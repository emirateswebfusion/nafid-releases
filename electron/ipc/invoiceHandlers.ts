import { ipcMain } from 'electron';
import crypto from 'node:crypto';
import { getDb, upsertCustomerRecord } from '../db/localDb.js';
import {
  triggerUrgentInvoiceSync,
  triggerUrgentQuotationSync,
  triggerUrgentWarrantySync
} from '../sync/syncWorker.js';
import {
  syncInvoiceCreditLedger,
  resetBackfillThrottle,
  syncReturnLedger,
  recalcPartyBalances,
  checkCustomerOverdueSync,
  computeCustomerCreditStatusSync
} from '../services/partyLedgerService.js';
import {
  getOrInitTerminalCode,
  requestServerInvoiceNumber,
  getGuaranteedNextInvoiceNumber,
  peekGuaranteedNextInvoiceNumber
} from '../services/invoiceNumberService.js';
import {
  adjustCashDrawerForInvoice,
  adjustPaymentSourcesForInvoice,
  deduplicateAndGetOpenDrawer,
  getCashAmountFromInvoice,
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
  resolveGstApplicability,
  deterministicUUID,
  localDate,
  localTimestamp,
  parseCleanDate,
  getUtcRangeForStoreDateRange,
  getStoreTimezoneSetting
} from './common.js';

const recentCheckoutsCache = new Map<string, { timestamp: number; result: any }>();

