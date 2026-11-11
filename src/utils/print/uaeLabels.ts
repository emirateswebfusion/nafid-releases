/**
 * Bilingual (English / Arabic) wording for UAE printed documents: A4 / half-A4 invoices, thermal receipts,
 * quotations, purchase bills and the WhatsApp bill text. These label pairs live only here.
 * The English halves are the exact wording printed before Arabic was added, so turning Arabic off restores it.
 */
import { getStoreCountry, type StoreCountry } from '../localization/storeProfile';

export interface BilingualLabel { en: string; ar: string }

export const UAE_LABELS = {
  taxInvoice: { en: 'TAX INVOICE', ar: 'فاتورة ضريبية' },
  invoice: { en: 'INVOICE', ar: 'فاتورة' },
  taxCreditNote: { en: 'TAX CREDIT NOTE', ar: 'إشعار دائن ضريبي' },
  creditNote: { en: 'CREDIT NOTE', ar: 'إشعار دائن' },
  purchaseBill: { en: 'PURCHASE BILL', ar: 'فاتورة شراء' },
  quotation: { en: 'QUOTATION', ar: 'عرض سعر' },
  estimate: { en: 'ESTIMATE', ar: 'تقدير' },
  address: { en: 'Address', ar: 'العنوان' },
  trn: { en: 'TRN', ar: 'رقم التسجيل الضريبي' },
  phone: { en: 'Phone', ar: 'الهاتف' },
  tel: { en: 'Tel', ar: 'الهاتف' },
  email: { en: 'Email', ar: 'البريد الإلكتروني' },
  website: { en: 'Website', ar: 'الموقع الإلكتروني' },
  invoiceNo: { en: 'Invoice No.', ar: 'رقم الفاتورة' },
  creditNoteNo: { en: 'Credit Note No.', ar: 'رقم الإشعار الدائن' },
  quotationNo: { en: 'Quotation No.', ar: 'رقم عرض السعر' },
  billNo: { en: 'Bill No.', ar: 'رقم الفاتورة' },
  no: { en: 'No.', ar: 'الرقم' },
  issueDate: { en: 'Issue date', ar: 'تاريخ الإصدار' },
  date: { en: 'Date', ar: 'التاريخ' },
  customer: { en: 'Customer', ar: 'العميل' },
  supplier: { en: 'Supplier', ar: 'المورد' },
  customerAddress: { en: 'Customer address', ar: 'عنوان العميل' },
  customerTrn: { en: 'Customer TRN', ar: 'الرقم الضريبي للعميل' },
  customerPhone: { en: 'Customer phone', ar: 'هاتف العميل' },
  dueDate: { en: 'Due date', ar: 'تاريخ الاستحقاق' },
  biller: { en: 'Biller', ar: 'المحاسب' },
  currency: { en: 'Currency: AED (UAE Dirham)', ar: 'العملة: درهم إماراتي' },
  amountsNote: { en: 'All amounts in AED; rates exclude VAT', ar: 'المبالغ بالدرهم؛ الأسعار غير شاملة الضريبة' },
  lineNo: { en: '#', ar: '' },
  description: { en: 'Description', ar: 'الوصف' },
  quantity: { en: 'Quantity', ar: 'الكمية' },
  unitPrice: { en: 'Unit price (excl. VAT)', ar: 'سعر الوحدة (غير شامل الضريبة)' },
  amount: { en: 'Amount (excl. VAT)', ar: 'المبلغ (غير شامل الضريبة)' },
  vatRate: { en: 'VAT rate', ar: 'نسبة الضريبة' },
  subtotal: { en: 'Subtotal', ar: 'المجموع الفرعي' },
  discount: { en: 'Discount', ar: 'الخصم' },
  vat: { en: 'VAT', ar: 'ضريبة القيمة المضافة' },
  scrapCredit: { en: 'Scrap credit', ar: 'رصيد الخردة' },
  returnCredit: { en: 'Return credit', ar: 'رصيد المرتجعات' },
  pointsDiscount: { en: 'Points discount', ar: 'خصم النقاط' },
  totalInclVat: { en: 'Total (including VAT)', ar: 'الإجمالي شامل الضريبة' },
  totalInclVatShort: { en: 'TOTAL incl. VAT', ar: 'الإجمالي شامل الضريبة' },
  refund: { en: 'Refund amount', ar: 'المبلغ المسترد' },
  received: { en: 'Received', ar: 'المبلغ المستلم' },
  balance: { en: 'Balance', ar: 'الرصيد' },
  previousBalance: { en: 'Previous balance', ar: 'الرصيد السابق' },
  paymentMethod: { en: 'Payment method', ar: 'طريقة الدفع' },
  payment: { en: 'Payment', ar: 'الدفع' },
  bank: { en: 'Bank', ar: 'البنك' },
  iban: { en: 'IBAN / Account', ar: 'الآيبان / الحساب' },
  swift: { en: 'SWIFT / BIC', ar: 'رمز السويفت' },
  branch: { en: 'Branch', ar: 'الفرع' },
  shippingAddress: { en: 'Shipping address', ar: 'عنوان الشحن' },
  vehicle: { en: 'Vehicle', ar: 'المركبة' },
  electronicRef: { en: 'Electronic reference', ar: 'المرجع الإلكتروني' },
  reprint: { en: 'Copy / Reprint', ar: 'نسخة' },
  thankYou: { en: 'Thank you', ar: 'شكراً لكم' },
  // WhatsApp bill text
  billItems: { en: 'Bill Items', ar: 'أصناف الفاتورة' },
  paymentMode: { en: 'Payment Mode', ar: 'طريقة الدفع' },
  totalAmount: { en: 'Total Amount', ar: 'المبلغ الإجمالي' },
  paidAmount: { en: 'Paid Amount', ar: 'المبلغ المدفوع' },
  dueBalance: { en: 'Due Balance', ar: 'الرصيد المستحق' },
  creditDueDate: { en: 'Credit Period Due Date', ar: 'تاريخ استحقاق الائتمان' },
  totalOutstanding: { en: 'Total Outstanding Ledger Due', ar: 'إجمالي الرصيد المستحق' },
  thankYouBusiness: { en: 'Thank you for your business!', ar: 'شكراً لتعاملكم معنا' },
  pdfAttached: { en: 'Detailed PDF invoice is attached below.', ar: 'الفاتورة التفصيلية مرفقة بصيغة PDF.' },
} as const satisfies Record<string, BilingualLabel>;

