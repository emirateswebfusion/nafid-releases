import { resolveBillPolicy, type BillPolicySettings } from '../utils/billPolicy.js';
import { readLoyaltyConfig } from './loyaltyService.js';
import type { CheckoutPayload, CheckoutResult, CustomerCreditRow, InvoiceItem, InvoiceRow, ProductRow, SettingRow } from './typesB.js';
import { getDb } from '../db/localDb.js';
import { upsertCustomerRecord } from '../db/customerIdentity.js';
import { getCashAmountFromInvoice, adjustPaymentSourcesForInvoice, adjustCashDrawerForInvoice, getOpenCashDrawer } from './cashDrawerService.js';
import { syncInvoiceCreditLedger, resetBackfillThrottle } from './partyLedgerService.js';
import { checkCustomerOverdueSync } from './customerCreditService.js';
import { getGuaranteedNextInvoiceNumber } from './invoiceNumberService.js';
import { localTimestamp, localDate } from './storeTime.js';
import crypto from 'node:crypto';
import * as invoicesSql from '../db/statements/invoices.js';
/** Checkout use-case: creates an invoice with items, stock, payments, cash drawer and credit ledger in one transaction. Called by electron/ipc handlers via invoicesService. */

/** Short-lived dedupe cache shared by checkout and updateInvoice (4 s window). */
export const recentCheckoutsCache = new Map<string, { timestamp: number; result: CheckoutResult }>();

