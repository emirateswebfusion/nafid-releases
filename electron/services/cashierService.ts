import { captureInvoicePoints, refreshInvoiceEarnings } from './loyaltyService.js';
import type { CashCategoryRow, CashDrawerRow, CashTransactionRow, InvoiceRow, SettingRow, SplitDetails } from './typesA.js';
import { getDb } from '../db/localDb.js';
import { autoCloseOverdueDrawers, deduplicateAndGetOpenDrawer, reconcileCashDrawer, getOpenCashDrawer, adjustPaymentSourcesForInvoice } from './cashDrawerService.js';
import { getCashRegisterPreferences } from './cashRegisterPreferences.js';
import { calculateRegisterPayments } from '../utils/registerPaymentTotals.js';
import * as registerSql from '../db/statements/cashDrawer.js';
import { getRegisterCashEntries, getDrawerWindow, findOpenDrawersBeforeDate } from './cashDrawerSession.js';
import { getStoreTimezoneSetting, parseCleanDate, localDate, localTimestamp } from './storeTime.js';
import crypto from 'node:crypto';
import { BrowserWindow } from 'electron';
import { calculateCashierSettlement } from '../utils/cashierSettlement.js';
import { normalizePaymentSplit, syncInvoiceCreditLedger } from './partyLedgerService.js';
import { sendShopClosingReport } from '../whatsapp/shopClosingReportService.js';
import * as cashierSql from '../db/statements/cashier.js';
/** cashier use-cases for the main process (called by electron/ipc handlers). */

