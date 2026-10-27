import { useFeatureFlagsStore } from '../../../config/featureFlags';
import React from 'react';
import { FileText, Shield, AlertCircle, Info, CheckCircle2, Tags } from 'lucide-react';
import clsx from 'clsx';
import { FONT_OPTIONS } from '../settingsUtils';
import { useBillingUIStore } from '../../../store/billingUIStore';
import { CODE_TYPES } from '../../../config/labelCodeTypes';
import { CashRegisterSettings } from './CashRegisterSettings';
import { CashDrawerAutoCloseSettings } from './CashDrawerAutoCloseSettings';
import type { SettingsForm } from '../settingsFormTypes';

export interface PrintOptionsSettingsTabProps {
  autoOpenCashDrawer: boolean; setAutoOpenCashDrawer: (v: boolean) => void;
  autoCloseCashDrawer: boolean; setAutoCloseCashDrawer: (v: boolean) => void;
  autoCloseCashDrawerTime: string; setAutoCloseCashDrawerTime: (v: string) => void;
  autoPrintBarcode: boolean; setAutoPrintBarcode: (v: boolean) => void;
  billSettings: SettingsForm['billSettings']; setBillSettings: SettingsForm['setBillSettings'];
  billingUIConfig: SettingsForm['billingUIConfig']; setBillingUIConfig: SettingsForm['setBillingUIConfig'];
  defaultOpeningBalance: SettingsForm['defaultOpeningBalance']; setDefaultOpeningBalance: SettingsForm['setDefaultOpeningBalance'];
  enableConvertToGst: boolean; setEnableConvertToGst: (v: boolean) => void;
  labelCodeType: SettingsForm['labelCodeType']; setLabelCodeType: SettingsForm['setLabelCodeType'];
  labelShowShopName: boolean; setLabelShowShopName: (v: boolean) => void;
  openCashDrawerOnPending: boolean; setOpenCashDrawerOnPending: (v: boolean) => void;
  receiptFont: string; setReceiptFont: (v: string) => void;
  scrapBillSettings: SettingsForm['scrapBillSettings']; setScrapBillSettings: SettingsForm['setScrapBillSettings'];
  showFullyPaidCashInLedger: boolean; setShowFullyPaidCashInLedger: (v: boolean) => void;
  showPriceOverrideMrp: boolean; setShowPriceOverrideMrp: (v: boolean) => void;
  showProductOffers: boolean; setShowProductOffers: (v: boolean) => void;
  loyaltyEnabled: boolean; setLoyaltyEnabled: (v: boolean) => void;
  loyaltyEarningRate: number | string; setLoyaltyEarningRate: SettingsForm['setLoyaltyEarningRate'];
  loyaltyRedemptionRate: number | string; setLoyaltyRedemptionRate: SettingsForm['setLoyaltyRedemptionRate'];
  loyaltyAwardOnPending: boolean; setLoyaltyAwardOnPending: (v: boolean) => void;
  enableScrap: boolean; setEnableScrap: (v: boolean) => void;
  previewFormat: SettingsForm['previewFormat']; setPreviewFormat: SettingsForm['setPreviewFormat'];
  previewStyle: SettingsForm['previewStyle']; setPreviewStyle: SettingsForm['setPreviewStyle'];
}

