import { getUtcRangeForStoreDateRange, getStoreTimezoneSetting, parseCleanDate } from './storeTime.js';
/**
 * UAE VAT Return 201 & FTA Audit Service — Electron main process.
 *
 * Implements official Federal Tax Authority (FTA) specifications:
 *  - Form VAT 201:
 *      Section 1: VAT on Sales and all other Outputs (Boxes 1 to 8)
 *      Section 2: VAT on Expenses and all other Inputs (Boxes 9 to 11)
 *      Section 3: Net VAT Due / Reclaimable (Boxes 12 to 14)
 *  - Sales Tax Invoices Audit (Full vs Simplified)
 *  - Tax Credit Notes (Sales Returns)
 *  - Purchase Bills (Input Tax Recovery)
 *  - FTA Compliance & Validation engine
 */

import { getDb } from '../db/localDb.js';
import * as vatSql from '../db/statements/vatReports.js';
import { validateTRN, normalizeEmirate, UAE_EMIRATES_LIST, type UaeEmirateCode } from '../utils/trnValidator.js';
import { roundStoreMoney, storeMoneyDecimals } from '../utils/moneyRounding.js';
import { getStoreCountrySetting } from './storeCountryService.js';

export interface VatPeriodFilter {
  tenant_id: string;
  from_date: string; // YYYY-MM-DD
  to_date: string;   // YYYY-MM-DD
  shop_emirate?: string;
  shop_trn?: string;
  shop_name?: string;
}

export interface Vat201BoxLine {
  boxNo: string;
  description: string;
  amount: number;       // Net Amount AED
  vatAmount: number;    // VAT Amount AED
  adjustment: number;   // Adjustments AED (Net adjustments)
  adjustmentVat: number;// VAT Adjustments AED
  recoverableVat?: number; // Recoverable VAT AED for Input Tax
}

export interface Vat201SectionOutput {
  standardRatedSupplies: {
    abuDhabi: Vat201BoxLine;
    dubai: Vat201BoxLine;
    sharjah: Vat201BoxLine;
    ajman: Vat201BoxLine;
    ummAlQuwain: Vat201BoxLine;
    rasAlKhaimah: Vat201BoxLine;
    fujairah: Vat201BoxLine;
  };
  touristRefunds: Vat201BoxLine;
  reverseChargeSupplies: Vat201BoxLine;
  zeroRatedSupplies: Vat201BoxLine;
  exemptSupplies: Vat201BoxLine;
  goodsImported: Vat201BoxLine;
  adjustmentsImported: Vat201BoxLine;
  totalOutputTax: {
    totalAmount: number;
    totalVat: number;
    totalAdjustment: number;
    totalAdjustmentVat: number;
    netOutputVatDue: number;
  };
}

export interface Vat201SectionInput {
  standardRatedExpenses: Vat201BoxLine;
  reverseChargeExpenses: Vat201BoxLine;
  totalInputTax: {
    totalAmount: number;
    totalRecoverableVat: number;
    totalAdjustment: number;
    totalAdjustmentVat: number;
    netInputVatRecoverable: number;
  };
}

export interface Vat201NetDue {
  totalDueTax: number;        // Box 12 (Net Output VAT)
  totalRecoverableTax: number; // Box 13 (Net Recoverable Input VAT)
  netVatPayable: number;      // Box 14 = Box 12 - Box 13
  status: 'PAYABLE' | 'RECLAIMABLE' | 'NIL';
}

export interface VatSalesAuditRow {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerTrn: string | null;
  invoiceType: 'SIMPLIFIED' | 'FULL';
  taxableAmount: number;
  vatRate: number;
  vatAmount: number;
  grandTotal: number;
  taxCategory: 'STANDARD' | 'ZERO_RATED' | 'EXEMPT';
  emirate: string;
  itemCount: number;
}