/** IPC `db:cashier:getDrawer` */
export function getDrawer({ tenant_id, business_date }: { tenant_id: string; business_date?: string }) {
  try {
    const db = getDb();
    autoCloseOverdueDrawers(db, tenant_id);
    let drawer = deduplicateAndGetOpenDrawer(db, tenant_id, business_date);

    if (!drawer || drawer.status !== 'OPEN') {
      const activeTenantId = tenant_id || 'global';
      let autoOpenSetting = false;
      const autoOpenRow = cashierSql.findOneSettingByKey(db).get(activeTenantId, activeTenantId) as SettingRow | undefined;
      if (autoOpenRow && autoOpenRow.value !== undefined && autoOpenRow.value !== null) {
        try { autoOpenSetting = Boolean(JSON.parse(autoOpenRow.value)); } catch { autoOpenSetting = String(autoOpenRow.value).trim() === 'true'; }
      }

      if (autoOpenSetting) {
        let defaultBal = 0;
        const balRow = cashierSql.findOneSettingByKeyDefaultOpeningBalance(db).get(activeTenantId, activeTenantId) as SettingRow | undefined;
        if (balRow && balRow.value !== undefined && balRow.value !== null) {
          try { defaultBal = Number(JSON.parse(balRow.value)) || 0; } catch { defaultBal = Number(balRow.value) || 0; }
        }
        if (isNaN(defaultBal) || defaultBal < 0) defaultBal = 0;

        const storeTz = getStoreTimezoneSetting(db, activeTenantId);
        const cleanDate = business_date ? parseCleanDate(business_date, storeTz) : localDate();

        const existing = cashierSql.findOneCashDrawerByBusinessDate(db).get(activeTenantId, cleanDate, cleanDate) as CashDrawerRow | undefined;

        if (!existing) {
          const drawer_id = crypto.randomUUID();
          cashierSql.insertCashDrawer(db).run(drawer_id, activeTenantId, cleanDate, defaultBal, defaultBal, defaultBal);
          drawer = deduplicateAndGetOpenDrawer(db, tenant_id, business_date);
        }
      }
    }

    if (!drawer) return null;
    const window = getDrawerWindow(db, tenant_id, drawer);
    const invoices = registerSql.listRegisterInvoices(db).all(tenant_id, window.from, window.to, window.to) as Array<{
      payment_method: string; grand_total: number; received_amount: number; split_details: string | null;
    }>;
    return { ...drawer, payment_totals: calculateRegisterPayments(invoices, getCashRegisterPreferences(db, tenant_id).paymentMethods) };
  } catch (error) {
    console.error(`[Cashier] getDrawer error:`, (error as Error).message);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:cashier:setOpeningBalance` */
export function setOpeningBalance({ tenant_id, opening_balance, user_id, user_name }: { tenant_id: string; opening_balance: number; user_id: string; user_name?: string }) {
  try {
    const db = getDb();
    autoCloseOverdueDrawers(db, tenant_id);
    const date = localDate();

    const existing = cashierSql.findOneCashDrawerByBusinessDateOpen(db).get(tenant_id, date, date) as CashDrawerRow | undefined;

    // One session at a time: a drawer left open on an earlier day must be closed before today's is opened.
    const older = existing ? [] : findOpenDrawersBeforeDate(db, tenant_id, date);
    if (older.length > 0) {
      const olderDate = parseCleanDate(older[0].business_date);
      return {
        success: false,
        error: 'PREVIOUS_DRAWER_OPEN',
        business_date: olderDate,
        drawer_id: older[0].drawer_id,
        message: `The cash drawer of ${olderDate} is still open. Close it before opening today's drawer.`,
      };
    }
    
    if (existing) {
      const newOpening = Number(opening_balance);
      const cashSales = Number(existing.cash_sales || 0);
      const cashIn = Number(existing.cash_in || 0);
      const cashOut = Number(existing.cash_out || 0);
      const newCurrentCash = newOpening + cashSales + cashIn - cashOut;

      cashierSql.updateCashDrawerByDrawerId(db).run(newOpening, newCurrentCash, newCurrentCash, user_id, existing.drawer_id);
    } else {
      const drawer_id = crypto.randomUUID();
      const newOpening = Number(opening_balance);
      cashierSql.insertCashDrawer2(db).run(drawer_id, tenant_id, date, newOpening, newOpening, newOpening, user_id);
    }
    
    const dId = existing ? existing.drawer_id : '';
    const targetDrawer = cashierSql.findOneCashDrawerByBusinessDateOpen(db).get(tenant_id, date, date) as CashDrawerRow | undefined;
    if (targetDrawer) {
      cashierSql.updateCashTransactionDrawerId(db).run(targetDrawer.drawer_id, tenant_id, date, date);
      reconcileCashDrawer(db, tenant_id, targetDrawer);
    }

    cashierSql.insertCashierAuditLog(db).run(crypto.randomUUID(), tenant_id, dId || (targetDrawer ? targetDrawer.drawer_id : ''), 'OPENING_BALANCE_SET', JSON.stringify({ opening_balance, business_date: date }), user_id, user_name || null);
    
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('sync:data-updated');
    import('../sync/syncWorker.js').then(({ triggerUrgentCashSync }) => {
      triggerUrgentCashSync().catch(e => console.error('[Main] Immediate urgent cash sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
    return { success: true };
  } catch (error) {
    console.error('[db:cashier:setOpeningBalance]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:cashier:getPendingInvoices` */
export function getPendingInvoices({ tenant_id, search }: { tenant_id: string; search?: string }) {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    
    const { statement, params } = cashierSql.getPendingInvoicesStatement(db, { tenant_id, search });
    const results = statement.all(...params);
    return results;
  } catch (error) {
    console.error('[db:cashier:getPendingInvoices]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:cashier:settlePayment` */
export function settlePayment({ tenant_id, invoice_id, received_amount, discount_amount, payment_method, payment_source_id, split_details, user_id, user_name }: {
  tenant_id: string; invoice_id: string; received_amount: number; discount_amount?: number; payment_method: string; payment_source_id?: string; split_details?: SplitDetails | string | null; user_id: string; user_name?: string
}) {
  const db = getDb();
  const validMethods = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'SPLIT'];
  if (!validMethods.includes(payment_method)) {
    return { success: false, error: 'Invalid payment method' };
  }
  
  try {
    const tx = db.transaction(() => {
      const invoice = (cashierSql.findInvoicesByInvoiceId(db).get(invoice_id) || cashierSql.findInvoicesByInvoiceId2(db).get(invoice_id, tenant_id)) as InvoiceRow | undefined;
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

      // Store the exact payment breakdown of the settled bill (reports, filters and the drawer read it).
      const splitStr = JSON.stringify(normalizePaymentSplit({
        grand_total: newGrandTotal, payment_method, received_amount: storedReceivedAmount,
        split_details: split_details ?? null,
      }));

      captureInvoicePoints(db, invoice_id);
      cashierSql.updateInvoiceByInvoiceId(db).run(payment_method, splitStr, storedReceivedAmount, actualRefundPaid, newDiscountTotal, discountValue, discountType, newGrandTotal, invoice_id);

      refreshInvoiceEarnings(db, invoice_id);
      
      const date = localDate();
      const drawer = getOpenCashDrawer(db, targetTenantId, date);

      let parsedSplitObj: SplitDetails | null = null;
      if (split_details && split_details !== 'null') {
        try {
          parsedSplitObj = typeof split_details === 'string' ? JSON.parse(split_details) : split_details;
        } catch { /* ignore */ }
      }
      const splitCashAmt = Number(parsedSplitObj?.cash) || 0;

      if (payment_method === 'CASH' || (payment_method === 'SPLIT' && splitCashAmt > 0)) {
        if (drawer) {
          if (actualRefundPaid > 0) {
            const transaction_id = crypto.randomUUID();
            cashierSql.insertCashTransaction(db).run(transaction_id, tenant_id, drawer.drawer_id, 'CASH_OUT', actualRefundPaid, 'CREDIT_REFUND', `Refund leftover credits for settled invoice ${invoice.invoice_number}`, user_id, user_name || null);
          }
        }
      }
      // Share billing's account posting, including non-cash portions of mixed payments.
      adjustPaymentSourcesForInvoice(db, targetTenantId, {
        invoice_number: invoice.invoice_number, payment_method, payment_source_id,
        received_amount: received, grand_total: 0, split_details: splitStr,
        user_id, user_name,
      });
      
      if (drawer) {
        reconcileCashDrawer(db, tenant_id, drawer);
      }

      cashierSql.insertCashierAuditLog(db).run(
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
  } catch (error) {
    console.error('[db:cashier:settlePayment]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:cashier:addTransaction` */
export function addTransaction({ tenant_id, type, amount, category, notes, user_id, user_name }: {
  tenant_id: string; type: 'CASH_IN' | 'CASH_OUT'; amount: number; category?: string; notes?: string; user_id: string; user_name?: string
}) {
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
      cashierSql.insertCashTransaction2(db).run(transaction_id, tenant_id, drawer.drawer_id, type, amount, category || null, notes || null, user_id, user_name || null, txDateIso);
      
      reconcileCashDrawer(db, tenant_id, drawer);
      
      cashierSql.insertCashierAuditLog(db).run(
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
  } catch (error) {
    console.error('[db:cashier:addTransaction]', error);
    return { success: false, error: (error as Error)?.message || 'Operation failed' };
  }
}

/** IPC `db:cashier:dayClosing` */
export function dayClosing({ tenant_id, actual_cash, closing_remarks, user_id, user_name, business_date }: {
  tenant_id: string; actual_cash: number; closing_remarks?: string; user_id: string; user_name?: string; business_date?: string
}) {
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
      let drawer = cashierSql.findOneCashDrawerByBusinessDate2(db).get(tenant_id, date, altDate, date, `${date}%`, date, altDate) as CashDrawerRow | undefined;
      if (!drawer) {
        drawer = cashierSql.findOneCashDrawerByStatus(db).get(tenant_id) as CashDrawerRow | undefined;
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
      
      cashierSql.updateCashDrawerByDrawerIdClosed(db).run(cashSales, cashIn, cashOut, expected, expected, actual, cash_short, cash_excess, closing_remarks || null, user_id, drawer.drawer_id);
      
      cashierSql.insertCashierAuditLog(db).run(
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
  } catch (error) {
    console.error('[db:cashier:dayClosing]', error);
    return { success: false, error: (error as Error).message || 'Operation failed' };
  }
}

/** IPC `db:cashier:reopenDrawer` */
export function reopenDrawer({ tenant_id, drawer_id, user_id, user_name }: { tenant_id: string; drawer_id: string; user_id: string; user_name?: string }) {
  const db = getDb();
  try {
    const tx = db.transaction(() => {
      const drawer = cashierSql.findCashDrawerByDrawerId(db).get(drawer_id, tenant_id) as CashDrawerRow | undefined;
      if (!drawer) throw new Error('Cash drawer not found');

      cashierSql.updateCashDrawerByDrawerIdOpen(db).run(drawer_id);

      reconcileCashDrawer(db, tenant_id, drawer);

      cashierSql.insertCashierAuditLog2(db).run(
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
  } catch (error) {
    console.error('[db:cashier:reopenDrawer]', error);
    return { success: false, error: (error as Error).message || 'Operation failed' };
  }
}

/** IPC `db:cashier:deleteTransaction` */
export function deleteTransaction({ tenant_id, transaction_id, user_id, user_name }: { tenant_id: string; transaction_id: string; user_id: string; user_name?: string }) {
  const db = getDb();
  try {
    let targetDrawerId: string | null | undefined = null;
    const tx = db.transaction(() => {
      const transaction = cashierSql.findCashTransactionsByTransactionId(db).get(transaction_id, tenant_id) as CashTransactionRow | undefined;
      if (!transaction) throw new Error('Transaction not found');

      targetDrawerId = transaction.drawer_id;

      cashierSql.deleteCashTransactionByTransactionId(db).run(transaction_id, tenant_id);

      if (targetDrawerId) {
        const drawer = cashierSql.findCashDrawerByDrawerId2(db).get(targetDrawerId) as CashDrawerRow | undefined;
        if (drawer) {
          reconcileCashDrawer(db, tenant_id, drawer);
        }
      }

      cashierSql.insertCashierAuditLog3(db).run(
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
  } catch (error) {
    console.error('[db:cashier:deleteTransaction]', error);
    return { success: false, error: (error as Error).message || 'Operation failed' };
  }
}

/** IPC `db:cashier:getTransactions` */
export function getTransactions({ tenant_id }: { tenant_id: string }) {
  try {
    const db = getDb();
    const drawer = deduplicateAndGetOpenDrawer(db, tenant_id);
    return drawer ? getRegisterCashEntries(db, tenant_id, drawer).reverse() : [];

  } catch (error) {
    console.error('[db:cashier:getTransactions]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:cashier:getHistory` */
export function getHistory({ tenant_id, limit = 30, offset = 0 }: { tenant_id: string; limit?: number; offset?: number }) {
  try {
    const db = getDb();
    autoCloseOverdueDrawers(db, tenant_id);
    const rows = cashierSql.findInvoices(db).all(tenant_id, limit, offset) as CashDrawerRow[];

    if (Array.isArray(rows)) {
      rows.forEach(r => reconcileCashDrawer(db, tenant_id, r));
    }
    return rows;
  } catch (error) {
    console.error('[db:cashier:getHistory]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:cashier:getDaySettlements` */
export function getDaySettlements({ tenant_id, business_date }: { tenant_id: string; business_date: string }) {
  try {
    const db = getDb();
    const cleanDate = business_date ? business_date.split('T')[0].split(' ')[0] : '';
    const dateLike = `${cleanDate}%`;
    return cashierSql.findInvoices2(db).all(tenant_id, cleanDate, dateLike, cleanDate);
  } catch (error) {
    console.error('[db:cashier:getDaySettlements]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:cashier:getDayTransactions` */
export function getDayTransactions({ tenant_id, business_date, from_date, to_date }: { tenant_id: string; business_date?: string; from_date?: string; to_date?: string }) {
  try {
    const db = getDb();
    if (from_date && to_date) {
      const cleanFrom = from_date.split('T')[0].split(' ')[0];
      const cleanTo = to_date.split('T')[0].split(' ')[0];
      return cashierSql.findCashTransactions2(db).all(tenant_id, cleanFrom, cleanTo);
    }
    const cleanDate = business_date ? business_date.split('T')[0].split(' ')[0] : '';
    const dateLike = `${cleanDate}%`;
    const drawers = cashierSql.findCashDrawerByBusinessDate(db).all(tenant_id, cleanDate, cleanDate, dateLike, cleanDate) as CashDrawerRow[];
    const drawerIds = (drawers || []).map(d => d.drawer_id).filter(Boolean);
    if (drawerIds.length === 0) {
      return cashierSql.findCashTransactions(db).all(tenant_id, cleanDate, dateLike, cleanDate);
    }
    const placeholders = drawerIds.map(() => '?').join(',');
    return cashierSql.listCashTransactionsForDrawersOrDate(db, placeholders).all(tenant_id, ...drawerIds, cleanDate, dateLike, cleanDate);
  } catch (error) {
    console.error('[db:cashier:getDayTransactions]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:cashier:getAuditLog` */
export function getAuditLog({ tenant_id, limit = 50, offset = 0 }: { tenant_id: string; limit?: number; offset?: number }) {
  try {
    const db = getDb();
    return cashierSql.findCashierAuditLog(db).all(tenant_id, limit, offset);
  } catch (error) {
    console.error('[db:cashier:getAuditLog]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:cashier:getCategories` */
export function getCategories({ tenant_id, type }: { tenant_id: string; type?: 'CASH_IN' | 'CASH_OUT' }) {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    const { statement, params } = cashierSql.getCategoriesStatement(db, { tenant_id, type });
    return statement.all(...params);
  } catch (error) {
    console.error('[db:cashier:getCategories]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:cashier:addCategory` */
export function addCategory({ tenant_id, name, type }: { tenant_id: string; name: string; type: 'CASH_IN' | 'CASH_OUT' }) {
  try {
    const db = getDb();
    if (!tenant_id || !name || !type) return { success: false, error: 'Missing required fields' };
    if (!['CASH_IN', 'CASH_OUT'].includes(type)) return { success: false, error: 'Type must be CASH_IN or CASH_OUT' };
    const category_id = crypto.randomUUID();
    cashierSql.insertCashCategory(db).run(category_id, tenant_id, name.trim(), type, tenant_id, type);
    return { success: true, category: { category_id, tenant_id, name: name.trim(), type } };
  } catch (error) {
    console.error('[db:cashier:addCategory]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:cashier:deleteCategory` */
export function deleteCategory({ category_id, tenant_id }: { category_id: string; tenant_id: string }) {
  try {
    const db = getDb();
    const cat = cashierSql.findCashCategoriesByCategoryId(db).get(category_id, tenant_id) as CashCategoryRow | undefined;
    if (!cat) return { success: false, error: 'Category not found' };
    if (cat.is_default === 1) return { success: false, error: 'Cannot delete default category' };
    cashierSql.deleteCashCategoryByCategoryId(db).run(category_id, tenant_id);
    return { success: true };
  } catch (error) {
    console.error('[db:cashier:deleteCategory]', error);
    return { success: false, error: 'Operation failed' };
  }
}