export const BAHRAIN_LABELS = {
  ...UAE_LABELS,
  trn: { en: 'VAT Account No.', ar: 'رقم الحساب الضريبي' },
  customerTrn: { en: 'Customer VAT Account No.', ar: 'رقم الحساب الضريبي للعميل' },
  currency: { en: 'Currency: BHD (Bahraini Dinar)', ar: 'العملة: دينار بحريني' },
  amountsNote: { en: 'All amounts in BHD; rates exclude VAT', ar: 'المبالغ بالدينار؛ الأسعار غير شاملة الضريبة' },
  simplifiedTaxInvoice: { en: 'SIMPLIFIED TAX INVOICE', ar: 'فاتورة ضريبية مبسطة' },
} as const satisfies Record<string, BilingualLabel>;

export function getVatLabels(country: StoreCountry = getStoreCountry()): typeof UAE_LABELS & { simplifiedTaxInvoice?: BilingualLabel } {
  return country === 'BH' ? (BAHRAIN_LABELS as unknown as typeof UAE_LABELS & { simplifiedTaxInvoice?: BilingualLabel }) : UAE_LABELS;
}

export type UaeLabelKey = keyof typeof UAE_LABELS;

const PAYMENT_METHODS: Record<string, string> = {
  CASH: 'نقداً', CARD: 'بطاقة', CREDIT: 'آجل', SPLIT: 'دفع مجزأ', BANK: 'تحويل بنكي', BANK_TRANSFER: 'تحويل بنكي', CHEQUE: 'شيك', ONLINE: 'دفع إلكتروني', UPI: 'دفع إلكتروني',
};

/** Payment method as stored (CASH, CARD, …) with its Arabic name; unknown methods print as stored. */
export function uaePaymentMethod(method: string | undefined): BilingualLabel | undefined {
  if (!method) return undefined;
  return { en: method, ar: PAYMENT_METHODS[method.trim().toUpperCase()] || '' };
}

/**
 * Document title (FTA, Cabinet Decision No. 52 of 2017, Art. 59 and 60): a VAT-registered supplier prints the words
 * "Tax Invoice" on full (Art. 59(1)) and simplified (Art. 59(2), B2C or ≤ AED 10,000) tax invoices alike, and
 * "Tax Credit Note" on credit notes. A shop with no TRN is not a registrant and cannot issue either. A VAT bill is an
 * invoiceType 'GST' sale, a B2B sale, or any sale that charged VAT; a zero-VAT bill of supply keeps "Invoice".
 */
