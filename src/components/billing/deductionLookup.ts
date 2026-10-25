import { scrapApi } from '../../data/scrap';
import { returnsApi } from '../../data/returns';
import { matchesDocumentNumber } from '../../utils/invoiceNumberHelper';

/**
 * Resolving scrap / return credits that can be deducted from a bill.
 * `found` → apply `amount` against document `number`; `error` → show `message`;
 * `none` → no such document. Network/IPC failures are thrown to the caller.
 */
export type CreditLookup =
  | { status: 'found'; amount: number; number: string }
  | { status: 'error'; message: string }
  | { status: 'none' };

/** A scrap / return document row as the deduction search dropdown lists it (untyped IPC rows). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DeductionSearchRow = any;

const NONE: CreditLookup = { status: 'none' };

/** Exact scrap-invoice lookup. A settled scrap credit cannot be redeemed twice. */
export async function lookupScrapCredit(tenantId: string, number: string): Promise<CreditLookup> {
  const res = await scrapApi.getScrapInvoiceByNumber({ tenant_id: tenantId, scrap_invoice_number: number });
  if (!res?.totalAmount) return NONE;
  if (res.paymentStatus === 'SETTLED') return { status: 'error', message: `Scrap credit ${number} has already been redeemed.` };
  return { status: 'found', amount: res.totalAmount, number };
}

/** Exact return lookup. Only the not-yet-adjusted remainder can be deducted. */
export async function lookupReturnCredit(tenantId: string, number: string): Promise<CreditLookup> {
  const res = await returnsApi.getReturnInvoiceByNumber({ tenant_id: tenantId, return_number: number });
  if (!res?.grand_total) return NONE;
  const remaining = res.grand_total - (res.adjusted_amount || 0);
  return remaining > 0 ? { status: 'found', amount: remaining, number } : { status: 'error', message: 'Return already fully adjusted' };
}

/** Exact lookup, then a loose match on the digits against pending scrap invoices. */
export async function findScrapCredit(tenantId: string, query: string): Promise<CreditLookup> {
  const exact = await lookupScrapCredit(tenantId, query);
  if (exact.status !== 'none') return exact;
  const list = await scrapApi.getScrapInvoiceList({ tenant_id: tenantId });
  const match = Array.isArray(list)
    ? list.find((inv) => inv.payment_status === 'PENDING' && matchesDocumentNumber(String(inv.invoice_number), query))
    : undefined;
  if (match) {
    const loose = await lookupScrapCredit(tenantId, match.invoice_number);
    if (loose.status !== 'none') return loose;
  }
  return { status: 'error', message: `Scrap invoice "${query}" not found` };
}

/** Exact lookup, then a loose match on the digits against returns with a pending balance. */
export async function findReturnCredit(tenantId: string, query: string): Promise<CreditLookup> {
  const exact = await lookupReturnCredit(tenantId, query);
  if (exact.status !== 'none') return exact;
  const list = await returnsApi.getPendingReturnInvoices({ tenant_id: tenantId });
  const match = Array.isArray(list)
    ? list.find((r: { return_number: string }) => matchesDocumentNumber(String(r.return_number), query))
    : undefined;
  if (match) {
    const loose = await lookupReturnCredit(tenantId, match.return_number);
    if (loose.status === 'found') return loose;
  }
  return { status: 'error', message: `Return "${query}" not found` };
}