export interface VatCreditNoteAuditRow {
  returnId: string;
  returnNumber: string;
  creditNoteNumber: string;
  returnDate: string;
  originalInvoiceNumber: string | null;
  originalInvoiceDate: string | null;
  customerName: string;
  customerTrn: string | null;
  taxableAmount: number;
  vatAmount: number;
  grandTotal: number;
  emirate: string;
}

export interface VatPurchaseAuditRow {
  purchaseBillId: string;
  billNumber: string;
  billDate: string;
  supplierInvoiceNumber: string | null;
  supplierName: string;
  supplierTrn: string | null;
  taxableAmount: number;
  vatAmount: number;
  grandTotal: number;
  isRecoverable: boolean;
  itemCount: number;
}

export interface VatValidationIssue {
  severity: 'BLOCKING' | 'WARNING' | 'INFO';
  code: string;
  message: string;
  details?: string;
  documentRef?: string;
}

export interface Vat201Report {
  taxablePerson: {
    shopName: string;
    trn: string | null;
    emirate: string;
    country: 'AE';
  };
  period: {
    fromDate: string;
    toDate: string;
    label: string;
  };
  section1Output: Vat201SectionOutput;
  section2Input: Vat201SectionInput;
  netDue: Vat201NetDue;
  salesAudit: VatSalesAuditRow[];
  creditNotesAudit: VatCreditNoteAuditRow[];
  purchaseAudit: VatPurchaseAuditRow[];
  validationIssues: VatValidationIssue[];
  summary: {
    totalSalesInvoices: number;
    totalCreditNotes: number;
    totalPurchaseBills: number;
    grossSales: number;
    netSalesTaxable: number;
    outputVat: number;
    grossPurchases: number;
    recoverableInputVat: number;
    netVatDue: number;
  };
  generatedAt: string;
}

interface RawInvoiceRow {
  invoice_id: string;
  tenant_id: string;
  invoice_number: string;
  invoice_type: string | null;
  created_at: string;
  subtotal: number;
  tax_total: number;
  discount_total: number | null;
  grand_total: number;
  customer_name: string | null;
  customer_phone: string | null;
  customer_gstin: string | null;
  customer_address: string | null;
  customer_state: string | null;
  is_deleted: number;
}

interface RawInvoiceItemRow {
  item_id: string;
  invoice_id: string;
  tenant_id: string;
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  total: number;
  is_service_item?: number;
  product_name?: string;
  combo_id?: string | null;
  combo_details?: string | null;
}

interface RawReturnRow {
  return_id: string;
  tenant_id: string;
  return_number: string;
  invoice_id: string;
  credit_note_number: string | null;
  original_invoice_number: string | null;
  original_invoice_date: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_gstin: string | null;
  subtotal: number;
  tax_total: number;
  grand_total: number;
  created_at: string;
}

interface RawPurchaseRow {
  purchase_bill_id: string;
  tenant_id: string;
  bill_number: string;
  supplier_id: string | null;
  supplier_name: string;
  bill_date: string | null;
  invoice_number: string | null;
  total_amount: number;
  bill_type: string | null;
  created_at: string;
  supplier_trn: string | null;
  supplier_address: string | null;
}

interface RawPurchaseItemRow {
  item_id: string;
  purchase_bill_id: string;
  tenant_id: string;
  product_id: string;
  name: string;
  quantity: number;
  purchase_price: number;
  total_amount: number;
  is_gst_applicable: number | null;
  tax_rate_percent: number | null;
  product_name?: string;
}



/**
 * Generates the full UAE VAT 201 Return & FTA Audit Report.
 */
