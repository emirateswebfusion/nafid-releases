import { ipcMain, BrowserWindow } from 'electron';
import crypto from 'node:crypto';
import { getDb } from '../db/localDb.js';
import { triggerUrgentCashSync } from '../sync/syncWorker.js';
import { calculateCashierSettlement } from '../utils/cashierSettlement.js';
import { sendShopClosingReport } from '../whatsapp/shopClosingReportService.js';
import { syncInvoiceCreditLedger } from '../services/partyLedgerService.js';
import {
  deduplicateAndGetOpenDrawer,
  reconcileCashDrawer,
  autoClosePastOpenDrawers,
  getOpenCashDrawer
} from '../services/cashDrawerService.js';
import {
  safeHandler,
  validateString,
  validateNumber,
  validateOptionalString,
  validateOptionalNumber,
  validateObject,
  validateArray,
  localDate,
  localTimestamp,
  parseCleanDate,
  getUtcRangeForStoreDateRange,
  getStoreTimezoneSetting
} from './common.js';

export function registerCashierHandlers(): void {
ipcMain.handle('db:cashier:getDrawer', (event, { tenant_id, business_date }: { tenant_id: string; business_date?: string }) => {
  try {
    const db = getDb();
    autoClosePastOpenDrawers(db, tenant_id);
    let drawer = deduplicateAndGetOpenDrawer(db, tenant_id, business_date);

    if (!drawer || drawer.status !== 'OPEN') {
      const activeTenantId = tenant_id || 'global';
      let autoOpenSetting = false;
      const autoOpenRow = db.prepare("SELECT value FROM settings WHERE (tenant_id = ? OR tenant_id = 'global') AND key = 'auto_open_cash_drawer' ORDER BY (CASE WHEN tenant_id = ? THEN 1 ELSE 0 END) DESC LIMIT 1").get(activeTenantId, activeTenantId) as any;
      if (autoOpenRow && autoOpenRow.value !== undefined && autoOpenRow.value !== null) {
        try { autoOpenSetting = Boolean(JSON.parse(autoOpenRow.value)); } catch { autoOpenSetting = String(autoOpenRow.value).trim() === 'true'; }
      }

      if (autoOpenSetting) {
        let defaultBal = 0;
        const balRow = db.prepare("SELECT value FROM settings WHERE (tenant_id = ? OR tenant_id = 'global') AND key = 'default_opening_balance' ORDER BY (CASE WHEN tenant_id = ? THEN 1 ELSE 0 END) DESC LIMIT 1").get(activeTenantId, activeTenantId) as any;
        if (balRow && balRow.value !== undefined && balRow.value !== null) {
          try { defaultBal = Number(JSON.parse(balRow.value)) || 0; } catch { defaultBal = Number(balRow.value) || 0; }
        }
        if (isNaN(defaultBal) || defaultBal < 0) defaultBal = 0;

        const storeTz = getStoreTimezoneSetting(db, activeTenantId);
        const cleanDate = business_date ? parseCleanDate(business_date, storeTz) : localDate();

        const existing = db.prepare(`
          SELECT * FROM cash_drawer 
          WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
            AND (business_date = ? OR date(business_date) = ?)
          ORDER BY created_at DESC LIMIT 1
        `).get(activeTenantId, cleanDate, cleanDate) as any;

        if (!existing) {
          const drawer_id = crypto.randomUUID();
          db.prepare(`
            INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, opening_balance, current_cash, expected_closing, status, opened_by, sync_status)
            VALUES (?, ?, ?, ?, ?, ?, 'OPEN', 'system_auto', 'PENDING')
          `).run(drawer_id, activeTenantId, cleanDate, defaultBal, defaultBal, defaultBal);
          drawer = deduplicateAndGetOpenDrawer(db, tenant_id, business_date);
        }
      }
    }

    return drawer;
  } catch (error: any) {
    console.error(`[Cashier] getDrawer error:`, error.message);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:cashier:setOpeningBalance', safeHandler((event, { tenant_id, opening_balance, user_id, user_name }: { tenant_id: string; opening_balance: number; user_id: string; user_name?: string }) => {
  try {
    const db = getDb();
    autoClosePastOpenDrawers(db, tenant_id);
    const date = localDate();

    const existing = db.prepare(`
      SELECT * FROM cash_drawer 
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
        AND (business_date = ? OR date(business_date) = ?)
      ORDER BY (CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) DESC, created_at DESC LIMIT 1
    `).get(tenant_id, date, date) as any;
    
    if (existing) {
      const newOpening = Number(opening_balance);
      const cashSales = Number(existing.cash_sales || 0);
      const cashIn = Number(existing.cash_in || 0);
      const cashOut = Number(existing.cash_out || 0);
      const newCurrentCash = newOpening + cashSales + cashIn - cashOut;

      db.prepare(`
        UPDATE cash_drawer SET 
          opening_balance = ?, 
          current_cash = ?, 
          expected_closing = ?, 
          status = 'OPEN', 
          opened_by = ?, 
          opened_at = CURRENT_TIMESTAMP, 
          actual_cash = NULL, 
          cash_short = 0, 
          cash_excess = 0, 
          closing_remarks = NULL, 
          closed_by = NULL, 
          closed_at = NULL, 
          sync_status = 'PENDING', 
          updated_at = CURRENT_TIMESTAMP
        WHERE drawer_id = ?
      `).run(newOpening, newCurrentCash, newCurrentCash, user_id, existing.drawer_id);
    } else {
      const drawer_id = crypto.randomUUID();
      const newOpening = Number(opening_balance);
      db.prepare(`
        INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, opening_balance, current_cash, expected_closing, status, opened_by, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, 'PENDING')
      `).run(drawer_id, tenant_id, date, newOpening, newOpening, newOpening, user_id);
    }
    
    const dId = existing ? existing.drawer_id : '';
    const targetDrawer = db.prepare(`
      SELECT * FROM cash_drawer 
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
        AND (business_date = ? OR date(business_date) = ?)
      ORDER BY (CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) DESC, created_at DESC LIMIT 1
    `).get(tenant_id, date, date) as any;
    if (targetDrawer) {
      db.prepare(`
        UPDATE cash_transactions 
        SET drawer_id = ? 
        WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
          AND (substr(transaction_date, 1, 10) = ? OR date(transaction_date) = ?)
      `).run(targetDrawer.drawer_id, tenant_id, date, date);
      reconcileCashDrawer(db, tenant_id, targetDrawer);
    }

    db.prepare(`
      INSERT INTO cashier_audit_log (audit_id, tenant_id, drawer_id, action, details, performed_by, performed_by_name, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(crypto.randomUUID(), tenant_id, dId || (targetDrawer ? targetDrawer.drawer_id : ''), 'OPENING_BALANCE_SET', JSON.stringify({ opening_balance, business_date: date }), user_id, user_name || null);
    
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('sync:data-updated');
    import('../sync/syncWorker.js').then(({ triggerUrgentCashSync }) => {
      triggerUrgentCashSync().catch(e => console.error('[Main] Immediate urgent cash sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
    return { success: true };
  } catch (error: any) {
    console.error('[db:cashier:setOpeningBalance]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:cashier:getPendingInvoices', (event, { tenant_id, search }: { tenant_id: string; search?: string }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    
    let query = `
      SELECT i.*, u.name as biller_name 
      FROM invoices i 
      LEFT JOIN users u ON i.user_id = u.user_id 
      WHERE i.tenant_id = ? 
        AND i.payment_method = 'PENDING' 
        AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (i.is_held IS NULL OR i.is_held = 0)
        AND (i.is_deleted IS NULL OR i.is_deleted = 0 OR i.is_deleted = '0' OR i.is_deleted = '0.0' OR i.is_deleted = 0.0)
    `;
    const params: any[] = [tenant_id];
    
    if (search) {
      query += ` AND (i.invoice_number LIKE ? OR i.customer_name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ` ORDER BY i.created_at DESC LIMIT 1000`;
    const results = db.prepare(query).all(...params);
    return results;
  } catch (error: any) {
    console.error('[db:cashier:getPendingInvoices]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:cashier:settlePayment', safeHandler((event, { tenant_id, invoice_id, received_amount, discount_amount, payment_method, payment_source_id, split_details, user_id, user_name }: {
  tenant_id: string; invoice_id: string; received_amount: number; discount_amount?: number; payment_method: string; payment_source_id?: string; split_details?: any; user_id: string; user_name?: string
}) => {
  const db = getDb();
  const validMethods = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'SPLIT'];
  if (!validMethods.includes(payment_method)) {
    return { success: false, error: 'Invalid payment method' };
  }
  
  try {
    const tx = db.transaction(() => {
      const invoice = (db.prepare(`SELECT * FROM invoices WHERE invoice_id = ?`).get(invoice_id) || db.prepare(`SELECT * FROM invoices WHERE invoice_id = ? AND tenant_id = ?`).get(invoice_id, tenant_id)) as any;
      if (!invoice) throw new Error('Invoice not found');
      
      const targetTenantId = invoice.tenant_id || tenant_id || 'global';
      const received = Number(received_amount) || 0;
      const settlement = calculateCashierSettlement(invoice, received, discount_amount);
      const {
        discountTotal: newDiscountTotal,
        discountValue,
        discountType,
        grandTotal: newGrandTotal,
        receivedAmount: storedReceivedAmount,
        actualRefundPaid,
        expectedRefundAmount: calculatedRefund,
        settlementDiscount,
      } = settlement;

      const splitStr = split_details && typeof split_details === 'object'
        ? JSON.stringify(split_details)
        : (split_details && split_details !== 'null' ? split_details : null);

      db.prepare(`
        UPDATE invoices SET 
          payment_method = ?, 
          split_details = ?, 
          received_amount = ?, 
          actual_refund_paid = ?,
          discount_total = ?, 
          discount_value = ?, 
          discount_type = ?, 
          grand_total = ?, 
          settled_at = CURRENT_TIMESTAMP,
          sync_status = 'PENDING', 
          updated_at = CURRENT_TIMESTAMP
        WHERE invoice_id = ?
      `).run(payment_method, splitStr, storedReceivedAmount, actualRefundPaid, newDiscountTotal, discountValue, discountType, newGrandTotal, invoice_id);

      // If invoice was created with 0 points_earned (e.g. pending bill) but customer exists and loyalty is enabled, award points now!
      if (invoice.customer_id && (!invoice.points_earned || Number(invoice.points_earned) <= 0)) {
        try {
          const lCfgRow: any = db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'loyalty_config'").get(targetTenantId)
            || db.prepare("SELECT value FROM settings WHERE tenant_id = 'global' AND key = 'loyalty_config'").get();
          let lCfg: any = null;
          if (lCfgRow?.value) {
            lCfg = typeof lCfgRow.value === 'string' ? JSON.parse(lCfgRow.value) : lCfgRow.value;
          }
          const flagsRow: any = db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'feature_flags'").get(targetTenantId)
            || db.prepare("SELECT value FROM settings WHERE tenant_id = 'global' AND key = 'feature_flags'").get();
          let flags: any = null;
          if (flagsRow?.value) {
            flags = typeof flagsRow.value === 'string' ? JSON.parse(flagsRow.value) : flagsRow.value;
          }
          const isLoyaltyOn = Boolean(lCfg?.enabled) || Boolean(flags?.loyalty);
          if (isLoyaltyOn) {
            const earningRate = Math.max(1, Number(lCfg?.earningRate) || 100);
            const ptsEarned = Math.floor(Math.max(0, Number(newGrandTotal) || 0) / earningRate);
            if (ptsEarned > 0) {
              const custRow: any = db.prepare('SELECT current_points_balance FROM customers WHERE customer_id = ?').get(invoice.customer_id);
              const prevBal = Number(custRow?.current_points_balance) || 0;
              const newBal = prevBal + ptsEarned;
              const nowTimestamp = localTimestamp();
              const eTxId = crypto.randomUUID();

              db.prepare(`
                UPDATE invoices SET
                  points_earned = ?,
                  previous_points_balance = COALESCE(previous_points_balance, ?),
                  remaining_points_balance = ?
                WHERE invoice_id = ?
              `).run(ptsEarned, prevBal, newBal, invoice_id);

              db.prepare(`
                INSERT INTO loyalty_transactions (
                  transaction_id, tenant_id, customer_id, invoice_id,
                  transaction_type, points, points_balance_before, points_balance_after,
                  reference_number, description, created_by, sync_status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'EARNED', ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
              `).run(
                eTxId, targetTenantId, invoice.customer_id, invoice_id,
                ptsEarned, prevBal, newBal,
                invoice.invoice_number,
                `Earned ${ptsEarned} points on settled invoice ${invoice.invoice_number}`,
                user_id || 'system',
                nowTimestamp, nowTimestamp
              );

              db.prepare(`
                UPDATE customers SET
                  total_points_earned = COALESCE(total_points_earned, 0) + ?,
                  current_points_balance = ?,
                  last_purchase_date = ?,
                  sync_status = 'PENDING',
                  updated_at = CURRENT_TIMESTAMP
                WHERE customer_id = ?
              `).run(ptsEarned, newBal, nowTimestamp, invoice.customer_id);
            }
          }
        } catch (lErr) {
          console.warn('[db:cashier:settlePayment] Failed to award loyalty points on settlement:', lErr);
        }
      }
      
      const date = localDate();
      const drawer = getOpenCashDrawer(db, targetTenantId, date);

      let parsedSplitObj: any = null;
      if (split_details && split_details !== 'null') {
        try {
          parsedSplitObj = typeof split_details === 'string' ? JSON.parse(split_details) : split_details;
        } catch {}
      }
      const splitCashAmt = Number(parsedSplitObj?.cash) || 0;

      if (payment_method === 'CASH' || (payment_method === 'SPLIT' && splitCashAmt > 0)) {
        if (drawer) {
          if (actualRefundPaid > 0) {
            const transaction_id = crypto.randomUUID();
            db.prepare(`
              INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, entered_by_name, sync_status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
            `).run(transaction_id, tenant_id, drawer.drawer_id, 'CASH_OUT', actualRefundPaid, 'CREDIT_REFUND', `Refund leftover credits for settled invoice ${invoice.invoice_number}`, user_id, user_name || null);
          }
        }
      } else if (payment_source_id) {
        // Non-cash payment against a configured bank / card / UPI source
        const source = db.prepare(`SELECT * FROM payment_sources WHERE source_id = ? AND tenant_id = ? AND is_deleted = 0 AND is_enabled = 1`).get(payment_source_id, tenant_id) as any;
        if (source) {
          const newBalance = Number(source.current_balance) + received;
          db.prepare(`
            INSERT INTO payment_source_transactions (transaction_id, tenant_id, source_id, type, amount, category, reference_number, notes, transaction_date, running_balance, entered_by, entered_by_name, sync_status)
            VALUES (?, ?, ?, 'CASH_IN', ?, 'Invoice Payment', ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, 'PENDING')
          `).run(
            crypto.randomUUID(), tenant_id, payment_source_id, received,
            invoice.invoice_number, `Invoice ${invoice.invoice_number} settled via ${payment_method}`,
            newBalance, user_id, user_name || null
          );
          db.prepare(`UPDATE payment_sources SET current_balance = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE source_id = ? AND tenant_id = ?`)
            .run(newBalance, payment_source_id, tenant_id);
        }
      }
      
      if (drawer) {
        reconcileCashDrawer(db, tenant_id, drawer);
      }

      db.prepare(`
        INSERT INTO cashier_audit_log (audit_id, tenant_id, drawer_id, action, details, performed_by, performed_by_name, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `).run(
        crypto.randomUUID(), tenant_id, drawer ? drawer.drawer_id : null, 'PAYMENT_COMPLETED',
        JSON.stringify({ invoice_id, invoice_number: invoice.invoice_number, received_amount: storedReceivedAmount, requested_net_amount: received, refund_amount: actualRefundPaid, expected_refund_amount: calculatedRefund, settlement_discount: settlementDiscount, discount: newDiscountTotal, payment_method, split_details: split_details || null, grand_total: newGrandTotal }),
        user_id, user_name || null
      );

      // Sync party credit ledger for credit payments
      syncInvoiceCreditLedger(db, {
        invoice_id: invoice.invoice_id,
        tenant_id: targetTenantId,
        invoice_number: invoice.invoice_number,
        invoice_type: invoice.invoice_type,
        grand_total: newGrandTotal,
        payment_method: payment_method,
        received_amount: storedReceivedAmount,
        balance_amount: 0, // Fully settled
        customer_id: invoice.customer_id,
        customer_name: invoice.customer_name,
        customer_phone: invoice.customer_phone,
        customer_address: invoice.customer_address,
        customer_gstin: invoice.customer_gstin,
        split_details: splitStr,
        user_id: user_id,
        user_name: user_name,
        created_at: invoice.created_at,
      });
    });
    
    tx();
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('sync:data-updated');
    import('../sync/syncWorker.js').then(({ triggerUrgentInvoiceSync, triggerUrgentCashSync }) => {
      triggerUrgentInvoiceSync().catch(e => console.error('[Main] Immediate urgent sync error:', e));
      triggerUrgentCashSync().catch(e => console.error('[Main] Immediate urgent cash sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
    return { success: true };
  } catch (error: any) {
    console.error('[db:cashier:settlePayment]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:cashier:addTransaction', safeHandler((event, { tenant_id, type, amount, category, notes, user_id, user_name }: {
  tenant_id: string; type: 'CASH_IN' | 'CASH_OUT'; amount: number; category?: string; notes?: string; user_id: string; user_name?: string
}) => {
  const db = getDb();
  if (!['CASH_IN', 'CASH_OUT'].includes(type)) return { success: false, error: 'Type must be CASH_IN or CASH_OUT' };
  if (!amount || amount <= 0) return { success: false, error: 'Amount must be positive' };
  
  try {
    const tx = db.transaction(() => {
      const date = localDate();
      const drawer = getOpenCashDrawer(db, tenant_id, date);
      if (!drawer) throw new Error('No open cash drawer for today. Set opening balance first.');
      if (drawer.status !== 'OPEN') throw new Error('Cash register is closed for today. Entries are locked.');
      
      const transaction_id = crypto.randomUUID();
      const txDateIso = new Date().toISOString();
      db.prepare(`
        INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, entered_by_name, transaction_date, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `).run(transaction_id, tenant_id, drawer.drawer_id, type, amount, category || null, notes || null, user_id, user_name || null, txDateIso);
      
      reconcileCashDrawer(db, tenant_id, drawer);
      
      db.prepare(`
        INSERT INTO cashier_audit_log (audit_id, tenant_id, drawer_id, action, details, performed_by, performed_by_name, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `).run(
        crypto.randomUUID(), tenant_id, drawer.drawer_id, type,
        JSON.stringify({ transaction_id, amount, category, notes }),
        user_id, user_name || null
      );
    });
    
    tx();
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('sync:data-updated');
    import('../sync/syncWorker.js').then(({ triggerUrgentCashSync }) => {
      triggerUrgentCashSync().catch(e => console.error('[Main] Immediate urgent cash sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
    return { success: true };
  } catch (error: any) {
    console.error('[db:cashier:addTransaction]', error);
    return { success: false, error: error?.message || 'Operation failed' };
  }
}));

ipcMain.handle('db:cashier:dayClosing', safeHandler((event, { tenant_id, actual_cash, closing_remarks, user_id, user_name, business_date }: {
  tenant_id: string; actual_cash: number; closing_remarks?: string; user_id: string; user_name?: string; business_date?: string
}) => {
  const db = getDb();
  try {
    let expected = 0;
    let actual = 0;
    let cash_short = 0;
    let cash_excess = 0;

    const tx = db.transaction(() => {
      const date = business_date ? (typeof business_date === 'string' ? parseCleanDate(business_date) : localDate(new Date(business_date))) : localDate();
      const parts = date.split('-');
      const altDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : date;
      let drawer = db.prepare(`
        SELECT * FROM cash_drawer 
        WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
          AND (business_date = ? OR business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ? OR substr(business_date, 1, 10) = ?)
        ORDER BY created_at DESC LIMIT 1
      `).get(tenant_id, date, altDate, date, `${date}%`, date, altDate) as any;
      if (!drawer) {
        drawer = db.prepare(`
          SELECT * FROM cash_drawer 
          WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
            AND status = 'OPEN' 
          ORDER BY business_date DESC, created_at DESC LIMIT 1
        `).get(tenant_id) as any;
      }
      if (!drawer) throw new Error(`No open cash drawer found for ${date}`);
      
      drawer = reconcileCashDrawer(db, tenant_id, drawer);

      const cashIn = Math.round(Number(drawer.cash_in || 0) * 100) / 100;
      const cashOut = Math.round(Number(drawer.cash_out || 0) * 100) / 100;
      const openingBal = Math.round(Number(drawer.opening_balance || 0) * 100) / 100;
      const cashSales = Math.round(Number(drawer.cash_sales || 0) * 100) / 100;

      expected = Math.round(Number(drawer.expected_closing || (openingBal + cashSales + cashIn - cashOut)) * 100) / 100;
      actual = Math.round(Number(actual_cash) * 100) / 100;
      const variance = Math.round((actual - expected) * 100) / 100;
      cash_short = variance < 0 ? Math.abs(variance) : 0;
      cash_excess = variance > 0 ? variance : 0;
      
      db.prepare(`
        UPDATE cash_drawer SET 
          cash_sales = ?,
          cash_in = ?, 
          cash_out = ?, 
          current_cash = ?, 
          expected_closing = ?, 
          actual_cash = ?, 
          cash_short = ?, 
          cash_excess = ?, 
          closing_remarks = ?, 
          status = 'CLOSED', 
          closed_by = ?, 
          closed_at = CURRENT_TIMESTAMP, 
          sync_status = 'PENDING', 
          updated_at = CURRENT_TIMESTAMP
        WHERE drawer_id = ?
      `).run(cashSales, cashIn, cashOut, expected, expected, actual, cash_short, cash_excess, closing_remarks || null, user_id, drawer.drawer_id);
      
      db.prepare(`
        INSERT INTO cashier_audit_log (audit_id, tenant_id, drawer_id, action, details, performed_by, performed_by_name, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `).run(
        crypto.randomUUID(), tenant_id, drawer.drawer_id, 'DAY_CLOSED',
        JSON.stringify({ expected_closing: expected, actual_cash: actual, cash_short, cash_excess, closing_remarks }),
        user_id, user_name || null
      );
    });
    
    tx();
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('sync:data-updated');
    import('../sync/syncWorker.js').then(({ triggerUrgentCashSync }) => {
      triggerUrgentCashSync().catch(e => console.error('[Main] Immediate urgent cash sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));

    // Non-blocking background trigger for WhatsApp Shop Closing Overview report
    setImmediate(() => {
      sendShopClosingReport({
        db,
        tenantId: tenant_id,
        businessDate: business_date,
        triggerType: 'SETTLEMENT_CLOSE',
        closedByName: user_name,
        reconcileCashDrawerFn: reconcileCashDrawer,
        getStoreTimezoneSettingFn: getStoreTimezoneSetting,
      }).catch(err => console.error('[Main] Shop closing WhatsApp report background error:', err));
    });

    return { success: true, expected_closing: expected, actual_cash: actual, cash_short, cash_excess };
  } catch (error: any) {
    console.error('[db:cashier:dayClosing]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
}));

ipcMain.handle('db:cashier:reopenDrawer', safeHandler((event, { tenant_id, drawer_id, user_id, user_name }: { tenant_id: string; drawer_id: string; user_id: string; user_name?: string }) => {
  const db = getDb();
  try {
    const tx = db.transaction(() => {
      const drawer = db.prepare(`SELECT * FROM cash_drawer WHERE drawer_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).get(drawer_id, tenant_id) as any;
      if (!drawer) throw new Error('Cash drawer not found');

      db.prepare(`
        UPDATE cash_drawer SET 
          status = 'OPEN',
          actual_cash = NULL,
          cash_short = 0,
          cash_excess = 0,
          closing_remarks = NULL,
          closed_by = NULL,
          closed_at = NULL,
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
        WHERE drawer_id = ?
      `).run(drawer_id);

      reconcileCashDrawer(db, tenant_id, drawer);

      db.prepare(`
        INSERT INTO cashier_audit_log (audit_id, tenant_id, drawer_id, action, details, performed_by, performed_by_name, sync_status)
        VALUES (?, ?, ?, 'DAY_REOPENED', ?, ?, ?, 'PENDING')
      `).run(
        crypto.randomUUID(), tenant_id, drawer_id,
        JSON.stringify({ business_date: drawer.business_date, reopened_at: localTimestamp() }),
        user_id, user_name || null
      );
    });

    tx();
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('sync:data-updated');
    import('../sync/syncWorker.js').then(({ triggerUrgentCashSync }) => {
      triggerUrgentCashSync().catch(e => console.error('[Main] Urgent cash sync error on reopen:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
    return { success: true };
  } catch (error: any) {
    console.error('[db:cashier:reopenDrawer]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
}));

ipcMain.handle('db:cashier:deleteTransaction', safeHandler((event, { tenant_id, transaction_id, user_id, user_name }: { tenant_id: string; transaction_id: string; user_id: string; user_name?: string }) => {
  const db = getDb();
  try {
    let targetDrawerId: string | null = null;
    const tx = db.transaction(() => {
      const transaction = db.prepare(`SELECT * FROM cash_transactions WHERE transaction_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).get(transaction_id, tenant_id) as any;
      if (!transaction) throw new Error('Transaction not found');

      targetDrawerId = transaction.drawer_id;

      db.prepare(`DELETE FROM cash_transactions WHERE transaction_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).run(transaction_id, tenant_id);

      if (targetDrawerId) {
        const drawer = db.prepare(`SELECT * FROM cash_drawer WHERE drawer_id = ?`).get(targetDrawerId) as any;
        if (drawer) {
          reconcileCashDrawer(db, tenant_id, drawer);
        }
      }

      db.prepare(`
        INSERT INTO cashier_audit_log (audit_id, tenant_id, drawer_id, action, details, performed_by, performed_by_name, sync_status)
        VALUES (?, ?, ?, 'TRANSACTION_DELETED', ?, ?, ?, 'PENDING')
      `).run(
        crypto.randomUUID(), tenant_id, targetDrawerId || null,
        JSON.stringify({ transaction_id, type: transaction.type, amount: transaction.amount, category: transaction.category }),
        user_id, user_name || null
      );
    });

    tx();
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('sync:data-updated');
    import('../sync/syncWorker.js').then(({ triggerUrgentCashSync }) => {
      triggerUrgentCashSync().catch(e => console.error('[Main] Urgent cash sync error on delete transaction:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
    return { success: true };
  } catch (error: any) {
    console.error('[db:cashier:deleteTransaction]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
}));

ipcMain.handle('db:cashier:getTransactions', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const date = localDate();
    const dateLike = `${date}%`;
    let drawers = db.prepare(`SELECT drawer_id FROM cash_drawer WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ?)`).all(tenant_id, date, date, dateLike, date) as any[];
    if (!drawers || drawers.length === 0) {
      drawers = db.prepare(`SELECT drawer_id FROM cash_drawer WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND status = 'OPEN' ORDER BY business_date DESC LIMIT 1`).all(tenant_id) as any[];
    }
    const drawerIds = (drawers || []).map(d => d.drawer_id).filter(Boolean);
    if (drawerIds.length === 0) {
      return db.prepare(`SELECT * FROM cash_transactions WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (date(transaction_date) = ? OR transaction_date LIKE ? OR substr(transaction_date, 1, 10) = ?) ORDER BY transaction_date DESC`).all(tenant_id, date, dateLike, date);
    }
    const placeholders = drawerIds.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM cash_transactions WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (drawer_id IN (${placeholders}) OR date(transaction_date) = ? OR transaction_date LIKE ? OR substr(transaction_date, 1, 10) = ?) ORDER BY transaction_date DESC`).all(tenant_id, ...drawerIds, date, dateLike, date);
  } catch (error: any) {
    console.error('[db:cashier:getTransactions]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:cashier:getHistory', (event, { tenant_id, limit = 30, offset = 0 }: { tenant_id: string; limit?: number; offset?: number }) => {
  try {
    const db = getDb();
    autoClosePastOpenDrawers(db, tenant_id);
    const rows = db.prepare(`
      SELECT cd.*,
        u1.name as opened_by_name,
        u2.name as closed_by_name,
        (SELECT COUNT(*) FROM invoices i WHERE (i.tenant_id = cd.tenant_id OR i.tenant_id = 'global' OR i.tenant_id = 'unset' OR i.tenant_id IS NULL) AND i.payment_method NOT IN ('PENDING', 'HOLD_DRAFT') AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD')) AND (i.is_held IS NULL OR i.is_held = 0) AND (date(COALESCE(i.settled_at, i.created_at)) = date(cd.business_date) OR COALESCE(i.settled_at, i.created_at) LIKE SUBSTR(cd.business_date, 1, 10) || '%' OR substr(COALESCE(i.settled_at, i.created_at), 1, 10) = SUBSTR(cd.business_date, 1, 10)) AND (i.is_deleted IS NULL OR i.is_deleted = 0)) as settled_count,
        (SELECT COALESCE(SUM(i.received_amount), 0) FROM invoices i WHERE (i.tenant_id = cd.tenant_id OR i.tenant_id = 'global' OR i.tenant_id = 'unset' OR i.tenant_id IS NULL) AND i.payment_method NOT IN ('PENDING', 'HOLD_DRAFT') AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD')) AND (i.is_held IS NULL OR i.is_held = 0) AND (date(COALESCE(i.settled_at, i.created_at)) = date(cd.business_date) OR COALESCE(i.settled_at, i.created_at) LIKE SUBSTR(cd.business_date, 1, 10) || '%' OR substr(COALESCE(i.settled_at, i.created_at), 1, 10) = SUBSTR(cd.business_date, 1, 10)) AND (i.is_deleted IS NULL OR i.is_deleted = 0)) as total_collected
      FROM cash_drawer cd
      LEFT JOIN users u1 ON cd.opened_by = u1.user_id
      LEFT JOIN users u2 ON cd.closed_by = u2.user_id
      WHERE (cd.tenant_id = ? OR cd.tenant_id = 'global' OR cd.tenant_id = 'unset' OR cd.tenant_id IS NULL)
      ORDER BY cd.business_date DESC
      LIMIT ? OFFSET ?
    `).all(tenant_id, limit, offset) as any[];

    if (Array.isArray(rows)) {
      rows.forEach(r => reconcileCashDrawer(db, tenant_id, r));
    }
    return rows;
  } catch (error: any) {
    console.error('[db:cashier:getHistory]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:cashier:getDaySettlements', (event, { tenant_id, business_date }: { tenant_id: string; business_date: string }) => {
  try {
    const db = getDb();
    const cleanDate = business_date ? business_date.split('T')[0].split(' ')[0] : '';
    const dateLike = `${cleanDate}%`;
    return db.prepare(`
      SELECT i.*, u.name as biller_name
      FROM invoices i
      LEFT JOIN users u ON i.user_id = u.user_id
      WHERE (i.tenant_id = ? OR i.tenant_id = 'global' OR i.tenant_id = 'unset' OR i.tenant_id IS NULL) 
        AND i.payment_method NOT IN ('PENDING', 'HOLD_DRAFT') 
        AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (i.is_held IS NULL OR i.is_held = 0)
        AND (
          date(COALESCE(i.settled_at, i.created_at)) = ? 
          OR COALESCE(i.settled_at, i.created_at) LIKE ? 
          OR substr(COALESCE(i.settled_at, i.created_at), 1, 10) = ?
        )
        AND (i.is_deleted IS NULL OR i.is_deleted = 0)
      ORDER BY COALESCE(i.settled_at, i.updated_at, i.created_at) DESC
    `).all(tenant_id, cleanDate, dateLike, cleanDate);
  } catch (error: any) {
    console.error('[db:cashier:getDaySettlements]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:cashier:getDayTransactions', (event, { tenant_id, business_date, from_date, to_date }: { tenant_id: string; business_date?: string; from_date?: string; to_date?: string }) => {
  try {
    const db = getDb();
    if (from_date && to_date) {
      const cleanFrom = from_date.split('T')[0].split(' ')[0];
      const cleanTo = to_date.split('T')[0].split(' ')[0];
      return db.prepare(`SELECT * FROM cash_transactions WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND substr(transaction_date, 1, 10) >= ? AND substr(transaction_date, 1, 10) <= ? ORDER BY transaction_date DESC`).all(tenant_id, cleanFrom, cleanTo);
    }
    const cleanDate = business_date ? business_date.split('T')[0].split(' ')[0] : '';
    const dateLike = `${cleanDate}%`;
    const drawers = db.prepare(`SELECT drawer_id FROM cash_drawer WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ?)`).all(tenant_id, cleanDate, cleanDate, dateLike, cleanDate) as any[];
    const drawerIds = (drawers || []).map(d => d.drawer_id).filter(Boolean);
    if (drawerIds.length === 0) {
      return db.prepare(`SELECT * FROM cash_transactions WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (date(transaction_date) = ? OR transaction_date LIKE ? OR substr(transaction_date, 1, 10) = ?) ORDER BY transaction_date DESC`).all(tenant_id, cleanDate, dateLike, cleanDate);
    }
    const placeholders = drawerIds.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM cash_transactions WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (drawer_id IN (${placeholders}) OR date(transaction_date) = ? OR transaction_date LIKE ? OR substr(transaction_date, 1, 10) = ?) ORDER BY transaction_date DESC`).all(tenant_id, ...drawerIds, cleanDate, dateLike, cleanDate);
  } catch (error: any) {
    console.error('[db:cashier:getDayTransactions]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:cashier:getAuditLog', (event, { tenant_id, limit = 50, offset = 0 }: { tenant_id: string; limit?: number; offset?: number }) => {
  try {
    const db = getDb();
    return db.prepare(`SELECT * FROM cashier_audit_log WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) ORDER BY performed_at DESC LIMIT ? OFFSET ?`).all(tenant_id, limit, offset);
  } catch (error: any) {
    console.error('[db:cashier:getAuditLog]', error);
    return { error: 'Operation failed' };
  }
});

// â”€â”€ Cash Categories IPC Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ipcMain.handle('db:cashier:getCategories', (event, { tenant_id, type }: { tenant_id: string; type?: 'CASH_IN' | 'CASH_OUT' }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    let query = `SELECT * FROM cash_categories WHERE tenant_id = ?`;
    const params: any[] = [tenant_id];
    if (type) { query += ` AND type = ?`; params.push(type); }
    query += ` ORDER BY sort_order ASC, name ASC`;
    return db.prepare(query).all(...params);
  } catch (error: any) {
    console.error('[db:cashier:getCategories]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:cashier:addCategory', safeHandler((event, { tenant_id, name, type }: { tenant_id: string; name: string; type: 'CASH_IN' | 'CASH_OUT' }) => {
  try {
    const db = getDb();
    if (!tenant_id || !name || !type) return { success: false, error: 'Missing required fields' };
    if (!['CASH_IN', 'CASH_OUT'].includes(type)) return { success: false, error: 'Type must be CASH_IN or CASH_OUT' };
    const category_id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO cash_categories (category_id, tenant_id, name, type, sort_order, is_default, sync_status)
      VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM cash_categories WHERE tenant_id = ? AND type = ?), 0, 'PENDING')
    `).run(category_id, tenant_id, name.trim(), type, tenant_id, type);
    return { success: true, category: { category_id, tenant_id, name: name.trim(), type } };
  } catch (error: any) {
    console.error('[db:cashier:addCategory]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:cashier:deleteCategory', safeHandler((event, { category_id, tenant_id }: { category_id: string; tenant_id: string }) => {
  try {
    const db = getDb();
    const cat = db.prepare(`SELECT * FROM cash_categories WHERE category_id = ? AND tenant_id = ?`).get(category_id, tenant_id) as any;
    if (!cat) return { success: false, error: 'Category not found' };
    if (cat.is_default === 1) return { success: false, error: 'Cannot delete default category' };
    db.prepare(`DELETE FROM cash_categories WHERE category_id = ? AND tenant_id = ?`).run(category_id, tenant_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:cashier:deleteCategory]', error);
    return { success: false, error: 'Operation failed' };
  }
}));


}
