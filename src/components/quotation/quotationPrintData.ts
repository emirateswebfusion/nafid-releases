import { storeDate } from '../../utils/time/dateDisplay';
import { getStoreLocale, isUaeStore } from '../../utils/localization/storeProfile';
import type { QuotationPrintData, QuotationPrintItem } from '../../utils/print/quotationPrintTypes';
import { getStoreTimezone } from '../../utils/time/timezoneHelper';
import type { QuotationState } from './hooks/useQuotationState';

/** Shared source for quotation preview, print and PDF; all use the same stored totals. */
export function buildQuotationPrintData(qm: QuotationState, shopName: string | null, userName: string | null): QuotationPrintData | null {
  const {
    bankAccount, bankBranch, bankIfsc, bankName, previewGstEnabled, quotationItems, selectedQuotation,
    shopAddress, shopEmail, shopGstin, shopPhone, shopState, upiId,
  } = qm;

    if (!selectedQuotation) return null;

    const printItems: QuotationPrintItem[] = quotationItems.map(item => ({
      name: item.name,
      quantity: Number(item.quantity) || 0,
      rate: Number(item.rate) || 0,
      amount: Number(item.amount) || 0,
      hsn_code: item.hsn_code || (item as typeof item).hsn_sac_code || null,
      uom: item.uom || ((item as typeof item).billing_type === 'WEIGHT' ? 'KG' : 'PCS'),
      billing_type: (item as typeof item).billing_type,
      weight: item.weight,
      discount_amount: item.discount_amount != null ? Number(item.discount_amount) : undefined,
      discount_percent: item.discount_percent != null ? Number(item.discount_percent) : undefined,
      taxable_amount: item.taxable_amount != null ? Number(item.taxable_amount) : Number(item.amount) || 0,
      tax_rate_percent: item.tax_rate_percent != null ? Number(item.tax_rate_percent) : 0,
      cgst_amount: item.cgst_amount != null ? Number(item.cgst_amount) : undefined,
      sgst_amount: item.sgst_amount != null ? Number(item.sgst_amount) : undefined,
      igst_amount: item.igst_amount != null ? Number(item.igst_amount) : undefined,
      is_gst_applicable: item.is_gst_applicable,
    }));

    return {
      shopName: shopName || 'NAFID STORE',
      shopAddress: shopAddress || undefined,
      shopPhone: shopPhone || undefined,
      shopEmail: shopEmail || undefined,
      shopGstin: shopGstin || undefined,
      shopState: shopState || undefined,
      quotationNumber: selectedQuotation.quotation_number,
      date: isUaeStore() ? selectedQuotation.created_at || '' : storeDate(selectedQuotation.created_at, getStoreLocale(), {
        timeZone: getStoreTimezone(),
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }),
      validUntil: '15 Days from Date of Issue',
      billerName: selectedQuotation.biller_name || userName || undefined,
      customerName: selectedQuotation.customer_name || undefined,
      customerPhone: selectedQuotation.customer_phone || undefined,
      customerAddress: selectedQuotation.customer_address || undefined,
      customerGstin: selectedQuotation.customer_gstin || undefined,
      customerState: selectedQuotation.customer_state || undefined,
      reverseCharge: 'No',
      isGstEnabled: previewGstEnabled,
      items: printItems,
      subtotal: Number(selectedQuotation.subtotal) || 0,
      discountTotal: selectedQuotation.discount_total != null ? Number(selectedQuotation.discount_total) : undefined,
      taxableAmount: previewGstEnabled ? (Number(selectedQuotation.subtotal) || 0) : undefined,
      taxTotal: previewGstEnabled ? (Number(selectedQuotation.tax_total) || 0) : 0,
      grandTotal: previewGstEnabled
        ? (Number(selectedQuotation.grand_total) || 0)
        : (Number(selectedQuotation.subtotal) || 0),
      termsAndConditions: selectedQuotation.terms_conditions || undefined,
      bankName: bankName || undefined,
      bankAccount: bankAccount || undefined,
      bankIfsc: bankIfsc || undefined,
      bankBranch: bankBranch || undefined,
      bankHolderName: shopName || undefined,
      upiId: upiId || undefined,
    };

}
