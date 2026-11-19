import type { Db } from '../db/statements/types.js';
import type { InvoiceRow } from './typesB.js';
import * as sql from '../db/statements/returnValidation.js';
import { normalizePaymentSplit } from './partyLedgerService.js';
import { getStoreCountrySetting, roundStoreMoney } from './storeCountryService.js';

interface Line { product_id: string; quantity: number; invoice_item_id?: string }
interface Snapshot { combo_id?: string | null; combo_details?: string | null; is_service_item?: number | null }
interface Source extends Snapshot { item_id: string; product_id: string; quantity: number; returned: number }
/** Recheck inside the save transaction; the return screen's earlier quantities may already be stale. */
export function validateReturnSource<T extends Line>(db: Db, tenant: string, invoiceId: string | null, items: T[]): (T & Snapshot)[] {
  if (!invoiceId) return items;
  const invoice = sql.invoice(db).get(invoiceId, tenant) as InvoiceRow | undefined;
  if (!invoice || invoice.is_deleted || ['HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'].includes(invoice.invoice_type)) {
    throw new Error('The original invoice is unavailable in this shop.');
  }
  const sources = sql.sourceLines(db).all(invoiceId, tenant) as Source[];
  const root = typeof invoice.converted_from_invoice_id === 'string' && invoice.converted_from_invoice_id ? invoice.converted_from_invoice_id : invoiceId;
  if (root !== invoiceId) {
    const original = sql.invoice(db).get(root, tenant) as InvoiceRow | undefined;
    if (!original || original.is_deleted) throw new Error('The original invoice is unavailable in this shop.');
  }
  const prior = sql.returnedProducts(db).all(root, root, tenant, tenant) as { product_id: string; quantity: number }[];
  const requested = new Map<string, number>(), products = new Map<string, number>();
  return items.map(item => {
    const matches = sources.filter(source => item.invoice_item_id ? source.item_id === item.invoice_item_id : source.product_id === item.product_id);
    if (matches.length !== 1 || matches[0].product_id !== item.product_id) throw new Error('Select the original invoice line for each returned item.');
    const source = matches[0];
    const quantity = (requested.get(source.item_id) ?? 0) + item.quantity;
    const productQuantity = (products.get(item.product_id) ?? 0) + item.quantity;
    const sold = sources.filter(line => line.product_id === item.product_id).reduce((sum, line) => sum + Number(line.quantity), 0);
    const already = Number(prior.find(line => line.product_id === item.product_id)?.quantity ?? 0);
    if (quantity + Number(source.returned) > Number(source.quantity) + 1e-9 || productQuantity + already > sold + 1e-9) {
      throw new Error('Return quantity exceeds the remaining quantity on the original invoice.');
    }
    requested.set(source.item_id, quantity); products.set(item.product_id, productQuantity);
    return { ...item, invoice_item_id: source.item_id, combo_id: source.combo_id,
      combo_details: source.combo_details, is_service_item: source.is_service_item };
  });
}

/** Derive the invoice header from its original credit terms and all still-active account credits. */
export function refreshReturnedInvoiceBalance(db: Db, invoiceId: string, tenant: string): void {
  const invoice = sql.invoice(db).get(invoiceId, tenant) as InvoiceRow | undefined;
  if (!invoice) return;
  if (typeof invoice.converted_from_invoice_id === 'string' && invoice.converted_from_invoice_id) {
    refreshReturnedInvoiceBalance(db, invoice.converted_from_invoice_id, tenant); return;
  }
  const country = getStoreCountrySetting(db, tenant);
  const original = Number(normalizePaymentSplit(invoice, country).credit) || 0;
  if (original <= 0 && !['CREDIT', 'SPLIT'].includes((invoice.payment_method ?? '').toUpperCase())) return;
  const credits = (sql.accountCredits(db).get(invoiceId, invoiceId, tenant, tenant) as { total: number }).total;
  sql.updateBalance(db).run(roundStoreMoney(Math.max(0, original - Number(credits)), country), invoiceId, tenant);
}

/** An edit cannot erase quantities that have already been accepted as a return. */
export function validateInvoiceReturnQuantities(db: Db, tenant: string, invoiceId: string, items: Line[]): void {
  const invoice = sql.invoice(db).get(invoiceId, tenant) as InvoiceRow | undefined;
  const root = typeof invoice?.converted_from_invoice_id === 'string' && invoice.converted_from_invoice_id ? invoice.converted_from_invoice_id : invoiceId;
  const returned = sql.returnedProducts(db).all(root, root, tenant, tenant) as { product_id: string; quantity: number }[];
  for (const prior of returned) {
    const quantity = items.filter(item => item.product_id === prior.product_id).reduce((sum, item) => sum + Number(item.quantity), 0);
    if (!Number.isFinite(quantity) || quantity + 1e-9 < Number(prior.quantity)) {
      throw new Error('Bill quantity cannot be lower than the quantity already returned. Cancel the return before editing this item.');
    }
  }
}