export function getVatReport(payload: VatPeriodFilter): Vat201Report | { error: string } {
  try {
    const { tenant_id, from_date, to_date, shop_emirate, shop_trn, shop_name } = payload;
    if (!tenant_id || !from_date || !to_date) {
      return { error: 'tenant_id, from_date, and to_date are required' };
    }

    const db = getDb();
    const country = getStoreCountrySetting(db, tenant_id);
    const decimals = storeMoneyDecimals(country);
    const r = (val: number) => roundStoreMoney(Number(val) || 0, country);
    const defaultRate: number = country === 'BH' ? 10 : 5;
    const currencyName = country === 'BH' ? 'BHD' : 'AED';
    const timezone = getStoreTimezoneSetting(db, tenant_id);
    const activeEmirate = normalizeEmirate(shop_emirate);

    // 1. Fetch raw database records
    const { startUtc, endUtc } = getUtcRangeForStoreDateRange(from_date, to_date, tenant_id);
    const invoices = vatSql.findInvoicesForVatReport(db).all(tenant_id, startUtc, endUtc) as RawInvoiceRow[];
    const invoiceItems = vatSql.findInvoiceItemsForVatReport(db).all(tenant_id, startUtc, endUtc) as RawInvoiceItemRow[];
    const returns = vatSql.findReturnsForVatReport(db).all(tenant_id, startUtc, endUtc) as RawReturnRow[];
    const purchases = vatSql.findPurchasesForVatReport(db).all({ tenant_id, from_date, to_date, startUtc, endUtc }) as RawPurchaseRow[];
    const purchaseItems = vatSql.findPurchaseItemsForVatReport(db).all({ tenant_id, from_date, to_date, startUtc, endUtc }) as RawPurchaseItemRow[];

    // Group items by parent
    const invoiceItemMap = new Map<string, RawInvoiceItemRow[]>();
    for (const item of invoiceItems) {
      const list = invoiceItemMap.get(item.invoice_id) || [];
      list.push(item);
      invoiceItemMap.set(item.invoice_id, list);
    }

    const purchaseItemMap = new Map<string, RawPurchaseItemRow[]>();
    for (const pItem of purchaseItems) {
      const list = purchaseItemMap.get(pItem.purchase_bill_id) || [];
      list.push(pItem);
      purchaseItemMap.set(pItem.purchase_bill_id, list);
    }

    const validationIssues: VatValidationIssue[] = [];

    // Check shop TRN
    const shopTrnRes = validateTRN(shop_trn);
    if (!shop_trn || shop_trn.trim() === '') {
      validationIssues.push({
        severity: 'BLOCKING',
        code: 'MISSING_SHOP_TRN',
        message: 'Shop TRN is not configured in settings. A 15-digit UAE TRN is required for FTA filings.',
      });
    } else if (!shopTrnRes.isValid) {
      validationIssues.push({
        severity: 'BLOCKING',
        code: 'INVALID_SHOP_TRN',
        message: `Configured Shop TRN (${shop_trn}) is invalid: ${shopTrnRes.error}`,
      });
    }

    // 2. Process Sales Invoices & Credit Notes
    const salesAudit: VatSalesAuditRow[] = [];
    let grossSales = 0;
    let netSalesTaxable = 0;
    let totalOutputVat = 0;
    let zeroRatedAmount = 0;
    let exemptAmount = 0;

    for (const inv of invoices) {
      const items = invoiceItemMap.get(inv.invoice_id) || [];
      const invTax = r(inv.tax_total);
      const invGrand = r(inv.grand_total);
      const invSub = r(inv.subtotal);

      grossSales = r(grossSales + invGrand);
      netSalesTaxable = r(netSalesTaxable + invSub);
      totalOutputVat = r(totalOutputVat + invTax);

      const hasTrn = Boolean(inv.customer_gstin && inv.customer_gstin.trim().length > 0);
      const isLargeInvoice = invGrand >= 10000;
      const invoiceType: 'SIMPLIFIED' | 'FULL' = hasTrn || isLargeInvoice ? 'FULL' : 'SIMPLIFIED';

      // FTA simplified invoice limit audit:
      // If invoice >= 10,000 AED and anonymous/unregistered, warn
      if (isLargeInvoice && !hasTrn) {
        validationIssues.push({
          severity: 'WARNING',
          code: 'SIMPLIFIED_EXCEEDS_10K',
          message: `Invoice ${inv.invoice_number} is AED ${invGrand.toFixed(2)} (>= 10,000 AED) but lacks customer TRN. FTA requires Full Tax Invoice details.`,
          documentRef: inv.invoice_number,
        });
      }

      // If customer has TRN, validate it
      if (hasTrn) {
        const trnVal = validateTRN(inv.customer_gstin, country);
        if (!trnVal.isValid) {
          validationIssues.push({
            severity: 'WARNING',
            code: 'INVALID_CUSTOMER_TRN',
            message: `Invoice ${inv.invoice_number} has invalid customer TRN "${inv.customer_gstin}": ${trnVal.error}`,
            documentRef: inv.invoice_number,
          });
        }
      }

      // Tax reconciliation check: subtotal * 5% vs invTax
      const expectedVat = r(invSub * (defaultRate / 100));
      if (Math.abs(expectedVat - invTax) > 0.05 && invTax > 0) {
        validationIssues.push({
          severity: 'INFO',
          code: 'VAT_ROUNDING_MISMATCH',
          message: `Invoice ${inv.invoice_number} has VAT difference: stored ${invTax.toFixed(decimals)} ${currencyName} vs calculated ${expectedVat.toFixed(decimals)} ${currencyName}`,
          documentRef: inv.invoice_number,
        });
      }

      const invEmirate = normalizeEmirate(inv.customer_state || activeEmirate);

      salesAudit.push({
        invoiceId: inv.invoice_id,
        invoiceNumber: inv.invoice_number,
        invoiceDate: parseCleanDate(inv.created_at, timezone),
        customerName: inv.customer_name || 'Retail Customer',
        customerTrn: inv.customer_gstin || null,
        invoiceType,
        taxableAmount: invSub,
        vatRate: invTax > 0 ? 5 : 0,
        vatAmount: invTax,
        grandTotal: invGrand,
        taxCategory: (invTax > 0 || items.some(item => {
          if (item.combo_details) {
            try {
              const parsed = JSON.parse(item.combo_details);
              if (Array.isArray(parsed) && parsed.some(c => (Number(c.tax_rate_percent) || 0) > 0)) return true;
            } catch { /* ignore */ }
          }
          return false;
        })) ? 'STANDARD' : 'ZERO_RATED',
        emirate: invEmirate,
        itemCount: items.length,
      });
    }

    // 3. Process Returns / Credit Notes
    const creditNotesAudit: VatCreditNoteAuditRow[] = [];
    let creditNotesTaxable = 0;
    let creditNotesVat = 0;

    for (const ret of returns) {
      const retSub = r(ret.subtotal);
      const retTax = r(ret.tax_total);
      const retGrand = r(ret.grand_total);

      creditNotesTaxable = r(creditNotesTaxable + retSub);
      creditNotesVat = r(creditNotesVat + retTax);

      const creditNoteNumber = ret.credit_note_number || ret.return_number;
      if (!ret.original_invoice_number) {
        validationIssues.push({
          severity: 'WARNING',
          code: 'CREDIT_NOTE_MISSING_INVOICE_REF',
          message: `Credit Note ${creditNoteNumber} does not link to an original Tax Invoice number. FTA rules require reference to original invoice.`,
          documentRef: creditNoteNumber,
        });
      }

      const retEmirate = activeEmirate;

      creditNotesAudit.push({
        returnId: ret.return_id,
        returnNumber: ret.return_number,
        creditNoteNumber,
        returnDate: parseCleanDate(ret.created_at, timezone),
        originalInvoiceNumber: ret.original_invoice_number || null,
        originalInvoiceDate: ret.original_invoice_date || null,
        customerName: ret.customer_name || 'Customer',
        customerTrn: ret.customer_gstin || null,
        taxableAmount: retSub,
        vatAmount: retTax,
        grandTotal: retGrand,
        emirate: retEmirate,
      });
    }

    // 4. Process Purchases (Input Tax)
    const purchaseAudit: VatPurchaseAuditRow[] = [];
    let grossPurchases = 0;
    let netPurchasesTaxable = 0;
    let recoverableInputVat = 0;

    for (const pb of purchases) {
      const pItems = purchaseItemMap.get(pb.purchase_bill_id) || [];
      const billTotal = r(pb.total_amount);
      grossPurchases = r(grossPurchases + billTotal);

      // Calculate taxable and VAT from items or bill
      let billTaxable = 0;
      let billVat = 0;

      if (pItems.length > 0) {
        for (const pItem of pItems) {
          const itemTotal = r(pItem.total_amount);
          const rate = pItem.tax_rate_percent !== null && pItem.tax_rate_percent !== undefined
            ? Number(pItem.tax_rate_percent)
            : defaultRate;
          const isTaxable = pItem.is_gst_applicable !== 0 && rate > 0;
          if (isTaxable) {
            // UAE VAT is usually inclusive or 5% on purchase
            const tax = r(itemTotal * (rate / (100 + rate)));
            const taxable = r(itemTotal - tax);
            billTaxable = r(billTaxable + taxable);
            billVat = r(billVat + tax);
          } else {
            billTaxable = r(billTaxable + itemTotal);
          }
        }
      } else {
        // Fallback: 5% standard VAT on purchase bill total
        billVat = r(billTotal * (defaultRate / (100 + defaultRate)));
        billTaxable = r(billTotal - billVat);
      }

      netPurchasesTaxable = r(netPurchasesTaxable + billTaxable);
      recoverableInputVat = r(recoverableInputVat + billVat);

      if (pb.supplier_trn) {
        const sTrnVal = validateTRN(pb.supplier_trn, country);
        if (!sTrnVal.isValid) {
          validationIssues.push({
            severity: 'INFO',
            code: 'INVALID_SUPPLIER_TRN',
            message: `Purchase Bill ${pb.bill_number} has supplier TRN "${pb.supplier_trn}" which is invalid: ${sTrnVal.error}`,
            documentRef: pb.bill_number,
          });
        }
      }

      purchaseAudit.push({
        purchaseBillId: pb.purchase_bill_id,
        billNumber: pb.bill_number,
        billDate: parseCleanDate(pb.bill_date || pb.created_at, timezone),
        supplierInvoiceNumber: pb.invoice_number || null,
        supplierName: pb.supplier_name,
        supplierTrn: pb.supplier_trn || null,
        taxableAmount: billTaxable,
        vatAmount: billVat,
        grandTotal: billTotal,
        isRecoverable: true,
        itemCount: pItems.length,
      });
    }

    // 5. Build Form VAT 201 Structure
    // Section 1: Standard rated supplies by Emirate (Box 1a to 1g)
    const emirateBoxes: Record<UaeEmirateCode, { amount: number; vat: number; adj: number; adjVat: number }> = {
      ABU_DHABI: { amount: 0, vat: 0, adj: 0, adjVat: 0 },
      DUBAI: { amount: 0, vat: 0, adj: 0, adjVat: 0 },
      SHARJAH: { amount: 0, vat: 0, adj: 0, adjVat: 0 },
      AJMAN: { amount: 0, vat: 0, adj: 0, adjVat: 0 },
      UMM_AL_QUWAIN: { amount: 0, vat: 0, adj: 0, adjVat: 0 },
      RAS_AL_KHAIMAH: { amount: 0, vat: 0, adj: 0, adjVat: 0 },
      FUJAIRAH: { amount: 0, vat: 0, adj: 0, adjVat: 0 },
    };

    // Allocate sales to emirate or zero-rated / exempt
    for (const sale of salesAudit) {
      if (sale.taxCategory === 'STANDARD') {
        const e = normalizeEmirate(sale.emirate);
        emirateBoxes[e].amount = r(emirateBoxes[e].amount + sale.taxableAmount);
        emirateBoxes[e].vat = r(emirateBoxes[e].vat + sale.vatAmount);
      } else if (sale.taxCategory === 'EXEMPT') {
        exemptAmount = r(exemptAmount + sale.taxableAmount);
      } else {
        zeroRatedAmount = r(zeroRatedAmount + sale.taxableAmount);
      }
    }

    // Allocate returns/credit notes as Adjustments to the store's Emirate
    for (const cn of creditNotesAudit) {
      const e = normalizeEmirate(cn.emirate);
      emirateBoxes[e].adj = r(emirateBoxes[e].adj + cn.taxableAmount);
      emirateBoxes[e].adjVat = r(emirateBoxes[e].adjVat + cn.vatAmount);
    }

    const standardRatedSupplies = {
      abuDhabi: {
        boxNo: '1a',
        description: 'Standard rated supplies in Abu Dhabi',
        amount: emirateBoxes.ABU_DHABI.amount,
        vatAmount: emirateBoxes.ABU_DHABI.vat,
        adjustment: emirateBoxes.ABU_DHABI.adj,
        adjustmentVat: emirateBoxes.ABU_DHABI.adjVat,
      },
      dubai: {
        boxNo: '1b',
        description: 'Standard rated supplies in Dubai',
        amount: emirateBoxes.DUBAI.amount,
        vatAmount: emirateBoxes.DUBAI.vat,
        adjustment: emirateBoxes.DUBAI.adj,
        adjustmentVat: emirateBoxes.DUBAI.adjVat,
      },
      sharjah: {
        boxNo: '1c',
        description: 'Standard rated supplies in Sharjah',
        amount: emirateBoxes.SHARJAH.amount,
        vatAmount: emirateBoxes.SHARJAH.vat,
        adjustment: emirateBoxes.SHARJAH.adj,
        adjustmentVat: emirateBoxes.SHARJAH.adjVat,
      },
      ajman: {
        boxNo: '1d',
        description: 'Standard rated supplies in Ajman',
        amount: emirateBoxes.AJMAN.amount,
        vatAmount: emirateBoxes.AJMAN.vat,
        adjustment: emirateBoxes.AJMAN.adj,
        adjustmentVat: emirateBoxes.AJMAN.adjVat,
      },
      ummAlQuwain: {
        boxNo: '1e',
        description: 'Standard rated supplies in Umm Al Quwain',
        amount: emirateBoxes.UMM_AL_QUWAIN.amount,
        vatAmount: emirateBoxes.UMM_AL_QUWAIN.vat,
        adjustment: emirateBoxes.UMM_AL_QUWAIN.adj,
        adjustmentVat: emirateBoxes.UMM_AL_QUWAIN.adjVat,
      },
      rasAlKhaimah: {
        boxNo: '1f',
        description: 'Standard rated supplies in Ras Al Khaimah',
        amount: emirateBoxes.RAS_AL_KHAIMAH.amount,
        vatAmount: emirateBoxes.RAS_AL_KHAIMAH.vat,
        adjustment: emirateBoxes.RAS_AL_KHAIMAH.adj,
        adjustmentVat: emirateBoxes.RAS_AL_KHAIMAH.adjVat,
      },
      fujairah: {
        boxNo: '1g',
        description: 'Standard rated supplies in Fujairah',
        amount: emirateBoxes.FUJAIRAH.amount,
        vatAmount: emirateBoxes.FUJAIRAH.vat,
        adjustment: emirateBoxes.FUJAIRAH.adj,
        adjustmentVat: emirateBoxes.FUJAIRAH.adjVat,
      },
    };

    const totalEmirateAmount = UAE_EMIRATES_LIST.reduce((acc, e) => r(acc + emirateBoxes[e.code].amount), 0);
    const totalEmirateVat = UAE_EMIRATES_LIST.reduce((acc, e) => r(acc + emirateBoxes[e.code].vat), 0);
    const totalEmirateAdj = UAE_EMIRATES_LIST.reduce((acc, e) => r(acc + emirateBoxes[e.code].adj), 0);
    const totalEmirateAdjVat = UAE_EMIRATES_LIST.reduce((acc, e) => r(acc + emirateBoxes[e.code].adjVat), 0);
    const totalOutputAmount = r(totalEmirateAmount + zeroRatedAmount + exemptAmount);

    const section1Output: Vat201SectionOutput = {
      standardRatedSupplies,
      touristRefunds: { boxNo: '2', description: 'Tax Refunds for Tourists Scheme', amount: 0, vatAmount: 0, adjustment: 0, adjustmentVat: 0 },
      reverseChargeSupplies: { boxNo: '3', description: 'Supplies subject to reverse charge provisions', amount: 0, vatAmount: 0, adjustment: 0, adjustmentVat: 0 },
      zeroRatedSupplies: { boxNo: '4', description: 'Zero rated supplies', amount: zeroRatedAmount, vatAmount: 0, adjustment: 0, adjustmentVat: 0 },
      exemptSupplies: { boxNo: '5', description: 'Exempt supplies', amount: exemptAmount, vatAmount: 0, adjustment: 0, adjustmentVat: 0 },
      goodsImported: { boxNo: '6', description: 'Goods imported into the UAE', amount: 0, vatAmount: 0, adjustment: 0, adjustmentVat: 0 },
      adjustmentsImported: { boxNo: '7', description: 'Adjustments to goods imported into the UAE', amount: 0, vatAmount: 0, adjustment: 0, adjustmentVat: 0 },
      totalOutputTax: {
        totalAmount: totalOutputAmount,
        totalVat: totalEmirateVat,
        totalAdjustment: totalEmirateAdj,
        totalAdjustmentVat: totalEmirateAdjVat,
        netOutputVatDue: r(totalEmirateVat - totalEmirateAdjVat),
      },
    };

    // Section 2: Input Tax (Boxes 9 to 11)
    const section2Input: Vat201SectionInput = {
      standardRatedExpenses: {
        boxNo: '9',
        description: 'Standard rated expenses / purchases',
        amount: netPurchasesTaxable,
        vatAmount: recoverableInputVat,
        adjustment: 0,
        adjustmentVat: 0,
        recoverableVat: recoverableInputVat,
      },
      reverseChargeExpenses: {
        boxNo: '10',
        description: 'Supplies subject to reverse charge provisions',
        amount: 0,
        vatAmount: 0,
        adjustment: 0,
        adjustmentVat: 0,
        recoverableVat: 0,
      },
      totalInputTax: {
        totalAmount: netPurchasesTaxable,
        totalRecoverableVat: recoverableInputVat,
        totalAdjustment: 0,
        totalAdjustmentVat: 0,
        netInputVatRecoverable: recoverableInputVat,
      },
    };

    // Section 3: Net VAT Due / Reclaimable (Boxes 12 to 14)
    const box12Due = section1Output.totalOutputTax.netOutputVatDue;
    const box13Recoverable = section2Input.totalInputTax.netInputVatRecoverable;
    const netDiff = r(box12Due - box13Recoverable);

    const netDue: Vat201NetDue = {
      totalDueTax: box12Due,
      totalRecoverableTax: box13Recoverable,
      netVatPayable: Math.abs(netDiff),
      status: netDiff > 0 ? 'PAYABLE' : netDiff < 0 ? 'RECLAIMABLE' : 'NIL',
    };

    return {
      taxablePerson: {
        shopName: shop_name || 'UAE Retail Store',
        trn: shop_trn || null,
        emirate: activeEmirate,
        country: 'AE',
      },
      period: {
        fromDate: from_date,
        toDate: to_date,
        label: `${from_date} to ${to_date}`,
      },
      section1Output,
      section2Input,
      netDue,
      salesAudit,
      creditNotesAudit,
      purchaseAudit,
      validationIssues,
      summary: {
        totalSalesInvoices: invoices.length,
        totalCreditNotes: returns.length,
        totalPurchaseBills: purchases.length,
        grossSales,
        netSalesTaxable,
        outputVat: box12Due,
        grossPurchases,
        recoverableInputVat: box13Recoverable,
        netVatDue: netDiff,
      },
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[vatReportService:getVatReport]', err);
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export * from './vatFilingService';

