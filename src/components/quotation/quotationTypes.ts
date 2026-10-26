import { getStoreTimezone } from '../../utils/timezoneHelper';
import { parseUTCDate } from '../../utils/receiptGenerator';
import type * as Rows from '../../data/dbRows';

/** Quotation screen: quotation and line-item rows as the quotations IPC returns them, and date labelling. */
export interface Quotation extends Rows.QuotationsRow {
  items?: QuotationItem[]; quotation_id: string;
}

export interface QuotationItem extends Rows.QuotationItemsRow {
  /** Joined from products by the item query. */
  hsn_sac_code?: string | null;
  billing_type?: string | null;
  is_gst_applicable?: boolean | number;
}

export const formatDateLabel = (dateStr: string | null | undefined) => {
  const tz = getStoreTimezone();
  const d = parseUTCDate(dateStr);
  return `${d.toLocaleDateString('en-IN', { timeZone: tz, weekday: 'long' })} — ${d.toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: 'long', year: 'numeric' })}`;
};
