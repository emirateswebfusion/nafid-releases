import type { CashDrawerRow, CashTransactionRow, CustomerCreditRow, InvoiceItem, LedgerRow, ProductRow, PurchaseBillRow, ServiceDb, SettingRow } from './typesB.js';
import { getDb } from '../db/localDb.js';
import { getOrInitTerminalCode } from './invoiceNumberService.js';
import crypto from 'node:crypto';
import { localTimestamp, localDate } from './storeTime.js';
import { getOpenCashDrawer } from './cashDrawerService.js';
import { recalcPartyBalances } from './partyLedgerService.js';
import * as purchasesSql from '../db/statements/purchases.js';
/** purchases use-cases for the main process (called by electron/ipc handlers). */

function getNextOrPeekPurchaseBillNumber(
  db: ServiceDb,
  tenantId: string,
  billType?: string,
  advance: boolean = false
): { success: boolean; billNumber: string; counter: number } {
  const terminalCode = getOrInitTerminalCode(db);
  const defaultPrefix = `${terminalCode}-PUR-`;
  const configKey = 'purchase_bill_counter';
  const effectiveTenant = tenantId || 'global';

  // 1. Fetch configured prefix/counter from tenant or global settings
  const row: SettingRow = purchasesSql.findSettingsByKey(db).get(effectiveTenant, configKey) as SettingRow
    || purchasesSql.findSettingsByKey(db).get('global', configKey) as SettingRow;

  let prefix = defaultPrefix;
  let configuredCounter: number | null = null;

  if (row && row.value) {
    try {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if (typeof parsed.counter === 'number' && parsed.counter > 0) {
        configuredCounter = parsed.counter;
      }
      if (parsed.prefix && typeof parsed.prefix === 'string' && parsed.prefix.trim().length > 0) {
        const clean = parsed.prefix.trim().replace(/[^A-Z0-9_-]/gi, '').toUpperCase();
        prefix = clean.endsWith('-') ? clean : `${clean}-`;
      }
    } catch { /* ignore */ }
  }

  // 2. If no explicit prefix was configured in settings, inspect existing purchase bills for this tenant
  const existingBills: PurchaseBillRow[] = purchasesSql.findPurchaseBills(db).all(effectiveTenant) as PurchaseBillRow[];

  if ((!row || prefix === defaultPrefix) && existingBills.length > 0) {
    for (const b of existingBills) {
      const match = String(b.bill_number || '').match(/^([A-Z0-9]+-PUR-)/i);
      if (match) {
        prefix = match[1].toUpperCase();
        break;
      }
    }
  }

  const isEstimate = (billType || '').toUpperCase() === 'ESTIMATE';

  // 3. Scan existing bills for the maximum used numeric counter in this series
  let maxUsed = 0;
  for (const b of existingBills) {
    const numStr = String(b.bill_number || '');
    const isEstBill = numStr.endsWith('-EST') || (b.bill_type || '').toUpperCase() === 'ESTIMATE';

    // GST series matches non-EST bills; Estimate series matches EST bills
    if (isEstimate === isEstBill) {
      const match = numStr.match(/(\d+)(?:-EST)?$/i);
      if (match) {
        const parsedNum = parseInt(match[1], 10);
        if (!isNaN(parsedNum) && parsedNum > maxUsed) {
          maxUsed = parsedNum;
        }
      }
    }
  }

  // 4. Determine starting counter:
  // Counter is strictly maxUsed + 1 if bills exist, else fallback to configuredCounter or 1.
  let counter: number;
  if (maxUsed > 0) {
    counter = maxUsed + 1;
  } else {
    counter = configuredCounter && configuredCounter > 0 ? configuredCounter : 1;
  }

  // 5. Duplicate check against existing bills
  const checkStmt = purchasesSql.findOnePurchaseBillByBillNumber(db);

  let candidate = isEstimate
    ? `${prefix}${String(counter).padStart(3, '0')}-EST`
    : `${prefix}${String(counter).padStart(3, '0')}`;

  while (checkStmt.get(effectiveTenant, candidate)) {
    counter++;
    candidate = isEstimate
      ? `${prefix}${String(counter).padStart(3, '0')}-EST`
      : `${prefix}${String(counter).padStart(3, '0')}`;
  }

  // 6. If advancing, persist next counter value
  if (advance) {
    const nextConfig = { prefix, counter: counter + 1 };
    purchasesSql.upsertSetting(db).run(effectiveTenant, configKey, JSON.stringify(nextConfig));

    if (effectiveTenant !== 'global') {
      purchasesSql.upsertSetting2(db).run(configKey, JSON.stringify(nextConfig));
    }
  }

  return { success: true, billNumber: candidate, counter };
}

