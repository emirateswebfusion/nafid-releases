/**
 * Characterization test for the print generators: every thermal receipt style, every A4/A5 invoice style, the purchase
 * bill and the quotation are rendered from fixed sample bills and a fixed clock, and the output is pinned in a
 * snapshot. Refactors of src/utils/{receipt,invoiceHtml,quotationHtml}* must leave it unchanged; a deliberate layout
 * change updates it in review (`npx vitest run tests/unit/printGenerators.characterization.test.ts -u`).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BILL_SETTINGS, generateReceiptText, type ReceiptData } from '../../src/utils/receiptGenerator';
import { generateInvoiceHtml, generatePurchaseBillHtml, type InvoiceData } from '../../src/utils/invoiceHtmlGenerator';
import { generateQuotationHtml, type QuotationPrintData } from '../../src/utils/quotationHtmlGenerator';

const gstItems = [
  { name: 'Steel Rod 12mm TMT Fe500 Premium Quality Long Name', quantity: 2, unit_price: 590, total: 1180, originalRate: 650, discountLabel: '9% off', brand: 'Tata', hsn_code: '7214', tax_rate_percent: 18, gst_percent: 18, cgst_rate: 9, sgst_rate: 9, cgst_amount: 90, sgst_amount: 90, unit: 'Pcs' },
  { name: 'Cement Bag', quantity: '1.5', unit_price: 400, total: 600, isPriceOverride: true, originalRate: 420, hsn_code: '2523', tax_rate_percent: 28, gst_percent: 28, unit: 'Bag' },
  { name: 'Nails (loose)', quantity: 0.75, unit_price: 120, total: 90, billing_type: 'WEIGHT', pieces_sold: 30, pieces_per_kg: 40, unit: 'Kg', tax_rate_percent: 5 },
  { name: 'Tool Kit Combo', quantity: 1, unit_price: 999, total: 999, isCombo: true, combo_items: [{ product_id: 'p1', quantity: 1, product_name: 'Hammer' }, { product_id: 'p2', quantity: 2, product_name: 'Screwdriver' }], tax_rate_percent: 18 },
];

const gstReceipt: ReceiptData = {
  shopName: 'Nafid Hardware & Paints', shopGstin: '32ABCDE1234F1Z5', shopState: 'Kerala (32)', shopAddress: 'MG Road, Kochi, Kerala 682016',
  shopPhone: '9876543210', shopEmail: 'shop@example.com', shopWebsite: 'example.com', upiId: 'shop@upi', showUpiQr: true,
  invoiceNumber: 'GST-2026-0102', date: '2026-10-15T09:15:00Z', billerName: 'Admin', items: gstItems,
  subtotal: 2600, tax: 269, cgst: 134.5, sgst: 134.5, discount: 50, discountType: 'PERCENTAGE', discountValue: 2,
  grandTotal: 2869, receivedAmount: 3000, balanceAmount: -131, oldBalance: 500, customerBalance: 500, paymentMethod: 'CASH',
  invoiceType: 'GST', isB2B: true, customerName: 'Acme Traders Pvt Ltd', customerPhone: '9123456780', customerGstin: '32AAACA1111A1Z1',
  customerState: 'Kerala (32)', customerAddress: 'Industrial Estate, Aluva', description: 'Site delivery', notes: 'Deliver before noon',
  transporterName: 'Fast Movers', vehicleNumber: 'KL-07-AB-1234', transporterDocNo: 'LR-55', transporterDocDate: '2026-10-15',
  ewayBillNo: 'EWB123456789', ewayBillDate: '2026-10-15', shippingName: 'Acme Godown', shippingAddress: 'Kalamassery', shippingGstin: '32AAACA1111A1Z1',
  scrapDeduction: 100, scrapInvoiceNumber: 'SCR-01', returnDeduction: 60, returnInvoiceNumber: 'RTN-07', showProductOffers: true,
  showPriceOverrideMrp: true, pointsEarned: 28, previousPointsBalance: 100, pointsRedeemed: 20, pointsRedeemedDiscount: 20,
  remainingPointsBalance: 108, extraBonus: 5, bankName: 'SBI', bankAccount: '1234567890', bankIfsc: 'SBIN0001234', bankBranch: 'Kochi',
  dueDate: '2026-10-30', creditPeriodDays: 15,
  billSettings: { ...DEFAULT_BILL_SETTINGS, instructions: 'Goods once sold will not be taken back.\nThank you!', electronicRefNumber: 'IRN-XYZ', showBosTaxBreakup: true, bosTaxRatePercent: 18 },
};

const bosReceipt: ReceiptData = {
  shopName: 'Corner Store', shopAddress: 'Market Road', shopPhone: '9000000001',
  invoiceNumber: 'POS1-104', date: '2026-10-03T12:15:00Z', billerName: 'Staff One',
  items: [
    { name: 'Paint 1L', quantity: 3, unit_price: 250, total: 750 },
    { name: 'Brush', quantity: 1, unit_price: 45.5, total: 45.5, discountLabel: 'Offer', originalRate: 50 },
  ],
  subtotal: 795.5, tax: 0, discount: 20, discountType: 'FIXED', discountValue: 20, grandTotal: 775.5,
  receivedAmount: 500, balanceAmount: 275.5, paymentMethod: 'SPLIT', splitDetails: JSON.stringify({ cash: 300, upi: 200, credit: 275.5 }),
  invoiceType: 'BILL_OF_SUPPLY', customerName: 'Ravi Kumar', customerPhone: '9876543210', isReprint: true,
  billSettings: { ...DEFAULT_BILL_SETTINGS, printFullName: false, showBrandName: false, itemColumnOrder: 'rate_qty', estimateMode: true, nonGstBillTitle: 'ESTIMATE', showBosTaxBreakup: true, bosTaxRatePercent: 5, bosTaxInclusive: true },
};

const RECEIPT_STYLES = ['standard', 'compact', 'modern', 'clean', 'classic', 'dot', 'slim', 'luxe', 'boxed', 'unknown-style'];
const INVOICE_STYLES = ['standard', 'boxed', 'modern', 'classic', 'half-a4'] as const;

const asInvoice = (r: ReceiptData, extra: Partial<InvoiceData> = {}): InvoiceData => ({ ...(r as unknown as InvoiceData), shopPan: 'ABCDE1234F', irn: 'IRN-1', ackNo: 'ACK-1', ackDate: '2026-10-15', customerStateCode: '32', ...extra });

const quotation = (gst: boolean): QuotationPrintData => ({
  shopName: 'Nafid Hardware & Paints', shopAddress: 'MG Road, Kochi', shopPhone: '9876543210', shopEmail: 'shop@example.com', shopWebsite: 'example.com',
  shopGstin: gst ? '32ABCDE1234F1Z5' : undefined, shopState: 'Kerala', shopStateCode: '32',
  quotationNumber: 'QT-0009', date: '2026-10-15T09:15:00Z', validUntil: '2026-10-30', billerName: 'Admin',
  customerName: 'Acme <Traders> & Co', customerPhone: '9123456780', customerAddress: 'Aluva', customerGstin: gst ? '32AAACA1111A1Z1' : undefined, customerState: 'Kerala',
  reverseCharge: 'No', isGstEnabled: gst,
  items: [
    { name: 'Steel Rod', quantity: 10, rate: 590, amount: 5900, hsn_code: '7214', uom: 'Pcs', base_price: 650, discount_amount: 600, discount_percent: 9.23, taxable_amount: 5000, tax_rate_percent: 18, cgst_rate: 9, cgst_amount: 450, sgst_rate: 9, sgst_amount: 450, is_gst_applicable: true },
    { name: 'Nails', quantity: 2.5, rate: 120, amount: 300, uom: 'Kg', billing_type: 'WEIGHT', weight: 2.5, tax_rate_percent: 5, is_gst_applicable: 1 },
    { name: 'Labour', quantity: 1, rate: 500, amount: 500, is_gst_applicable: 0 },
  ],
  subtotal: 6700, discountTotal: 600, taxableAmount: 5800, taxTotal: 945, cgstTotal: 472.5, sgstTotal: 472.5, roundOff: 0.5, grandTotal: 7645.5,
  termsAndConditions: '1. Prices valid for 15 days\n2. Delivery extra',
  bankName: 'SBI', bankAccount: '1234567890', bankIfsc: 'SBIN0001234', bankBranch: 'Kochi', bankHolderName: 'Nafid Hardware', upiId: 'shop@upi',
});

const purchaseItems = [
  { name: 'Steel Rod', quantity: 100, purchase_price: 500, total_amount: 59000, is_gst_applicable: 1, tax_rate_percent: 18, hsn_sac_code: '7214', item_code: 'SR1', sku_barcode: '1001' },
  { name: 'Loose Nails', quantity: 20.5, purchase_price: 80, total_amount: 1640, is_gst_applicable: 0, tax_rate_percent: 0 },
];

describe('print generators (characterization)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T10:30:00Z'));
  });
  afterAll(() => { vi.useRealTimers(); });

  it('renders every thermal receipt style the same way', () => {
    const out: Record<string, string> = {};
    for (const style of RECEIPT_STYLES) {
      out[`gst/${style}/5.8`] = generateReceiptText(gstReceipt, 5.8, undefined, style);
      out[`gst/${style}/8`] = generateReceiptText(gstReceipt, 8, undefined, style);
      out[`bos/${style}/5.8`] = generateReceiptText(bosReceipt, 5.8, undefined, style);
      out[`bos/${style}/48cols`] = generateReceiptText({ ...bosReceipt, billSettings: undefined, isReprint: false }, 8, 48, style);
    }
    expect(out).toMatchSnapshot();
  });

  it('renders every invoice style the same way', () => {
    const out: Record<string, string> = {};
    for (const style of INVOICE_STYLES) {
      out[`gst/${style}`] = generateInvoiceHtml(asInvoice(gstReceipt), style);
      out[`gst-a5v/${style}`] = generateInvoiceHtml(asInvoice(gstReceipt, { a5Orientation: 'vertical', logoUrl: 'data:image/png;base64,AA==' }), style);
      out[`bos/${style}`] = generateInvoiceHtml(asInvoice(bosReceipt), style);
    }
    expect(out).toMatchSnapshot();
  });

  it('renders purchase bills and quotations the same way', () => {
    const shop = { shopName: 'Nafid Hardware', shopAddress: 'MG Road', shopPhone: '9876543210', shopGstin: '32ABCDE1234F1Z5' };
    const bill = { bill_number: 'PB-1', supplier_name: 'Big Supplier', supplier_phone: '9000000001', supplier_address: 'Chennai', supplier_gstin: '33AAAAA0000A1Z5', bill_date: '2026-10-12T10:00:00Z', invoice_number: 'SUP-77', payment_type: 'CREDIT', notes: 'Paid half', total_amount: 60640, created_at: '2026-10-12T10:00:00Z' };
    expect({
      purchaseGst: generatePurchaseBillHtml(shop, { ...bill, bill_type: 'GST' }, purchaseItems),
      purchaseEstimate: generatePurchaseBillHtml({ shopName: null }, { ...bill, bill_type: 'NON_GST', bill_date: null, supplier_phone: null }, purchaseItems.slice(1)),
      quotationGst: generateQuotationHtml(quotation(true)),
      quotationPlain: generateQuotationHtml(quotation(false)),
    }).toMatchSnapshot();
  });
});