export const PrintOptionsSettingsTab: React.FC<PrintOptionsSettingsTabProps> = ({
  autoOpenCashDrawer, setAutoOpenCashDrawer,
  autoCloseCashDrawer, setAutoCloseCashDrawer,
  autoCloseCashDrawerTime, setAutoCloseCashDrawerTime,
  autoPrintBarcode, setAutoPrintBarcode,
  billSettings, setBillSettings,
  billingUIConfig, setBillingUIConfig,
  defaultOpeningBalance, setDefaultOpeningBalance,
  enableConvertToGst, setEnableConvertToGst,
  labelCodeType, setLabelCodeType,
  labelShowShopName, setLabelShowShopName,
  openCashDrawerOnPending, setOpenCashDrawerOnPending,
  receiptFont, setReceiptFont,
  scrapBillSettings, setScrapBillSettings,
  showFullyPaidCashInLedger, setShowFullyPaidCashInLedger,
  showPriceOverrideMrp, setShowPriceOverrideMrp,
  showProductOffers, setShowProductOffers,
}) => {
  const { flags: featureFlags } = useFeatureFlagsStore();
  return (
          <div className="space-y-6 animate-in fade-in duration-300">
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
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setAutoPrintBarcode(!autoPrintBarcode)}>Auto Print Barcode for New Products</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">When a new product is created from the Billing page, automatically print its barcode label.</p>
                  </div>
                  <button type="button" onClick={() => setAutoPrintBarcode(!autoPrintBarcode)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', autoPrintBarcode ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', autoPrintBarcode ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setShowProductOffers(!showProductOffers)}>Show Pre-Set Catalog Offers on Bills</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">Controls whether original MRP is shown for pre-set product catalog offers &amp; discounts created in Product Master (e.g. MRP ₹100 → Offer Price ₹80).</p>
                  </div>
                  <button type="button" onClick={() => setShowProductOffers(!showProductOffers)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', showProductOffers ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', showProductOffers ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setShowPriceOverrideMrp(!showPriceOverrideMrp)}>Show Old MRP on Price Overrides (Billing Page)</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">Controls whether original MRP is shown when unit price is manually overridden or discounted directly on the Billing checkout page (e.g. MRP ₹100 → Overridden ₹80).</p>
                  </div>
                  <button type="button" onClick={() => setShowPriceOverrideMrp(!showPriceOverrideMrp)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', showPriceOverrideMrp ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', showPriceOverrideMrp ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => {
                      const newVal = !billingUIConfig.showPurchasePriceInPOS;
                      const updated = { ...billingUIConfig, showPurchasePriceInPOS: newVal };
                      setBillingUIConfig(updated);
                      useBillingUIStore.getState().updateConfig(updated);
                    }}>Show Product Purchase Cost in Price Override Menu (View-Only)</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">When enabled, the product's cost/purchase price is shown in the Price Override &amp; Tier dropdown on POS for reference (View Only, non-selectable).</p>
                  </div>
                  <button type="button" onClick={() => {
                    const newVal = !billingUIConfig.showPurchasePriceInPOS;
                    const updated = { ...billingUIConfig, showPurchasePriceInPOS: newVal };
                    setBillingUIConfig(updated);
                    useBillingUIStore.getState().updateConfig(updated);
                  }} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', billingUIConfig.showPurchasePriceInPOS ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', billingUIConfig.showPurchasePriceInPOS ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setOpenCashDrawerOnPending(!openCashDrawerOnPending)}>Open Cash Drawer on Pending Payment</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">When billing with Pending payment method, automatically open the cash drawer after printing.</p>
                  </div>
                  <button type="button" onClick={() => setOpenCashDrawerOnPending(!openCashDrawerOnPending)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', openCashDrawerOnPending ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', openCashDrawerOnPending ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setAutoOpenCashDrawer(!autoOpenCashDrawer)}>Auto Open Cash Drawer</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">Automatically open the cash register drawer session with a default balance on session start.</p>
                  </div>
                  <button type="button" onClick={() => setAutoOpenCashDrawer(!autoOpenCashDrawer)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', autoOpenCashDrawer ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', autoOpenCashDrawer ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <CashRegisterSettings />
                <CashDrawerAutoCloseSettings
                  autoCloseEnabled={autoCloseCashDrawer}
                  setAutoCloseEnabled={setAutoCloseCashDrawer}
                  autoCloseTime={autoCloseCashDrawerTime}
                  setAutoCloseTime={setAutoCloseCashDrawerTime}
                />

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none">Show Fully Paid Cash Transactions in Party Ledger</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">When enabled, sales where the customer pays the full bill amount in cash will appear in the party ledger as a sale and payment entry (net zero effect on balance). When disabled, such transactions are hidden from the party ledger.</p>
                  </div>
                  <button type="button" onClick={() => setShowFullyPaidCashInLedger(!showFullyPaidCashInLedger)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', showFullyPaidCashInLedger ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', showFullyPaidCashInLedger ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                {autoOpenCashDrawer && (
                <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                    <label className="text-xs font-bold text-foreground mb-1 block">Default Opening Amount (₹)</label>
                    <p className="text-[10px] text-muted-foreground/75 mb-2.5">Set a default cash amount to start the drawer with. If empty or cleared, opening balance will be 0 (starts from 0).</p>
                    <div className="relative max-w-xs">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0"
                        value={defaultOpeningBalance}
                        onChange={(e) => setDefaultOpeningBalance(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 bg-background border border-border rounded-xl text-xs font-bold text-foreground focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>
                  </div>
                )}

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
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">GST-based: When enabled, invoices will indicate tax is payable on reverse charge basis.</p>
                  </div>
                  <button type="button" onClick={() => setBillSettings(s => ({ ...s, reverseCharge: !s.reverseCharge }))} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', billSettings.reverseCharge ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', billSettings.reverseCharge ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setBillSettings(s => ({ ...s, quotationGstEnabled: s.quotationGstEnabled === false ? true : false }))}>Enable GST in Quotations</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">When enabled, quotations display HSN/SAC, Taxable Value, CGST/SGST/IGST columns, and tax summary. When disabled, generates a clean Non-GST quotation.</p>
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
                      <p className="text-[11px] text-muted-foreground/80 mt-0.5">Customize fields for Bill of Supply &amp; Estimate bills</p>
                    </div>
                    <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 self-start sm:self-auto shrink-0">
                      Applies to Bill of Supply &amp; Estimate Only
                    </span>
                  </div>

                  <div className="mb-3.5 p-3 bg-blue-500/[0.06] border border-blue-500/20 rounded-xl flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-blue-700 dark:text-blue-300 font-medium leading-relaxed">
                      Checklist customization applies only to <strong>Bill of Supply &amp; Estimate</strong> bills. <strong>GST Tax Invoices</strong> will always display all mandatory invoice details as required by GST regulations.
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
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>

                  {billSettings.showBosTaxBreakup && (
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
                          Bill Document Title (Non-GST / Regular Bill)
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
                  <p className="text-[10px] text-muted-foreground/75 mb-3">Appears at the bottom left of boxed GST A4 invoices.</p>
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
                  <p className="text-[10px] text-muted-foreground/75 mb-3">Optional e-invoice / electronic reference number printed on GST invoices.</p>
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
                          <span>{label}</span>
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

            {/* Card 2: Label Format */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-purple-500/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-600 shadow-[0_4px_12px_rgba(168,85,247,0.1)] shrink-0">
                  <Tags className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-purple-600 uppercase tracking-widest">Product Label Codes</span>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-3 block">Default Code Type</label>
                  <div className="grid grid-cols-2 gap-4">
                    {CODE_TYPES.map((ct) => (
                      <button
                        type="button"
                        key={ct.id}
                        onClick={() => setLabelCodeType(ct.id)}
                        className={clsx(
                          "relative flex items-center gap-3.5 p-4.5 rounded-2xl border-2 transition-all duration-300 cursor-pointer text-left",
                          labelCodeType === ct.id
                            ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/10"
                            : "border-border/80 hover:border-primary/35 hover:bg-muted/20"
                        )}
                      >
                        <div className={clsx(
                          "p-2.5 rounded-xl shrink-0",
                          labelCodeType === ct.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          {ct.id === 'barcode' ? (
                            <svg className="w-5 h-5 text-current" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 4h2v16H2zM6 4h1v16H6zM9 4h2v16H9zM13 4h1v16h-1zM16 4h2v16h-2zM20 4h2v16h-2z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 text-current" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              {[7,9,11,13,15].map(x => (
                                <g key={x}>
                                  <rect x={x} y="7" width="1" height="2" fill="currentColor" />
                                  <rect x={x} y="11" width="1" height="2" fill="currentColor" />
                                  <rect x={x} y="15" width="1" height="2" fill="currentColor" />
                                </g>
                              ))}
                              <rect x="17" y="7" width="1" height="10" fill="currentColor" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{ct.label}</p>
                          <p className="text-xs text-muted-foreground/75 truncate mt-0.5">{ct.description}</p>
                        </div>
                        {labelCodeType === ct.id && (
                          <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/20">
                            <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setLabelShowShopName(!labelShowShopName)}>Show Shop Name on Labels</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">Print the shop name at the top of product barcode and QR labels.</p>
                  </div>
                  <button type="button" onClick={() => setLabelShowShopName(!labelShowShopName)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', labelShowShopName ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', labelShowShopName ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="p-4 bg-blue-500/[0.04] border border-blue-500/20 rounded-2xl flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 dark:text-blue-400 font-medium leading-relaxed">
                    The selected code type will be used as the default for generating, previewing, and printing product labels. Existing labels remain unaffected.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 3: Billing Security & Actions */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <Shield className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">Billing Security &amp; Actions</span>
              </div>

              <div className="space-y-3.5">
                {/* Convert to GST Toggle */}
                <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border bg-muted/20 border-border/60">
                  <div className="flex-1 min-w-0">
                    <label className="text-xs font-bold text-foreground block">Convert to GST in Sales History</label>
                    <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-relaxed">
                      Show "Convert to GST" button in Sales History to convert Bill of Supply invoices to GST invoices.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableConvertToGst(!enableConvertToGst)}
                    className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', enableConvertToGst ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}
                    title={enableConvertToGst ? 'Enabled' : 'Disabled'}
                  >
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', enableConvertToGst ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                {/* Biller PIN Protection Toggle */}
                <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border bg-muted/20 border-border/60">
                  <div className="flex-1 min-w-0">
                    <label className="text-xs font-bold text-foreground block">Biller PIN Protection</label>
                    <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-relaxed">Require security PIN before switching biller or completing billing actions</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { const v = !featureFlags?.biller_pin; useFeatureFlagsStore.getState().setFlag('biller_pin', v); }}
                    className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', featureFlags?.biller_pin ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}
                    title={featureFlags?.biller_pin ? 'Enabled' : 'Disabled'}
                  >
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', featureFlags?.biller_pin ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                {/* Sales Staff Tracking Toggle */}
                <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border bg-muted/20 border-border/60">
                  <div className="flex-1 min-w-0">
                    <label className="text-xs font-bold text-foreground block">Sales Staff Tracking</label>
                    <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-relaxed">Track sales staff per invoice for performance and commission reporting</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { const v = !featureFlags?.sales_staff; useFeatureFlagsStore.getState().setFlag('sales_staff', v); }}
                    className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', featureFlags?.sales_staff ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}
                    title={featureFlags?.sales_staff ? 'Enabled' : 'Disabled'}
                  >
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', featureFlags?.sales_staff ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                {/* Staff Credit Billing & Ledger Toggle */}
                <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border bg-muted/20 border-border/60">
                  <div className="flex-1 min-w-0">
                    <label className="text-xs font-bold text-foreground block">Show Staff in Customer Search & Credit Ledger</label>
                    <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-relaxed">
                      Show staff in billing customer search. Credit sales to staff automatically update their staff ledger without creating duplicate customer parties.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { const v = !featureFlags?.staff_credit_billing; useFeatureFlagsStore.getState().setFlag('staff_credit_billing', v); }}
                    className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', featureFlags?.staff_credit_billing ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}
                    title={featureFlags?.staff_credit_billing ? 'Enabled' : 'Disabled'}
                  >
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', featureFlags?.staff_credit_billing ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>
              </div>
            </div>
          </div>
  );
};