/** IPC `db:checkout` */
export function checkout(payload: CheckoutPayload) {
  const { items, scrap_items, ...invoice } = payload;
  const db = getDb();
  const tenantId = invoice.tenant_id || 'global';
  const policySettings: BillPolicySettings = {};
  for (const key of ['exclude_b2b_from_revenue', 'exclude_b2c_from_revenue', 'filing_only_mode'] as const) {
    const row = invoicesSql.findSettingsByKey(db).get(tenantId, key) as SettingRow | undefined;
    try { if (row?.value) policySettings[key] = JSON.parse(row.value); } catch { /* Missing/invalid settings retain defaults. */ }
  }
  const policy = resolveBillPolicy(invoice.invoice_type, invoice.customer_gstin, invoice.bill_purpose === 'FILING_ONLY', policySettings);
  Object.assign(invoice, policy);

  // Deduplication guard: block duplicate checkout calls within a 4-second window
  const itemsSig = (items || []).map((i: InvoiceItem) => `${i.product_id}:${i.quantity}:${i.unit_price}`).sort().join('|');
  // The customer and payment are part of the key: the same goods billed to another customer (or paid differently)
  // within 4 s is a different bill, not a double click, and must not be dropped.
  const customerSig = `${(invoice.customer_name || '').trim().toLowerCase()}|${(invoice.customer_phone || '').trim()}`;
  const paymentSig = `${invoice.payment_method || ''}|${invoice.received_amount ?? ''}|${typeof invoice.split_details === 'string' ? invoice.split_details : JSON.stringify(invoice.split_details ?? null)}`;
  const cacheKey = `${policy.bill_purpose}:${policy.counts_in_revenue}:${policy.stock_applied}:${tenantId}:${invoice.grand_total}:${itemsSig}:${customerSig}:${paymentSig}`;
  const now = Date.now();
  const cached = recentCheckoutsCache.get(cacheKey);
  if (cached && (now - cached.timestamp < 4000)) {
    console.warn(`[db:checkout] Duplicate checkout request blocked within 4s window (Key: ${cacheKey}). Returning previous invoice ${cached.result.invoice_number}`);
    return cached.result;
  }

  // Idempotency guard: if invoice_id already exists in database, return existing result
  if (invoice.invoice_id) {
    const existingById: InvoiceRow = invoicesSql.findInvoicesByInvoiceId(db).get(invoice.invoice_id) as InvoiceRow;
    if (existingById) {
      console.warn(`[db:checkout] Invoice ID ${invoice.invoice_id} already exists in database. Returning existing invoice ${existingById.invoice_number}`);
      const res = { success: true, invoice_id: existingById.invoice_id, invoice_number: existingById.invoice_number };
      recentCheckoutsCache.set(cacheKey, { timestamp: now, result: res });
      return res;
    }
  }

  // Collision guard: if invoice_number is missing or already taken by another invoice, generate a guaranteed unique number
  let finalInvoiceNumber = invoice.invoice_number;
  const tripleSeriesRow: SettingRow = invoicesSql.findSettingsByKey(db).get('global', 'three_invoice_series') as SettingRow;
  let isTripleSeries = false;
  if (tripleSeriesRow && tripleSeriesRow.value) {
    try { isTripleSeries = Boolean(JSON.parse(tripleSeriesRow.value).enabled); } catch { /* ignore */ }
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
    const existingByNum: InvoiceRow = invoicesSql.findOneInvoiceByInvoiceNumber(db).get(tenantId, finalInvoiceNumber) as InvoiceRow;
    if (existingByNum) {
      console.warn(`[db:checkout] Invoice number collision detected for "${finalInvoiceNumber}". Resolving with new guaranteed unique number.`);
      finalInvoiceNumber = getGuaranteedNextInvoiceNumber(db, tenantId, configKey).invoiceNumber;
    }
  }

  let checkoutCreatedAt = '';
  const transaction = db.transaction(() => {
    // Credit Limit & Credit Period enforcement guard
    const paymentMethodUpper = (invoice.payment_method || '').toUpperCase();
    let splitObj: Record<string, unknown> | null = null;
    if (invoice.split_details && typeof invoice.split_details === 'string') {
      try { splitObj = JSON.parse(invoice.split_details); } catch { /* ignore */ }
    } else if (invoice.split_details && typeof invoice.split_details === 'object') {
      splitObj = invoice.split_details;
    }
    const isCreditBilling = paymentMethodUpper === 'CREDIT' || (paymentMethodUpper === 'SPLIT' && Number(splitObj?.credit) > 0);

    if (isCreditBilling) {
      const custPhone = (invoice.customer_phone || '').trim();
      const custName = (invoice.customer_name || '').trim();
      let matchedParty: CustomerCreditRow | null | undefined = null;
      if (custPhone) {
        const cleanDigits = custPhone.replace(/\D/g, '');
        if (cleanDigits.length >= 7) {
          const last10 = cleanDigits.slice(-10);
          matchedParty = invoicesSql.findOnePartyByPhone(db).get(tenantId, custPhone, `%${last10}`) as CustomerCreditRow | null | undefined;
        } else {
          matchedParty = invoicesSql.findPartiesByPhone(db).get(tenantId, custPhone) as CustomerCreditRow | null | undefined;
        }
      }
      if (!matchedParty && custName) {
        matchedParty = invoicesSql.findPartiesByName(db).get(tenantId, custName) as CustomerCreditRow | null | undefined;
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
    let custRow: CustomerCreditRow | null | undefined = null;
    if (customerId) {
      custRow = invoicesSql.findCustomersByCustomerId(db).get(customerId) as CustomerCreditRow | null | undefined;
    }

    const previousPointsBal = Number(custRow?.current_points_balance) || 0;
    const config = readLoyaltyConfig(db, tenantId);
    const pm = (invoice.payment_method || 'PENDING').toUpperCase();
    const ptsRedeemed = Number(invoice.points_redeemed) || 0;
    const suppliedDiscount = Number(invoice.points_redeemed_discount) || 0;
    if (!Number.isSafeInteger(ptsRedeemed) || ptsRedeemed < 0 || ptsRedeemed > Math.max(0, previousPointsBal)) {
      throw new Error('Points balance changed or redemption is invalid; refresh the bill');
    }
    if ((ptsRedeemed || suppliedDiscount) && (!config.enabled || !customerId || pm === 'HOLD' || policy.counts_in_revenue !== 1)) {
      throw new Error('Loyalty redemption is unavailable; refresh the bill');
    }
    const ptsRedeemedDiscount = Math.round(ptsRedeemed * Math.max(0.01, Number(config.redemptionRate) || 1) * 100) / 100;
    if (Math.abs(suppliedDiscount - ptsRedeemedDiscount) > 0.001) {
      throw new Error('Points discount changed; refresh the bill');
    }
    const shouldEarn = config.enabled && customerId && pm !== 'HOLD' && (pm !== 'PENDING' || config.awardPointsOnPending)
      && policy.counts_in_revenue === 1;
    const ptsEarned = shouldEarn ? Math.floor(Math.max(0, Number(invoice.grand_total) || 0) / Math.max(1, Number(config.earningRate) || 100)) : 0;

    const remainingPointsBal = previousPointsBal - ptsRedeemed + ptsEarned;

    const invStmt = invoicesSql.insertInvoice(db);
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
      nowTimestamp,
      policy.counts_in_revenue, policy.bill_purpose, policy.stock_applied
    );

    // Record Loyalty Transactions & Update Customer Points Balance
    if (customerId) {
      let runningPoints = previousPointsBal;
      if (ptsRedeemed > 0) {
        const afterRedeem = Math.max(0, runningPoints - ptsRedeemed);
        const rTxId = crypto.randomUUID();
        invoicesSql.insertLoyaltyTransaction(db).run(
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
        invoicesSql.insertLoyaltyTransaction2(db).run(
          eTxId, tenantId, customerId, invoice.invoice_id,
          ptsEarned, runningPoints, afterEarn,
          finalInvoiceNumber,
          `Earned ${ptsEarned} points on invoice ${finalInvoiceNumber}`,
          invoice.user_id || 'system',
          nowTimestamp, nowTimestamp
        );
        runningPoints = afterEarn;
      }

      invoicesSql.updateCustomerByCustomerId(db).run(
        ptsEarned,
        ptsRedeemed,
        runningPoints,
        nowTimestamp,
        customerId
      );
    }

    // 2. Insert items and update stock
    const itemStmt = invoicesSql.insertInvoiceItem(db);
    const stockStmt = invoicesSql.updateProductCurrentStock(db);
    const getDaStmt = invoicesSql.findProductsByProductId(db);
    const updDaStmt = invoicesSql.updateProductDomainAttributes(db);

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
      if (policy.stock_applied === 1 && !item.isServiceItem) {
        if (isCombo && item.combo_items && Array.isArray(item.combo_items)) {
          for (const ci of item.combo_items) {
            const qtyToDeduct = (Number(ci.quantity) || 1) * (Number(item.quantity) || 1);
            stockStmt.run(qtyToDeduct, ci.product_id);
          }
        } else {
          stockStmt.run(item.quantity, item.product_id);
        }

        if (item.pieces_sold) {
          const row = getDaStmt.get(item.product_id) as ProductRow;
          if (row?.domain_attributes) {
            try {
              const da = JSON.parse(row.domain_attributes);
              if (da.pcs !== undefined || da.pcs_stock !== undefined) {
                const nextPcs = Math.max(0, (Number(da.pcs_stock ?? da.pcs) || 0) - item.pieces_sold);
                da.pcs_stock = nextPcs;
                da.pcs = nextPcs;
                updDaStmt.run(JSON.stringify(da), item.product_id);
              }
            } catch { /* ignore */ }
          }
        }
      }
    }

    // 3. Handle scrap credit deduction settlement & single-use validation
    if (invoice.scrap_invoice_number && Number(invoice.scrap_deduction) > 0) {
      const existingScrapTx = invoicesSql.findOneScrapTransactionByScrapInvoiceNumber(db).get(invoice.tenant_id, invoice.scrap_invoice_number) as { payment_status: string };

      if (existingScrapTx && existingScrapTx.payment_status === 'SETTLED') {
        throw new Error(`Scrap credit ${invoice.scrap_invoice_number} has already been redeemed.`);
      }

      invoicesSql.updateScrapTransactionPaymentStatus(db).run(invoice.tenant_id, invoice.scrap_invoice_number);
    }

    // 4. Handle scrap items — create scrap transactions and update scrap stock
    if (scrap_items && scrap_items.length > 0) {
      const scrapTxStmt = invoicesSql.insertScrapTransaction(db);
      const scrapStockStmt = invoicesSql.updateScrapCategoryCurrentStock(db);

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
      const ptsDisc = Number((invoice as InvoiceRow).points_redeemed_discount) || 0;
      const preDeductionTotal = Math.max(0, sub + tax - disc - ptsDisc);
      const netRefund = totalDeductions > preDeductionTotal ? totalDeductions - preDeductionTotal : 0;

      const pm = (invoice.payment_method || '').toUpperCase();
      if (netRefund > 0 && (pm === 'CASH' || pm === 'SPLIT')) {
        const todayDate = localDate();
        const drawer = getOpenCashDrawer(db, invoice.tenant_id || 'global', todayDate);
        if (drawer) {
          const txnId = crypto.randomUUID();
          invoicesSql.insertCashTransaction(db).run(
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
          invoicesSql.updateCashDrawerByDrawerId(db).run(newCashOut, newCurrentCash, newExpectedClosing, drawer.drawer_id);
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
  } catch (error) {
    console.error('[db:checkout]', error);
    return { success: false, error: 'Operation failed' };
  }
}