export function registerInvoiceHandlers(): void {

ipcMain.handle('db:checkout', safeHandler((event, payload) => {
  const { items, scrap_items, ...invoice } = payload;
  const db = getDb();
  const tenantId = invoice.tenant_id || 'global';

  // Deduplication guard: block duplicate checkout calls within a 4-second window
  const itemsSig = (items || []).map((i: any) => `${i.product_id}:${i.quantity}:${i.unit_price}`).sort().join('|');
  const cacheKey = `${tenantId}:${invoice.grand_total}:${itemsSig}`;
  const now = Date.now();
  const cached = recentCheckoutsCache.get(cacheKey);
  if (cached && (now - cached.timestamp < 4000)) {
    console.warn(`[db:checkout] Duplicate checkout request blocked within 4s window (Key: ${cacheKey}). Returning previous invoice ${cached.result.invoice_number}`);
    return cached.result;
  }

  // Idempotency guard: if invoice_id already exists in database, return existing result
  if (invoice.invoice_id) {
    const existingById: any = db.prepare('SELECT invoice_id, invoice_number FROM invoices WHERE invoice_id = ?').get(invoice.invoice_id);
    if (existingById) {
      console.warn(`[db:checkout] Invoice ID ${invoice.invoice_id} already exists in database. Returning existing invoice ${existingById.invoice_number}`);
      const res = { success: true, invoice_id: existingById.invoice_id, invoice_number: existingById.invoice_number };
      recentCheckoutsCache.set(cacheKey, { timestamp: now, result: res });
      return res;
    }
  }

  // Collision guard: if invoice_number is missing or already taken by another invoice, generate a guaranteed unique number
  let finalInvoiceNumber = invoice.invoice_number;
  const tripleSeriesRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'three_invoice_series');
  let isTripleSeries = false;
  if (tripleSeriesRow && tripleSeriesRow.value) {
    try { isTripleSeries = Boolean(JSON.parse(tripleSeriesRow.value).enabled); } catch {}
  }
  let resolvedSeries: string | undefined;
  if (invoice.invoice_type === 'GST') {
    if (isTripleSeries) {
      resolvedSeries = (invoice.customer_gstin && String(invoice.customer_gstin).trim()) ? 'gst_b2b' : 'gst_b2c';
    } else {
      resolvedSeries = 'gst';
    }
  }
  const configKey = resolvedSeries === 'gst_b2b' ? 'gst_b2b_invoice_counter_config' : resolvedSeries === 'gst_b2c' ? 'gst_b2c_invoice_counter_config' : resolvedSeries === 'gst' ? 'gst_invoice_counter_config' : 'invoice_counter_config';

  if (!finalInvoiceNumber) {
    finalInvoiceNumber = getGuaranteedNextInvoiceNumber(db, tenantId, configKey).invoiceNumber;
  } else {
    const existingByNum: any = db.prepare('SELECT invoice_id FROM invoices WHERE tenant_id = ? AND invoice_number = ? LIMIT 1').get(tenantId, finalInvoiceNumber);
    if (existingByNum) {
      console.warn(`[db:checkout] Invoice number collision detected for "${finalInvoiceNumber}". Resolving with new guaranteed unique number.`);
      finalInvoiceNumber = getGuaranteedNextInvoiceNumber(db, tenantId, configKey).invoiceNumber;
    }
  }

  let checkoutCreatedAt = '';
  const transaction = db.transaction(() => {
    // Credit Limit & Credit Period enforcement guard
    const paymentMethodUpper = (invoice.payment_method || '').toUpperCase();
    let splitObj: any = null;
    if (invoice.split_details && typeof invoice.split_details === 'string') {
      try { splitObj = JSON.parse(invoice.split_details); } catch {}
    } else if (invoice.split_details && typeof invoice.split_details === 'object') {
      splitObj = invoice.split_details;
    }
    const isCreditBilling = paymentMethodUpper === 'CREDIT' || (paymentMethodUpper === 'SPLIT' && Number(splitObj?.credit) > 0);

    if (isCreditBilling) {
      const custPhone = (invoice.customer_phone || '').trim();
      const custName = (invoice.customer_name || '').trim();
      let matchedParty: any = null;
      if (custPhone) {
        const cleanDigits = custPhone.replace(/\D/g, '');
        if (cleanDigits.length >= 7) {
          const last10 = cleanDigits.slice(-10);
          matchedParty = db.prepare(`
            SELECT * FROM parties 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND (phone = ? OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?)
            LIMIT 1
          `).get(tenantId, custPhone, `%${last10}`);
        } else {
          matchedParty = db.prepare('SELECT * FROM parties WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)').get(tenantId, custPhone);
        }
      }
      if (!matchedParty && custName) {
        matchedParty = db.prepare('SELECT * FROM parties WHERE tenant_id = ? AND name = ? COLLATE NOCASE AND (is_deleted IS NULL OR is_deleted = 0)').get(tenantId, custName);
      }

      if (matchedParty && Number(matchedParty.credit_limit) > 0) {
        const creditLimit = Number(matchedParty.credit_limit);
        const curBal = Math.max(0, Number(matchedParty.balance) || 0);
        const billCredit = paymentMethodUpper === 'CREDIT'
          ? Math.max(0, Number(invoice.grand_total) - (Number(invoice.received_amount) || 0))
          : Math.max(0, Number(splitObj?.credit) || 0);
        const projected = curBal + billCredit;
        if (projected > creditLimit) {
          const excess = projected - creditLimit;
          throw new Error(`Credit limit of ₹${creditLimit.toLocaleString('en-IN')} exceeded for ${matchedParty.name || 'Customer'}! Current balance: ₹${curBal.toLocaleString('en-IN')}, Bill credit: ₹${billCredit.toLocaleString('en-IN')}. Exceeds limit by ₹${excess.toLocaleString('en-IN')}.`);
        }
      }

      // Credit Period Expiry restriction check:
      // Restricts only credit purchases if configured to restrict when overdue bills exist
      const overdueStatus = checkCustomerOverdueSync(db, tenantId, invoice.customer_id, custPhone, custName);
      if (overdueStatus.creditPeriodEnabled && overdueStatus.restrictOnExpiry && overdueStatus.isOverdue) {
        const fmtN = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        throw new Error(
          `Credit purchase blocked: ${overdueStatus.customerName} has ${overdueStatus.overdueCount} overdue credit bill(s) totaling ₹${fmtN(overdueStatus.overdueAmount)} (oldest overdue by ${overdueStatus.oldestOverdueDays} days). Credit period has expired. Please settle pending dues before making new credit purchases.`
        );
      }
    }

    const customerId = invoice.customer_id || upsertCustomerRecord(
      db,
      tenantId,
      invoice.customer_name,
      invoice.customer_phone,
      invoice.customer_address
    );

    // Calculate due date if credit purchase and customer has credit period configured
    let calculatedDueDate: string | null = invoice.due_date || null;
    if (!calculatedDueDate && isCreditBilling) {
      const custPhone = (invoice.customer_phone || '').trim();
      const custName = (invoice.customer_name || '').trim();
      const overdueStatus = checkCustomerOverdueSync(db, tenantId, customerId || invoice.customer_id, custPhone, custName);
      if (overdueStatus.creditPeriodEnabled && overdueStatus.creditPeriodDays > 0) {
        calculatedDueDate = new Date(Date.now() + overdueStatus.creditPeriodDays * 24 * 60 * 60 * 1000).toISOString();
      }
    }

    const nowTimestamp = invoice.created_at
      ? (isNaN(new Date(invoice.created_at).getTime()) ? localTimestamp() : new Date(invoice.created_at).toISOString())
      : localTimestamp();
    checkoutCreatedAt = nowTimestamp;

    // Loyalty Points Processing
    let custRow: any = null;
    if (customerId) {
      custRow = db.prepare('SELECT customer_id, total_points_earned, total_points_redeemed, current_points_balance FROM customers WHERE customer_id = ?').get(customerId);
    }

    const previousPointsBal = custRow ? (Number(custRow.current_points_balance) || 0) : (Number(invoice.previous_points_balance) || 0);
    let ptsRedeemed = Math.max(0, Number(invoice.points_redeemed) || 0);
    if (ptsRedeemed > previousPointsBal) {
      ptsRedeemed = previousPointsBal;
    }
    const ptsRedeemedDiscount = Math.max(0, Number(invoice.points_redeemed_discount) || 0);

    let ptsEarned = Math.max(0, Number(invoice.points_earned) || 0);
    if (customerId && invoice.payment_method !== 'HOLD') {
      try {
        const lCfgRow: any = db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'loyalty_config'").get(tenantId)
          || db.prepare("SELECT value FROM settings WHERE tenant_id = 'global' AND key = 'loyalty_config'").get();
        let lCfg: any = null;
        if (lCfgRow?.value) {
          lCfg = typeof lCfgRow.value === 'string' ? JSON.parse(lCfgRow.value) : lCfgRow.value;
        }
        const flagsRow: any = db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'feature_flags'").get(tenantId)
          || db.prepare("SELECT value FROM settings WHERE tenant_id = 'global' AND key = 'feature_flags'").get();
        let flags: any = null;
        if (flagsRow?.value) {
          flags = typeof flagsRow.value === 'string' ? JSON.parse(flagsRow.value) : flagsRow.value;
        }
        const isLoyaltyOn = Boolean(lCfg?.enabled) || Boolean(flags?.loyalty);
        const awardOnPending = Boolean(lCfg?.awardPointsOnPending);
        const shouldAwardNow = invoice.payment_method !== 'PENDING' || awardOnPending;

        if (!shouldAwardNow) {
          ptsEarned = 0;
        } else if (isLoyaltyOn && ptsEarned === 0) {
          const earningRate = Math.max(1, Number(lCfg?.earningRate) || 100);
          ptsEarned = Math.floor(Math.max(0, Number(invoice.grand_total) || 0) / earningRate);
        }
      } catch (e) {
        console.warn('[db:checkout] Failed to evaluate loyalty points on checkout:', e);
      }
    }

    const remainingPointsBal = Math.max(0, previousPointsBal - ptsRedeemed + ptsEarned);

    const invStmt = db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, user_id, invoice_number, invoice_type, 
        subtotal, tax_total, discount_total, discount_type, discount_value, grand_total, 
        payment_method, split_details, received_amount, balance_amount, customer_name, customer_phone, customer_gstin, customer_state, customer_address, sync_status,
        scrap_deduction, scrap_invoice_number, return_deduction, return_invoice_number, customer_id,
        cgst_total, sgst_total, igst_total, supply_type, actual_refund_paid, notes, description, settled_at, due_date,
        points_earned, points_redeemed, points_redeemed_discount, previous_points_balance, remaining_points_balance,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    invStmt.run(
      invoice.invoice_id,
      invoice.tenant_id,
      invoice.user_id,
      finalInvoiceNumber,
      invoice.invoice_type,
      invoice.subtotal,
      invoice.tax_total,
      invoice.discount_total,
      invoice.discount_type || 'FIXED',
      invoice.discount_value || 0,
      invoice.grand_total,
      invoice.payment_method || 'PENDING',
      invoice.split_details && typeof invoice.split_details === 'object' ? JSON.stringify(invoice.split_details) : (invoice.split_details && invoice.split_details !== 'null' ? invoice.split_details : null),
      invoice.received_amount ?? 0,
      invoice.balance_amount ?? 0,
      invoice.customer_name || null,
      invoice.customer_phone || null,
      invoice.customer_gstin || null,
      invoice.customer_state || null,
      invoice.customer_address || null,
      invoice.scrap_deduction ?? 0,
      invoice.scrap_invoice_number || null,
      invoice.return_deduction ?? 0,
      invoice.return_invoice_number || null,
      customerId || null,
      // GST split totals (Indian GST Act compliance)
      invoice.cgst_total ?? 0,
      invoice.sgst_total ?? 0,
      invoice.igst_total ?? 0,
      invoice.supply_type || 'INTRA',
      invoice.actual_refund_paid ?? 0,
      invoice.notes || invoice.description || null,
      invoice.description || invoice.notes || null,
      (invoice.payment_method && invoice.payment_method !== 'PENDING' && invoice.payment_method !== 'HOLD') ? nowTimestamp : null,
      calculatedDueDate,
      ptsEarned,
      ptsRedeemed,
      ptsRedeemedDiscount,
      previousPointsBal,
      remainingPointsBal,
      nowTimestamp,
      nowTimestamp
    );

    // Record Loyalty Transactions & Update Customer Points Balance
    if (customerId) {
      let runningPoints = previousPointsBal;
      if (ptsRedeemed > 0) {
        const afterRedeem = Math.max(0, runningPoints - ptsRedeemed);
        const rTxId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO loyalty_transactions (
            transaction_id, tenant_id, customer_id, invoice_id,
            transaction_type, points, points_balance_before, points_balance_after,
            reference_number, description, created_by, sync_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'REDEEMED', ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
        `).run(
          rTxId, tenantId, customerId, invoice.invoice_id,
          ptsRedeemed, runningPoints, afterRedeem,
          finalInvoiceNumber,
          `Redeemed ${ptsRedeemed} points for ₹${ptsRedeemedDiscount.toFixed(2)} discount on invoice ${finalInvoiceNumber}`,
          invoice.user_id || 'system',
          nowTimestamp, nowTimestamp
        );
        runningPoints = afterRedeem;
      }

      if (ptsEarned > 0) {
        const afterEarn = runningPoints + ptsEarned;
        const eTxId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO loyalty_transactions (
            transaction_id, tenant_id, customer_id, invoice_id,
            transaction_type, points, points_balance_before, points_balance_after,
            reference_number, description, created_by, sync_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'EARNED', ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
        `).run(
          eTxId, tenantId, customerId, invoice.invoice_id,
          ptsEarned, runningPoints, afterEarn,
          finalInvoiceNumber,
          `Earned ${ptsEarned} points on invoice ${finalInvoiceNumber}`,
          invoice.user_id || 'system',
          nowTimestamp, nowTimestamp
        );
        runningPoints = afterEarn;
      }

      db.prepare(`
        UPDATE customers SET
          total_points_earned = COALESCE(total_points_earned, 0) + ?,
          total_points_redeemed = COALESCE(total_points_redeemed, 0) + ?,
          current_points_balance = ?,
          last_purchase_date = ?,
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
        WHERE customer_id = ?
      `).run(
        ptsEarned,
        ptsRedeemed,
        runningPoints,
        nowTimestamp,
        customerId
      );
    }

    // 2. Insert items and update stock
    const itemStmt = db.prepare(`
      INSERT INTO invoice_items (item_id, invoice_id, tenant_id, product_id, name, quantity, unit_price, tax_amount, total, pieces_sold, is_service_item, combo_id, combo_details, billing_type, uom,
        cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, hsn_sac_code, supply_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const stockStmt = db.prepare('UPDATE products SET current_stock = current_stock - ?, sync_status = \'PENDING\' WHERE product_id = ?');
    const getDaStmt = db.prepare('SELECT domain_attributes FROM products WHERE product_id = ?');
    const updDaStmt = db.prepare('UPDATE products SET domain_attributes = ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?');

    for (const item of items) {
      const isCombo = Boolean(item.isCombo || item.combo_id || (item.combo_items && item.combo_items.length > 0));
      const comboId = item.combo_id || (isCombo ? item.product_id : null);
      const comboDetailsJson = item.combo_items ? JSON.stringify(item.combo_items) : null;

      itemStmt.run(
        item.item_id,
        invoice.invoice_id,
        invoice.tenant_id,
        item.product_id,
        item.name,
        item.quantity,
        item.unit_price,
        item.tax_amount,
        item.total,
        item.pieces_sold ?? item.pieces_override ?? null,
        item.isServiceItem ? 1 : 0,
        comboId,
        comboDetailsJson,
        item.billing_type || null,
        item.uom || item.unit || null,
        // GST split per line item (Indian GST Act compliance)
        item.cgst_rate ?? 0,
        item.sgst_rate ?? 0,
        item.igst_rate ?? 0,
        item.cgst_amount ?? 0,
        item.sgst_amount ?? 0,
        item.igst_amount ?? 0,
        item.hsn_sac_code || null,
        item.supply_type || 'INTRA',
      );
      if (!item.isServiceItem) {
        if (isCombo && item.combo_items && Array.isArray(item.combo_items)) {
          for (const ci of item.combo_items) {
            const qtyToDeduct = (Number(ci.quantity) || 1) * (Number(item.quantity) || 1);
            stockStmt.run(qtyToDeduct, ci.product_id);
          }
        } else {
          stockStmt.run(item.quantity, item.product_id);
        }

        if (item.pieces_sold) {
          const row = getDaStmt.get(item.product_id) as any;
          if (row?.domain_attributes) {
            try {
              const da = JSON.parse(row.domain_attributes);
              if (da.pcs !== undefined || da.pcs_stock !== undefined) {
                const nextPcs = Math.max(0, (Number(da.pcs_stock ?? da.pcs) || 0) - item.pieces_sold);
                da.pcs_stock = nextPcs;
                da.pcs = nextPcs;
                updDaStmt.run(JSON.stringify(da), item.product_id);
              }
            } catch {}
          }
        }
      }
    }

    // 3. Handle scrap credit deduction settlement & single-use validation
    if (invoice.scrap_invoice_number && Number(invoice.scrap_deduction) > 0) {
      const existingScrapTx = db.prepare(`
        SELECT payment_status FROM scrap_transactions
        WHERE tenant_id = ? AND scrap_invoice_number = ? AND (is_deleted IS NULL OR is_deleted = 0)
        LIMIT 1
      `).get(invoice.tenant_id, invoice.scrap_invoice_number) as any;

      if (existingScrapTx && existingScrapTx.payment_status === 'SETTLED') {
        throw new Error(`Scrap credit ${invoice.scrap_invoice_number} has already been redeemed.`);
      }

      db.prepare(`
        UPDATE scrap_transactions
        SET payment_status = 'SETTLED', sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND scrap_invoice_number = ?
      `).run(invoice.tenant_id, invoice.scrap_invoice_number);
    }

    // 4. Handle scrap items â€” create scrap transactions and update scrap stock
    if (scrap_items && scrap_items.length > 0) {
      const scrapTxStmt = db.prepare(`
        INSERT INTO scrap_transactions (transaction_id, tenant_id, type, scrap_category_id, quantity, rate, total_amount, party_name, customer_phone, customer_address, notes, scrap_invoice_number, payment_status, sync_status, updated_at)
        VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
      `);
      const scrapStockStmt = db.prepare(`UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`);

      for (const scrap of scrap_items) {
        scrapTxStmt.run(
          scrap.transaction_id,
          invoice.tenant_id,
          scrap.scrap_category_id,
          scrap.quantity,
          scrap.rate,
          scrap.total_amount,
          invoice.customer_name || null,
          invoice.customer_phone || null,
          invoice.customer_address || null,
          `From invoice ${finalInvoiceNumber}`,
          invoice.scrap_invoice_number || null,
          scrap.payment_status || 'SETTLED'
        );
        scrapStockStmt.run(scrap.quantity, scrap.scrap_category_id);
      }
    }

    // If payment method is CREDIT, sync with parties/staff ledger
    syncInvoiceCreditLedger(db, {
      ...invoice,
      invoice_number: finalInvoiceNumber,
      received_amount: invoice.received_amount ?? 0,
      balance_amount: invoice.balance_amount ?? 0,
      is_staff: Boolean(invoice.is_staff || invoice.isStaffCustomer),
      staff_id: invoice.staff_id || null,
    });
    // Reset backfill cooldown so the next db:getParties call immediately
    // picks up this newly created credit entry.
    resetBackfillThrottle();
  });

  try {
    transaction();

    const newCash = getCashAmountFromInvoice(invoice);
    if (newCash > 0) {
      adjustCashDrawerForInvoice(db, invoice.tenant_id || 'global', localDate(), 0, newCash);
    }
    adjustPaymentSourcesForInvoice(db, invoice.tenant_id || 'global', invoice, false);
    if (newCash <= 0) {
      const scrapD = Number(invoice.scrap_deduction) || 0;
      const returnD = Number(invoice.return_deduction) || 0;
      const totalDeductions = scrapD + returnD;
      const sub = Number(invoice.subtotal) || 0;
      const tax = Number(invoice.tax_total) || 0;
      const disc = Number(invoice.discount_total) || 0;
      const ptsDisc = Number((invoice as any).points_redeemed_discount) || 0;
      const preDeductionTotal = Math.max(0, sub + tax - disc - ptsDisc);
      const netRefund = totalDeductions > preDeductionTotal ? totalDeductions - preDeductionTotal : 0;

      const pm = (invoice.payment_method || '').toUpperCase();
      if (netRefund > 0 && (pm === 'CASH' || pm === 'SPLIT')) {
        const todayDate = localDate();
        const drawer = getOpenCashDrawer(db, invoice.tenant_id || 'global', todayDate);
        if (drawer) {
          const txnId = crypto.randomUUID();
          db.prepare(`
            INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, sync_status)
            VALUES (?, ?, ?, 'CASH_OUT', ?, 'CREDIT_REFUND', ?, ?, 'PENDING')
          `).run(
            txnId,
            invoice.tenant_id || 'global',
            drawer.drawer_id,
            netRefund,
            `Net cash refund for invoice ${finalInvoiceNumber}`,
            invoice.user_id || 'system'
          );
          const newCashOut = Number(drawer.cash_out) + netRefund;
          const newCurrentCash = Number(drawer.current_cash) - netRefund;
          const newExpectedClosing = Number(drawer.opening_balance) + Number(drawer.cash_sales) + Number(drawer.cash_in) - newCashOut;
          db.prepare(`
            UPDATE cash_drawer SET cash_out = ?, current_cash = ?, expected_closing = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE drawer_id = ?
          `).run(newCashOut, newCurrentCash, newExpectedClosing, drawer.drawer_id);
        }
      }
    }

    // Trigger immediate background sync so the invoice appears on web portal instantly
    import('../sync/syncWorker.js').then(({ triggerUrgentInvoiceSync, runInitialSync }) => {
      triggerUrgentInvoiceSync().catch(e => console.error('[Main] Immediate urgent sync error:', e));
      runInitialSync().catch(e => console.error('[Main] Immediate sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));

    const res = { success: true, invoice_id: invoice.invoice_id, invoice_number: finalInvoiceNumber, created_at: checkoutCreatedAt };
    recentCheckoutsCache.set(cacheKey, { timestamp: now, result: res });
    if (recentCheckoutsCache.size > 100) {
      for (const [k, v] of recentCheckoutsCache.entries()) {
        if (now - v.timestamp > 30000) recentCheckoutsCache.delete(k);
      }
    }

    return res;
  } catch (error: any) {
    console.error('[db:checkout]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

// â”€â”€ Hold Bill IPC Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Save current cart as a HOLD invoice: deducts stock, sets held_until = now + 24h
ipcMain.handle('db:holdBill', safeHandler((event, payload) => {
  const { items, ...invoice } = payload;
  const db = getDb();
  const transaction = db.transaction(() => {
    // Force a unique HLD invoice number for hold bills to avoid UNIQUE constraint conflicts with regular invoices
    let holdInvoiceNumber = invoice.invoice_number;
    if (!holdInvoiceNumber || !holdInvoiceNumber.includes('HLD')) {
      holdInvoiceNumber = `${(invoice.tenant_id || 'POS1').substring(0, 4).toUpperCase()}-HLD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // 1. Insert the invoice as a HOLD type
    const invStmt = db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, user_id, invoice_number, invoice_type, 
        subtotal, tax_total, discount_total, discount_type, discount_value, grand_total, 
        payment_method, split_details, received_amount, balance_amount, customer_name, customer_phone, 
        customer_gstin, customer_state, customer_address, sync_status,
        scrap_deduction, scrap_invoice_number, return_deduction, return_invoice_number,
        held_until, is_held, hold_note
      )
      VALUES (?, ?, ?, ?, 'HOLD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?, ?, ?, datetime('now', '+24 hours', 'localtime'), 1, ?)
    `);
    invStmt.run(
      invoice.invoice_id,
      invoice.tenant_id,
      invoice.user_id,
      holdInvoiceNumber,
      invoice.subtotal,
      invoice.tax_total,
      invoice.discount_total,
      invoice.discount_type || 'FIXED',
      invoice.discount_value || 0,
      invoice.grand_total,
      invoice.payment_method || 'PENDING',
      invoice.split_details && typeof invoice.split_details === 'object' ? JSON.stringify(invoice.split_details) : (invoice.split_details && invoice.split_details !== 'null' ? invoice.split_details : null),
      invoice.received_amount ?? 0,
      invoice.balance_amount ?? 0,
      invoice.customer_name || null,
      invoice.customer_phone || null,
      invoice.customer_gstin || null,
      invoice.customer_state || null,
      invoice.customer_address || null,
      invoice.scrap_deduction ?? 0,
      invoice.scrap_invoice_number || null,
      invoice.return_deduction ?? 0,
      invoice.return_invoice_number || null,
      invoice.hold_note || null
    );

    // 2. Insert items and DEDUCT stock (reserve the inventory for this hold)
    const itemStmt = db.prepare(`
      INSERT INTO invoice_items (item_id, invoice_id, tenant_id, product_id, name, quantity, unit_price, tax_amount, total, pieces_sold, is_service_item, combo_id, combo_details, billing_type, uom)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const stockStmt = db.prepare('UPDATE products SET current_stock = current_stock - ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND (is_service_item IS NULL OR is_service_item = 0)');

    for (const item of items) {
      const isCombo = Boolean(item.isCombo || item.combo_id || (item.combo_items && item.combo_items.length > 0));
      const comboId = item.combo_id || (isCombo ? item.product_id : null);
      const comboDetailsJson = item.combo_items ? JSON.stringify(item.combo_items) : null;

      itemStmt.run(
        item.item_id,
        invoice.invoice_id,
        invoice.tenant_id,
        item.product_id,
        item.name,
        item.quantity,
        item.unit_price,
        item.tax_amount,
        item.total,
        item.pieces_sold ?? item.pieces_override ?? null,
        item.isServiceItem ? 1 : 0,
        comboId,
        comboDetailsJson,
        item.billing_type || null,
        item.uom || item.unit || null
      );
      if (!item.isServiceItem) {
        if (isCombo && item.combo_items && Array.isArray(item.combo_items)) {
          for (const ci of item.combo_items) {
            const qtyToDeduct = (Number(ci.quantity) || 1) * (Number(item.quantity) || 1);
            stockStmt.run(qtyToDeduct, ci.product_id);
          }
        } else {
          stockStmt.run(item.quantity, item.product_id);
        }
      }
    }
  });

  try {
    transaction();
    return { success: true };
  } catch (error: any) {
    console.error('[db:holdBill]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

// Get all active (non-expired) held bills for a tenant
ipcMain.handle('db:getHeldBills', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM invoices 
      WHERE tenant_id = ? 
        AND invoice_type = 'HOLD' 
        AND is_held = 1 
        AND held_until > datetime('now', 'localtime')
      ORDER BY created_at DESC
    `).all(tenant_id);
  } catch (error: any) {
    console.error('[db:getHeldBills]', error);
    return { error: 'Operation failed' };
  }
});

// Get a specific held bill's full data for recall, restore stock, and mark as recalled
ipcMain.handle('db:recallHeldBill', (event, { invoice_id }: { invoice_id: string }) => {
  try {
    const db = getDb();
    if (!invoice_id) return { success: false, error: 'Missing invoice ID' };

    let resultInvoice: any = null;
    let resultItems: any[] = [];

    const transaction = db.transaction(() => {
      // 1. Get the held invoice
      resultInvoice = db.prepare(
        `SELECT * FROM invoices WHERE invoice_id = ? AND (invoice_type = 'HOLD' OR is_held = 1)`
      ).get(invoice_id) as any;

      if (!resultInvoice) {
        throw new Error('Held bill not found or already recalled');
      }

      // 2. Get line items
      resultItems = db.prepare(
        `SELECT ii.*, p.sku_barcode, p.brand_manufacturer, p.grade_id, p.pricing_mode, pg.rate as grade_rate, pg.purchase_price as grade_purchase_price, 
                p.discount_percent, p.discount_flat, p.offer_price, p.purchase_price, p.base_price,
                p.tax_rate_percent as gst_percent, p.uom, p.hsn_sac_code as hsn, p.billing_type
         FROM invoice_items ii
         LEFT JOIN products p ON ii.product_id = p.product_id
         LEFT JOIN product_grades pg ON p.grade_id = pg.grade_id
         WHERE ii.invoice_id = ?`
      ).all(invoice_id) as any[];

      // 3. Revert stock (add back stock reserved during hold)
      const stockStmt = db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND (is_service_item IS NULL OR is_service_item = 0)');
      for (const item of resultItems) {
        if (!item.is_service_item) {
          if (item.combo_details) {
            try {
              const comboItems = JSON.parse(item.combo_details);
              if (Array.isArray(comboItems)) {
                for (const ci of comboItems) {
                  const qtyToRevert = (Number(ci.quantity) || 1) * (Number(item.quantity) || 1);
                  stockStmt.run(qtyToRevert, ci.product_id);
                }
                continue;
              }
            } catch {}
          }
          if (item.product_id) {
            stockStmt.run(item.quantity, item.product_id);
          }
        }
      }

      // 4. Mark invoice as recalled / deleted so it disappears from held list & sales history
      db.prepare(`
        UPDATE invoices 
        SET is_held = 0, 
            invoice_type = 'RECALLED_HOLD',
            is_deleted = 1,
            sync_status = 'SYNCED', 
            updated_at = CURRENT_TIMESTAMP 
        WHERE invoice_id = ?
      `).run(invoice_id);
    });

    transaction();
    return { success: true, invoice: resultInvoice, items: resultItems };
  } catch (error: any) {
    console.error('[db:recallHeldBill]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
});

// Manually release a held bill â€” revert stock and mark as expired
ipcMain.handle('db:releaseHeldBill', (event, { invoice_id }: { invoice_id: string }) => {
  try {
    const db = getDb();
    const transaction = db.transaction(() => {
      // 1. Check it's a valid held bill
      const invoice = db.prepare(
        `SELECT * FROM invoices WHERE invoice_id = ? AND invoice_type = 'HOLD' AND is_held = 1`
      ).get(invoice_id) as any;
      if (!invoice) {
        throw new Error('Held bill not found');
      }

      // 2. Get items to revert stock
      const items = db.prepare(
        'SELECT product_id, quantity, is_service_item, combo_details FROM invoice_items WHERE invoice_id = ?'
      ).all(invoice_id) as any[];

      // 3. Revert stock (add back)
      const stockStmt = db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND (is_service_item IS NULL OR is_service_item = 0)');
      for (const item of items) {
        if (!item.is_service_item) {
          if (item.combo_details) {
            try {
              const comboItems = JSON.parse(item.combo_details);
              if (Array.isArray(comboItems)) {
                for (const ci of comboItems) {
                  const qtyToRevert = (Number(ci.quantity) || 1) * (Number(item.quantity) || 1);
                  stockStmt.run(qtyToRevert, ci.product_id);
                }
                continue;
              }
            } catch {}
          }
          if (item.product_id) {
            stockStmt.run(item.quantity, item.product_id);
          }
        }
      }

      // 4. Mark invoice as expired/held = 0, change type to track it (keep sync_status='SYNCED' so it stays out of the sync queue)
      db.prepare(`
        UPDATE invoices 
        SET is_held = 0, 
            invoice_type = 'EXPIRED_HOLD', 
            is_deleted = 1,
            sync_status = 'SYNCED', 
            updated_at = CURRENT_TIMESTAMP 
        WHERE invoice_id = ?
      `).run(invoice_id);
    });

    transaction();
    return { success: true };
  } catch (error: any) {
    console.error('[db:releaseHeldBill]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
});

// Auto-expire stale held bills â€” called on startup
ipcMain.handle('db:expireStaleHeldBills', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    let expiredCount = 0;

    const transaction = db.transaction(() => {
      // 1. Find all expired held bills
      const expired = db.prepare(`
        SELECT invoice_id FROM invoices 
        WHERE tenant_id = ? 
          AND (invoice_type = 'HOLD' OR is_held = 1)
          AND held_until <= datetime('now', 'localtime')
      `).all(tenant_id) as any[];

      for (const bill of expired) {
        // 2. Get items to revert stock
        const items = db.prepare(
          'SELECT product_id, quantity, is_service_item, combo_details FROM invoice_items WHERE invoice_id = ?'
        ).all(bill.invoice_id) as any[];

        // 3. Revert stock
        const stockStmt = db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND (is_service_item IS NULL OR is_service_item = 0)');
        for (const item of items) {
          if (!item.is_service_item) {
            if (item.combo_details) {
              try {
                const comboItems = JSON.parse(item.combo_details);
                if (Array.isArray(comboItems)) {
                  for (const ci of comboItems) {
                    const qtyToRevert = (Number(ci.quantity) || 1) * (Number(item.quantity) || 1);
                    stockStmt.run(qtyToRevert, ci.product_id);
                  }
                  continue;
                }
              } catch {}
            }
            if (item.product_id) {
              stockStmt.run(item.quantity, item.product_id);
            }
          }
        }

        // 4. Mark as expired & deleted
        db.prepare(`
          UPDATE invoices 
          SET is_held = 0, 
              invoice_type = 'EXPIRED_HOLD', 
              is_deleted = 1,
              sync_status = 'SYNCED', 
              updated_at = CURRENT_TIMESTAMP 
          WHERE invoice_id = ?
        `).run(bill.invoice_id);

        expiredCount++;
      }

      // Cleanup any non-held EXPIRED_HOLD or RECALLED_HOLD records so they never leak into queries
      db.prepare(`UPDATE invoices SET is_deleted = 1, is_held = 0 WHERE tenant_id = ? AND invoice_type IN ('EXPIRED_HOLD', 'RECALLED_HOLD') AND (is_deleted IS NULL OR is_deleted = 0)`).run(tenant_id);
    });

    transaction();
    if (expiredCount > 0) {
      console.log(`[Hold] Expired ${expiredCount} stale held bill(s) and reverted stock`);
    }
    return { success: true, expiredCount };
  } catch (error: any) {
    console.error('[db:expireStaleHeldBills]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// â”€â”€ Payment Methods (BANK / CARD / UPI sources) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('db:payments:getSources', (event, tenant_id: string) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    return db.prepare(`
      SELECT ps.*,
        (SELECT COUNT(*) FROM payment_source_transactions pst WHERE pst.source_id = ps.source_id) AS transaction_count,
        (SELECT MAX(pst.transaction_date) FROM payment_source_transactions pst WHERE pst.source_id = ps.source_id) AS last_transaction_date
      FROM payment_sources ps
      WHERE ps.tenant_id = ? AND ps.is_deleted = 0
      ORDER BY ps.type ASC, ps.sort_order ASC, ps.name COLLATE NOCASE ASC
    `).all(tenant_id);
  } catch (error: any) {
    console.error('[db:payments:getSources]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:payments:addSource', safeHandler((event, s: any) => {
  try {
    const db = getDb();
    if (!s?.tenant_id || !s?.name || !s?.type) return { success: false, error: 'tenant_id, name and type are required' };
    if (!['BANK', 'CARD', 'UPI'].includes(s.type)) return { success: false, error: 'type must be BANK, CARD or UPI' };

    const tx = db.transaction(() => {
      const opening = parseFloat(s.opening_balance) || 0;
      const makeDefault = s.is_default === true || s.is_default === 1;
      const source_id = s.source_id || crypto.randomUUID();

      if (makeDefault) {
        db.prepare(`UPDATE payment_sources SET is_default = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND type = ? AND is_deleted = 0`)
          .run(s.tenant_id, s.type);
      }

      db.prepare(`
        INSERT INTO payment_sources (source_id, tenant_id, name, type, bank_name, account_number, holder_name, upi_id, opening_balance, current_balance, is_default, is_enabled, sort_order, is_deleted, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        source_id, s.tenant_id, s.name.trim(), s.type,
        s.bank_name?.trim() || null, s.account_number?.trim() || null,
        s.holder_name?.trim() || null, s.upi_id?.trim() || null,
        opening, opening, makeDefault ? 1 : 0, s.is_enabled === false ? 0 : 1,
        s.sort_order ?? 0
      );

      if (opening > 0) {
        db.prepare(`
          INSERT INTO payment_source_transactions (transaction_id, tenant_id, source_id, type, amount, category, notes, transaction_date, running_balance, entered_by, entered_by_name, sync_status)
          VALUES (?, ?, ?, 'CASH_IN', ?, 'Opening Balance', ?, CURRENT_TIMESTAMP, ?, ?, ?, 'PENDING')
        `).run(
          crypto.randomUUID(), s.tenant_id, source_id, opening,
          `Opening balance for ${s.name.trim()}`, opening, s.created_by || null, s.created_by_name || null
        );
      }
      return source_id;
    });

    const source_id = tx();
    return { success: true, source_id };
  } catch (error: any) {
    console.error('[db:payments:addSource]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:payments:updateSource', safeHandler((event, s: any) => {
  try {
    const db = getDb();
    if (!s?.source_id || !s?.tenant_id) return { success: false, error: 'source_id and tenant_id are required' };

    const tx = db.transaction(() => {
      const existing = db.prepare(`SELECT * FROM payment_sources WHERE source_id = ? AND tenant_id = ? AND is_deleted = 0`).get(s.source_id, s.tenant_id) as any;
      if (!existing) throw new Error('Payment source not found');

      if (s.is_default === true) {
        db.prepare(`UPDATE payment_sources SET is_default = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND type = ? AND is_deleted = 0`)
          .run(s.tenant_id, existing.type);
      }

      let newOpening: number | null = null;
      if (s.opening_balance !== undefined) {
        const parsedOpening = parseFloat(s.opening_balance) || 0;
        if (parsedOpening !== Number(existing.opening_balance)) {
          const txCount = (db.prepare(`SELECT COUNT(*) as cnt FROM payment_source_transactions WHERE source_id = ?`).get(s.source_id) as any).cnt;
          if (txCount > 0) throw new Error('Opening balance can only be changed when there are no transactions on this source');
          newOpening = parsedOpening;
        }
      }

      db.prepare(`
        UPDATE payment_sources SET
          name = COALESCE(?, name),
          bank_name = ?, account_number = ?, holder_name = ?, upi_id = ?,
          is_enabled = COALESCE(?, is_enabled),
          is_default = COALESCE(?, is_default),
          sort_order = COALESCE(?, sort_order),
          opening_balance = COALESCE(?, opening_balance),
          current_balance = COALESCE(?, current_balance),
          sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE source_id = ? AND tenant_id = ?
      `).run(
        s.name?.trim() || null,
        s.bank_name !== undefined ? (s.bank_name?.trim() || null) : existing.bank_name,
        s.account_number !== undefined ? (s.account_number?.trim() || null) : existing.account_number,
        s.holder_name !== undefined ? (s.holder_name?.trim() || null) : existing.holder_name,
        s.upi_id !== undefined ? (s.upi_id?.trim() || null) : existing.upi_id,
        s.is_enabled !== undefined ? (s.is_enabled === true || s.is_enabled === 1 ? 1 : 0) : undefined,
        s.is_default !== undefined ? (s.is_default === true || s.is_default === 1 ? 1 : 0) : undefined,
        s.sort_order !== undefined ? s.sort_order : undefined,
        newOpening,
        newOpening !== null ? newOpening : undefined,
        s.source_id, s.tenant_id
      );

      if (newOpening !== null) {
        db.prepare(`UPDATE payment_source_transactions SET amount = ?, running_balance = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE source_id = ? AND category = 'Opening Balance' AND tenant_id = ?`)
          .run(newOpening, newOpening, s.source_id, s.tenant_id);
      }
    });

    tx();
    return { success: true };
  } catch (error: any) {
    console.error('[db:payments:updateSource]', error);
    if (error.message?.includes('Opening balance')) return { success: false, error: error.message };
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:payments:deleteSource', (event, { source_id, tenant_id }: { source_id: string; tenant_id: string }) => {
  try {
    const db = getDb();
    const result = db.prepare(`UPDATE payment_sources SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE source_id = ? AND tenant_id = ?`)
      .run(source_id, tenant_id);
    if (result.changes === 0) return { success: false, error: 'Payment source not found' };
    return { success: true };
  } catch (error: any) {
    console.error('[db:payments:deleteSource]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:payments:getTransactions', (event, { source_id, tenant_id }: { source_id: string; tenant_id: string }) => {
  try {
    const db = getDb();
    if (!source_id || !tenant_id) return [];
    return db.prepare(`
      SELECT * FROM payment_source_transactions
      WHERE source_id = ? AND tenant_id = ?
      ORDER BY transaction_date DESC, created_at DESC
      LIMIT 500
    `).all(source_id, tenant_id);
  } catch (error: any) {
    console.error('[db:payments:getTransactions]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:payments:addTransaction', safeHandler((event, t: any) => {
  try {
    const db = getDb();
    if (!t?.tenant_id || !t?.source_id) return { success: false, error: 'tenant_id and source_id are required' };
    if (!['CASH_IN', 'CASH_OUT'].includes(t.type)) return { success: false, error: 'type must be CASH_IN or CASH_OUT' };
    const amount = Number(t.amount);
    if (!isFinite(amount) || amount <= 0) return { success: false, error: 'amount must be a positive number' };

    const tx = db.transaction(() => {
      const source = db.prepare(`SELECT * FROM payment_sources WHERE source_id = ? AND tenant_id = ? AND is_deleted = 0`).get(t.source_id, t.tenant_id) as any;
      if (!source) throw new Error('Payment source not found');

      const currentBalance = Number(source.current_balance) || 0;
      const newBalance = t.type === 'CASH_IN' ? currentBalance + amount : currentBalance - amount;

      db.prepare(`
        INSERT INTO payment_source_transactions (transaction_id, tenant_id, source_id, type, amount, category, notes, reference_number, transaction_date, running_balance, entered_by, entered_by_name, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, 'PENDING')
      `).run(
        t.transaction_id || crypto.randomUUID(), t.tenant_id, t.source_id, t.type, amount,
        t.category?.trim() || null, t.notes?.trim() || null, t.reference_number?.trim() || null,
        t.transaction_date || null, newBalance, t.entered_by || null, t.entered_by_name || null
      );

      db.prepare(`UPDATE payment_sources SET current_balance = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE source_id = ? AND tenant_id = ?`)
        .run(newBalance, t.source_id, t.tenant_id);

      return newBalance;
    });

    const balance = tx();
    return { success: true, balance };
  } catch (error: any) {
    console.error('[db:payments:addTransaction]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

// â”€â”€ Diagnostic: Clear stuck PENDING sync records â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


ipcMain.handle('db:applyInvoiceDiscount', (event, { invoice_id, discount_type, discount_value, role }: { invoice_id: string, discount_type: 'FIXED' | 'PERCENTAGE', discount_value: number, role?: string }) => {
  try {
    const db = getDb();

    // Only ADMIN or SUPER_ADMIN can apply discounts
    const normalizedRole = (role || '').toUpperCase();
    if (!['ADMIN', 'SUPER_ADMIN', 'OWNER'].includes(normalizedRole)) {
      return { success: false, error: 'Admin access required to apply discounts' };
    }
    
    const invoice = db.prepare('SELECT subtotal, tax_total, scrap_deduction, return_deduction FROM invoices WHERE invoice_id = ?').get(invoice_id) as any;
    if (!invoice) return { success: false, error: 'Invoice not found' };

    let discount_total = 0;
    if (discount_type === 'PERCENTAGE') {
      discount_total = invoice.subtotal * (discount_value / 100);
    } else {
      discount_total = discount_value;
    }

    const scrapD = Math.max(0, Number(invoice.scrap_deduction) || 0);
    const returnD = Math.max(0, Number(invoice.return_deduction) || 0);
    const grand_total = Math.max(0, invoice.subtotal + invoice.tax_total - discount_total - scrapD - returnD);

    db.prepare(`
      UPDATE invoices 
      SET discount_total = ?, discount_type = ?, discount_value = ?, grand_total = ?, sync_status = 'PENDING'
      WHERE invoice_id = ?
    `).run(discount_total, discount_type, discount_value, grand_total, invoice_id);

    return { success: true };
  } catch (error: any) {
    console.error('[db:applyInvoiceDiscount]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:getInvoices', (event, filters?: { user_id?: string; tenant_id?: string; role?: string; limit?: number; offset?: number; search?: string; payment_method?: string; invoice_type?: string; filterDate?: string; filterDateEnd?: string; tax_rate_percent?: string; only_user_invoices?: boolean; accounting_view?: 'REAL_SALES' | 'TAX_FILING' | 'ALL'; invoice_id?: string }) => {
  try {
    const db = getDb();
    const { user_id, tenant_id, role, limit, offset, search, payment_method, invoice_type, filterDate, filterDateEnd, tax_rate_percent, accounting_view, invoice_id } = filters || {};

    const activeTenantId = tenant_id || 'global';

    let query = `
      SELECT i.*, u.name as biller_name,
        st_biller.name as biller_staff_name,
        st_sales.name as sales_staff_name,
        COALESCE((SELECT COUNT(*) FROM invoice_items ii WHERE ii.invoice_id = i.invoice_id), 0) as item_count
      FROM invoices i 
      LEFT JOIN users u ON i.user_id = u.user_id 
      LEFT JOIN staff st_biller ON i.biller_staff_id = st_biller.staff_id
      LEFT JOIN staff st_sales ON i.sales_staff_id = st_sales.staff_id
      WHERE (i.tenant_id = ? OR i.tenant_id = 'global' OR i.tenant_id = 'unset' OR i.tenant_id IS NULL) 
        AND (i.is_deleted IS NULL OR i.is_deleted = 0 OR i.is_deleted = '0' OR i.is_deleted = '0.0' OR i.is_deleted = 0.0)
        AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (i.is_held IS NULL OR i.is_held = 0)
    `;
    const params: any[] = [activeTenantId];

    // Direct invoice_id or invoice_number lookup shortcut
    if (invoice_id) {
      const direct = db.prepare(`
        SELECT i.*, u.name as biller_name,
          st_biller.name as biller_staff_name,
          st_sales.name as sales_staff_name,
          COALESCE((SELECT COUNT(*) FROM invoice_items ii WHERE ii.invoice_id = i.invoice_id), 0) as item_count
        FROM invoices i 
        LEFT JOIN users u ON i.user_id = u.user_id 
        LEFT JOIN staff st_biller ON i.biller_staff_id = st_biller.staff_id
        LEFT JOIN staff st_sales ON i.sales_staff_id = st_sales.staff_id
        WHERE (i.invoice_id = ? OR i.invoice_number = ?)
          AND (i.is_deleted IS NULL OR i.is_deleted = 0 OR i.is_deleted = '0' OR i.is_deleted = '0.0' OR i.is_deleted = 0.0)
        LIMIT 1
      `).all(invoice_id, invoice_id);
      if (direct && direct.length > 0) {
        return direct;
      }
    }

    // Only filter by user_id if explicitly requested (e.g. only_user_invoices flag)
    if (filters?.only_user_invoices && user_id) {
      query += ' AND i.user_id = ?';
      params.push(user_id);
    }

    // Accounting View filter:
    // - TAX_FILING: Official GST invoices meant for government/tax filing (both direct GST and BoS-converted GST copies)
    // - ALL: Complete unfiltered ledger (both original counter sales and GST filing copies)
    // - REAL_SALES: Bill of Supply (BOS) counter sales only. Strictly excludes GST (B2C and B2B) bills!
    if (invoice_id) {
      // If directly looking up an invoice by ID, do not restrict by accounting view
    } else if (accounting_view === 'TAX_FILING') {
      query += " AND i.invoice_type = 'GST'";
    } else if (accounting_view === 'REAL_SALES') {
      query += " AND i.invoice_type = 'BILL_OF_SUPPLY'";
    } else if (accounting_view === 'ALL') {
      // Do not filter out conversion copies for the full ledger. When a product-level
      // tax rate filter is active, the synthetic GST copies are excluded so the list
      // matches the de-duplicated summary and product totals.
      if (tax_rate_percent !== undefined && tax_rate_percent !== '' && tax_rate_percent !== 'all') {
        query += " AND (i.converted_from_invoice_id IS NULL OR i.converted_from_invoice_id = '')";
      }
    } else {
      // Default to REAL_SALES: Show genuine counter transactions
      query += " AND (i.converted_from_invoice_id IS NULL OR i.converted_from_invoice_id = '')";
    }

    if (search) {
      query += ' AND (i.invoice_id = ? OR i.invoice_number LIKE ? OR i.customer_name LIKE ? OR i.customer_phone LIKE ? OR i.description LIKE ? OR i.notes LIKE ?)';
      params.push(search, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (payment_method) {
      const pmUpper = payment_method.toUpperCase();
      if (['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT'].includes(pmUpper)) {
        const jsonKey = pmUpper === 'BANK_TRANSFER' ? 'bank_transfer' : pmUpper.toLowerCase();
        query += ` AND (UPPER(i.payment_method) = ? OR (UPPER(i.payment_method) IN ('SPLIT', 'CREDIT') AND CAST(json_extract(i.split_details, '$.${jsonKey}') AS REAL) > 0))`;
        params.push(pmUpper);
      } else {
        query += ' AND UPPER(i.payment_method) = ?';
        params.push(pmUpper);
      }
    }

    if (invoice_type === 'GST_B2B') {
      query += " AND i.invoice_type = 'GST' AND i.customer_gstin IS NOT NULL AND i.customer_gstin != ''";
    } else if (invoice_type === 'GST_B2C') {
      query += " AND i.invoice_type = 'GST' AND (i.customer_gstin IS NULL OR i.customer_gstin = '')";
    } else if (invoice_type === 'BILL_OF_SUPPLY') {
      query += " AND i.invoice_type = 'BILL_OF_SUPPLY'";
    } else if (invoice_type === 'GST') {
      query += " AND i.invoice_type = 'GST'";
    }

    if (tax_rate_percent !== undefined && tax_rate_percent !== '') {
      const targetRate = parseFloat(tax_rate_percent);
      if (!isNaN(targetRate)) {
        query += ` AND EXISTS (
          SELECT 1 FROM invoice_items ii
          WHERE ii.invoice_id = i.invoice_id
            AND (
              ROUND(COALESCE(ii.cgst_rate, 0) + COALESCE(ii.sgst_rate, 0) + COALESCE(ii.igst_rate, 0)) = ?
              OR (ii.total > 0 AND ROUND((ii.tax_amount / ii.total) * 100.0) = ?)
            )
        )`;
        params.push(targetRate, targetRate);
      }
    }

    if (filterDate) {
      const cleanStart = parseCleanDate(filterDate);
      const cleanEnd = filterDateEnd ? parseCleanDate(filterDateEnd) : cleanStart;
      const { startUtc, endUtc } = getUtcRangeForStoreDateRange(cleanStart, cleanEnd, activeTenantId);

      // Use created_at for date filtering to match the grouping/ordering in the UI.
      // Using COALESCE(settled_at, created_at) caused invoices created on a different date
      // to appear under wrong date groups (e.g. filtered for Oct 12 but displayed under Oct 19).
      query += ` AND (i.created_at >= ? AND i.created_at <= ?)`;
      params.push(startUtc, endUtc);
    }

    query += ' ORDER BY i.created_at DESC, i.invoice_id ASC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }
    if (offset) {
      query += ' OFFSET ?';
      params.push(offset);
    }

    const results = db.prepare(query).all(...params);
    console.log(`[db:getInvoices] Returned ${results.length} invoices for tenant_id=${tenant_id} filterDate=${filterDate||'any'} offset=${offset||0}`);
    return results;
  } catch (error: any) {
    console.error('[db:getInvoices] Error fetching invoices:', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getInvoicesSummary', (event, filters?: { user_id?: string; tenant_id?: string; role?: string; search?: string; payment_method?: string; invoice_type?: string; filterDate?: string; filterDateEnd?: string; tax_rate_percent?: string; only_user_invoices?: boolean; accounting_view?: 'REAL_SALES' | 'TAX_FILING' | 'ALL' }) => {
  try {
    const db = getDb();
    const { user_id, tenant_id, role, search, payment_method, invoice_type, filterDate, filterDateEnd, tax_rate_percent, accounting_view } = filters || {};

    const activeTenantId = tenant_id || 'global';

    // Determine the split_details JSON key for the active payment method filter
    const splitJsonKey = payment_method && ['CASH','UPI','CARD','BANK_TRANSFER','CHEQUE','CREDIT'].includes(payment_method.toUpperCase())
      ? (payment_method.toUpperCase() === 'BANK_TRANSFER' ? 'bank_transfer' : payment_method.toLowerCase())
      : null;

    const isTaxFiling = accounting_view === 'TAX_FILING';
    const isBosOnly = accounting_view === 'REAL_SALES';

    let query = isTaxFiling ? `
      SELECT 
        COALESCE(SUM(
          CASE
            WHEN UPPER(i.payment_method) IN ('SPLIT', 'CREDIT') AND i.split_details IS NOT NULL AND ${splitJsonKey ? `'${splitJsonKey}' IS NOT NULL` : `1=0`}
              THEN CAST(COALESCE(json_extract(i.split_details, '$.${splitJsonKey || 'cash'}'), 0) AS REAL)
            ELSE MAX(0, COALESCE(i.grand_total, COALESCE(i.subtotal, 0) + COALESCE(i.tax_total, 0) - COALESCE(i.discount_total, 0) - COALESCE(i.points_redeemed_discount, 0) - COALESCE(i.scrap_deduction, 0) - COALESCE(i.return_deduction, 0)))
          END
        ), 0) as totalSales,
        COALESCE(SUM(MAX(0, COALESCE(i.subtotal, 0) + COALESCE(i.tax_total, 0) - COALESCE(i.discount_total, 0) - COALESCE(i.points_redeemed_discount, 0))), 0) as totalSalesBeforeDeductions,
        COUNT(1) as totalInvoices,
        COALESCE(SUM(i.tax_total), 0) as totalTax,
        COALESCE(SUM(i.discount_total), 0) as totalDiscount
      FROM invoices i 
      WHERE (i.tenant_id = ? OR i.tenant_id = 'global' OR i.tenant_id = 'unset' OR i.tenant_id IS NULL) 
        AND (i.is_deleted IS NULL OR i.is_deleted = 0 OR i.is_deleted = '0' OR i.is_deleted = '0.0' OR i.is_deleted = 0.0)
        AND (i.invoice_type = 'GST')
        AND (i.is_held IS NULL OR i.is_held = 0)
    ` : isBosOnly ? `
      SELECT 
        COALESCE(SUM(
          CASE
            WHEN UPPER(i.payment_method) IN ('SPLIT', 'CREDIT') AND i.split_details IS NOT NULL AND ${splitJsonKey ? `'${splitJsonKey}' IS NOT NULL` : `1=0`}
              THEN CAST(COALESCE(json_extract(i.split_details, '$.${splitJsonKey || 'cash'}'), 0) AS REAL)
            ELSE MAX(0, COALESCE(i.grand_total, COALESCE(i.subtotal, 0) + COALESCE(i.tax_total, 0) - COALESCE(i.discount_total, 0) - COALESCE(i.points_redeemed_discount, 0) - COALESCE(i.scrap_deduction, 0) - COALESCE(i.return_deduction, 0)))
          END
        ), 0) as totalSales,
        COALESCE(SUM(MAX(0, COALESCE(i.subtotal, 0) + COALESCE(i.tax_total, 0) - COALESCE(i.discount_total, 0) - COALESCE(i.points_redeemed_discount, 0))), 0) as totalSalesBeforeDeductions,
        COUNT(1) as totalInvoices,
        COALESCE(SUM(i.tax_total), 0) as totalTax,
        COALESCE(SUM(i.discount_total), 0) as totalDiscount
      FROM invoices i 
      WHERE (i.tenant_id = ? OR i.tenant_id = 'global' OR i.tenant_id = 'unset' OR i.tenant_id IS NULL) 
        AND (i.is_deleted IS NULL OR i.is_deleted = 0 OR i.is_deleted = '0' OR i.is_deleted = '0.0' OR i.is_deleted = 0.0)
        AND (i.invoice_type = 'BILL_OF_SUPPLY')
        AND (i.is_held IS NULL OR i.is_held = 0)
    ` : `
      SELECT 
        COALESCE(SUM(CASE WHEN (i.converted_from_invoice_id IS NULL OR i.converted_from_invoice_id = '') THEN 
          CASE
            WHEN UPPER(i.payment_method) IN ('SPLIT', 'CREDIT') AND i.split_details IS NOT NULL AND ${splitJsonKey ? `'${splitJsonKey}' IS NOT NULL` : `1=0`}
              THEN CAST(COALESCE(json_extract(i.split_details, '$.${splitJsonKey || 'cash'}'), 0) AS REAL)
            ELSE MAX(0, COALESCE(i.grand_total, COALESCE(i.subtotal, 0) + COALESCE(i.tax_total, 0) - COALESCE(i.discount_total, 0) - COALESCE(i.points_redeemed_discount, 0) - COALESCE(i.scrap_deduction, 0) - COALESCE(i.return_deduction, 0)))
          END
        ELSE 0 END), 0) as totalSales,
        COALESCE(SUM(CASE WHEN (i.converted_from_invoice_id IS NULL OR i.converted_from_invoice_id = '') THEN
          MAX(0, COALESCE(i.subtotal, 0) + COALESCE(i.tax_total, 0) - COALESCE(i.discount_total, 0) - COALESCE(i.points_redeemed_discount, 0))
        ELSE 0 END), 0) as totalSalesBeforeDeductions,
        COUNT(CASE WHEN (i.converted_from_invoice_id IS NULL OR i.converted_from_invoice_id = '') THEN 1 END) as totalInvoices,
        COALESCE(SUM(CASE WHEN (i.converted_from_invoice_id IS NULL OR i.converted_from_invoice_id = '') THEN i.tax_total ELSE 0 END), 0) as totalTax,
        COALESCE(SUM(CASE WHEN (i.converted_from_invoice_id IS NULL OR i.converted_from_invoice_id = '') THEN i.discount_total ELSE 0 END), 0) as totalDiscount
      FROM invoices i 
      WHERE (i.tenant_id = ? OR i.tenant_id = 'global' OR i.tenant_id = 'unset' OR i.tenant_id IS NULL) 
        AND (i.is_deleted IS NULL OR i.is_deleted = 0 OR i.is_deleted = '0' OR i.is_deleted = '0.0' OR i.is_deleted = 0.0)
        AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (i.is_held IS NULL OR i.is_held = 0)
    `;
    const params: any[] = [activeTenantId];

    if (filters?.only_user_invoices && user_id) {
      query += ' AND i.user_id = ?';
      params.push(user_id);
    }

    if (search) {
      query += ' AND (i.invoice_number LIKE ? OR i.customer_name LIKE ? OR i.customer_phone LIKE ? OR i.description LIKE ? OR i.notes LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (payment_method) {
      const pmUpper = payment_method.toUpperCase();
      if (['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT'].includes(pmUpper)) {
        const jsonKey = pmUpper === 'BANK_TRANSFER' ? 'bank_transfer' : pmUpper.toLowerCase();
        query += ` AND (UPPER(i.payment_method) = ? OR (UPPER(i.payment_method) IN ('SPLIT', 'CREDIT') AND CAST(json_extract(i.split_details, '$.${jsonKey}') AS REAL) > 0))`;
        params.push(pmUpper);
      } else {
        query += ' AND UPPER(i.payment_method) = ?';
        params.push(pmUpper);
      }
    }

    if (invoice_type === 'GST_B2B') {
      query += " AND i.invoice_type = 'GST' AND i.customer_gstin IS NOT NULL AND i.customer_gstin != ''";
    } else if (invoice_type === 'GST_B2C') {
      query += " AND i.invoice_type = 'GST' AND (i.customer_gstin IS NULL OR i.customer_gstin = '')";
    } else if (invoice_type === 'BILL_OF_SUPPLY') {
      query += " AND i.invoice_type = 'BILL_OF_SUPPLY'";
    } else if (invoice_type === 'GST') {
      query += " AND i.invoice_type = 'GST'";
    }

    if (tax_rate_percent !== undefined && tax_rate_percent !== '') {
      const targetRate = parseFloat(tax_rate_percent);
      if (!isNaN(targetRate)) {
        query += ` AND EXISTS (
          SELECT 1 FROM invoice_items ii
          WHERE ii.invoice_id = i.invoice_id
            AND (
              ROUND(COALESCE(ii.cgst_rate, 0) + COALESCE(ii.sgst_rate, 0) + COALESCE(ii.igst_rate, 0)) = ?
              OR (ii.total > 0 AND ROUND((ii.tax_amount / ii.total) * 100.0) = ?)
            )
        )`;
        params.push(targetRate, targetRate);
      }
    }

    if (filterDate) {
      const cleanStart = parseCleanDate(filterDate);
      const cleanEnd = filterDateEnd ? parseCleanDate(filterDateEnd) : cleanStart;
      const { startUtc, endUtc } = getUtcRangeForStoreDateRange(cleanStart, cleanEnd, activeTenantId);

      // Use created_at for date filtering to match the grouping/ordering in the UI.
      // Using COALESCE(settled_at, created_at) caused invoices created on a different date
      // to appear under wrong date groups (e.g. filtered for Oct 12 but displayed under Oct 19).
      query += ` AND (i.created_at >= ? AND i.created_at <= ?)`;
      params.push(startUtc, endUtc);
    }

    const row = db.prepare(query).get(...params) as any;
    const totalSales = row ? Number(row.totalSales) || 0 : 0;
    const totalSalesBeforeDeductions = row ? Number(row.totalSalesBeforeDeductions) || 0 : 0;
    const totalInvoices = row ? Number(row.totalInvoices) || 0 : 0;
    const totalTax = row ? Number(row.totalTax) || 0 : 0;
    const totalDiscount = row ? Number(row.totalDiscount ?? row.discount_total) || 0 : 0;
    const avgOrder = totalInvoices > 0 ? totalSales / totalInvoices : 0;

    return { totalSales, totalSalesBeforeDeductions, totalInvoices, totalTax, totalDiscount, avgOrder };
  } catch (error: any) {
    console.error('[db:getInvoicesSummary] Error:', error);
    return { totalSales: 0, totalSalesBeforeDeductions: 0, totalInvoices: 0, totalTax: 0, totalDiscount: 0, avgOrder: 0 };
  }
});

ipcMain.handle('db:getDashboardStats', (event, tenantId: string) => {
  try {
    const db = getDb();
    const dateStr = localDate(new Date(), tenantId);
    const { startUtc, endUtc } = getUtcRangeForStoreDateRange(dateStr, dateStr, tenantId);
    const row = db.prepare(`
      SELECT COALESCE(SUM(MAX(0, COALESCE(grand_total, COALESCE(subtotal, 0) + COALESCE(tax_total, 0) - COALESCE(discount_total, 0) - COALESCE(points_redeemed_discount, 0) - COALESCE(scrap_deduction, 0) - COALESCE(return_deduction, 0)))), 0) as totalSales, COUNT(*) as invoiceCount
      FROM invoices
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
        AND (COALESCE(settled_at, created_at) >= ? AND COALESCE(settled_at, created_at) <= ?)
        AND (converted_from_invoice_id IS NULL OR converted_from_invoice_id = '')
        AND (is_deleted IS NULL OR is_deleted = 0 OR is_deleted = '0' OR is_deleted = '0.0' OR is_deleted = 0.0)
        AND (invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (is_held IS NULL OR is_held = 0)
    `).get(tenantId, startUtc, endUtc) as any;
    return { success: true, totalSales: row.totalSales, invoiceCount: row.invoiceCount };
  } catch (error: any) {
    console.error('[db:getDashboardStats]', error);
    return { success: false, totalSales: 0, invoiceCount: 0, error: 'Operation failed' };
  }
});

ipcMain.handle('db:getInvoiceItems', (event, invoice_id: string) => {
  try {
    const db = getDb();
    return db.prepare(`
      SELECT ii.*,
             COALESCE(NULLIF(TRIM(ii.hsn_sac_code), ''), p.hsn_sac_code, '') AS hsn_sac_code,
             COALESCE(NULLIF(TRIM(ii.uom), ''), p.uom, 'PCS') AS uom,
             p.tax_rate_percent AS product_tax_rate_percent
      FROM invoice_items ii
      LEFT JOIN products p ON ii.product_id = p.product_id
      WHERE ii.invoice_id = ?
    `).all(invoice_id);
  } catch (error: any) {
    console.error('[db:getInvoiceItems]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:updateInvoice', async (event, payload: {
  invoice_id: string;
  tenant_id: string;
  role?: string;
  permissions?: string[];
  user_id?: string;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  discount_type: string;
  discount_value: number;
  grand_total: number;
  payment_method?: string;
  received_amount?: number;
  actual_refund_paid?: number;
  balance_amount?: number;
  customer_name?: string;
  customer_phone?: string;
  customer_gstin?: string;
  customer_state?: string;
  customer_address?: string;
  scrap_deduction?: number;
  scrap_invoice_number?: string;
  return_deduction?: number;
  return_invoice_number?: string;
  items: Array<{
    item_id?: string;
    product_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    tax_amount: number;
    total: number;
    isServiceItem?: boolean;
  }>;
}) => {
  // Permission check: allow ADMIN role OR staff with sales.edit permission
  const normalizedRole = (payload.role || '').toUpperCase();
  const isAdmin = ['ADMIN', 'SUPER_ADMIN', 'OWNER', 'ADMINISTRATOR'].includes(normalizedRole);
  const perms = Array.isArray(payload.permissions) ? payload.permissions : [];
  const hasEditPerm = perms.includes('*') || perms.includes('sales.edit');

  let hasDbPerm = false;
  if (!isAdmin && !hasEditPerm && payload.user_id) {
    try {
      const db = getDb();
      const u = db.prepare('SELECT role, permissions FROM users WHERE user_id = ?').get(payload.user_id) as any;
      if (u) {
        const uRole = (u.role || '').toUpperCase();
        if (['ADMIN', 'SUPER_ADMIN', 'OWNER', 'ADMINISTRATOR'].includes(uRole)) hasDbPerm = true;
        const uPerms = JSON.parse(u.permissions || '[]');
        if (Array.isArray(uPerms) && (uPerms.includes('*') || uPerms.includes('sales.edit'))) hasDbPerm = true;
      }
    } catch {}
  }

  if (!isAdmin && !hasEditPerm && !hasDbPerm) {
    return { success: false, error: 'You do not have permission to edit bills' };
  }
  const { items, ...invoice } = payload;
  const db = getDb();
  const existingInv = db.prepare(`SELECT * FROM invoices WHERE invoice_id = ?`).get(payload.invoice_id) as any;
  if (!existingInv) {
    return { success: false, error: 'Invoice not found' };
  }
  const oldCash = getCashAmountFromInvoice(existingInv);

  const finalReceivedAmount = payload.received_amount !== undefined ? payload.received_amount : (existingInv?.received_amount ?? null);
  const finalActualRefundPaid = payload.actual_refund_paid !== undefined ? payload.actual_refund_paid : (existingInv?.actual_refund_paid ?? 0);
  const finalBalanceAmount = payload.balance_amount !== undefined ? payload.balance_amount : (existingInv?.balance_amount ?? null);

  // Deduplication guard: block duplicate update calls within a 4-second window for the same invoice
  const itemsSig = (items || []).map((i: any) => `${i.product_id}:${i.quantity}:${i.unit_price}`).sort().join('|');
  const headerSig = JSON.stringify(invoice);
  const updateCacheKey = `update:${existingInv.tenant_id || payload.tenant_id}:${payload.invoice_id}:${invoice.grand_total}:${itemsSig}:${headerSig}`;
  const now = Date.now();
  const cachedUpdate = recentCheckoutsCache.get(updateCacheKey);
  if (cachedUpdate && (now - cachedUpdate.timestamp < 4000)) {
    console.warn(`[db:updateInvoice] Duplicate update request blocked within 4s window for invoice ${payload.invoice_id}. Returning previous result.`);
    return cachedUpdate.result;
  }

  const transaction = db.transaction(() => {
    const customerId = upsertCustomerRecord(
      db,
      payload.tenant_id || 'global',
      invoice.customer_name,
      invoice.customer_phone,
      invoice.customer_address
    );

    // 1. Get old items for stock adjustment
    const oldItems = db.prepare('SELECT product_id, quantity FROM invoice_items WHERE invoice_id = ?').all(payload.invoice_id) as any[];

    const updatedCreatedAt = (invoice as any).created_at
      ? (isNaN(new Date((invoice as any).created_at).getTime()) ? null : new Date((invoice as any).created_at).toISOString())
      : null;

    // 2. Update invoice header
    db.prepare(`
      UPDATE invoices SET
        subtotal = ?, tax_total = ?, discount_total = ?, discount_type = ?,
        discount_value = ?, grand_total = ?, payment_method = ?,
        received_amount = ?, actual_refund_paid = ?, balance_amount = ?, split_details = ?,
        customer_name = ?, customer_phone = ?, customer_gstin = ?, customer_state = ?, customer_address = ?,
        scrap_deduction = ?, scrap_invoice_number = ?, return_deduction = ?, return_invoice_number = ?,
        customer_id = ?, cgst_total = ?, sgst_total = ?, igst_total = ?, supply_type = ?,
        notes = ?, description = ?,
        points_earned = COALESCE(?, points_earned),
        points_redeemed = COALESCE(?, points_redeemed),
        points_redeemed_discount = COALESCE(?, points_redeemed_discount),
        previous_points_balance = COALESCE(?, previous_points_balance),
        remaining_points_balance = COALESCE(?, remaining_points_balance),
        created_at = COALESCE(?, created_at),
        sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE invoice_id = ?
    `).run(
      invoice.subtotal, invoice.tax_total, invoice.discount_total,
      invoice.discount_type || 'FIXED', invoice.discount_value || 0,
      invoice.grand_total, invoice.payment_method || 'PENDING',
      finalReceivedAmount, finalActualRefundPaid, finalBalanceAmount,
      (invoice as any).split_details && typeof (invoice as any).split_details === 'object' ? JSON.stringify((invoice as any).split_details) : ((invoice as any).split_details && (invoice as any).split_details !== 'null' ? (invoice as any).split_details : null),
      invoice.customer_name || null, invoice.customer_phone || null,
      invoice.customer_gstin || null, invoice.customer_state || null,
      invoice.customer_address || null,
      invoice.scrap_deduction ?? 0, invoice.scrap_invoice_number || null,
      invoice.return_deduction ?? 0, invoice.return_invoice_number || null,
      customerId || null,
      (invoice as any).cgst_total ?? 0, (invoice as any).sgst_total ?? 0,
      (invoice as any).igst_total ?? 0, (invoice as any).supply_type || 'INTRA',
      (invoice as any).notes || (invoice as any).description || null,
      (invoice as any).description || (invoice as any).notes || null,
      (invoice as any).points_earned ?? null,
      (invoice as any).points_redeemed ?? null,
      (invoice as any).points_redeemed_discount ?? null,
      (invoice as any).previous_points_balance ?? null,
      (invoice as any).remaining_points_balance ?? null,
      updatedCreatedAt,
      payload.invoice_id
    );

    // 3. Delete old items
    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(payload.invoice_id);

    // 4. Insert new items
    const itemStmt = db.prepare(`
      INSERT INTO invoice_items (item_id, invoice_id, tenant_id, product_id, name, quantity, unit_price, tax_amount, total, pieces_sold, is_service_item, billing_type, uom,
        cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, hsn_sac_code, supply_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of (items || [])) {
      itemStmt.run(
        item.item_id || crypto.randomUUID(),
        payload.invoice_id,
        payload.tenant_id || 'global',
        item.product_id || '',
        item.name || 'Product',
        item.quantity ?? 1,
        item.unit_price ?? 0,
        item.tax_amount ?? 0,
        item.total ?? 0,
        (item as any).pieces_sold ?? (item as any).pieces_override ?? null,
        (item as any).isServiceItem ? 1 : 0,
        (item as any).billing_type || null,
        (item as any).uom || (item as any).unit || null,
        (item as any).cgst_rate ?? 0,
        (item as any).sgst_rate ?? 0,
        (item as any).igst_rate ?? 0,
        (item as any).cgst_amount ?? 0,
        (item as any).sgst_amount ?? 0,
        (item as any).igst_amount ?? 0,
        (item as any).hsn_sac_code || null,
        (item as any).supply_type || (invoice as any).supply_type || 'INTRA',
      );
    }

    // 5. Adjust stock: reverse old quantities, apply new (skip service items)
    const isServiceItemLookup: Record<string, boolean> = {};
    const svcStmt = db.prepare('SELECT is_service_item FROM products WHERE product_id = ?');
    const isServiceItem = (pid: string) => {
      if (isServiceItemLookup[pid] === undefined) {
        const row = svcStmt.get(pid) as any;
        isServiceItemLookup[pid] = row ? !!row.is_service_item : false;
      }
      return isServiceItemLookup[pid];
    };

    const stockDelta: Record<string, number> = {};
    for (const old of oldItems) {
      if (!isServiceItem(old.product_id)) {
        stockDelta[old.product_id] = (stockDelta[old.product_id] || 0) + old.quantity;
      }
    }
    for (const item of items) {
      if (!isServiceItem(item.product_id)) {
        stockDelta[item.product_id] = (stockDelta[item.product_id] || 0) - item.quantity;
      }
    }
    const stockStmt = db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?');
    for (const [product_id, delta] of Object.entries(stockDelta)) {
      stockStmt.run(delta, product_id);
    }

    // Sync party credit ledger
    syncInvoiceCreditLedger(db, {
      invoice_id: payload.invoice_id,
      tenant_id: payload.tenant_id,
      invoice_number: existingInv.invoice_number,
      invoice_type: existingInv.invoice_type,
      grand_total: invoice.grand_total,
      payment_method: invoice.payment_method,
      received_amount: finalReceivedAmount,
      balance_amount: finalBalanceAmount,
      customer_id: customerId || (payload as any).customer_id || (invoice as any).customer_id || existingInv.customer_id,
      customer_name: invoice.customer_name,
      customer_phone: invoice.customer_phone,
      customer_address: invoice.customer_address,
      customer_gstin: invoice.customer_gstin,
      split_details: (invoice as any).split_details || (payload as any).split_details || existingInv.split_details,
      user_id: payload.role,
      user_name: payload.role,
      created_at: updatedCreatedAt || existingInv.created_at,
      is_staff: Boolean((payload as any).is_staff || (payload as any).isStaffCustomer || existingInv.is_staff),
      staff_id: (payload as any).staff_id || null,
    });
    resetBackfillThrottle(); // reset so next db:getParties re-scans

    // Sync Loyalty Points on invoice update
    const targetCustId = customerId || (payload as any).customer_id || (invoice as any).customer_id || existingInv.customer_id;
    if (targetCustId) {
      try {
        const targetTenantId = payload.tenant_id || existingInv.tenant_id || 'global';
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
          const awardOnPending = Boolean(lCfg?.awardPointsOnPending);
          const newPaymentMethod = (invoice.payment_method || existingInv.payment_method || '').toUpperCase();
          const shouldEarn = newPaymentMethod !== 'PENDING' || awardOnPending;

          let targetPointsEarned: number;
          if ((invoice as any).points_earned !== undefined && (invoice as any).points_earned !== null) {
            targetPointsEarned = Number((invoice as any).points_earned) || 0;
          } else if (shouldEarn) {
            targetPointsEarned = Math.floor(Math.max(0, Number(invoice.grand_total) || 0) / earningRate);
          } else {
            targetPointsEarned = 0;
          }

          const prevEarned = Number(existingInv.points_earned) || 0;
          const diffEarned = targetPointsEarned - prevEarned;

          if (diffEarned !== 0) {
            const custRow: any = db.prepare('SELECT current_points_balance FROM customers WHERE customer_id = ?').get(targetCustId);
            const curBal = Number(custRow?.current_points_balance) || 0;
            const newBal = Math.max(0, curBal + diffEarned);
            const nowTs = localTimestamp();

            const txType = diffEarned > 0 ? 'EARNED' : 'ADJUSTED';
            const txDesc = diffEarned > 0
              ? (prevEarned === 0
                  ? `Earned ${targetPointsEarned} points on invoice ${existingInv.invoice_number}`
                  : `Earned ${diffEarned} additional points on updated invoice ${existingInv.invoice_number}`)
              : `Adjusted ${Math.abs(diffEarned)} points on updated invoice ${existingInv.invoice_number}`;

            db.prepare(`
              INSERT INTO loyalty_transactions (
                transaction_id, tenant_id, customer_id, invoice_id,
                transaction_type, points, points_balance_before, points_balance_after,
                reference_number, description, created_by, sync_status, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
            `).run(
              crypto.randomUUID(), targetTenantId,
              targetCustId, payload.invoice_id,
              txType, Math.abs(diffEarned), curBal, newBal,
              existingInv.invoice_number, txDesc,
              payload.user_id || payload.role || 'system',
              nowTs, nowTs
            );

            db.prepare(`
              UPDATE customers SET
                total_points_earned = COALESCE(total_points_earned, 0) + ?,
                current_points_balance = ?,
                last_purchase_date = COALESCE(last_purchase_date, ?),
                sync_status = 'PENDING',
                updated_at = CURRENT_TIMESTAMP
              WHERE customer_id = ?
            `).run(diffEarned, newBal, nowTs, targetCustId);

            db.prepare(`
              UPDATE invoices SET
                points_earned = ?,
                remaining_points_balance = ?
              WHERE invoice_id = ?
            `).run(targetPointsEarned, newBal, payload.invoice_id);
          }
        }
      } catch (lErr) {
        console.warn('[db:updateInvoice] Failed to sync loyalty points:', lErr);
      }
    }
  });

  try {
    transaction();

    const newCash = getCashAmountFromInvoice(payload);
    const effectiveInvDate = (invoice as any).created_at
      ? (isNaN(new Date((invoice as any).created_at).getTime()) ? existingInv.created_at : new Date((invoice as any).created_at).toISOString())
      : existingInv.created_at;
    if (existingInv) {
      adjustCashDrawerForInvoice(db, existingInv.tenant_id || payload.tenant_id, effectiveInvDate, oldCash, newCash);
    }

    import('../sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Invoice update sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
    const res = { success: true, created_at: effectiveInvDate };
    recentCheckoutsCache.set(updateCacheKey, { timestamp: now, result: res });
    if (recentCheckoutsCache.size > 100) {
      for (const [k, v] of recentCheckoutsCache.entries()) {
        if (now - v.timestamp > 30000) recentCheckoutsCache.delete(k);
      }
    }
    return res;
  } catch (error: any) {
    console.error('[db:updateInvoice]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:updateInvoicePayment', (event, payload: {
  invoice_id: string;
  tenant_id: string;
  payment_method: string;
  received_amount: number;
  balance_amount: number;
  split_details?: any;
}) => {
  try {
    const db = getDb();
    const existingInv = db.prepare(`SELECT * FROM invoices WHERE invoice_id = ?`).get(payload.invoice_id) as any;
    if (!existingInv) {
      return { success: false, error: 'Invoice not found' };
    }
    const oldCash = getCashAmountFromInvoice(existingInv);

    // Deduplication guard
    const paymentCacheKey = `updatePayment:${existingInv.tenant_id || payload.tenant_id}:${payload.invoice_id}:${payload.payment_method}:${payload.received_amount}:${payload.balance_amount}`;
    const now = Date.now();
    const cachedPayment = recentCheckoutsCache.get(paymentCacheKey);
    if (cachedPayment && (now - cachedPayment.timestamp < 4000)) {
      console.warn(`[db:updateInvoicePayment] Duplicate update request blocked within 4s window for invoice ${payload.invoice_id}. Returning previous result.`);
      return cachedPayment.result;
    }

    const splitDetailsVal = payload.split_details && typeof payload.split_details === 'object'
      ? JSON.stringify(payload.split_details)
      : (payload.split_details && payload.split_details !== 'null' ? payload.split_details : null);

    db.prepare(`
      UPDATE invoices SET
        payment_method = ?,
        received_amount = ?,
        balance_amount = ?,
        split_details = ?,
        sync_status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
      WHERE invoice_id = ?
    `).run(
      payload.payment_method,
      payload.received_amount,
      payload.balance_amount,
      splitDetailsVal,
      payload.invoice_id
    );

    const updatedInvObj = {
      ...existingInv,
      payment_method: payload.payment_method,
      received_amount: payload.received_amount,
      split_details: payload.split_details ?? existingInv.split_details,
    };
    const newCash = getCashAmountFromInvoice(updatedInvObj);

    adjustCashDrawerForInvoice(db, existingInv.tenant_id || payload.tenant_id, existingInv.created_at, oldCash, newCash);
    adjustPaymentSourcesForInvoice(db, existingInv.tenant_id || payload.tenant_id, updatedInvObj, false);

    syncInvoiceCreditLedger(db, {
      invoice_id: payload.invoice_id,
      tenant_id: existingInv.tenant_id || payload.tenant_id,
      invoice_number: existingInv.invoice_number,
      invoice_type: existingInv.invoice_type,
      grand_total: existingInv.grand_total,
      payment_method: payload.payment_method,
      received_amount: payload.received_amount,
      balance_amount: payload.balance_amount,
      customer_id: existingInv.customer_id,
      customer_name: existingInv.customer_name,
      customer_phone: existingInv.customer_phone,
      customer_address: existingInv.customer_address,
      customer_gstin: existingInv.customer_gstin,
      split_details: payload.split_details ?? existingInv.split_details,
      created_at: existingInv.created_at,
      is_staff: Boolean(existingInv.is_staff || (payload as any).is_staff),
      staff_id: (payload as any).staff_id || null,
    });
    resetBackfillThrottle(); // reset so next db:getParties re-scans

    // Award loyalty points if invoice was pending and now paid
    if (existingInv.customer_id && (!existingInv.points_earned || Number(existingInv.points_earned) <= 0)) {
      const newPm = (payload.payment_method || '').toUpperCase();
      if (newPm !== 'PENDING') {
        try {
          const targetTenantId = existingInv.tenant_id || payload.tenant_id || 'global';
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
            const ptsEarned = Math.floor(Math.max(0, Number(existingInv.grand_total) || 0) / earningRate);
            if (ptsEarned > 0) {
              const custRow: any = db.prepare('SELECT current_points_balance FROM customers WHERE customer_id = ?').get(existingInv.customer_id);
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
              `).run(ptsEarned, prevBal, newBal, payload.invoice_id);

              db.prepare(`
                INSERT INTO loyalty_transactions (
                  transaction_id, tenant_id, customer_id, invoice_id,
                  transaction_type, points, points_balance_before, points_balance_after,
                  reference_number, description, created_by, sync_status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'EARNED', ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
              `).run(
                eTxId, targetTenantId, existingInv.customer_id, payload.invoice_id,
                ptsEarned, prevBal, newBal,
                existingInv.invoice_number,
                `Earned ${ptsEarned} points on settled invoice ${existingInv.invoice_number}`,
                'system',
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
              `).run(ptsEarned, newBal, nowTimestamp, existingInv.customer_id);
            }
          }
        } catch (lErr) {
          console.warn('[db:updateInvoicePayment] Failed to award loyalty points on payment update:', lErr);
        }
      }
    }

    import('../sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Invoice payment update sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
    const res = { success: true };
    recentCheckoutsCache.set(paymentCacheKey, { timestamp: now, result: res });
    if (recentCheckoutsCache.size > 100) {
      for (const [k, v] of recentCheckoutsCache.entries()) {
        if (now - v.timestamp > 30000) recentCheckoutsCache.delete(k);
      }
    }
    return res;
  } catch (error: any) {
    console.error('[db:updateInvoicePayment]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// â”€â”€ Return Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('db:createReturn', safeHandler((event, payload: {
  return_id: string;
  invoice_id: string;
  tenant_id: string;
  user_id?: string;
  user_name?: string;
  return_number: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  subtotal: number;
  tax_total: number;
  grand_total: number;
  reason?: string;
  refund_method?: string;
  adjusted_invoice_number?: string;
  adjusted_amount?: number;
  items: Array<{
    return_item_id: string;
    product_id: string;
    invoice_item_id?: string;
    name: string;
    quantity: number;
    unit_price: number;
    tax_amount: number;
    total: number;
  }>;
}) => {
  const { items, ...returnData } = payload;
  const db = getDb();
  const transaction = db.transaction(() => {
    if (returnData.customer_name || returnData.customer_phone) {
      upsertCustomerRecord(db, returnData.tenant_id || 'global', returnData.customer_name, returnData.customer_phone, null);
    }
    const now = localTimestamp();
    db.prepare(`
      INSERT INTO returns (
        return_id, invoice_id, tenant_id, user_id, return_number,
        customer_name, customer_phone, customer_address,
        subtotal, tax_total, grand_total, reason,
        refund_method, adjusted_invoice_number, adjusted_amount,
        sync_status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `).run(
      returnData.return_id, returnData.invoice_id, returnData.tenant_id, returnData.user_id || null,
      returnData.return_number, returnData.customer_name || null, returnData.customer_phone || null,
      returnData.customer_address || null,
      returnData.subtotal, returnData.tax_total, returnData.grand_total, returnData.reason || null,
      returnData.refund_method || null, returnData.adjusted_invoice_number || null,
      returnData.adjusted_amount ?? 0,
      now, now
    );

    const itemStmt = db.prepare(`
      INSERT INTO return_items (return_item_id, return_id, tenant_id, invoice_item_id, product_id, name, quantity, unit_price, tax_amount, total, sync_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
    `);
    const stockStmt = db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?');

    for (const item of items) {
      itemStmt.run(
        item.return_item_id, returnData.return_id, returnData.tenant_id,
        item.invoice_item_id || null, item.product_id, item.name,
        item.quantity, item.unit_price, item.tax_amount, item.total
      );
      stockStmt.run(item.quantity, item.product_id);
    }

    let origInv: any = null;
    if (returnData.invoice_id) {
      origInv = db.prepare('SELECT * FROM invoices WHERE invoice_id = ?').get(returnData.invoice_id);
    }
    const origPm = (origInv?.payment_method || '').toUpperCase();
    let origSplitCredit = 0;
    if (origInv?.split_details) {
      try {
        const s = typeof origInv.split_details === 'string' ? JSON.parse(origInv.split_details) : origInv.split_details;
        origSplitCredit = Number(s?.credit) || 0;
      } catch {}
    }
    const isOrigCredit = Boolean(
      origInv && (
        origPm === 'CREDIT' ||
        origSplitCredit > 0 ||
        (Number(origInv.balance_amount) > 0 && origPm !== 'CASH')
      )
    );

    // If original invoice was a credit bill, reduce its balance_amount by the returned amount
    if (isOrigCredit && origInv) {
      const currentBal = Number(origInv.balance_amount) || (origPm === 'CREDIT' ? Math.max(0, Number(origInv.grand_total) - (Number(origInv.received_amount) || 0)) : origSplitCredit);
      const newBal = Math.max(0, currentBal - Number(returnData.grand_total));
      db.prepare("UPDATE invoices SET balance_amount = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE invoice_id = ?").run(newBal, origInv.invoice_id);
    }

    const refMethod = (returnData.refund_method || (isOrigCredit ? 'CREDIT' : 'ADJUST_BILL')).toUpperCase();

    if (refMethod === 'CASH' && Number(returnData.grand_total) > 0) {
      const todayDate = localDate();
      const drawer = getOpenCashDrawer(db, returnData.tenant_id, todayDate);
      if (drawer) {
        const existingTx = db.prepare(`SELECT transaction_id FROM cash_transactions WHERE drawer_id = ? AND category = 'RETURN_REFUND' AND notes LIKE ?`).get(drawer.drawer_id, `%${returnData.return_number}%`);
        if (!existingTx) {
          const txnId = crypto.randomUUID();
          db.prepare(`
            INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, sync_status)
            VALUES (?, ?, ?, 'CASH_OUT', ?, 'RETURN_REFUND', ?, ?, 'PENDING')
          `).run(
            txnId,
            returnData.tenant_id,
            drawer.drawer_id,
            Number(returnData.grand_total),
            `Return refund for ${returnData.return_number}`,
            returnData.user_id || 'system'
          );
          const newCashOut = Number(drawer.cash_out) + Number(returnData.grand_total);
          const newCurrentCash = Number(drawer.current_cash) - Number(returnData.grand_total);
          const newExpectedClosing = Number(drawer.opening_balance) + Number(drawer.cash_sales) + Number(drawer.cash_in) - newCashOut;
          db.prepare(`
            UPDATE cash_drawer SET cash_out = ?, current_cash = ?, expected_closing = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE drawer_id = ?
          `).run(newCashOut, newCurrentCash, newExpectedClosing, drawer.drawer_id);
        }
      }
    }

    // Sync party ledger whenever:
    // 1. Original bill was a credit invoice (return reduces customer's balance), OR
    // 2. Refund method is CREDIT, STORE_CREDIT, or ADJUST_BILL (customer gets account credit), OR
    // 3. Customer has an account / identity and refund was made
    const shouldSyncLedger = isOrigCredit || ['CREDIT', 'STORE_CREDIT', 'ADJUST_BILL'].includes(refMethod) || (
      Boolean(returnData.customer_name || returnData.customer_phone || origInv?.customer_id) &&
      ['CARD', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CASH'].includes(refMethod) &&
      Number(returnData.grand_total) > 0
    );

    if (shouldSyncLedger && Number(returnData.grand_total) > 0) {
      syncReturnLedger(db, {
        tenant_id: returnData.tenant_id || origInv?.tenant_id || 'global',
        return_number: returnData.return_number,
        return_id: returnData.return_id,
        invoice_id: returnData.invoice_id || null,
        invoice_number: origInv?.invoice_number || null,
        customer_id: origInv?.customer_id || null,
        customer_name: returnData.customer_name || origInv?.customer_name || null,
        customer_phone: returnData.customer_phone || origInv?.customer_phone || null,
        customer_address: returnData.customer_address || origInv?.customer_address || null,
        customer_gstin: origInv?.customer_gstin || null,
        grand_total: Number(returnData.grand_total) || 0,
        refund_method: refMethod,
        amount: Number(returnData.grand_total) || 0,
        user_id: returnData.user_id,
        user_name: returnData.user_name || returnData.user_id,
        created_at: now,
      });
    }
  });

  try {
    transaction();
    import('../sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Return sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
    return { success: true };
  } catch (error: any) {
    console.error('[db:createReturn]', error);
    return { success: false, error: error?.message || 'Operation failed' };
  }
}));

ipcMain.handle('db:getAlreadyReturnedQuantities', safeHandler((event, invoice_id: string) => {
  const db = getDb();
  return db.prepare(`
    SELECT invoice_item_id, COALESCE(SUM(quantity), 0) as returned_qty
    FROM return_items
    WHERE return_id IN (SELECT return_id FROM returns WHERE invoice_id = ?)
    GROUP BY invoice_item_id
  `).all(invoice_id);
}));

// Return-mode invoice search â€” only returns bills that still have at least one
// item with remaining returnable quantity (fully returned bills are excluded).
ipcMain.handle('db:getReturnableInvoices', safeHandler((event, { tenant_id, search, limit = 10, role, user_id }: { tenant_id: string; search?: string; limit?: number; role?: string; user_id?: string }) => {
  const db = getDb();
  let query = `
    SELECT i.*, u.name as biller_name
    FROM invoices i
    LEFT JOIN users u ON i.user_id = u.user_id
    WHERE i.tenant_id = ?
      AND i.invoice_type NOT IN ('SCRAP', 'RETURN')
      AND EXISTS (
        SELECT 1 FROM invoice_items ii
        WHERE ii.invoice_id = i.invoice_id
          AND ii.quantity > COALESCE((
            SELECT SUM(ri.quantity) FROM return_items ri
            WHERE ri.invoice_item_id = ii.item_id
          ), 0)
      )
  `;
  const params: any[] = [tenant_id];

  if (role === 'BILLER' && user_id) {
    query += ' AND i.user_id = ?';
    params.push(user_id);
  }

  if (search) {
    query += ' AND (i.invoice_number LIKE ? OR i.customer_name LIKE ? OR i.customer_phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY i.created_at DESC, i.invoice_id ASC';
  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
  }

  return db.prepare(query).all(...params);
}));

ipcMain.handle('db:getReturnInvoiceByNumber', safeHandler((event, { tenant_id, return_number }: { tenant_id: string; return_number: string }) => {
  const db = getDb();
  const q = String(return_number || '').trim();
  if (!q) return null;
  const qNum = (q.match(/\d+/g) || []).join('');

  // 1. Direct match by exact return_number
  let row = db.prepare('SELECT * FROM returns WHERE tenant_id = ? AND return_number = ?').get(tenant_id, q);
  if (row) return row;

  // 2. Direct match by common prefixes
  row = db.prepare('SELECT * FROM returns WHERE tenant_id = ? AND (return_number = ? OR return_number = ?)').get(tenant_id, `RET-${q}`, `RTN-${q}`);
  if (row) return row;

  // 3. Fallback: match by numeric part
  if (qNum) {
    const list = db.prepare('SELECT * FROM returns WHERE tenant_id = ? AND grand_total > COALESCE(adjusted_amount, 0)').all(tenant_id) as any[];
    const match = list.find((r: any) => {
      const numStr = (String(r.return_number || '').match(/\d+/g) || []).join('');
      return numStr === qNum || Number(numStr) === Number(qNum) || numStr.endsWith(qNum);
    });
    if (match) return match;
  }
  return null;
}));

ipcMain.handle('db:getPendingReturnInvoices', safeHandler((event, { tenant_id, search }: { tenant_id: string; search?: string }) => {
  const db = getDb();
  let query = `
    SELECT * FROM returns 
    WHERE tenant_id = ? 
      AND (refund_method = 'ADJUST_BILL' OR refund_method IS NULL OR refund_method = '')
      AND grand_total > COALESCE(adjusted_amount, 0)
  `;
  const params: any[] = [tenant_id];
  if (search) {
    query += ' AND (return_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY created_at DESC LIMIT 50';
  return db.prepare(query).all(...params);
}));

// Accumulate partial ADJUST_BILL consumption. adjusted_amount tracks how much of
// the return credit has been used across bills; the return stays pending until
// adjusted_amount >= grand_total. adjusted_invoice_number records the last invoice
// that consumed part of the credit.
ipcMain.handle('db:settleReturnInvoice', safeHandler((event, { tenant_id, return_number, adjusted_invoice_number, amount }: { tenant_id: string; return_number: string; adjusted_invoice_number: string; amount: number }) => {
  const db = getDb();
  const amt = Math.max(0, Number(amount) || 0);
  if (amt <= 0) return { success: false, error: 'Invalid adjustment amount' };
  
  // Get return details for ledger sync
  const returnData = db.prepare(`
    SELECT return_id, return_number, customer_name, customer_phone, customer_address, grand_total, refund_method, created_at, user_id
    FROM returns WHERE tenant_id = ? AND return_number = ?
  `).get(tenant_id, return_number) as any;
  
  const res = db.prepare(`
    UPDATE returns 
    SET adjusted_amount = COALESCE(adjusted_amount, 0) + ?,
        adjusted_invoice_number = ?,
        sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = ? AND return_number = ? AND grand_total > COALESCE(adjusted_amount, 0)
  `).run(amt, adjusted_invoice_number, tenant_id, return_number);
  
  if (res.changes === 0) return { success: false, error: 'Return not found or already fully adjusted' };
  
  // Sync party ledger for ADJUST_BILL
  if (returnData && returnData.refund_method === 'ADJUST_BILL') {
    syncReturnLedger(db, {
      tenant_id: tenant_id || 'global',
      return_number: returnData.return_number,
      return_id: returnData.return_id,
      customer_name: returnData.customer_name,
      customer_phone: returnData.customer_phone,
      customer_address: returnData.customer_address,
      customer_gstin: null,
      grand_total: returnData.grand_total,
      refund_method: 'ADJUST_BILL',
      adjusted_invoice_number: adjusted_invoice_number,
      amount: amt,
      user_id: returnData.user_id,
      user_name: returnData.user_name || returnData.user_id,
      created_at: localTimestamp(),
    });
  }
  
  return { success: true };
}));

ipcMain.handle('db:getReturns', (event, filters?: {
  tenant_id?: string;
  invoice_id?: string;
  limit?: number;
  offset?: number;
  search?: string;
}) => {
  try {
    const db = getDb();
    const { tenant_id, invoice_id, limit, offset, search } = filters || {};
    if (!tenant_id) return [];

    let query = `SELECT r.* FROM returns r WHERE r.tenant_id = ?`;
    const params: any[] = [tenant_id];

    if (invoice_id) {
      query += ' AND r.invoice_id = ?';
      params.push(invoice_id);
    }

    if (search) {
      query += ' AND (r.return_number LIKE ? OR r.customer_name LIKE ? OR r.customer_phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY r.created_at DESC';

    if (limit) { query += ' LIMIT ?'; params.push(limit); }
    if (offset) { query += ' OFFSET ?'; params.push(offset); }

    return db.prepare(query).all(...params);
  } catch (error: any) {
    console.error('[db:getReturns]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getReturnItems', (event, return_id: string) => {
  try {
    const db = getDb();
    return db.prepare('SELECT ri.*, p.sku_barcode, p.item_code FROM return_items ri LEFT JOIN products p ON ri.product_id = p.product_id WHERE ri.return_id = ?').all(return_id);
  } catch (error: any) {
    console.error('[db:getReturnItems]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:deleteReturn', (event, return_id: string) => {
  try {
    const db = getDb();
    const transaction = db.transaction(() => {
      const returnRow = db.prepare('SELECT * FROM returns WHERE return_id = ?').get(return_id) as any;
      if (!returnRow) return;

      const items = db.prepare('SELECT product_id, quantity FROM return_items WHERE return_id = ?').all(return_id) as any[];
      for (const item of items) {
        db.prepare('UPDATE products SET current_stock = current_stock - ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?').run(item.quantity, item.product_id);
      }

      // Restore original invoice balance_amount if it was a credit bill
      if (returnRow.invoice_id) {
        const origInv = db.prepare('SELECT * FROM invoices WHERE invoice_id = ?').get(returnRow.invoice_id) as any;
        if (origInv) {
          const origPm = (origInv.payment_method || '').toUpperCase();
          let origSplitCredit = 0;
          if (origInv.split_details) {
            try {
              const s = typeof origInv.split_details === 'string' ? JSON.parse(origInv.split_details) : origInv.split_details;
              origSplitCredit = Number(s?.credit) || 0;
            } catch {}
          }
          const isOrigCredit = origPm === 'CREDIT' || origSplitCredit > 0 || (Number(origInv.balance_amount) > 0 && origPm !== 'CASH');
          if (isOrigCredit) {
            const restoredBalance = (Number(origInv.balance_amount) || 0) + (Number(returnRow.grand_total) || 0);
            db.prepare("UPDATE invoices SET balance_amount = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE invoice_id = ?").run(restoredBalance, origInv.invoice_id);
          }
        }
      }

      // Soft delete party ledger entries for this return
      const ledgerRows = db.prepare(`
        SELECT ledger_id, party_id FROM party_ledger
        WHERE reference_number = ?
           OR reference_number LIKE ? || '-%'
           OR description LIKE '%' || ? || '%'
      `).all(returnRow.return_number, returnRow.return_number, returnRow.return_number) as any[];

      const affectedParties = new Set<string>();
      for (const row of ledgerRows) {
        affectedParties.add(row.party_id);
        db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?").run(row.ledger_id);
      }

      db.prepare('DELETE FROM return_items WHERE return_id = ?').run(return_id);
      db.prepare('DELETE FROM returns WHERE return_id = ?').run(return_id);

      for (const pId of affectedParties) {
        recalcPartyBalances(db, pId);
      }
    });
    transaction();
    return { success: true };
  } catch (error: any) {
    console.error('[db:deleteReturn]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:getNextReturnNumber', safeHandler((event, payload: { tenant_id: string; prefix?: string }) => {
  const db = getDb();
  const terminalCode = getOrInitTerminalCode(db);
  const defaultPrefix = `${terminalCode}-RTN-`;
  const result = db.transaction(() => {
    const confRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'return_counter');
    let prefix = defaultPrefix;
    let counter = 1;
    if (payload.prefix) {
      prefix = payload.prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
    } else if (confRow) {
      try {
        const cfg = JSON.parse(confRow.value);
        let rawPrefix = cfg.prefix && /[A-Z0-9]/i.test(cfg.prefix) ? cfg.prefix : defaultPrefix;
        if (rawPrefix.includes('-RTN-')) {
          // Respect user-set prefix -- no forced override
        }
        prefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
        counter = typeof cfg.counter === 'number' ? cfg.counter : 1;
      } catch {
        // Invalid JSON â€” use defaults
      }
    }
    const usedRows: any[] = db.prepare('SELECT return_number FROM returns WHERE return_number LIKE ?').all(`${prefix}%`);
    let maxUsed = 0;
    for (const row of usedRows) {
      const usedNum = parseInt(String(row.return_number).slice(prefix.length), 10);
      if (!isNaN(usedNum) && usedNum > maxUsed) maxUsed = usedNum;
    }
    const nextCounter = Math.max(counter, maxUsed + 1);
    const returnNumber = `${prefix}${String(nextCounter).padStart(3, '0')}`;
    db.prepare(`INSERT INTO settings (tenant_id, key, value, sync_status, updated_at) VALUES ('global', 'return_counter', ?, 'LOCAL', CURRENT_TIMESTAMP) ON CONFLICT(tenant_id, key) DO UPDATE SET value = EXCLUDED.value, sync_status = 'LOCAL', updated_at = CURRENT_TIMESTAMP`).run(JSON.stringify({ prefix, counter: nextCounter + 1 }));
    return { success: true, returnNumber };
  })();
  return result;
}));

ipcMain.handle('db:peekNextReturnNumber', safeHandler((event, payload: { tenant_id: string; prefix?: string }) => {
  const db = getDb();
  const terminalCode = getOrInitTerminalCode(db);
  const defaultPrefix = `${terminalCode}-RTN-`;
  const confRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'return_counter');
  let prefix = defaultPrefix;
  let counter = 1;
  if (payload.prefix) {
    const sanitized = payload.prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
    prefix = sanitized && /[A-Z0-9]/i.test(sanitized) ? sanitized : defaultPrefix;
  } else if (confRow) {
    try {
      const cfg = JSON.parse(confRow.value);
      let rawPrefix = cfg.prefix && /[A-Z0-9]/i.test(cfg.prefix) ? cfg.prefix : defaultPrefix;
      if (rawPrefix.includes('-RTN-')) {
          // Respect user-set prefix -- no forced override
      }
      prefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
      counter = typeof cfg.counter === 'number' ? cfg.counter : 1;
    } catch {
      // Invalid JSON â€” use defaults
    }
  }
  const usedRows: any[] = db.prepare('SELECT return_number FROM returns WHERE return_number LIKE ?').all(`${prefix}%`);
  let maxUsed = 0;
  for (const row of usedRows) {
    const usedNum = parseInt(String(row.return_number).slice(prefix.length), 10);
    if (!isNaN(usedNum) && usedNum > maxUsed) maxUsed = usedNum;
  }
  const nextCounter = Math.max(counter, maxUsed + 1);
  return { success: true, returnNumber: `${prefix}${String(nextCounter).padStart(3, '0')}` };
}));

ipcMain.handle('db:previewConvertBosToGst', (event, payload: {
  invoice_ids: string[];
  tenant_id: string;
  tax_mode?: 'EXCLUSIVE' | 'INCLUSIVE';
}) => {
  try {
    const db = getDb();
    const parseSetting = (row: any): any => {
      if (!row) return null;
      try { return JSON.parse(row.value); } catch { return row.value; }
    };

    const profitPctRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(payload.tenant_id || 'global', 'gst_profit_percentage');
    const profitPercentage = profitPctRow ? Number(parseSetting(profitPctRow) || 0) || 30 : 30;
    const multiplier = 1 + (profitPercentage / 100);

    const taxInclusiveRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(payload.tenant_id || 'global', 'gst_conversion_tax_inclusive');
    const isTaxInclusive = payload.tax_mode ? (payload.tax_mode === 'INCLUSIVE') : Boolean(taxInclusiveRow ? parseSetting(taxInclusiveRow) : false);

    let totalBosAmount = 0;
    let totalTaxableAmount = 0;
    let totalTaxAmount = 0;
    let totalConvertedAmount = 0;
    let hasRealGstAny = false;
    let hasPaperAny = false;
    let hasSkippedAny = false;

    const invoices: Array<{
      invoice_id: string;
      invoice_number: string;
      bos_grand_total: number;
      taxable_amount: number;
      tax_amount: number;
      converted_grand_total: number;
      points_discount: number;
      scrap_deduction: number;
      return_deduction: number;
      deductions_total: number;
      has_real_gst: boolean;
      has_paper: boolean;
      skipped_items: string[];
    }> = [];

    for (const invoice_id of payload.invoice_ids) {
      const inv: any = db.prepare('SELECT * FROM invoices WHERE invoice_id = ?').get(invoice_id);
      if (!inv) continue;
      const tid = inv.tenant_id || payload.tenant_id || 'global';

      const items: any[] = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoice_id);
      let newSubtotal = 0;
      let newTotalTax = 0;
      let hasRealGst = false;
      let hasPaper = false;
      const skippedItems: string[] = [];
      let convertedItemCount = 0;

      for (const item of items) {
        const cleanName = item.name.replace(/\s*\((GST|EST|Estimate)\)$/i, '').trim();
        const gstProduct = db.prepare(`
          SELECT * FROM products 
          WHERE tenant_id = ? 
            AND (product_id = ? OR name = ? OR name = ?) 
            AND is_deleted = 0
          ORDER BY (CASE WHEN product_id = ? THEN 1 WHEN name LIKE '%(GST)' THEN 2 ELSE 3 END) ASC
          LIMIT 1
        `).get(tid, item.product_id, cleanName + ' (GST)', cleanName, item.product_id) as any;

        if (!gstProduct) {
          skippedItems.push(item.name || item.product_id);
          continue;
        }

        const originalQty = Number(item.quantity) || 0;

        const gstStockRows = db.prepare(`
          SELECT pbi.item_id, pbi.quantity, pbi.purchase_price, pbi.selling_price, pbi.offer_price, pbi.tax_rate_percent
          FROM purchase_bill_items pbi
          JOIN purchase_bills pb ON pbi.purchase_bill_id = pb.purchase_bill_id
          WHERE pbi.product_id = ? 
            AND pb.bill_type = 'GST' 
            AND pb.tenant_id = ?
          ORDER BY pbi.created_at ASC
        `).all(gstProduct.product_id, tid) as any[];

        let da: Record<string, any> = {};
        try { da = JSON.parse(gstProduct.domain_attributes || '{}'); } catch {}

        const isRealGstProduct = gstProduct.is_gst_applicable === 1 && da.gst_type !== 'PAPER';
        const isPaperProduct = !isRealGstProduct && (
          da.gst_type === 'PAPER' ||
          (da.paper_mrp !== undefined && da.paper_mrp !== null && Number(da.paper_mrp) > 0) ||
          (da.paper_purchase_price !== undefined && da.paper_purchase_price !== null && Number(da.paper_purchase_price) > 0) ||
          (da.gst_purchase_price !== undefined && da.gst_purchase_price !== null && Number(da.gst_purchase_price) > 0) ||
          (da.paper_stock !== undefined && Number(da.paper_stock) > 0)
        );

        if (isRealGstProduct) hasRealGst = true;
        if (isPaperProduct) hasPaper = true;

        if (!isRealGstProduct && !isPaperProduct && gstStockRows.length === 0) {
          skippedItems.push(item.name || item.product_id);
          continue;
        }

        const gstSoldRow = db.prepare(`
          SELECT COALESCE(SUM(ii.quantity), 0) as total_gst_sold
          FROM invoice_items ii
          JOIN invoices i ON ii.invoice_id = i.invoice_id
          WHERE ii.product_id = ? AND i.invoice_type = 'GST' AND ii.tenant_id = ? AND i.invoice_id != ?
        `).get(gstProduct.product_id, tid, invoice_id) as any;
        const totalGstSold = gstSoldRow ? Number(gstSoldRow.total_gst_sold) : 0;

        let remainingSold = totalGstSold;
        const availableGstBatches: { item_id: string; qty: number; purchase_price: number; selling_price: number; offer_price: number; tax_rate_percent: number }[] = [];

        for (const batch of gstStockRows) {
          const batchQty = Number(batch.quantity) || 0;
          const alreadyConsumed = Math.min(batchQty, remainingSold);
          const availableQty = batchQty - alreadyConsumed;
          remainingSold = Math.max(0, remainingSold - alreadyConsumed);
          if (availableQty > 0) {
            availableGstBatches.push({
              item_id: batch.item_id,
              qty: availableQty,
              purchase_price: Number(batch.purchase_price) || 0,
              selling_price: Number(batch.selling_price) || 0,
              offer_price: Number(batch.offer_price) || 0,
              tax_rate_percent: Number(batch.tax_rate_percent) || 0,
            });
          }
        }

        if (gstStockRows.length === 0 && isPaperProduct && Number(da.paper_stock || 0) > 0) {
          const paperStock = Number(da.paper_stock) || 0;
          const availPaper = Math.max(0, paperStock - totalGstSold);
          if (availPaper > 0) {
            availableGstBatches.push({
              item_id: 'manual-paper-stock',
              qty: availPaper,
              purchase_price: Number(da.paper_purchase_price || da.gst_purchase_price || 0),
              selling_price: Number(da.paper_mrp || da.paper_base_price || 0),
              offer_price: Number(da.paper_offer_price || da.paper_offer || 0),
              tax_rate_percent: Number(gstProduct.tax_rate_percent) || 0,
            });
          }
        } else if (isRealGstProduct && gstStockRows.length === 0) {
          const realStock = Math.max(0, Number(gstProduct.current_stock) || 0);
          const availReal = Math.max(0, realStock + originalQty - totalGstSold);
          if (availReal > 0) {
            availableGstBatches.push({
              item_id: 'real-gst-stock',
              qty: availReal,
              purchase_price: Number(gstProduct.purchase_price) || 0,
              selling_price: Number(gstProduct.base_price) || 0,
              offer_price: Number(gstProduct.offer_price) || 0,
              tax_rate_percent: Number(gstProduct.tax_rate_percent) || 0,
            });
          }
        }

        const totalAvailableGstStock = availableGstBatches.reduce((sum, b) => sum + b.qty, 0);
        const qtyToConvert = isRealGstProduct ? originalQty : Math.min(originalQty, totalAvailableGstStock);

        if (qtyToConvert <= 0) {
          skippedItems.push(item.name || item.product_id);
          continue;
        }

        let newUnitPrice = 0;
        let batchTaxRate = 0;

        if (isRealGstProduct) {
          newUnitPrice = Number(item.unit_price) || 0;
          batchTaxRate = Number(item.tax_rate) || Number(gstProduct.tax_rate_percent) || 0;
        } else {
          let paperSellingPrice = 0;
          let paperPurchasePrice = 0;

          for (const batch of availableGstBatches) {
            if (batch.offer_price > 0 && !paperSellingPrice) {
              paperSellingPrice = batch.offer_price;
              if (batch.tax_rate_percent > 0) batchTaxRate = batch.tax_rate_percent;
            } else if (batch.selling_price > 0 && !paperSellingPrice) {
              paperSellingPrice = batch.selling_price;
              if (batch.tax_rate_percent > 0) batchTaxRate = batch.tax_rate_percent;
            }
            if (batch.purchase_price > 0 && !paperPurchasePrice) {
              paperPurchasePrice = batch.purchase_price;
              if (batch.tax_rate_percent > 0 && !batchTaxRate) batchTaxRate = batch.tax_rate_percent;
            }
          }

          if (!paperSellingPrice || paperSellingPrice <= 0) {
            if (da.paper_offer_price && Number(da.paper_offer_price) > 0) paperSellingPrice = Number(da.paper_offer_price);
            else if (da.paper_offer && Number(da.paper_offer) > 0) paperSellingPrice = Number(da.paper_offer);
            else if (da.paper_mrp && Number(da.paper_mrp) > 0) paperSellingPrice = Number(da.paper_mrp);
            else if (da.paper_base_price && Number(da.paper_base_price) > 0) paperSellingPrice = Number(da.paper_base_price);
          }

          if (!paperPurchasePrice || paperPurchasePrice <= 0) {
            paperPurchasePrice = Number(da.paper_purchase_price || da.gst_purchase_price || gstProduct.purchase_price) || 0;
          }

          if (paperSellingPrice > 0) {
            newUnitPrice = paperSellingPrice;
          } else if (paperPurchasePrice > 0) {
            newUnitPrice = Math.round(paperPurchasePrice * multiplier * 100) / 100;
          } else {
            newUnitPrice = Number(item.unit_price) || 0;
          }
        }

        if (!newUnitPrice || newUnitPrice <= 0) {
          newUnitPrice = Number(item.unit_price) || 0;
        }

        const taxRate = Number(gstProduct.tax_rate_percent) || batchTaxRate || Number(item.tax_rate) || 0;
        let itemTaxable = 0;
        let itemTax = 0;
        let itemTotal = 0;

        if (isTaxInclusive && taxRate > 0) {
          itemTotal = Math.round(newUnitPrice * qtyToConvert * 100) / 100;
          itemTaxable = Math.round((itemTotal / (1 + taxRate / 100)) * 100) / 100;
          itemTax = Math.round((itemTotal - itemTaxable) * 100) / 100;
        } else {
          itemTaxable = Math.round(newUnitPrice * qtyToConvert * 100) / 100;
          itemTax = Math.round(itemTaxable * (taxRate / 100) * 100) / 100;
          itemTotal = Math.round((itemTaxable + itemTax) * 100) / 100;
        }

        newSubtotal += itemTaxable;
        newTotalTax += itemTax;
        convertedItemCount++;

        if (qtyToConvert < originalQty) {
          skippedItems.push(`${item.name} (partial)`);
        }
      }

      newSubtotal = Math.round(newSubtotal * 100) / 100;
      newTotalTax = Math.round(newTotalTax * 100) / 100;

      let newDiscountTotal = 0;
      if (inv.discount_type === 'PERCENTAGE' && Number(inv.discount_value) > 0) {
        newDiscountTotal = Math.round(newSubtotal * (Number(inv.discount_value) / 100) * 100) / 100;
      } else if (inv.discount_type === 'FIXED' && Number(inv.discount_value) > 0) {
        newDiscountTotal = Math.min(Number(inv.discount_value), newSubtotal);
      }

      const taxableAmount = newSubtotal - newDiscountTotal;
      const effectiveTaxRate = newSubtotal > 0 ? newTotalTax / newSubtotal : 0;
      const adjustedTax = Math.round(taxableAmount * effectiveTaxRate * 100) / 100;
      const pointsDiscount = Math.max(0, Number(inv.points_redeemed_discount) || 0);
      const scrapDeduction = inv.scrap_invoice_number ? Math.max(0, Number(inv.scrap_deduction) || 0) : 0;
      const returnDeduction = inv.return_invoice_number ? Math.max(0, Number(inv.return_deduction) || 0) : 0;
      const deductionsTotal = Math.round((pointsDiscount + scrapDeduction + returnDeduction) * 100) / 100;
      const grossConvertedTotal = Math.round((taxableAmount + adjustedTax) * 100) / 100;
      const convertedGrandTotal = convertedItemCount > 0
        ? Math.max(0, Math.round((grossConvertedTotal - deductionsTotal) * 100) / 100)
        : Number(inv.grand_total) || 0;

      totalBosAmount += Number(inv.grand_total) || 0;
      totalTaxableAmount += taxableAmount;
      totalTaxAmount += adjustedTax;
      totalConvertedAmount += convertedGrandTotal;
      if (hasRealGst) hasRealGstAny = true;
      if (hasPaper) hasPaperAny = true;
      if (skippedItems.length > 0) hasSkippedAny = true;

      invoices.push({
        invoice_id: inv.invoice_id,
        invoice_number: inv.invoice_number,
        bos_grand_total: Number(inv.grand_total) || 0,
        taxable_amount: taxableAmount,
        tax_amount: adjustedTax,
        converted_grand_total: convertedGrandTotal,
        points_discount: pointsDiscount,
        scrap_deduction: scrapDeduction,
        return_deduction: returnDeduction,
        deductions_total: deductionsTotal,
        has_real_gst: hasRealGst,
        has_paper: hasPaper,
        skipped_items: skippedItems,
      });
    }

    return {
      success: true,
      invoices,
      total_bos_amount: Math.round(totalBosAmount * 100) / 100,
      total_taxable_amount: Math.round(totalTaxableAmount * 100) / 100,
      total_tax_amount: Math.round(totalTaxAmount * 100) / 100,
      total_converted_amount: Math.round(totalConvertedAmount * 100) / 100,
      has_real_gst: hasRealGstAny,
      has_paper: hasPaperAny,
      has_skipped: hasSkippedAny,
    };
  } catch (error: any) {
    console.error('[db:previewConvertBosToGst]', error);
    return { success: false, error: error.message || 'Failed to preview conversion' };
  }
});

ipcMain.handle('db:convertBosToGst', async (event, payload: {
  invoice_ids: string[];
  tenant_id: string;
  user_id: string;
  tax_mode?: 'EXCLUSIVE' | 'INCLUSIVE';
}) => {
  try {
    console.log('[convertBosToGst] Starting conversion for', payload.invoice_ids.length, 'invoices');
    const db = getDb();

    // Some settings are stored raw (server-synced) and some JSON-encoded â€” parse both.
    const parseSetting = (row: any): any => {
      if (!row) return null;
      try { return JSON.parse(row.value); } catch { return row.value; }
    };

    // Get shop state
    const shopStateRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(payload.tenant_id || 'global', 'shop_state');
    const shopState: string = shopStateRow ? (parseSetting(shopStateRow) || 'KL') : 'KL';

    // Get profit percentage
    const profitPctRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(payload.tenant_id || 'global', 'gst_profit_percentage');
    const profitPercentage = profitPctRow ? Number(parseSetting(profitPctRow) || 0) || 30 : 30;
    const multiplier = 1 + (profitPercentage / 100);

    // Get tax inclusive setting
    const taxInclusiveRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(payload.tenant_id || 'global', 'gst_conversion_tax_inclusive');
    const isTaxInclusive = payload.tax_mode ? (payload.tax_mode === 'INCLUSIVE') : Boolean(taxInclusiveRow ? parseSetting(taxInclusiveRow) : false);

    const results: { invoice_id: string; old_number: string; new_number: string; success: boolean; error?: string }[] = [];

    for (const invoice_id of payload.invoice_ids) {
      // Look up invoice number first so it's available even if the transaction fails
      let invoiceNumber = '';
      const invLookup: any = db.prepare('SELECT invoice_number, invoice_type FROM invoices WHERE invoice_id = ?').get(invoice_id);
      if (invLookup) {
        invoiceNumber = invLookup.invoice_number;
      }

      try {
        const numberInvoice: any = db.prepare('SELECT * FROM invoices WHERE invoice_id = ?').get(invoice_id);
        let preallocatedInvoiceNumber = '';
        if (numberInvoice && numberInvoice.invoice_type !== 'GST' && !numberInvoice.converted_to_invoice_id) {
          const numberTid = numberInvoice.tenant_id || payload.tenant_id || 'global';
          const numberTripleRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(numberTid, 'three_invoice_series')
            || db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'three_invoice_series');
          const numberTriple = numberTripleRow ? parseSetting(numberTripleRow) : null;
          const numberIsB2B = Boolean(numberInvoice.customer_gstin && String(numberInvoice.customer_gstin).trim() !== '');
          const numberSeries = numberTriple?.enabled ? (numberIsB2B ? 'gst_b2b' : 'gst_b2c') : 'gst';
          const numberConfigKey = numberSeries === 'gst_b2b' ? 'gst_b2b_invoice_counter_config'
            : numberSeries === 'gst_b2c' ? 'gst_b2c_invoice_counter_config'
            : 'gst_invoice_counter_config';
          const localNext = peekGuaranteedNextInvoiceNumber(db, numberTid, numberConfigKey);
          const serverAllocation = await requestServerInvoiceNumber(db, numberTid, numberSeries, numberConfigKey, localNext.counter, 1500);
          if (serverAllocation.success) preallocatedInvoiceNumber = serverAllocation.invoiceNumber;
        }

        const invoice = db.transaction(() => {
          // Get the invoice
          const inv: any = db.prepare('SELECT * FROM invoices WHERE invoice_id = ?').get(invoice_id);
          if (!inv) throw new Error('Invoice not found');
          if (inv.invoice_type === 'GST') throw new Error('Invoice is already a GST invoice');
          if (inv.converted_to_invoice_id) throw new Error('Invoice is already converted');

          const tid = inv.tenant_id || payload.tenant_id || 'global';
          const oldInvoiceNumber = inv.invoice_number;

          // Check if three invoice series is enabled
          const tripleSeriesRow: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(tid, 'three_invoice_series')
            || db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'three_invoice_series');
          const tripleSeries = tripleSeriesRow ? parseSetting(tripleSeriesRow) : null;

          const isB2B = Boolean(inv.customer_gstin && inv.customer_gstin.trim() !== '');
          let configKey = 'gst_invoice_counter_config';

          if (tripleSeries && tripleSeries.enabled) {
            configKey = isB2B ? 'gst_b2b_invoice_counter_config' : 'gst_b2c_invoice_counter_config';
          } else {
            // Dedicated GST counter so GST invoices NEVER steal or continue regular Bill of Supply numbers
            const dualSeriesRow2: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(tid, 'dual_invoice_series')
              || db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'dual_invoice_series');
            const dualSeries2 = dualSeriesRow2 ? parseSetting(dualSeriesRow2) : null;
            if (dualSeries2 && dualSeries2.enabled) {
              configKey = 'gst_invoice_counter_config';
            } else {
              configKey = 'gst_invoice_counter_config';
            }
          }

          const { invoiceNumber: newInvoiceNumber } = preallocatedInvoiceNumber
            ? { invoiceNumber: preallocatedInvoiceNumber }
            : getGuaranteedNextInvoiceNumber(db, tid, configKey);

          // Get invoice items
          const items: any[] = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoice_id);

          let newSubtotal = 0;
          let newTotalTax = 0;
          const copyItems: { item_id: string; source_item_id: string; product_id: string; name: string; quantity: number; is_service_item: number; newUnitPrice: number; newTotal: number; newTaxAmount: number; taxRate: number; bosUnitPrice: number; bosTax: number; bosTotal: number; qtyFromPaper: number; paperConsumed: { item_id: string; qty: number }[]; hsn_sac_code?: string | null; uom?: string | null }[] = [];
          const skippedItems: string[] = [];

          for (const item of items) {
            const cleanName = item.name.replace(/\s*\((GST|EST|Estimate)\)$/i, '').trim();
            const gstProduct = db.prepare(`
              SELECT * FROM products 
              WHERE tenant_id = ? 
                AND (product_id = ? OR name = ? OR name = ?) 
                AND is_deleted = 0
              ORDER BY (CASE WHEN product_id = ? THEN 1 WHEN name LIKE '%(GST)' THEN 2 ELSE 3 END) ASC
              LIMIT 1
            `).get(tid, item.product_id, cleanName + ' (GST)', cleanName, item.product_id) as any;

            if (!gstProduct) {
              skippedItems.push(`${item.name || item.product_id} (Product not found)`);
              continue;
            }

            const originalQty = Number(item.quantity) || 0;

            // ─── Compute available GST stock WITH rates from all GST purchase bills (FIFO) ───
            // Includes both Real GST purchases (skip_stock_update = 0) and Paper GST purchases (skip_stock_update = 1)
            const gstStockRows = db.prepare(`
              SELECT pbi.item_id, pbi.quantity, pbi.purchase_price, pbi.selling_price, pbi.offer_price, pbi.tax_rate_percent
              FROM purchase_bill_items pbi
              JOIN purchase_bills pb ON pbi.purchase_bill_id = pb.purchase_bill_id
              WHERE pbi.product_id = ? 
                AND pb.bill_type = 'GST' 
                AND pb.tenant_id = ?
              ORDER BY pbi.created_at ASC
            `).all(gstProduct.product_id, tid) as any[];

            let da: Record<string, any> = {};
            try { da = JSON.parse(gstProduct.domain_attributes || '{}'); } catch {}

            // A product is Real GST if is_gst_applicable is 1 and its gst_type is not explicitly PAPER
            const isRealGstProduct = gstProduct.is_gst_applicable === 1 && da.gst_type !== 'PAPER';

            const isPaperProduct = !isRealGstProduct && (
              da.gst_type === 'PAPER' ||
              (da.paper_mrp !== undefined && da.paper_mrp !== null && Number(da.paper_mrp) > 0) ||
              (da.paper_purchase_price !== undefined && da.paper_purchase_price !== null && Number(da.paper_purchase_price) > 0) ||
              (da.gst_purchase_price !== undefined && da.gst_purchase_price !== null && Number(da.gst_purchase_price) > 0) ||
              (da.paper_stock !== undefined && Number(da.paper_stock) > 0)
            );

            // ─── Rule 3: Skip estimate (not paper) products from bill conversion ───
            if (!isRealGstProduct && !isPaperProduct && gstStockRows.length === 0) {
              skippedItems.push(`${item.name || item.product_id} (Estimate non-paper product skipped)`);
              continue;
            }

            // Total GST quantity already sold on existing GST invoices
            const gstSoldRow = db.prepare(`
              SELECT COALESCE(SUM(ii.quantity), 0) as total_gst_sold
              FROM invoice_items ii
              JOIN invoices i ON ii.invoice_id = i.invoice_id
              WHERE ii.product_id = ? AND i.invoice_type = 'GST' AND ii.tenant_id = ? AND i.invoice_id != ?
            `).get(gstProduct.product_id, tid, invoice_id) as any;
            const totalGstSold = gstSoldRow ? Number(gstSoldRow.total_gst_sold) : 0;

            // Calculate remaining qty per purchase bill item (FIFO consumption)
            let remainingSold = totalGstSold;
            const availableGstBatches: { item_id: string; qty: number; purchase_price: number; selling_price: number; offer_price: number; tax_rate_percent: number }[] = [];

            for (const batch of gstStockRows) {
              const batchQty = Number(batch.quantity) || 0;
              const alreadyConsumed = Math.min(batchQty, remainingSold);
              const availableQty = batchQty - alreadyConsumed;
              remainingSold = Math.max(0, remainingSold - alreadyConsumed);
              
              if (availableQty > 0) {
                availableGstBatches.push({
                  item_id: batch.item_id,
                  qty: availableQty,
                  purchase_price: Number(batch.purchase_price) || 0,
                  selling_price: Number(batch.selling_price) || 0,
                  offer_price: Number(batch.offer_price) || 0,
                  tax_rate_percent: Number(batch.tax_rate_percent) || 0,
                });
              }
            }

            // If manual paper stock is defined in product domain_attributes without purchase bill
            if (gstStockRows.length === 0 && isPaperProduct && Number(da.paper_stock || 0) > 0) {
              const paperStock = Number(da.paper_stock) || 0;
              const availPaper = Math.max(0, paperStock - totalGstSold);
              if (availPaper > 0) {
                availableGstBatches.push({
                  item_id: 'manual-paper-stock',
                  qty: availPaper,
                  purchase_price: Number(da.paper_purchase_price || da.gst_purchase_price || 0),
                  selling_price: Number(da.paper_mrp || da.paper_base_price || 0),
                  offer_price: Number(da.paper_offer_price || da.paper_offer || 0),
                  tax_rate_percent: Number(gstProduct.tax_rate_percent) || 0,
                });
              }
            } else if (isRealGstProduct && gstStockRows.length === 0) {
              const realStock = Math.max(0, Number(gstProduct.current_stock) || 0);
              const availReal = Math.max(0, realStock + originalQty - totalGstSold);
              if (availReal > 0) {
                availableGstBatches.push({
                  item_id: 'real-gst-stock',
                  qty: availReal,
                  purchase_price: Number(gstProduct.purchase_price) || 0,
                  selling_price: Number(gstProduct.base_price) || 0,
                  offer_price: Number(gstProduct.offer_price) || 0,
                  tax_rate_percent: Number(gstProduct.tax_rate_percent) || 0,
                });
              }
            }

            const totalAvailableGstStock = availableGstBatches.reduce((sum, b) => sum + b.qty, 0);
            const qtyToConvert = isRealGstProduct ? originalQty : Math.min(originalQty, totalAvailableGstStock);

            if (qtyToConvert <= 0) {
              skippedItems.push(`${item.name || item.product_id} (0 of ${originalQty} converted - no GST stock available)`);
              continue;
            }

            // ─── Determine Unit Price based on user specifications: ───
            let newUnitPrice = 0;
            let batchTaxRate = 0;

            if (isRealGstProduct) {
              // ─── Rule 1: Real GST product -> same BOS price (no any changes) ───
              newUnitPrice = Number(item.unit_price) || 0;
              batchTaxRate = Number(item.tax_rate) || Number(gstProduct.tax_rate_percent) || 0;
            } else {
              // ─── Rule 2: Paper details available -> use paper MRP/offer; if not available -> use settings percentage on purchase price ───
              let paperSellingPrice = 0;
              let paperPurchasePrice = 0;

              for (const batch of availableGstBatches) {
                if (batch.offer_price > 0 && !paperSellingPrice) {
                  paperSellingPrice = batch.offer_price;
                  if (batch.tax_rate_percent > 0) batchTaxRate = batch.tax_rate_percent;
                } else if (batch.selling_price > 0 && !paperSellingPrice) {
                  paperSellingPrice = batch.selling_price;
                  if (batch.tax_rate_percent > 0) batchTaxRate = batch.tax_rate_percent;
                }
                if (batch.purchase_price > 0 && !paperPurchasePrice) {
                  paperPurchasePrice = batch.purchase_price;
                  if (batch.tax_rate_percent > 0 && !batchTaxRate) batchTaxRate = batch.tax_rate_percent;
                }
              }

              if (!paperSellingPrice || paperSellingPrice <= 0) {
                if (da.paper_offer_price && Number(da.paper_offer_price) > 0) {
                  paperSellingPrice = Number(da.paper_offer_price);
                } else if (da.paper_offer && Number(da.paper_offer) > 0) {
                  paperSellingPrice = Number(da.paper_offer);
                } else if (da.paper_mrp && Number(da.paper_mrp) > 0) {
                  paperSellingPrice = Number(da.paper_mrp);
                } else if (da.paper_base_price && Number(da.paper_base_price) > 0) {
                  paperSellingPrice = Number(da.paper_base_price);
                }
              }

              if (!paperPurchasePrice || paperPurchasePrice <= 0) {
                paperPurchasePrice = Number(da.paper_purchase_price || da.gst_purchase_price || gstProduct.purchase_price) || 0;
              }

              if (paperSellingPrice > 0) {
                newUnitPrice = paperSellingPrice;
              } else if (paperPurchasePrice > 0) {
                newUnitPrice = Math.round(paperPurchasePrice * multiplier * 100) / 100;
              } else {
                newUnitPrice = Number(item.unit_price) || 0;
              }
            }

            if (!newUnitPrice || newUnitPrice <= 0) {
              newUnitPrice = Number(item.unit_price) || 0;
            }

            const taxRate = Number(gstProduct.tax_rate_percent) || batchTaxRate || Number(item.tax_rate) || 0;
            let itemTaxable = 0;
            let itemTax = 0;
            let itemTotal = 0;
            let finalUnitPrice = newUnitPrice;

            if (isTaxInclusive && taxRate > 0) {
              itemTotal = Math.round(newUnitPrice * qtyToConvert * 100) / 100;
              itemTaxable = Math.round((itemTotal / (1 + taxRate / 100)) * 100) / 100;
              itemTax = Math.round((itemTotal - itemTaxable) * 100) / 100;
              finalUnitPrice = Math.round((newUnitPrice / (1 + taxRate / 100)) * 100) / 100;
            } else {
              itemTaxable = Math.round(newUnitPrice * qtyToConvert * 100) / 100;
              itemTax = Math.round(itemTaxable * (taxRate / 100) * 100) / 100;
              itemTotal = Math.round((itemTaxable + itemTax) * 100) / 100;
              finalUnitPrice = newUnitPrice;
            }

            newSubtotal += itemTaxable;
            newTotalTax += itemTax;

            copyItems.push({
              item_id: crypto.randomUUID(),
              source_item_id: item.item_id,
              product_id: gstProduct.product_id,
              name: gstProduct.name,
              quantity: qtyToConvert,
              is_service_item: item.is_service_item ? 1 : 0,
              newUnitPrice: finalUnitPrice,
              newTotal: itemTaxable,
              newTaxAmount: itemTax,
              taxRate: Number(taxRate) || 0,
              bosUnitPrice: Number(item.unit_price) || 0,
              bosTax: Number(item.tax_amount) || 0,
              bosTotal: Number(item.total) || 0,
              qtyFromPaper: qtyToConvert,
              paperConsumed: [],
              hsn_sac_code: gstProduct.hsn_sac_code || item.hsn_sac_code || null,
              uom: gstProduct.uom || item.uom || 'PCS',
            });

            if (qtyToConvert < originalQty) {
              skippedItems.push(`${item.name || item.product_id} (${qtyToConvert} of ${originalQty} converted, balance ${originalQty - qtyToConvert} skipped - limited GST stock)`);
            }
          }

          if (copyItems.length === 0) {
            throw new Error(skippedItems.length > 0 ? skippedItems.join('; ') : 'No items have available GST stock. Conversion failed.');
          }

          newSubtotal = Math.round(newSubtotal * 100) / 100;
          newTotalTax = Math.round(newTotalTax * 100) / 100;

          // Recalculate discount on new subtotal
          let newDiscountTotal = 0;
          if (inv.discount_type === 'PERCENTAGE' && Number(inv.discount_value) > 0) {
            newDiscountTotal = Math.round(newSubtotal * (Number(inv.discount_value) / 100) * 100) / 100;
          } else if (inv.discount_type === 'FIXED' && Number(inv.discount_value) > 0) {
            newDiscountTotal = Math.min(Number(inv.discount_value), newSubtotal);
          }

          const taxableAmount = newSubtotal - newDiscountTotal;
          const effectiveTaxRate = newSubtotal > 0 ? newTotalTax / newSubtotal : 0;
          const adjustedTax = Math.round(taxableAmount * effectiveTaxRate * 100) / 100;
          const pointsDiscount = Math.max(0, Number(inv.points_redeemed_discount) || 0);
          const scrapDeduction = inv.scrap_invoice_number ? Math.max(0, Number(inv.scrap_deduction) || 0) : 0;
          const returnDeduction = inv.return_invoice_number ? Math.max(0, Number(inv.return_deduction) || 0) : 0;
          const deductionsTotal = Math.round((pointsDiscount + scrapDeduction + returnDeduction) * 100) / 100;
          const grossGrandTotal = Math.round((taxableAmount + adjustedTax) * 100) / 100;
          const newGrandTotal = Math.max(0, Math.round((grossGrandTotal - deductionsTotal) * 100) / 100);

          const newInvoiceId = crypto.randomUUID();

          const isInterStateConv = shopState.trim().toUpperCase() !== '' && (inv.customer_state || '').trim().toUpperCase() !== '' && shopState.trim().toUpperCase() !== (inv.customer_state || '').trim().toUpperCase();
          const convSupplyType: 'INTRA' | 'INTER' = isInterStateConv ? 'INTER' : 'INTRA';
          const convCgstTotal = isInterStateConv ? 0 : Math.round((adjustedTax / 2) * 100) / 100;
          const convSgstTotal = isInterStateConv ? 0 : Math.round((adjustedTax / 2) * 100) / 100;
          const convIgstTotal = isInterStateConv ? adjustedTax : 0;

          const originalReceived = Number(inv.received_amount) || 0;
          const wasFullyPaid = (Number(inv.grand_total) || 0) > 0
            && (Number(inv.balance_amount) || 0) <= 0
            && (String(inv.payment_method || '').toUpperCase() !== 'PENDING' || originalReceived > 0);
          const newReceivedAmount = wasFullyPaid ? newGrandTotal : Math.min(originalReceived, newGrandTotal);
          const newBalanceAmount = Math.max(0, Math.round((newGrandTotal - newReceivedAmount) * 100) / 100);

          // 1. Create the GST invoice as a NEW row (copy) — the BoS stays intact.
          //    No stock movement: stock was already deducted when the BoS was sold.
          //    Inherits the actual bill date (created_at) from the original Bill of Supply!
          const actualBillDate = inv.created_at || new Date().toISOString();

          db.prepare(`
            INSERT INTO invoices (
              invoice_id, tenant_id, user_id, invoice_number, invoice_type,
              subtotal, tax_total, discount_total, discount_type, discount_value, grand_total,
              payment_method, split_details, received_amount, balance_amount,
              customer_id, customer_name, customer_phone, customer_gstin, customer_state, customer_address,
              biller_staff_id, sales_staff_id, notes, description,
              sync_status,
              converted_from_invoice_id, converted_from_invoice_number,
              cgst_total, sgst_total, igst_total, supply_type,
              points_redeemed, points_redeemed_discount,
              scrap_deduction, scrap_invoice_number, return_deduction, return_invoice_number,
              created_at
            )
            VALUES (?, ?, ?, ?, 'GST', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            newInvoiceId,
            inv.tenant_id,
            inv.user_id,
            newInvoiceNumber,
            newSubtotal,
            adjustedTax,
            newDiscountTotal,
            inv.discount_type || 'FIXED',
            inv.discount_value || 0,
            newGrandTotal,
            inv.payment_method || 'CASH',
            inv.split_details || null,
            newReceivedAmount,
            newBalanceAmount,
            inv.customer_id || null,
            inv.customer_name || null,
            inv.customer_phone || null,
            inv.customer_gstin || null,
            inv.customer_state || null,
            inv.customer_address || null,
            inv.biller_staff_id || null,
            inv.sales_staff_id || null,
            inv.notes || null,
            inv.description || null,
            invoice_id,
            oldInvoiceNumber,
            convCgstTotal,
            convSgstTotal,
            convIgstTotal,
            convSupplyType,
            inv.points_redeemed ?? null,
            pointsDiscount > 0 ? pointsDiscount : null,
            scrapDeduction > 0 ? scrapDeduction : null,
            scrapDeduction > 0 ? (inv.scrap_invoice_number || null) : null,
            returnDeduction > 0 ? returnDeduction : null,
            returnDeduction > 0 ? (inv.return_invoice_number || null) : null,
            actualBillDate
          );

          // 2. Copy the priced items — they remember their original BoS values so
          //    returns refund what the customer actually paid.
          const insertItemStmt = db.prepare(`
            INSERT INTO invoice_items (
              item_id, invoice_id, tenant_id, product_id, name, quantity, unit_price, tax_amount, total, is_service_item,
              source_item_id, bos_unit_price, bos_tax_amount, bos_total, qty_from_paper_stock,
              cgst_rate, sgst_rate, igst_rate,
              cgst_amount, sgst_amount, igst_amount, supply_type,
              hsn_sac_code, uom, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const ci of copyItems) {
            const itemCgst = isInterStateConv ? 0 : Math.round((ci.newTaxAmount / 2) * 100) / 100;
            const itemSgst = isInterStateConv ? 0 : Math.round((ci.newTaxAmount / 2) * 100) / 100;
            const itemIgst = isInterStateConv ? ci.newTaxAmount : 0;
            const itemCgstRate = isInterStateConv ? 0 : Math.round((ci.taxRate / 2) * 100) / 100;
            const itemSgstRate = isInterStateConv ? 0 : Math.round((ci.taxRate / 2) * 100) / 100;
            const itemIgstRate = isInterStateConv ? ci.taxRate : 0;

            insertItemStmt.run(
              ci.item_id,
              newInvoiceId,
              inv.tenant_id,
              ci.product_id,
              ci.name,
              ci.quantity,
              ci.newUnitPrice,
              ci.newTaxAmount,
              ci.newTotal,
              ci.is_service_item,
              ci.source_item_id,
              ci.bosUnitPrice,
              ci.bosTax,
              ci.bosTotal,
              ci.qtyFromPaper,
              itemCgstRate,
              itemSgstRate,
              itemIgstRate,
              itemCgst,
              itemSgst,
              itemIgst,
              convSupplyType,
              ci.hsn_sac_code || null,
              ci.uom || 'PCS',
              actualBillDate
            );
          }

          // 3. Mark the BoS as superseded â€” linked to its GST copy (original Estimate remains untouched)
          db.prepare(`
            UPDATE invoices SET
              converted_to_invoice_id = ?,
              converted_to_invoice_number = ?,
              sync_status = 'PENDING',
              updated_at = CURRENT_TIMESTAMP
            WHERE invoice_id = ?
          `).run(newInvoiceId, newInvoiceNumber, invoice_id);

          return {
            old_number: oldInvoiceNumber,
            new_number: newInvoiceNumber,
            skipped: skippedItems.length > 0 ? skippedItems : undefined
          };
        })();

        results.push({
          invoice_id,
          old_number: invoice.old_number,
          new_number: invoice.new_number,
          success: true,
          ...(invoice.skipped ? { skipped_items: invoice.skipped } : {})
        });
        console.log('[convertBosToGst] Converted', invoice_id, 'â†’', invoice.new_number);
      } catch (err: any) {
        console.error('[convertBosToGst] Failed', invoice_id, err.message);
        results.push({ invoice_id, old_number: invoiceNumber, new_number: '', success: false, error: err?.message || 'Conversion failed' });
      }
    }

    console.log('[convertBosToGst] Completed', results.filter(r => r.success).length, '/', results.length);
    return { success: true, results };
  } catch (error: any) {
    console.error('[convertBosToGst] Fatal error', error.message);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.removeHandler('settings:getAll');

ipcMain.handle('db:getNextServerInvoiceNumber', async (event, { tenant_id, series, start }: { tenant_id: string; series?: string; start?: number }) => {
  try {
    const db = getDb();
    const configKey = series === 'gst_b2b' ? 'gst_b2b_invoice_counter_config' : series === 'gst_b2c' ? 'gst_b2c_invoice_counter_config' : series === 'gst' ? 'gst_invoice_counter_config' : 'invoice_counter_config';
    return await requestServerInvoiceNumber(db, tenant_id || 'global', series, configKey, start);
  } catch (error: any) {
    console.error('[db:getNextServerInvoiceNumber]', error);
    return { success: false, error: 'Operation failed', offline: true };
  }
});

ipcMain.handle('db:getNextInvoiceNumber', (event, { tenant_id, series }: { tenant_id: string; series?: string }) => {
  try {
    const db = getDb();
    const configKey = series === 'gst_b2b' ? 'gst_b2b_invoice_counter_config' : series === 'gst_b2c' ? 'gst_b2c_invoice_counter_config' : series === 'gst' ? 'gst_invoice_counter_config' : 'invoice_counter_config';
    const result = getGuaranteedNextInvoiceNumber(db, tenant_id || 'global', configKey);
    return { success: true, invoiceNumber: result.invoiceNumber, counter: result.counter };
  } catch (error: any) {
    console.error('[db:getNextInvoiceNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:peekNextInvoiceNumber', (event, { tenant_id, series }: { tenant_id: string; series?: string }) => {
  try {
    const db = getDb();
    const configKey = series === 'gst_b2b' ? 'gst_b2b_invoice_counter_config' : series === 'gst_b2c' ? 'gst_b2c_invoice_counter_config' : series === 'gst' ? 'gst_invoice_counter_config' : 'invoice_counter_config';
    const result = peekGuaranteedNextInvoiceNumber(db, tenant_id || 'global', configKey);
    return { success: true, invoiceNumber: result.invoiceNumber, counter: result.counter, prefix: result.prefix };
  } catch (error: any) {
    console.error('[db:peekNextInvoiceNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
});


ipcMain.handle('db:getNextQuotationNumber', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const terminalCode = getOrInitTerminalCode(db);
    const configKey = 'quotation_counter';

    const result = db.transaction(() => {
      const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', configKey);
      let counter = 1;
      let config: { prefix: string; counter: number } = { prefix: `${terminalCode}-QTN-`, counter: 1 };

      if (row) {
        try {
          const parsed = JSON.parse(row.value);
          counter = (typeof parsed.counter === 'number' ? parsed.counter : 1);
          let rawPrefix = parsed.prefix && /[A-Z0-9]/i.test(parsed.prefix) ? parsed.prefix : `${terminalCode}-QTN-`;
          if (rawPrefix.includes('-QTN-')) {
          // Respect user-set prefix -- no forced override
          }
          config = { prefix: rawPrefix, counter };
        } catch {
          counter = 1;
        }
      }

      const prefix = config.prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || `${terminalCode}-QTN-`;
      const quotationNumber = `${prefix}${String(counter).padStart(3, '0')}`;

      config.counter = counter + 1;
      db.prepare(`
        INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
        VALUES ('global', ?, ?, 'LOCAL', CURRENT_TIMESTAMP)
        ON CONFLICT(tenant_id, key) DO UPDATE SET
          value = EXCLUDED.value,
          sync_status = 'LOCAL',
          updated_at = CURRENT_TIMESTAMP
      `).run(configKey, JSON.stringify(config));

      return { success: true, quotationNumber, counter };
    })();

    return result;
  } catch (error: any) {
    console.error('[db:getNextQuotationNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:peekNextQuotationNumber', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const terminalCode = getOrInitTerminalCode(db);
    const defaultPrefix = `${terminalCode}-QTN-`;

    const row: any = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get('global', 'quotation_counter');
    if (row) {
      try {
        const config = JSON.parse(row.value);
        let rawPrefix = config.prefix && /[A-Z0-9]/i.test(config.prefix) ? config.prefix : defaultPrefix;
        if (rawPrefix.includes('-QTN-')) {
          // Respect user-set prefix -- no forced override
        }
        const prefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
        return { success: true, quotationNumber: `${prefix}${String(config.counter || 1).padStart(3, '0')}` };
      } catch {
        // Invalid JSON in stored value â€” fall through to default
      }
    }
    return { success: true, quotationNumber: `${terminalCode}-QTN-001` };
  } catch (error: any) {
    console.error('[db:peekNextQuotationNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:saveQuotation', safeHandler((event, q) => {
  try {
    const db = getDb();
    const result = db.transaction(() => {
      const qCols = db.prepare('PRAGMA table_info(quotations)').all().map((c: any) => c.name);
      if (qCols.includes('customer_gstin')) {
        db.prepare(`
          INSERT INTO quotations (
            quotation_id, tenant_id, quotation_number, customer_name, customer_phone, customer_address,
            customer_gstin, customer_state, is_gst, discount_total, round_off, biller_name,
            terms_conditions, subtotal, tax_total, grand_total, status, sync_status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'PENDING')
          ON CONFLICT(quotation_id) DO UPDATE SET
            quotation_number = excluded.quotation_number,
            customer_name = excluded.customer_name,
            customer_phone = excluded.customer_phone,
            customer_address = excluded.customer_address,
            customer_gstin = excluded.customer_gstin,
            customer_state = excluded.customer_state,
            is_gst = excluded.is_gst,
            discount_total = excluded.discount_total,
            round_off = excluded.round_off,
            biller_name = excluded.biller_name,
            terms_conditions = excluded.terms_conditions,
            subtotal = excluded.subtotal,
            tax_total = excluded.tax_total,
            grand_total = excluded.grand_total,
            status = 'ACTIVE',
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
        `).run(
          q.quotation_id, q.tenant_id, q.quotation_number, q.customer_name || null, q.customer_phone || null, q.customer_address || null,
          q.customer_gstin || null, q.customer_state || null, q.is_gst ?? (Number(q.tax_total) > 0 ? 1 : 0),
          Number(q.discount_total) || 0, Number(q.round_off) || 0, q.biller_name || null,
          q.terms_conditions || null, q.subtotal, q.tax_total, q.grand_total
        );
      } else {
        db.prepare(`
          INSERT INTO quotations (quotation_id, tenant_id, quotation_number, customer_name, customer_phone, customer_address, terms_conditions, subtotal, tax_total, grand_total, status, sync_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'PENDING')
          ON CONFLICT(quotation_id) DO UPDATE SET
            quotation_number = excluded.quotation_number,
            customer_name = excluded.customer_name,
            customer_phone = excluded.customer_phone,
            customer_address = excluded.customer_address,
            terms_conditions = excluded.terms_conditions,
            subtotal = excluded.subtotal,
            tax_total = excluded.tax_total,
            grand_total = excluded.grand_total,
            status = 'ACTIVE',
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
        `).run(q.quotation_id, q.tenant_id, q.quotation_number, q.customer_name || null, q.customer_phone || null, q.customer_address || null, q.terms_conditions || null, q.subtotal, q.tax_total, q.grand_total);
      }

      // Delete old items before inserting new ones to prevent duplicate rows
      db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(q.quotation_id);

      const qiCols = db.prepare('PRAGMA table_info(quotation_items)').all().map((c: any) => c.name);
      if (qiCols.includes('hsn_code')) {
        const stmt = db.prepare(`
          INSERT INTO quotation_items (
            item_id, quotation_id, tenant_id, product_id, name, quantity, weight, rate, amount,
            hsn_code, uom, tax_rate_percent, discount_amount, discount_percent, taxable_amount,
            cgst_amount, sgst_amount, igst_amount, sync_status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `);
        for (const item of q.items) {
          stmt.run(
            item.item_id, q.quotation_id, q.tenant_id, item.product_id || null, item.name, item.quantity, item.weight || null, item.rate, item.amount,
            item.hsn_code || null, item.uom || null, Number(item.tax_rate_percent) || 0,
            Number(item.discount_amount) || 0, Number(item.discount_percent) || 0,
            Number(item.taxable_amount) || item.amount,
            Number(item.cgst_amount) || 0, Number(item.sgst_amount) || 0, Number(item.igst_amount) || 0
          );
        }
      } else {
        const stmt = db.prepare(`
          INSERT INTO quotation_items (item_id, quotation_id, tenant_id, product_id, name, quantity, weight, rate, amount, sync_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `);
        for (const item of q.items) {
          stmt.run(item.item_id, q.quotation_id, q.tenant_id, item.product_id || null, item.name, item.quantity, item.weight || null, item.rate, item.amount);
        }
      }
      return { success: true };
    })();
    triggerUrgentQuotationSync().catch(() => {});
    return result;
  } catch (error: any) {
    console.error('[db:saveQuotation]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:getQuotations', (event, { tenant_id, search }: { tenant_id: string; search?: string }) => {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';
    let query = "SELECT * FROM quotations WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = '' OR tenant_id IS NULL) AND (status IS NULL OR status != 'DELETED')";
    const params: any[] = [tid];
    if (search) {
      query += ' AND (customer_name LIKE ? OR customer_phone LIKE ? OR quotation_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    query += ' ORDER BY created_at DESC LIMIT 200';
    return db.prepare(query).all(...params);
  } catch (error: any) {
    console.error('[db:getQuotations]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getQuotationItems', async (event, quotationId: string) => {
  try {
    const db = getDb();
    const qiCols = db.prepare('PRAGMA table_info(quotation_items)').all().map((c: any) => c.name);
    let selectFields = 'qi.*';
    if (qiCols.includes('hsn_code')) {
      selectFields = "qi.*, COALESCE(NULLIF(TRIM(qi.hsn_code), ''), p.hsn_sac_code, '') AS hsn_code, COALESCE(NULLIF(TRIM(qi.uom), ''), p.uom, 'PCS') AS uom, COALESCE(NULLIF(qi.tax_rate_percent, 0), p.tax_rate_percent, qi.tax_rate_percent, 0) AS tax_rate_percent, COALESCE(p.is_gst_applicable, 1) AS is_gst_applicable";
    } else {
      selectFields = "qi.*, COALESCE(p.hsn_sac_code, '') AS hsn_code, COALESCE(p.uom, 'PCS') AS uom, COALESCE(p.tax_rate_percent, 0) AS tax_rate_percent, COALESCE(p.is_gst_applicable, 1) AS is_gst_applicable";
    }
    const query = `
      SELECT ${selectFields}
      FROM quotation_items qi
      LEFT JOIN products p ON qi.product_id = p.product_id
      WHERE qi.quotation_id = ?
      ORDER BY qi.created_at ASC
    `;
    let items = db.prepare(query).all(quotationId);
    if ((!items || items.length === 0) && quotationId) {
      const q = db.prepare('SELECT * FROM quotations WHERE quotation_id = ?').get(quotationId) as any;
      if (q && (Number(q.subtotal) > 0 || Number(q.grand_total) > 0)) {
        console.log(`[db:getQuotationItems] Repairing missing items for quotation ${quotationId}...`);
        db.prepare("UPDATE quotations SET sync_status = 'PENDING' WHERE quotation_id = ?").run(quotationId);
        triggerUrgentQuotationSync().catch(() => {});
        await new Promise(r => setTimeout(r, 300));
        items = db.prepare(query).all(quotationId);
      }
    }
    if (Array.isArray(items) && items.length > 1) {
      const timestamps: number[] = items.map((i: any) => i.created_at ? new Date(i.created_at).getTime() : 0).filter(Boolean);
      const uniqueTs = Array.from(new Set<number>(timestamps));
      if (uniqueTs.length > 1) {
        const latestTs = Math.max(...uniqueTs);
        items = items.filter((i: any) => (i.created_at ? new Date(i.created_at).getTime() : 0) === latestTs);
      }
    }
    return items;
  } catch (error: any) {
    console.error('[db:getQuotationItems]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:deleteQuotation', (event, quotationId: string) => {
  try {
    const db = getDb();
    db.transaction(() => {
      db.prepare("UPDATE quotations SET status = 'DELETED', sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE quotation_id = ?").run(quotationId);
      db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(quotationId);
    })();
    triggerUrgentQuotationSync().catch(() => {});
    return { success: true };
  } catch (error: any) {
    console.error('[db:deleteQuotation]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:updateQuotation', (event, q) => {
  try {
    const db = getDb();
    const result = db.transaction(() => {
      const qCols = db.prepare('PRAGMA table_info(quotations)').all().map((c: any) => c.name);
      if (qCols.includes('customer_gstin')) {
        db.prepare(`
          UPDATE quotations SET 
            customer_name = ?, customer_phone = ?, customer_address = ?,
            customer_gstin = ?, customer_state = ?, is_gst = ?, discount_total = ?, round_off = ?, biller_name = ?,
            terms_conditions = ?, subtotal = ?, tax_total = ?, grand_total = ?,
            sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE quotation_id = ?
        `).run(
          q.customer_name || null, q.customer_phone || null, q.customer_address || null,
          q.customer_gstin || null, q.customer_state || null, q.is_gst ?? (Number(q.tax_total) > 0 ? 1 : 0),
          Number(q.discount_total) || 0, Number(q.round_off) || 0, q.biller_name || null,
          q.terms_conditions || null, q.subtotal, q.tax_total, q.grand_total, q.quotation_id
        );
      } else {
        db.prepare(`
          UPDATE quotations SET 
            customer_name = ?, customer_phone = ?, customer_address = ?, terms_conditions = ?,
            subtotal = ?, tax_total = ?, grand_total = ?,
            sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE quotation_id = ?
        `).run(q.customer_name || null, q.customer_phone || null, q.customer_address || null, q.terms_conditions || null, q.subtotal, q.tax_total, q.grand_total, q.quotation_id);
      }

      // Delete old items
      db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(q.quotation_id);

      // Insert new items
      const qiCols = db.prepare('PRAGMA table_info(quotation_items)').all().map((c: any) => c.name);
      if (qiCols.includes('hsn_code')) {
        const stmt = db.prepare(`
          INSERT INTO quotation_items (
            item_id, quotation_id, tenant_id, product_id, name, quantity, weight, rate, amount,
            hsn_code, uom, tax_rate_percent, discount_amount, discount_percent, taxable_amount,
            cgst_amount, sgst_amount, igst_amount, sync_status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `);
        for (const item of q.items) {
          stmt.run(
            item.item_id, q.quotation_id, q.tenant_id, item.product_id || null, item.name, item.quantity, item.weight || null, item.rate, item.amount,
            item.hsn_code || null, item.uom || null, Number(item.tax_rate_percent) || 0,
            Number(item.discount_amount) || 0, Number(item.discount_percent) || 0,
            Number(item.taxable_amount) || item.amount,
            Number(item.cgst_amount) || 0, Number(item.sgst_amount) || 0, Number(item.igst_amount) || 0
          );
        }
      } else {
        const stmt = db.prepare(`
          INSERT INTO quotation_items (item_id, quotation_id, tenant_id, product_id, name, quantity, weight, rate, amount, sync_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `);
        for (const item of q.items) {
          stmt.run(item.item_id, q.quotation_id, q.tenant_id, item.product_id || null, item.name, item.quantity, item.weight || null, item.rate, item.amount);
        }
      }
      return { success: true };
    })();
    triggerUrgentQuotationSync().catch(() => {});
    return result;
  } catch (error: any) {
    console.error('[db:updateQuotation]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:updateQuotationStatus', (event, { quotation_id, status, converted_to_invoice, invoice_id }: { quotation_id: string; status?: string; converted_to_invoice?: number; invoice_id?: string }) => {
  try {
    const db = getDb();
    const updates: string[] = ["sync_status = 'PENDING'", "updated_at = CURRENT_TIMESTAMP"];
    const params: any[] = [];
    if (status) { updates.push('status = ?'); params.push(status); }
    if (converted_to_invoice !== undefined) { updates.push('converted_to_invoice = ?'); params.push(converted_to_invoice); }
    if (invoice_id) { updates.push('invoice_id = ?'); params.push(invoice_id); }
    params.push(quotation_id);
    db.prepare(`UPDATE quotations SET ${updates.join(', ')} WHERE quotation_id = ?`).run(...params);
    triggerUrgentQuotationSync().catch(() => {});
    return { success: true };
  } catch (error: any) {
    console.error('[db:updateQuotationStatus]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// â”€â”€ Warranties IPC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('db:saveWarranty', safeHandler((event, w) => {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO warranties (warranty_id, tenant_id, invoice_id, invoice_item_id, bill_number, brand, customer_name, customer_phone, product_name, product_details, purchase_date, warranty_period_days, expiry_date, notes, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(w.warranty_id, w.tenant_id, w.invoice_id || null, w.invoice_item_id || null, w.bill_number || null, w.brand || null, w.customer_name, w.customer_phone || null, w.product_name, w.product_details || null, w.purchase_date, w.warranty_period_days, w.expiry_date, w.notes || null);
    triggerUrgentWarrantySync().catch(() => {});
    return { success: true };
  } catch (error: any) {
    console.error('[db:saveWarranty]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:getWarranties', (event, { tenant_id, search }: { tenant_id: string; search?: string }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    let query = 'SELECT * FROM warranties WHERE tenant_id = ?';
    const params: any[] = [tenant_id];
    if (search) {
      query += ' AND (customer_name LIKE ? OR customer_phone LIKE ? OR product_name LIKE ? OR brand LIKE ? OR bill_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    query += ' ORDER BY created_at DESC LIMIT 200';
    return db.prepare(query).all(...params);
  } catch (error: any) {
    console.error('[db:getWarranties]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:deleteWarranty', (event, warrantyId: string) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM warranties WHERE warranty_id = ?').run(warrantyId);
    triggerUrgentWarrantySync().catch(() => {});
    return { success: true };
  } catch (error: any) {
    console.error('[db:deleteWarranty]', error);
    return { success: false, error: 'Operation failed' };
  }
});


}
