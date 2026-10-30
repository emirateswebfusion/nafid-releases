import { UaeQuotationDocumentView } from './UaeQuotationDocumentView';
import { getStoreLocale, isUaeStore, localizeTaxText } from '../../../utils/localization/storeProfile';
import { useRef } from 'react';
import { formatCurrency } from '../../../utils/pricing/money';
import { formatDateLabel, type Quotation } from '../quotationTypes';
import type { QuotationState } from '../hooks/useQuotationState';

export interface QuotationDocumentViewProps {
  hasConfiguredBank: boolean;
  isInterState: boolean;
  previewAmountInWords: string;
  previewGrandTotal: number;
  previewHasDiscounts: boolean;
  previewHasHsn: boolean;
  qm: QuotationState;
  selectedQuotation: Quotation;
  shopName: string | null;
}

/** Printable quotation document: shop header, customer / quotation details, product table, totals and bank details. */
export function QuotationDocumentView({
  hasConfiguredBank, isInterState, previewAmountInWords, previewGrandTotal, previewHasDiscounts, previewHasHsn, qm,
  selectedQuotation, shopName,
}: QuotationDocumentViewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  if (isUaeStore()) return <UaeQuotationDocumentView qm={qm} selectedQuotation={selectedQuotation} shopName={shopName} />;
  const {
    bankAccount, bankBranch, bankIfsc, bankName, previewGstEnabled, quotationItems, shopAddress, shopEmail, shopGstin,
    shopPhone, shopState, upiId,
  } = qm;
  return (
    <div
      ref={printRef}
      className="max-w-5xl mx-auto bg-white text-slate-900 border border-slate-900 rounded-lg sm:rounded-xl p-4 sm:p-6 md:p-8 lg:p-10 shadow-md font-sans text-xs transition-all"
      style={{ minHeight: 'auto', backgroundColor: '#ffffff', color: '#111111' }}
    >
      {/* 1. SHOP HEADER */}
      <div className="text-center pb-2.5 sm:pb-3 md:pb-4 border-b-2 border-slate-900">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-wider text-black">
          {shopName || 'NAFID STORE'}
        </h1>
        {shopAddress && (
          <p className="text-[11px] sm:text-xs font-semibold text-slate-700 mt-0.5 sm:mt-1">{shopAddress}</p>
        )}
        <p className="text-[10px] sm:text-[11px] md:text-xs font-semibold text-slate-700 mt-0.5">
          {[
            shopPhone ? `Phone: ${shopPhone}` : '',
            shopEmail ? `Email: ${shopEmail}` : '',
            shopGstin ? `GSTIN: ${shopGstin}` : '',
            shopState ? `State: ${shopState}` : '',
          ].filter(Boolean).join(' | ')}
        </p>
        <div className="mt-2 sm:mt-2.5">
          <span className="inline-block px-3 sm:px-4 py-0.5 text-[10px] sm:text-xs font-extrabold uppercase tracking-widest border border-slate-900 bg-slate-100 text-black">
            QUOTATION
          </span>
        </div>
      </div>

      {/* 2. CUSTOMER & QUOTATION DETAILS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 border-b-2 border-slate-900">
        {/* Left: Receiver Details */}
        <div className="p-2.5 sm:p-3.5 md:p-4 sm:border-r-2 sm:border-slate-900">
          <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-black border-b border-dashed border-slate-900 pb-1 mb-1.5 sm:mb-2">
            Receiver Details / Quotation To
          </div>
          <div className="font-bold text-xs sm:text-sm md:text-base text-black">
            {selectedQuotation.customer_name || 'Cash Customer'}
          </div>
          {selectedQuotation.customer_address && (
            <div className="text-[11px] sm:text-xs text-black mt-0.5">{selectedQuotation.customer_address}</div>
          )}
          {selectedQuotation.customer_phone && (
            <div className="text-[11px] sm:text-xs text-black mt-0.5"><strong>Phone:</strong> {selectedQuotation.customer_phone}</div>
          )}
          {selectedQuotation.customer_gstin && (
            <div className="text-[11px] sm:text-xs text-black mt-0.5"><strong>{localizeTaxText("GSTIN")}:</strong> {selectedQuotation.customer_gstin}</div>
          )}
          {selectedQuotation.customer_state && (
            <div className="text-[11px] sm:text-xs text-black mt-0.5"><strong>State:</strong> {selectedQuotation.customer_state}</div>
          )}
        </div>

        {/* Right: Quotation Information */}
        <div className="p-2.5 sm:p-3.5 md:p-4">
          <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-black border-b border-dashed border-slate-900 pb-1 mb-1.5 sm:mb-2">
            Quotation Information
          </div>
          <table className="w-full text-[11px] sm:text-xs">
            <tbody>
              <tr>
                <td className="font-bold text-black py-0.5 sm:py-1">Quotation No.:</td>
                <td className="text-right tabular-nums font-bold text-black py-0.5 sm:py-1 tracking-wide">{selectedQuotation.quotation_number}</td>
              </tr>
              <tr>
                <td className="font-bold text-black py-0.5 sm:py-1">Date:</td>
                <td className="text-right text-black py-0.5 sm:py-1">{formatDateLabel(selectedQuotation.created_at)}</td>
              </tr>
              <tr>
                <td className="font-bold text-black py-0.5 sm:py-1">Valid Until:</td>
                <td className="text-right text-black py-0.5 sm:py-1">15 Days from Issue Date</td>
              </tr>
              {previewGstEnabled && (
                <>
                  <tr>
                    <td className="font-bold text-black py-0.5 sm:py-1">Reverse Charge:</td>
                    <td className="text-right text-black py-0.5 sm:py-1">No</td>
                  </tr>
                  <tr>
                    <td className="font-bold text-black py-0.5 sm:py-1">Place of Supply:</td>
                    <td className="text-right text-black py-0.5 sm:py-1">{selectedQuotation.customer_state || shopState || 'Local'}</td>
                  </tr>
                </>
              )}
              {selectedQuotation.biller_name && (
                <tr>
                  <td className="font-bold text-black py-0.5 sm:py-1">Prepared By:</td>
                  <td className="text-right text-black py-0.5 sm:py-1">{selectedQuotation.biller_name}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. PRODUCT TABLE */}
      <div className="overflow-x-auto -mx-1 sm:mx-0">
        <table className="w-full border-collapse text-[10.5px] sm:text-xs">
          <thead>
            <tr className="bg-slate-100">
              <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center font-bold text-[9px] sm:text-[10px] uppercase w-8 sm:w-10">#</th>
              <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-left font-bold text-[9px] sm:text-[10px] uppercase min-w-[120px]">Description of Goods</th>
              {previewHasHsn && (
                <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center font-bold text-[9px] sm:text-[10px] uppercase w-16 sm:w-20">HSN/SAC</th>
              )}
              <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center font-bold text-[9px] sm:text-[10px] uppercase w-12 sm:w-16">Qty</th>
              <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center font-bold text-[9px] sm:text-[10px] uppercase w-12 sm:w-16">UOM</th>
              <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right font-bold text-[9px] sm:text-[10px] uppercase w-16 sm:w-20">Unit Price</th>
              {previewHasDiscounts && (
                <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right font-bold text-[9px] sm:text-[10px] uppercase w-14 sm:w-16">Disc.</th>
              )}
              {previewGstEnabled && (
                <>
                  <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right font-bold text-[9px] sm:text-[10px] uppercase w-16 sm:w-20">Taxable Val</th>
                  {isInterState ? (
                    <>
                      <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center font-bold text-[9px] sm:text-[10px] uppercase w-12 sm:w-14">IGST %</th>
                      <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right font-bold text-[9px] sm:text-[10px] uppercase w-14 sm:w-16">IGST Amt</th>
                    </>
                  ) : (
                    <>
                      <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center font-bold text-[9px] sm:text-[10px] uppercase w-12 sm:w-14">CGST %</th>
                      <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right font-bold text-[9px] sm:text-[10px] uppercase w-14 sm:w-16">CGST Amt</th>
                      <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center font-bold text-[9px] sm:text-[10px] uppercase w-12 sm:w-14">SGST %</th>
                      <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right font-bold text-[9px] sm:text-[10px] uppercase w-14 sm:w-16">SGST Amt</th>
                    </>
                  )}
                </>
              )}
              <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right font-bold text-[9px] sm:text-[10px] uppercase w-20 sm:w-24">Total</th>
            </tr>
          </thead>
          <tbody>
            {quotationItems.map((item, idx) => {
              const qty = Number(item.quantity) || 0;
              const rate = Number(item.rate) || 0;
              const lineTotal = Number(item.amount) || (rate * qty);
              const taxRate = Number(item.tax_rate_percent) || 0;
              const halfRate = taxRate / 2;
              const taxableVal = (item.taxable_amount != null && Number(item.taxable_amount) > 0)
                ? Number(item.taxable_amount)
                : (rate * qty > 0 ? (rate * qty) : lineTotal);
              const cgstAmt = item.cgst_amount != null ? Number(item.cgst_amount) : Math.round(taxableVal * (halfRate / 100) * 100) / 100;
              const sgstAmt = item.sgst_amount != null ? Number(item.sgst_amount) : Math.round(taxableVal * (halfRate / 100) * 100) / 100;
              const igstAmt = item.igst_amount != null ? Number(item.igst_amount) : Math.round(taxableVal * (taxRate / 100) * 100) / 100;

              return (
                <tr key={item.item_id || idx} className="hover:bg-slate-50">
                  <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center font-medium">{idx + 1}</td>
                  <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-left font-semibold text-black">{item.name}</td>
                  {previewHasHsn && (
                    <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center text-slate-700">{item.hsn_code || '-'}</td>
                  )}
                  <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center">{qty}</td>
                  <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center uppercase">{item.uom || (item.weight ? 'KG' : 'PCS')}</td>
                  <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right tabular-nums font-semibold">{formatCurrency(rate)}</td>
                  {previewHasDiscounts && (
                    <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right tabular-nums font-semibold">
                      {item.discount_percent ? `${item.discount_percent}%` : (item.discount_amount ? formatCurrency(item.discount_amount) : '-')}
                    </td>
                  )}
                  {previewGstEnabled && (
                    <>
                      <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right tabular-nums font-semibold">{formatCurrency(taxableVal)}</td>
                      {isInterState ? (
                        <>
                          <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center">{taxRate}%</td>
                          <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right tabular-nums font-semibold">{formatCurrency(igstAmt)}</td>
                        </>
                      ) : (
                        <>
                          <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center">{halfRate}%</td>
                          <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right tabular-nums font-semibold">{formatCurrency(cgstAmt)}</td>
                          <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center">{halfRate}%</td>
                          <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right tabular-nums font-semibold">{formatCurrency(sgstAmt)}</td>
                        </>
                      )}
                    </>
                  )}
                  <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right tabular-nums font-bold text-black">{formatCurrency(lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 4. TOTALS & SUMMARY SECTION */}
      <div className="grid grid-cols-1 sm:grid-cols-2 border-b-2 border-slate-900">
        {/* Words and Terms */}
        <div className="p-2.5 sm:p-3.5 md:p-4 sm:border-r-2 sm:border-slate-900 flex flex-col justify-between">
          <div>
            <div className="p-2 sm:p-2.5 md:p-3 bg-slate-50 border border-slate-900 rounded-md mb-2 sm:mb-3">
              <span className="text-[9px] sm:text-[10px] font-black uppercase text-black block mb-0.5">Amount Chargeable (in words)</span>
              <span className="text-xs sm:text-sm font-bold text-black block leading-snug">{previewAmountInWords} Only</span>
            </div>

            {selectedQuotation.terms_conditions && (
              <div className="pt-1">
                <span className="text-[9px] sm:text-[10px] font-black uppercase text-black block mb-1">Terms &amp; Conditions</span>
                <p className="text-[10px] sm:text-[11px] text-black whitespace-pre-line leading-relaxed">{selectedQuotation.terms_conditions}</p>
              </div>
            )}
          </div>
        </div>

        {/* Amount Summary Table */}
        <div className="p-0">
          <table className="w-full text-[11px] sm:text-xs">
            <tbody>
              <tr className="border-b border-slate-200">
                <td className="p-2 sm:p-2.5 font-bold text-black">Subtotal</td>
                <td className="p-2.5 text-right tabular-nums font-semibold text-black">{formatCurrency(selectedQuotation.subtotal)}</td>
              </tr>
              {selectedQuotation.discount_total != null && Number(selectedQuotation.discount_total) > 0 && (
                <tr className="border-b border-slate-200 text-red-600">
                  <td className="p-2 sm:p-2.5 font-bold">Discount Total</td>
                  <td className="p-2.5 text-right tabular-nums font-semibold">-{formatCurrency(selectedQuotation.discount_total)}</td>
                </tr>
              )}
              {previewGstEnabled && (
                <>
                  <tr className="border-b border-slate-200">
                    <td className="p-2 sm:p-2.5 font-bold text-black">Taxable Amount</td>
                    <td className="p-2.5 text-right tabular-nums font-semibold text-black">{formatCurrency(selectedQuotation.subtotal)}</td>
                  </tr>
                  {isInterState ? (
                    <tr className="border-b border-slate-200">
                      <td className="p-2 sm:p-2.5 font-bold text-black">Integrated Tax (IGST)</td>
                      <td className="p-2.5 text-right tabular-nums font-semibold text-black">{formatCurrency(selectedQuotation.tax_total)}</td>
                    </tr>
                  ) : (
                    <>
                      <tr className="border-b border-slate-200">
                        <td className="p-2 sm:p-2.5 font-bold text-black">Central Tax (CGST)</td>
                        <td className="p-2.5 text-right tabular-nums font-semibold text-black">{formatCurrency(selectedQuotation.tax_total / 2)}</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="p-2 sm:p-2.5 font-bold text-black">State Tax (SGST)</td>
                        <td className="p-2.5 text-right tabular-nums font-semibold text-black">{formatCurrency(selectedQuotation.tax_total / 2)}</td>
                      </tr>
                    </>
                  )}
                </>
              )}
              {selectedQuotation.round_off ? (
                <tr className="border-b border-slate-200">
                  <td className="p-2 sm:p-2.5 font-bold text-black">Round Off</td>
                  <td className="p-2.5 text-right tabular-nums font-semibold text-black">{formatCurrency(selectedQuotation.round_off)}</td>
                </tr>
              ) : null}
              <tr className="bg-slate-100 border-t-2 border-slate-900">
                <td className="p-2.5 sm:p-3 font-black text-xs sm:text-sm uppercase text-black">Grand Total</td>
                <td className="p-2.5 sm:p-3 text-right tabular-nums font-black text-sm sm:text-base md:text-lg text-black">{formatCurrency(previewGrandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. BANK ACCOUNT DETAILS & SIGNATURE (BOTTOM OF FINAL PAGE) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 pt-1.5 sm:pt-2">
        {/* Left: Bank Account Box */}
        <div className="p-2.5 sm:p-3.5 md:p-4 sm:border-r-2 sm:border-slate-900">
          <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-black border-b border-dashed border-slate-900 pb-1 mb-1.5 sm:mb-2">
            Bank Account Details
          </div>
          {hasConfiguredBank ? (
            <div className="space-y-1 text-[11px] sm:text-xs text-black">
              {bankName && <div><strong className="inline-block w-20 sm:w-24 text-black">Bank Name:</strong> {bankName}</div>}
              <div><strong className="inline-block w-20 sm:w-24 text-black">A/C Holder:</strong> {shopName || 'NAFID STORE'}</div>
              {bankAccount && <div><strong className="inline-block w-20 sm:w-24 text-black">Account No.:</strong> {bankAccount}</div>}
              {bankBranch && <div><strong className="inline-block w-20 sm:w-24 text-black">Branch:</strong> {bankBranch}</div>}
              {bankIfsc && <div><strong className="inline-block w-20 sm:w-24 text-black">IFSC Code:</strong> {bankIfsc}</div>}
              {upiId && <div><strong className="inline-block w-20 sm:w-24 text-black">UPI ID:</strong> {upiId}</div>}
            </div>
          ) : (
            <p className="text-[11px] sm:text-xs text-black italic">Please contact shop directly for wire transfer details.</p>
          )}
        </div>

        {/* Right: Authorized Signatory */}
        <div className="p-2.5 sm:p-3.5 md:p-4 flex flex-col justify-between items-end text-right min-h-[80px] sm:min-h-[90px]">
          <div className="text-[11px] sm:text-xs font-bold text-black">
            For <strong>{shopName || 'NAFID STORE'}</strong>
          </div>
          <div className="mt-8 sm:mt-12 md:mt-14 pt-2 border-t border-dashed border-slate-900 min-w-[130px] sm:min-w-[150px] text-center text-[10px] sm:text-xs font-bold text-black">
            Authorized Signatory
          </div>
        </div>
      </div>

      {/* Footer Note */}
      <p className="text-[9px] sm:text-[10px] text-black text-center pt-2 sm:pt-3 border-t border-slate-200 mt-2">
        This is a computer-generated quotation issued on {new Date().toLocaleDateString(getStoreLocale())}.
      </p>
    </div>
  );
}