/** IPC `db:getProductSuppliers` */
export function getProductSuppliers(tenantId: string) {
  try {
    const db = getDb();
    if (!tenantId) return {};
    const rows = purchasesSql.findPurchaseBillItems(db).all(tenantId);
    const map: Record<string, string[]> = {};
    for (const row of rows as { product_id: string; supplier_name: string }[]) {
      if (!map[row.product_id]) map[row.product_id] = [];
      if (!map[row.product_id].includes(row.supplier_name)) {
        map[row.product_id].push(row.supplier_name);
      }
    }
    return map;
  } catch (error) {
    console.error('[db:getProductSuppliers]', error);
    return {};
  }
}

/** IPC `db:peekNextPurchaseBillNumber` */
export function peekNextPurchaseBillNumber(payload: { tenant_id: string; bill_type?: string }) {
  try {
    const db = getDb();
    return getNextOrPeekPurchaseBillNumber(db, payload?.tenant_id, payload?.bill_type, false);
  } catch (error) {
    console.error('[db:peekNextPurchaseBillNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:getNextPurchaseBillNumber` */
export function getNextPurchaseBillNumber(payload: { tenant_id: string; bill_type?: string }) {
  try {
    const db = getDb();
    const result = db.transaction(() => {
      return getNextOrPeekPurchaseBillNumber(db, payload?.tenant_id, payload?.bill_type, true);
    })();
    return result;
  } catch (error) {
    console.error('[db:getNextPurchaseBillNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:addPurchaseBill` */
export function addPurchaseBill(payload: {
  purchase_bill_id: string;
  tenant_id: string;
  bill_number: string;
  supplier_id?: string;
  supplier_name: string;
  bill_date?: string;
  invoice_number?: string;
  notes?: string;
  total_amount: number;
  bill_type?: string;
  payment_type?: string;
    items: Array<{
      item_id: string;
      product_id: string;
      name: string;
      quantity: number;
      purchase_price: number;
      total_amount: number;
      selling_price?: number | null;
      offer_price?: number | null;
      is_gst_applicable?: number;
      tax_rate_percent?: number;
      hsn_sac_code?: string;
      skip_stock_update?: number;
    }>;
  }) {
    try {
      const db = getDb();
      const billType = payload.bill_type || 'GST';
      const paymentType = payload.payment_type || 'CASH';
      const result = db.transaction(() => {
        const { items, ...bill } = payload;
        purchasesSql.insertPurchaseBill(db).run(bill.purchase_bill_id, bill.tenant_id, bill.bill_number, bill.supplier_id || null, bill.supplier_name, bill.bill_date || null, bill.invoice_number || null, bill.notes || null, bill.total_amount, billType, paymentType);

        const stmt = purchasesSql.insertPurchaseBillItem(db);
        // Two stock statements: ESTIMATE bills update stock+price; GST bills update price only (tax documents, not inventory)
        const updateStock = purchasesSql.updateProductCurrentStockAndPurchasePrice(db);
        const updatePrice = purchasesSql.updateProductBasePrice(db);
        const updateOfferPrice = purchasesSql.updateProductOfferPrice(db);
        for (const item of items) {
          const isGst = billType === 'GST' ? (item.is_gst_applicable ?? 1) : 0;
          const hasEstimate = billType === 'GST' ? purchasesSql.findOnePurchaseBillItemByBillTypeAndProductId(db).get(item.product_id, bill.tenant_id) : null;
          const skipStock = (billType === 'GST' && (item.skip_stock_update === 1 || Boolean(hasEstimate))) ? 1 : (item.skip_stock_update ?? 0);
          stmt.run(item.item_id, bill.purchase_bill_id, bill.tenant_id, item.product_id, item.name, item.quantity, item.purchase_price, item.total_amount, item.selling_price != null ? item.selling_price : 0, item.offer_price != null ? item.offer_price : 0, isGst, item.tax_rate_percent ?? 0, item.hsn_sac_code || null, skipStock);
          const actualPurchasePrice = billType === 'GST' && isGst === 1
            ? item.purchase_price * (1 + (item.tax_rate_percent ?? 0) / 100)
            : item.purchase_price;
          // Update stock for Estimates, and for GST bills only if they are not dummy / paper (not shared/skipped)
          if (billType === 'ESTIMATE' || (billType === 'GST' && skipStock === 0)) {
            updateStock.run(item.quantity, actualPurchasePrice, item.product_id, bill.tenant_id);
            if (item.selling_price != null) {
              updatePrice.run(item.selling_price, item.product_id, bill.tenant_id);
            }
            if (item.offer_price != null) {
              updateOfferPrice.run(item.offer_price, item.product_id, bill.tenant_id);
            }
          } else {
            // Paper GST bill: update domain_attributes with paper_purchase_price and paper_mrp
            const prodRow = purchasesSql.findProductsByProductId(db).get(item.product_id) as ProductRow;
            if (prodRow) {
              let da: Record<string, unknown> = {};
              try { da = JSON.parse(prodRow.domain_attributes || '{}'); } catch { /* ignore */ }
              da.gst_purchase_price = item.purchase_price;
              da.paper_purchase_price = item.purchase_price;
              if (item.selling_price != null) {
                da.paper_mrp = item.selling_price;
                da.paper_base_price = item.selling_price;
              }
              purchasesSql.updateProductDomainAttributes(db).run(JSON.stringify(da), item.product_id, bill.tenant_id);
            }
          }
        }

      // If CREDIT payment and supplier is a known party, create ledger entry
      if (paymentType === 'CREDIT' && bill.supplier_id) {
        const party = purchasesSql.findPartiesByPartyId(db).get(bill.supplier_id) as CustomerCreditRow;
        if (party) {
          const balanceType = billType === 'ESTIMATE' ? 'ESTIMATE' : 'GST';
          const ledgerId = crypto.randomUUID();
          const debitAmount = bill.total_amount;
          const balanceCol = balanceType === 'ESTIMATE' ? 'estimate_balance' : 'gst_balance';
          const currentTypeBalance = parseFloat(party[balanceCol] as string) || 0;
          const newTypeBalance = currentTypeBalance - debitAmount;
          const newBalance = (parseFloat(party.balance as string) || 0) - debitAmount;
          purchasesSql.insertPartyLedger(db).run(ledgerId, bill.supplier_id, bill.tenant_id, bill.bill_date || localTimestamp(), `Purchase bill ${bill.bill_number} - ${bill.supplier_name}`, 0, debitAmount, newBalance, balanceType, bill.bill_number, 'system', 'System');
          purchasesSql.updatePartyBalanceColumn(db, balanceCol)
            .run(newBalance, newTypeBalance, bill.bill_date || localTimestamp(), bill.supplier_id);
        }
      }

      // If CASH payment, deduct cash from current cash drawer
      if (paymentType === 'CASH' && Number(bill.total_amount) > 0) {
        const todayDate = localDate();
        const drawer = getOpenCashDrawer(db, bill.tenant_id, todayDate);
        if (drawer) {
          const txnId = crypto.randomUUID();
          purchasesSql.insertCashTransaction(db).run(
            txnId,
            bill.tenant_id,
            drawer.drawer_id,
            Number(bill.total_amount),
            `Purchase bill ${bill.bill_number} - ${bill.supplier_name}`
          );
          const newCashOut = Number(drawer.cash_out) + Number(bill.total_amount);
          const newCurrentCash = Number(drawer.current_cash) - Number(bill.total_amount);
          const newExpectedClosing = Number(drawer.opening_balance) + Number(drawer.cash_sales) + Number(drawer.cash_in) - newCashOut;
          purchasesSql.updateCashDrawerByDrawerId(db).run(newCashOut, newCurrentCash, newExpectedClosing, drawer.drawer_id);
        }
      }

      return { success: true };
    })();
    return result;
  } catch (error) {
    console.error('[db:addPurchaseBill]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:getPurchaseBills` */
export function getPurchaseBills({ tenant_id, search, limit, offset }: { tenant_id: string; search?: string; limit?: number; offset?: number }) {
  try {
    const db = getDb();
    if (!tenant_id) return [];

    const { statement, params } = purchasesSql.getPurchaseBillsStatement(db, { tenant_id, search, limit, offset });

    return statement.all(...params);
  } catch (error) {
    console.error('[db:getPurchaseBills]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:getPurchaseBillItems` */
export function getPurchaseBillItems(purchase_bill_id: string) {
  try {
    const db = getDb();
    return purchasesSql.findPurchaseBillItemsByPurchaseBillId(db).all(purchase_bill_id);
  } catch (error) {
    console.error('[db:getPurchaseBillItems]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:updatePurchaseBill` */
export function updatePurchaseBill(payload: {
  purchase_bill_id: string;
  tenant_id: string;
  bill_number: string;
  supplier_id?: string;
  supplier_name: string;
  bill_date?: string;
  invoice_number?: string;
  notes?: string;
  total_amount: number;
  bill_type?: string;
  payment_type?: string;
  items: Array<{
    item_id: string;
    product_id: string;
    name: string;
    quantity: number;
    purchase_price: number;
    total_amount: number;
    selling_price?: number | null;
    offer_price?: number | null;
    is_gst_applicable?: number;
    tax_rate_percent?: number;
    hsn_sac_code?: string;
    skip_stock_update?: number;
  }>;
}) {
  try {
    const db = getDb();
    const billType = payload.bill_type || 'GST';
    const paymentType = payload.payment_type || 'CASH';
    const result = db.transaction(() => {
      const { items, ...bill } = payload;
      // Revert stock of previous items before deleting them.
      // Must query oldBill and oldItems BEFORE updating purchase_bills
      const oldBill = purchasesSql.findPurchaseBillsByPurchaseBillId(db).get(bill.purchase_bill_id) as PurchaseBillRow;
      const oldBillType = oldBill?.bill_type || 'GST';
      const oldItems = purchasesSql.findPurchaseBillItemsByPurchaseBillIdProductIdAndQuantity(db).all(bill.purchase_bill_id) as InvoiceItem[];

      purchasesSql.updatePurchaseBillByPurchaseBillId(db).run(bill.supplier_id || null, bill.supplier_name, bill.bill_date || null, bill.invoice_number || null, bill.notes || null, bill.total_amount, billType, paymentType, bill.purchase_bill_id);

      const decreaseStock = purchasesSql.updateProductCurrentStock(db);
      if (oldBillType === 'ESTIMATE') {
        for (const item of oldItems) {
          decreaseStock.run(item.quantity, item.product_id, bill.tenant_id);
        }
      } else {
        // For old GST bills, only revert stock if this item was NOT dummy (meaning no skip_stock_update and no Estimate exists for this product)
        for (const item of oldItems) {
          if (item.skip_stock_update === 1) {
            continue; // Was dummy / paper stock, never added to physical shop stock
          }
          const hasEstimate = purchasesSql.findOnePurchaseBillItemByBillTypeAndProductId(db).get(item.product_id, bill.tenant_id);
          if (!hasEstimate) {
            decreaseStock.run(item.quantity, item.product_id, bill.tenant_id);
          }
        }
      }

      purchasesSql.deletePurchaseBillItemByPurchaseBillId(db).run(bill.purchase_bill_id);

      const stmt = purchasesSql.insertPurchaseBillItem(db);
      // Two stock statements: ESTIMATE bills update stock+price; GST bills update price only
      const updateStock = purchasesSql.updateProductCurrentStockAndPurchasePrice(db);
      const updatePrice = purchasesSql.updateProductBasePrice(db);
      const updateOfferPrice = purchasesSql.updateProductOfferPrice(db);
      for (const item of items) {
        const isGst = billType === 'GST' ? (item.is_gst_applicable ?? 1) : 0;
        const hasEstimate = billType === 'GST' ? purchasesSql.findOnePurchaseBillItemByBillTypeAndProductId(db).get(item.product_id, bill.tenant_id) : null;
        const skipStock = (billType === 'GST' && (item.skip_stock_update === 1 || Boolean(hasEstimate))) ? 1 : (item.skip_stock_update ?? 0);

        stmt.run(item.item_id, bill.purchase_bill_id, bill.tenant_id, item.product_id, item.name, item.quantity, item.purchase_price, item.total_amount, item.selling_price != null ? item.selling_price : 0, item.offer_price != null ? item.offer_price : 0, isGst, item.tax_rate_percent ?? 0, item.hsn_sac_code || null, skipStock);
        const actualPurchasePrice = billType === 'GST' && isGst === 1
          ? item.purchase_price * (1 + (item.tax_rate_percent ?? 0) / 100)
          : item.purchase_price;
        // Update stock for Estimates, and for GST bills only if they are not dummy / paper (not shared/skipped)
        if (billType === 'ESTIMATE' || (billType === 'GST' && skipStock === 0)) {
          updateStock.run(item.quantity, actualPurchasePrice, item.product_id, bill.tenant_id);
          if (item.selling_price != null) {
            updatePrice.run(item.selling_price, item.product_id, bill.tenant_id);
          }
          if (item.offer_price != null) {
            updateOfferPrice.run(item.offer_price, item.product_id, bill.tenant_id);
          }
        } else {
          // Paper GST bill: update domain_attributes with paper_purchase_price and paper_mrp
          const prodRow = purchasesSql.findProductsByProductId(db).get(item.product_id) as ProductRow;
          if (prodRow) {
            let da: Record<string, unknown> = {};
            try { da = JSON.parse(prodRow.domain_attributes || '{}'); } catch { /* ignore */ }
            da.gst_purchase_price = item.purchase_price;
            da.paper_purchase_price = item.purchase_price;
            if (item.selling_price != null) {
              da.paper_mrp = item.selling_price;
              da.paper_base_price = item.selling_price;
            }
            purchasesSql.updateProductDomainAttributes(db).run(JSON.stringify(da), item.product_id, bill.tenant_id);
          }
        }
      }

      if (paymentType === 'CREDIT' && bill.supplier_id) {
        const party = purchasesSql.findPartiesByPartyId(db).get(bill.supplier_id) as CustomerCreditRow;
        if (party) {
          const balanceType = billType === 'ESTIMATE' ? 'ESTIMATE' : 'GST';
          const ledgerId = crypto.randomUUID();
          const debitAmount = bill.total_amount;
          const balanceCol = balanceType === 'ESTIMATE' ? 'estimate_balance' : 'gst_balance';
          const currentTypeBalance = parseFloat(party[balanceCol] as string) || 0;
          const newTypeBalance = currentTypeBalance - debitAmount;
          const newBalance = (parseFloat(party.balance as string) || 0) - debitAmount;
          purchasesSql.insertPartyLedger(db).run(ledgerId, bill.supplier_id, bill.tenant_id, bill.bill_date || localTimestamp(), `Purchase bill ${bill.bill_number} - ${bill.supplier_name}`, 0, debitAmount, newBalance, balanceType, bill.bill_number, 'system', 'System');
          purchasesSql.updatePartyBalanceColumn(db, balanceCol)
            .run(newBalance, newTypeBalance, bill.bill_date || localTimestamp(), bill.supplier_id);
        }
      }

      return { success: true };
    })();
    return result;
  } catch (error) {
    console.error('[db:updatePurchaseBill]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:deletePurchaseBill` */
export function deletePurchaseBill(purchase_bill_id: string) {
  try {
    const db = getDb();
    db.transaction(() => {
      const bill = purchasesSql.findPurchaseBillsByPurchaseBillId2(db).get(purchase_bill_id) as PurchaseBillRow;
      if (bill) {
        if (bill.supplier_id && bill.bill_number) {
          const ledgerEntries = purchasesSql.findPartyLedgerByPartyIdAndReferenceNumber(db).all(bill.tenant_id, bill.supplier_id, bill.bill_number) as LedgerRow[];
          for (const entry of ledgerEntries) {
            purchasesSql.updatePartyLedgerIsDeleted(db).run(entry.ledger_id);
          }
          recalcPartyBalances(db, bill.supplier_id);
        }

        if (bill.payment_type === 'CASH' && Number(bill.total_amount) > 0) {
          const tx = purchasesSql.findCashTransactionsByCategory(db).get(bill.tenant_id, `%${bill.bill_number}%`) as CashTransactionRow;
          if (tx) {
            purchasesSql.deleteCashTransactionByTransactionId(db).run(tx.transaction_id);
            const drawer = purchasesSql.findCashDrawerByDrawerId(db).get(tx.drawer_id) as CashDrawerRow;
            if (drawer) {
              const newCashOut = Math.max(0, Number(drawer.cash_out) - Number(tx.amount));
              const newCurrentCash = Number(drawer.opening_balance) + Number(drawer.cash_sales) + Number(drawer.cash_in) - newCashOut;
              const newExpectedClosing = newCurrentCash;
              purchasesSql.updateCashDrawerByDrawerId(db).run(newCashOut, newCurrentCash, newExpectedClosing, drawer.drawer_id);
            }
          }
        }
      }
      purchasesSql.deletePurchaseBillItemByPurchaseBillId(db).run(purchase_bill_id);
      purchasesSql.deletePurchaseBillByPurchaseBillId(db).run(purchase_bill_id);
    })();
    import('../sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Sync after delete error:', e));
    }).catch(() => {});
    return { success: true };
  } catch (error) {
    console.error('[db:deletePurchaseBill]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:getPurchaseBillProducts` */
export function getPurchaseBillProducts({ tenant_id, search, limit, numericPrefixOnly = false }: { tenant_id: string; search?: string; limit?: number; numericPrefixOnly?: boolean }) {
  try {
    const db = getDb();
    if (!tenant_id) return [];

    const { statement, params } = purchasesSql.getPurchaseBillProductsStatement(db, { tenant_id, search, numericPrefixOnly, limit });
    return statement.all(...params);
  } catch (error) {
    console.error('[db:getPurchaseBillProducts]', error);
    return { error: 'Operation failed' };
  }
}
