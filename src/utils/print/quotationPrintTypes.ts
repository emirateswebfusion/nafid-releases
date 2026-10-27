/** Data passed to the quotation print / PDF generator (quotationHtmlGenerator.ts). */
export interface QuotationPrintItem {
  name: string;
  quantity: number;
  rate: number; // Unit price
  amount: number; // Line total
  hsn_code?: string | null;
  uom?: string | null;
  billing_type?: string | null;
  weight?: number | null;
  base_price?: number | null;
  discount_amount?: number | null;
  discount_percent?: number | null;
  taxable_amount?: number | null;
  tax_rate_percent?: number | null;
  cgst_rate?: number | null;
  cgst_amount?: number | null;
  sgst_rate?: number | null;
  sgst_amount?: number | null;
  igst_rate?: number | null;
  igst_amount?: number | null;
  is_gst_applicable?: boolean | number | null;
}

export interface QuotationPrintData {
  shopName: string;
  shopAddress?: string;
  shopPhone?: string;
  shopEmail?: string;
  shopWebsite?: string;
  shopGstin?: string;
  shopState?: string;
  shopStateCode?: string;

  quotationNumber: string;
  date: string;
  validUntil?: string;
  billerName?: string;

  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerGstin?: string;
  customerState?: string;

  reverseCharge?: string; // 'No' | 'Yes'
  isGstEnabled: boolean;

  items: QuotationPrintItem[];

  subtotal: number;
  discountTotal?: number;
  taxableAmount?: number;
  taxTotal: number;
  cgstTotal?: number;
  sgstTotal?: number;
  igstTotal?: number;
  roundOff?: number;
  grandTotal: number;

  termsAndConditions?: string;

  // Bank details
  bankName?: string;
  bankAccount?: string;
  bankIfsc?: string;
  bankBranch?: string;
  bankHolderName?: string;
  upiId?: string;
}
