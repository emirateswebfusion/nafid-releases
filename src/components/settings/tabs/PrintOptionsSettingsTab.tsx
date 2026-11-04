import { isUaeStore, localizeTaxText } from '../../../utils/localization/storeProfile';
import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import React from 'react';
import { FileText, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import { FONT_OPTIONS } from '../settingsUtils';
import type { SettingsForm } from '../settingsFormTypes';
import { UaeArabicPrintSetting } from './UaeArabicPrintSetting';

export interface PrintOptionsSettingsTabProps {
  billSettings: SettingsForm['billSettings']; setBillSettings: SettingsForm['setBillSettings'];
  receiptFont: string; setReceiptFont: (v: string) => void;
  scrapBillSettings: SettingsForm['scrapBillSettings']; setScrapBillSettings: SettingsForm['setScrapBillSettings'];
  showProductOffers: boolean; setShowProductOffers: (v: boolean) => void;
}

/** Bill Content: what appears on printed bills (checklist, column order, T&C, declarations, scrap bills, font). */
export const PrintOptionsSettingsTab: React.FC<PrintOptionsSettingsTabProps> = ({
  billSettings, setBillSettings,
  receiptFont, setReceiptFont,
  scrapBillSettings, setScrapBillSettings,
  showProductOffers, setShowProductOffers,
}) => {
  return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {isUaeStore() && <UaeArabicPrintSetting />}
            {/* Card 1: General Bill Options & Checklist */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <FileText className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">Bill Printing Options &amp; Content Checklist</span>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setShowProductOffers(!showProductOffers)}>Show Pre-Set Catalog Offers on Bills</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">Controls whether original MRP is shown for pre-set product catalog offers &amp; discounts created in Product Master (e.g. MRP {getCurrencyPrefix()}100 → Offer Price {getCurrencyPrefix()}80).</p>
                  </div>
                  <button type="button" onClick={() => setShowProductOffers(!showProductOffers)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', showProductOffers ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', showProductOffers ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setBillSettings(s => ({ ...s, showDescription: s.showDescription === false ? true : false }))}>Show Bill Description / Remarks</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">When enabled, the Bill Description / Remarks box will appear on the billing page and printed receipts.</p>
                  </div>
                  <button type="button" onClick={() => setBillSettings(s => ({ ...s, showDescription: s.showDescription === false ? true : false }))} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', billSettings.showDescription !== false ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', billSettings.showDescription !== false ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setBillSettings(s => ({ ...s, showTransporterDetails: s.showTransporterDetails === false ? true : false }))}>Show Transporter &amp; E-Way Bill Details Section</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">When enabled, the Transporter &amp; E-Way Bill Details section will appear on printed invoices and preview.</p>
                  </div>
                  <button type="button" onClick={() => setBillSettings(s => ({ ...s, showTransporterDetails: s.showTransporterDetails === false ? true : false }))} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', billSettings.showTransporterDetails !== false ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', billSettings.showTransporterDetails !== false ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setBillSettings(s => ({ ...s, reverseCharge: !s.reverseCharge }))}>Tax Is Payable On Reverse Charge</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">{localizeTaxText("GST")}-based: When enabled, invoices will indicate tax is payable on reverse charge basis.</p>
                  </div>
                  <button type="button" onClick={() => setBillSettings(s => ({ ...s, reverseCharge: !s.reverseCharge }))} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', billSettings.reverseCharge ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', billSettings.reverseCharge ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setBillSettings(s => ({ ...s, quotationGstEnabled: s.quotationGstEnabled === false ? true : false }))}>Enable {localizeTaxText("GST")} in Quotations</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">{isUaeStore() ? 'When enabled, quotations display net amounts, VAT rates and VAT totals.' : 'When enabled, quotations display HSN/SAC, Taxable Value, CGST/SGST/IGST columns, and tax summary.'} When disabled, generates a clean Non-{localizeTaxText("GST")} quotation.</p>
                  </div>
                  <button type="button" onClick={() => setBillSettings(s => ({ ...s, quotationGstEnabled: s.quotationGstEnabled === false ? true : false }))} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', billSettings.quotationGstEnabled !== false ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', billSettings.quotationGstEnabled !== false ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <label className="text-xs font-bold text-foreground mb-1 block">Item Columns Order on Bill</label>
                  <p className="text-[10px] text-muted-foreground/75 mb-3">Choose column order for items in receipts and bills (Qty Rate vs Rate Qty).</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setBillSettings(s => ({ ...s, itemColumnOrder: 'qty_rate' }))}
                      className={clsx(
                        'flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer',
                        (billSettings.itemColumnOrder || 'qty_rate') === 'qty_rate'
                          ? 'bg-primary/10 border-primary text-primary font-semibold'
                          : 'bg-background border-border text-foreground hover:border-primary/30'
                      )}
                    >
                      <div className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center shrink-0">
                        {(billSettings.itemColumnOrder || 'qty_rate') === 'qty_rate' && <div className="w-2 h-2 rounded-full bg-current" />}
                      </div>
                      <div>
                        <div className="text-xs font-bold">Qty → Rate</div>
                        <div className="text-[10px] text-muted-foreground">Quantity first, then Rate</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillSettings(s => ({ ...s, itemColumnOrder: 'rate_qty' }))}
                      className={clsx(
                        'flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer',
                        billSettings.itemColumnOrder === 'rate_qty'
                          ? 'bg-primary/10 border-primary text-primary font-semibold'
                          : 'bg-background border-border text-foreground hover:border-primary/30'
                      )}
                    >
                      <div className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center shrink-0">
                        {billSettings.itemColumnOrder === 'rate_qty' && <div className="w-2 h-2 rounded-full bg-current" />}
                      </div>
                      <div>
                        <div className="text-xs font-bold">Rate → Qty</div>
                        <div className="text-[10px] text-muted-foreground">Rate first, then Quantity</div>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div>
                      <label className="text-xs font-bold text-foreground block">Bill Content Checklist</label>
                      <p className="text-[11px] text-muted-foreground/80 mt-0.5">Customize fields for {localizeTaxText("Bill of Supply")} &amp; Estimate bills</p>
                    </div>
                    <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 self-start sm:self-auto shrink-0">
                      Applies to {localizeTaxText("Bill of Supply")} &amp; Estimate Only
                    </span>
                  </div>

                  <div className="mb-3.5 p-3 bg-blue-500/[0.06] border border-blue-500/20 rounded-xl flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-blue-700 dark:text-blue-300 font-medium leading-relaxed">
                      Checklist customization applies only to <strong>{localizeTaxText("Bill of Supply")} &amp; Estimate</strong> bills. <strong>{localizeTaxText("GST")} Tax Invoices</strong> will always display all mandatory invoice details as required by {localizeTaxText("GST")} regulations.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                    {[
                      { key: 'showShopName', label: 'Shop Name' },
                      { key: 'showShopAddress', label: 'Shop Address' },
                      { key: 'showPhone', label: 'Phone Number' },
                      { key: 'showShopGstin', label: 'Shop GSTIN' },
                      { key: 'showShopState', label: 'Shop State' },
                      { key: 'showTitle', label: 'Document Title' },
                      { key: 'showBillerName', label: 'Biller Name' },
                      { key: 'showCustomerName', label: 'Customer Name' },
                      { key: 'showCustomerPhone', label: 'Customer Phone' },
                      { key: 'showCustomerAddress', label: 'Customer Address' },
                      { key: 'showCustomerGstin', label: 'Customer GSTIN' },
                      { key: 'showCustomerState', label: 'Customer State' },
                      { key: 'showDescription', label: 'Bill Description / Remarks' },
                      { key: 'showTransporterDetails', label: 'Transporter & E-Way Bill Details' },
                      { key: 'showBosTaxBreakup', label: 'Tax Breakup on Bill of Supply' },
                      { key: 'printFullName', label: 'Full Product Name' },
                      { key: 'showBrandName', label: 'Product Brand Name' },
                      { key: 'showWeightDetails', label: 'Weight & Per-Weight Rate (Weight Items)' },
                      { key: 'showPcsForWeightProducts', label: 'Show Weight Items in PCS (Pieces)' },
                      { key: 'showPcsUnit', label: 'Show "PCS" Suffix on Quantities' },
                      { key: 'showCreditBalance', label: 'Show Customer Balance / Credit Breakdown (Sales, Cash Received, Balance)' },
                      { key: 'showBarcodeOnReceipt', label: 'Invoice Barcode on Receipts' },
                      { key: 'showAuthorisedSignatory', label: 'Authorised Signatory' },
                      { key: 'showForShopName', label: 'For {shop name}' },
                    ].map(({ key, label }) => {
                      const isChecked = billSettings[key as keyof typeof billSettings] !== false;
                      return (
                        <label key={key} className="flex items-center gap-3 py-1.5 cursor-pointer group text-xs text-foreground font-medium select-none">
                          <button
                            type="button"
                            onClick={() => {
                              setBillSettings(s => ({ ...s, [key]: s[key as keyof typeof s] === false ? true : false }));
                            }}
                            className={clsx(
                              'w-4.5 h-4.5 rounded-lg border-2 flex items-center justify-center transition-all shrink-0',
                              isChecked ? 'bg-primary border-primary' : 'border-muted-foreground/30 group-hover:border-primary/50'
                            )}
                          >
                            {isChecked && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                          </button>
                          <span>{localizeTaxText(label)}</span>
                        </label>
                      );
                    })}
                  </div>

                  {!isUaeStore() && billSettings.showBosTaxBreakup && (
                    <div className="mt-4 pt-4 border-t border-border/40 space-y-4 animate-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-foreground shrink-0 font-bold">CGST/SGST Rate %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={billSettings.bosTaxRatePercent}
                          onChange={e => {
                            const v = parseFloat(e.target.value) || 0;
                            setBillSettings(s => ({ ...s, bosTaxRatePercent: Math.max(0, Math.min(100, v)) }));
                          }}
                          className="w-20 px-3 py-1.5 text-xs border border-border/80 rounded-xl bg-background text-foreground text-center font-mono font-bold"
                        />
                        <span className="text-[10px] text-muted-foreground/70">Split equally as CGST + SGST</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-foreground shrink-0 font-bold">Tax Type</label>
                        <div className="flex rounded-xl border border-border/80 overflow-hidden bg-background/50 shadow-inner">
                          <button
                            type="button"
                            onClick={() => setBillSettings(s => ({ ...s, bosTaxInclusive: false }))}
                            className={clsx(
                              'px-4 py-1.5 text-xs font-bold transition-all cursor-pointer',
                              !billSettings.bosTaxInclusive ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-transparent text-muted-foreground hover:text-foreground'
                            )}
                          >
                            Exclusive
                          </button>
                          <button
                            type="button"
                            onClick={() => setBillSettings(s => ({ ...s, bosTaxInclusive: true }))}
                            className={clsx(
                              'px-4 py-1.5 text-xs font-bold transition-all cursor-pointer',
                              billSettings.bosTaxInclusive ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-transparent text-muted-foreground hover:text-foreground'
                            )}
                          >
                            Inclusive
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border-t border-border/40 my-3.5 pt-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-card/60 border border-border/60 rounded-xl">
                      <div>
                        <span className="text-xs text-foreground font-bold flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-primary" />
                          Bill Document Title (Non-{localizeTaxText("GST")} / Regular Bill)
                        </span>
                        <p className="text-[10px] text-muted-foreground/75 mt-0.5">Choose whether regular bills display "BILL OF SUPPLY" or "ESTIMATE" as document title.</p>
                      </div>
                      <div className="flex rounded-xl border border-border/80 overflow-hidden bg-background/50 shadow-inner shrink-0">
                        <button
                          type="button"
                          onClick={() => setBillSettings(s => ({ ...s, nonGstBillTitle: 'BILL_OF_SUPPLY', estimateMode: false }))}
                          className={clsx(
                            'px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5',
                            (billSettings.nonGstBillTitle !== 'ESTIMATE' && !billSettings.estimateMode)
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'bg-transparent text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {(billSettings.nonGstBillTitle !== 'ESTIMATE' && !billSettings.estimateMode) && <CheckCircle2 className="w-3 h-3" />}
                          BILL OF SUPPLY
                        </button>
                        <button
                          type="button"
                          onClick={() => setBillSettings(s => ({ ...s, nonGstBillTitle: 'ESTIMATE', estimateMode: true }))}
                          className={clsx(
                            'px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5',
                            (billSettings.nonGstBillTitle === 'ESTIMATE' || billSettings.estimateMode)
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'bg-transparent text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {(billSettings.nonGstBillTitle === 'ESTIMATE' || billSettings.estimateMode) && <CheckCircle2 className="w-3 h-3" />}
                          ESTIMATE
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <label className="text-xs font-bold text-foreground mb-3 block">Bill Instructions (T&amp;C)</label>
                  <textarea
                    value={billSettings.instructions || ''}
                    onChange={e => setBillSettings(s => ({ ...s, instructions: e.target.value }))}
                    placeholder="e.g. 1. Goods once sold will not be taken back.&#10;2. Subject to local jurisdiction.&#10;3. E. &amp; O. E."
                    rows={4}
                    className="w-full bg-background border border-border/80 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all resize-none text-sm font-medium"
                  />
                  <p className="text-[10px] text-muted-foreground/70 mt-1.5">These instructions will appear at the bottom of thermal receipts, A5 estimates, and A4 invoices.</p>
                </div>

                <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <label className="text-xs font-bold text-foreground mb-1 block">Certification Statement / Declaration</label>
                  <p className="text-[10px] text-muted-foreground/75 mb-3">Appears at the bottom left of boxed {localizeTaxText("GST")} A4 invoices.</p>
                  <input
                    type="text"
                    value={billSettings.certificationText !== undefined ? billSettings.certificationText : 'Certified that the Particulars given above are true and correct'}
                    onChange={e => setBillSettings(s => ({ ...s, certificationText: e.target.value }))}
                    placeholder="Certified that the Particulars given above are true and correct"
                    className="w-full bg-background border border-border/80 rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm font-medium"
                  />
                </div>

                <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <label className="text-xs font-bold text-foreground mb-1 block">Electronic Reference Number (IRN / e-Invoice No)</label>
                  <p className="text-[10px] text-muted-foreground/75 mb-3">Optional e-invoice / electronic reference number printed on {localizeTaxText("GST")} invoices.</p>
                  <input
                    type="text"
                    value={billSettings.electronicRefNumber || ''}
                    onChange={e => setBillSettings(s => ({ ...s, electronicRefNumber: e.target.value }))}
                    placeholder="e.g. 4d1693f213284395b6aa536df37a9a5"
                    className="w-full bg-background border border-border/80 rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm font-medium"
                  />
                </div>

                <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <label className="text-xs font-bold text-foreground mb-1 block">Scrap Bill Item Columns Order</label>
                  <p className="text-[10px] text-muted-foreground/75 mb-3">Choose column order for items in scrap receipts and bills.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setScrapBillSettings(s => ({ ...s, itemColumnOrder: 'qty_rate' }))}
                      className={clsx(
                        'flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer',
                        (scrapBillSettings.itemColumnOrder || 'qty_rate') === 'qty_rate'
                          ? 'bg-primary/10 border-primary text-primary font-semibold'
                          : 'bg-background border-border text-foreground hover:border-primary/30'
                      )}
                    >
                      <div className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center shrink-0">
                        {(scrapBillSettings.itemColumnOrder || 'qty_rate') === 'qty_rate' && <div className="w-2 h-2 rounded-full bg-current" />}
                      </div>
                      <div>
                        <div className="text-xs font-bold">Qty → Rate</div>
                        <div className="text-[10px] text-muted-foreground">Quantity first, then Rate</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setScrapBillSettings(s => ({ ...s, itemColumnOrder: 'rate_qty' }))}
                      className={clsx(
                        'flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer',
                        scrapBillSettings.itemColumnOrder === 'rate_qty'
                          ? 'bg-primary/10 border-primary text-primary font-semibold'
                          : 'bg-background border-border text-foreground hover:border-primary/30'
                      )}
                    >
                      <div className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center shrink-0">
                        {scrapBillSettings.itemColumnOrder === 'rate_qty' && <div className="w-2 h-2 rounded-full bg-current" />}
                      </div>
                      <div>
                        <div className="text-xs font-bold">Rate → Qty</div>
                        <div className="text-[10px] text-muted-foreground">Rate first, then Quantity</div>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <label className="text-xs font-bold text-foreground mb-3 block">Scrap Bill Content</label>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                    {[
                      { key: 'showScrapHeading', label: 'Scrap Bill Heading' },
                      { key: 'showShopName', label: 'Shop Name' },
                      { key: 'showShopAddress', label: 'Shop Address' },
                      { key: 'showPhone', label: 'Phone Number' },
                      { key: 'showShopGstin', label: 'Shop GSTIN' },
                      { key: 'showTitle', label: 'Document Title' },
                      { key: 'showBillerName', label: 'Biller Name' },
                      { key: 'showCustomerName', label: 'Customer Name' },
                      { key: 'showCustomerPhone', label: 'Customer Phone' },
                      { key: 'showCustomerAddress', label: 'Customer Address' },
                      { key: 'showCustomerState', label: 'Customer State' },
                      { key: 'showBarcodeOnReceipt', label: 'Invoice Barcode on Receipts' },
                      { key: 'showAuthorisedSignatory', label: 'Authorised Signatory' },
                      { key: 'showForShopName', label: 'For {shop name}' },
                    ].map(({ key, label }) => {
                      const isChecked = scrapBillSettings[key as keyof typeof scrapBillSettings] !== false;
                      return (
                        <label key={key} className="flex items-center gap-3 cursor-pointer group text-xs text-foreground font-medium select-none">
                          <button
                            type="button"
                            onClick={() => setScrapBillSettings(s => ({ ...s, [key]: s[key as keyof typeof s] === false ? true : false }))}
                            className={clsx(
                              'w-4.5 h-4.5 rounded-lg border-2 flex items-center justify-center transition-all shrink-0',
                              isChecked ? 'bg-primary border-primary' : 'border-muted-foreground/30 group-hover:border-primary/50'
                            )}
                          >
                            {isChecked && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                          </button>
                          <span>{localizeTaxText(label)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-3 block">Bill / Receipt Font</label>
                  <div className="flex flex-wrap gap-2.5">
                    {FONT_OPTIONS.map(f => (
                      <button
                        type="button"
                        key={f.id}
                        onClick={() => setReceiptFont(f.id)}
                        className={clsx(
                          'px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer border',
                          receiptFont === f.id
                            ? 'bg-primary text-primary-foreground shadow-md shadow-primary/10 border-transparent scale-100 font-extrabold'
                            : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground border-border/60'
                        )}
                        style={{ fontFamily: receiptFont === f.id ? f.family : undefined }}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 mt-2.5">Font used when printing receipts &amp; bills.</p>
                </div>

                <div className="p-4 bg-amber-500/[0.04] border border-amber-500/20 rounded-2xl flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium leading-relaxed">
                    Changes apply only to new invoices. Previously generated invoices remain unaffected.
                  </p>
                </div>
              </div>
            </div>
          </div>
  );
};