export function uaeDocumentTitle(
  doc: { invoiceType?: string; isB2B?: boolean; shopGstin?: string; tax?: number; grandTotal?: number },
  country: StoreCountry = getStoreCountry()
): BilingualLabel {
  const registered = Boolean(doc.shopGstin?.trim());
  const type = doc.invoiceType || '';
  if (['RETURN', 'SALES_RETURN', 'CREDIT_NOTE'].includes(type)) return registered ? UAE_LABELS.taxCreditNote : UAE_LABELS.creditNote;
  if (type === 'PURCHASE') return UAE_LABELS.purchaseBill;
  if (type === 'QUOTATION') return UAE_LABELS.quotation;
  if (type === 'ESTIMATE') return UAE_LABELS.estimate;
  const chargesVat = type === 'GST' || Boolean(doc.isB2B) || Number(doc.tax) > 0;
  if (!registered || !chargesVat) return UAE_LABELS.invoice;
  if (country === 'BH') {
    const isSimplified = !doc.isB2B && (doc.grandTotal == null || doc.grandTotal <= 500);
    return isSimplified ? BAHRAIN_LABELS.simplifiedTaxInvoice : UAE_LABELS.taxInvoice;
  }
  return UAE_LABELS.taxInvoice;
}

/** Number label that matches the document title. */
export function uaeNumberLabel(invoiceType?: string): BilingualLabel {
  if (['RETURN', 'SALES_RETURN', 'CREDIT_NOTE'].includes(invoiceType || '')) return UAE_LABELS.creditNoteNo;
  if (invoiceType === 'QUOTATION') return UAE_LABELS.quotationNo;
  if (invoiceType === 'PURCHASE') return UAE_LABELS.billNo;
  return UAE_LABELS.invoiceNo;
}

/** "VAT 5%" when every line carries the same rate, else plain "VAT". */
export function uaeVatLabel(items: ReadonlyArray<{ tax_rate_percent?: number | null; gst_percent?: number | null }>): BilingualLabel {
  const rates = new Set(items.map(item => item.tax_rate_percent ?? item.gst_percent));
  const [rate] = [...rates];
  if (rates.size !== 1 || rate == null || !(Number(rate) > 0)) return UAE_LABELS.vat;
  return { en: `${UAE_LABELS.vat.en} ${rate}%`, ar: `${UAE_LABELS.vat.ar} ${rate}%` };
}

/** Plain text pair: "Subtotal / المجموع الفرعي", or English alone. */
export function bilingualText(label: BilingualLabel, arabic: boolean): string {
  return arabic && label.ar ? `${label.en} / ${label.ar}` : label.en;
}

/** HTML escaping for UAE documents (labels and customer-entered values alike). */
export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));

/** HTML pair; the Arabic half is an isolated right-to-left block so bidi never reorders the English. */
export function bilingualHtml(label: BilingualLabel, arabic: boolean, separator: ' / ' | '<br>' = ' / '): string {
  const en = escapeHtml(label.en);
  return arabic && label.ar ? `${en}${separator}<span class="ar" dir="rtl" lang="ar">${escapeHtml(label.ar)}</span>` : en;
}

/** Arabic-capable font stack for A4 documents (Windows: Arial / Segoe UI / Tahoma all carry Arabic glyphs). */
export const UAE_ARABIC_CSS = '.ar{font-family:"Segoe UI",Tahoma,Arial,"Noto Naskh Arabic","Geeza Pro",sans-serif;unicode-bidi:isolate}';

/** Setting `uae_arabic_print` (UAE only): Arabic on documents (A4, half-A4, PDF, quotation, WhatsApp) and on thermal. */
export interface UaeArabicPrint { documents: boolean; thermal: boolean }
export const UAE_ARABIC_PRINT_KEY = 'uae_arabic_print';
/** Documents render through Chromium and show Arabic; thermal stays English until a shop's printer is proven. */
export const DEFAULT_UAE_ARABIC_PRINT: UaeArabicPrint = { documents: true, thermal: false };

export function normalizeUaeArabicPrint(value: unknown): UaeArabicPrint {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return { ...DEFAULT_UAE_ARABIC_PRINT }; }
  }
  if (!value || typeof value !== 'object') return { ...DEFAULT_UAE_ARABIC_PRINT };
  const record = value as Record<string, unknown>;
  const flag = (key: keyof UaeArabicPrint) => typeof record[key] === 'boolean' ? record[key] as boolean : DEFAULT_UAE_ARABIC_PRINT[key];
  return { documents: flag('documents'), thermal: flag('thermal') };
}

let activeArabicPrint: UaeArabicPrint = { ...DEFAULT_UAE_ARABIC_PRINT };
export function setUaeArabicPrint(value: unknown): void { activeArabicPrint = normalizeUaeArabicPrint(value); }
export function getUaeArabicPrint(): UaeArabicPrint { return activeArabicPrint; }
