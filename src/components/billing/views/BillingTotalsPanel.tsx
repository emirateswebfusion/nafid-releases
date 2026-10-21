import React from 'react';
import clsx from 'clsx';
import { ArrowLeftRight, CheckCircle2, Coins, CreditCard, FileText, Gift, Percent, Recycle, Save, X } from 'lucide-react';
import { Skeleton } from '../../ui/Skeleton';
import { WhatsAppIcon } from '../../ui/WhatsAppIcon';
import { useCartStore } from '../../../store/cartStore';
import { useTabStore } from '../../../store/tabStore';
import { formatCurrency } from '../BillingConstants';
import type { BillingUIConfig } from '../../../store/billingUIStore';

export interface BillingTotalsPanelProps {
  uiConfig: BillingUIConfig;
  activeDiscField: any;
  activeTab: any;
  actualRefundPaid: number;
  cgst: number;
  checkoutBtnRef: React.MutableRefObject<any>;
  commitTotalOverride: any;
  customerName: any;
  customerPhone: any;
  customerPointsBalance: any;
  descriptionInputRef: React.MutableRefObject<any>;
  discount: number;
  discountPercentRef: React.MutableRefObject<any>;
  discountRef: React.MutableRefObject<any>;
  displayGrandTotal: number;
  effectiveDeductionMode: any;
  enableScrap: boolean;
  extraBonus: number;
  findMatchingParty: any;
  focusDescriptionOrDiscount: any;
  getNumericPart: any;
  grandTotal: number;
  handleCheckout: any;
  handleHoldBill: any;
  handleProcessReturnFromCart: any;
  handleResetGrandTotalOverride: any;
  handleSaveQuotation: any;
  handleWhatsAppSendActiveBill: any;
  igst: number;
  isCheckingOut: boolean;
  isEditingTotal: boolean;
  isGrandTotalOverridden: boolean;
  isLoadingEditBill: boolean;
  isLoyaltyModuleEnabled: boolean;
  isQuotationActive: boolean;
  isReturnModuleEnabled: boolean;
  isScrapModuleEnabled: boolean;
  isSendingWhatsApp: boolean;
  localDiscText: any;
  originalReturnTotal: number;
  overrideTotalInput: any;
  paymentMethod: any;
  paymentOptionRefs: any;
  pointsDeductionInputRef: React.MutableRefObject<any>;
  pointsRedeemedCalc: number;
  pointsRedeemedDiscountCalc: number;
  pointsToRedeem: number;
  qtyRefs: any;
  quotationSaving: boolean;
  rawDisplayGrandTotal: number;
  receivedAmount: number;
  receivedInputRef: React.MutableRefObject<any>;
  refundAmount: number;
  returnDeductionInputRef: React.MutableRefObject<any>;
  returnDeductionSearchQuery: any;
  returnDiscountTotal: number;
  returnProcessed: boolean;
  returnProcessing: boolean;
  returnTotal: number;
  scrapDeductionInputRef: React.MutableRefObject<any>;
  scrapDeductionSearchQuery: any;
  scrapTotal: number;
  searchRef: React.MutableRefObject<any>;
  setActiveDiscField: (v: any) => void;
  setDeductionTabMode: (v: any) => void;
  setHardwareError: (v: any) => void;
  setIsEditingTotal: (v: any) => void;
  setLocalDiscText: (v: any) => void;
  setOverrideTotalInput: (v: any) => void;
  setPointsToRedeem: (v: any) => void;
  setReturnDeductionDropdownStyle: (v: any) => void;
  setReturnDeductionResults: (v: any) => void;
  setReturnDeductionSearchMode: (v: any) => void;
  setReturnDeductionSearchQuery: (v: any) => void;
  setScrapDeductionDropdownStyle: (v: any) => void;
  setScrapDeductionResults: (v: any) => void;
  setScrapDeductionSearchQuery: (v: any) => void;
  setShowLoyaltyRedemption: (v: any) => void;
  sgst: number;
  showDescriptionState: boolean;
  splitDetails: any;
  splitTotal: number;
  startEditingTotal: any;
  subtotal: number;
  tenantId: any;
  totalKgs: number;
  totalOverrideInputRef: React.MutableRefObject<any>;
  totalPcs: number;
  totalProducts: number;
  totalTax: number;
}

export const BillingTotalsPanel: React.FC<BillingTotalsPanelProps> = ({
  uiConfig,
  activeDiscField,
  activeTab,
  actualRefundPaid,
  cgst,
  checkoutBtnRef,
  commitTotalOverride,
  customerName,
  customerPhone,
  customerPointsBalance,
  descriptionInputRef,
  discount,
  discountPercentRef,
  discountRef,
  displayGrandTotal,
  effectiveDeductionMode,
  enableScrap,
  extraBonus,
  findMatchingParty,
  focusDescriptionOrDiscount,
  getNumericPart,
  grandTotal,
  handleCheckout,
  handleHoldBill,
  handleProcessReturnFromCart,
  handleResetGrandTotalOverride,
  handleSaveQuotation,
  handleWhatsAppSendActiveBill,
  igst,
  isCheckingOut,
  isEditingTotal,
  isGrandTotalOverridden,
  isLoadingEditBill,
  isLoyaltyModuleEnabled,
  isQuotationActive,
  isReturnModuleEnabled,
  isScrapModuleEnabled,
  isSendingWhatsApp,
  localDiscText,
  originalReturnTotal,
  overrideTotalInput,
  paymentMethod,
  paymentOptionRefs,
  pointsDeductionInputRef,
  pointsRedeemedCalc,
  pointsRedeemedDiscountCalc,
  pointsToRedeem,
  qtyRefs,
  quotationSaving,
  rawDisplayGrandTotal,
  receivedAmount,
  receivedInputRef,
  refundAmount,
  returnDeductionInputRef,
  returnDeductionSearchQuery,
  returnDiscountTotal,
  returnProcessed,
  returnProcessing,
  returnTotal,
  scrapDeductionInputRef,
  scrapDeductionSearchQuery,
  scrapTotal,
  searchRef,
  setActiveDiscField,
  setDeductionTabMode,
  setHardwareError,
  setIsEditingTotal,
  setLocalDiscText,
  setOverrideTotalInput,
  setPointsToRedeem,
  setReturnDeductionDropdownStyle,
  setReturnDeductionResults,
  setReturnDeductionSearchMode,
  setReturnDeductionSearchQuery,
  setScrapDeductionDropdownStyle,
  setScrapDeductionResults,
  setScrapDeductionSearchQuery,
  setShowLoyaltyRedemption,
  sgst,
  showDescriptionState,
  splitDetails,
  splitTotal,
  startEditingTotal,
  subtotal,
  tenantId,
  totalKgs,
  totalOverrideInputRef,
  totalPcs,
  totalProducts,
  totalTax,
}) => {
  const items = useCartStore(s => s.items);
  const clearReturnDeduction = useCartStore(s => s.clearReturnDeduction);
  const clearScrapDeduction = useCartStore(s => s.clearScrapDeduction);
  const discountType = useCartStore(s => s.discountType);
  const discountValue = useCartStore(s => s.discountValue);
  const editingActive = useCartStore(s => s.editingInvoiceId);
  const editingQuotationId = useCartStore(s => s.editingQuotationId);
  const invoiceType = useCartStore(s => s.invoiceType);
  const isQuotationMode = useCartStore(s => s.isQuotationMode);
  const isReturnMode = useCartStore(s => s.isReturnMode);
  const isScrapMode = useCartStore(s => s.isScrapMode);
  const setDiscount = useCartStore(s => s.setDiscount);
  const setReturnDeduction = useCartStore(s => s.setReturnDeduction);
  const setScrapDeduction = useCartStore(s => s.setScrapDeduction);
  const storeReturnDeduction = useCartStore(s => s.returnDeduction);
  const storeReturnInvoiceNumber = useCartStore(s => s.returnInvoiceNumber);
  const storeScrapDeduction = useCartStore(s => s.scrapDeduction);
  const storeScrapInvoiceNumber = useCartStore(s => s.scrapInvoiceNumber);
  const updateActiveTab = useTabStore(s => s.updateActiveTab);

  return (
      <div className={clsx(
        uiConfig.orientation === 'horizontal-stack'
          ? "w-1/2 h-full overflow-y-auto flex flex-col justify-between bg-card px-5 py-3 shrink-0 border-l border-border"
          : "shrink-0 border-t border-border bg-background"
      )}>

        {/* Calculation breakdown */}
        <div className="px-5 pt-2.5 pb-0 space-y-1.5 text-xs border-b border-border">
          <div className="flex justify-between items-center pb-1 border-b border-border/40 text-muted-foreground transition-all duration-300">
            <span className="font-bold text-xs text-muted-foreground">Items Summary</span>
            <span className="font-extrabold text-xs text-foreground flex items-center gap-1.5">
              <span className={clsx(items.length === 0 && 'text-muted-foreground/60')}>{totalProducts} {totalProducts === 1 ? 'Product' : 'Products'}</span>
              <span className={clsx(items.length === 0 && 'text-muted-foreground/40')}>&middot;</span>
              <span className={clsx(items.length === 0 && 'text-muted-foreground/60')}>{totalPcs} Pcs</span>
              {totalKgs > 0 && (
                <>
                  <span>&middot;</span>
                  <span className="text-amber-600 dark:text-amber-400">{totalKgs.toFixed(3)} Kg</span>
                </>
              )}
            </span>
          </div>

          {isReturnMode && returnDiscountTotal > 0.005 ? (
            <>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-semibold">Original Items Total</span>
                <span className="font-semibold text-muted-foreground line-through font-mono">{formatCurrency(originalReturnTotal)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-rose-600 dark:text-rose-400 font-semibold">Invoice Discount Deducted</span>
                <span className="font-semibold text-rose-600 dark:text-rose-400 font-mono">-{formatCurrency(returnDiscountTotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-semibold text-sm">Net Return Subtotal</span>
                <span className="font-bold text-foreground text-sm font-mono">{formatCurrency(returnTotal)}</span>
              </div>
            </>
          ) : (!isScrapMode ? subtotal > 0 : scrapTotal > 0) && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-semibold text-sm">Items Subtotal</span>
              <span className="font-bold text-foreground text-sm">{formatCurrency(isScrapMode ? scrapTotal : subtotal)}</span>
            </div>
          )}

          {invoiceType === 'GST' && totalTax > 0 && (
            <>
              {igst > 0 ? (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-sm">IGST (Out of State)</span>
                  <span className="font-semibold text-foreground/80 text-sm">{formatCurrency(igst)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">CGST</span>
                    <span className="font-semibold text-foreground/80 text-sm">{formatCurrency(cgst)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">SGST</span>
                    <span className="font-semibold text-foreground/80 text-sm">{formatCurrency(sgst)}</span>
                  </div>
                </>
              )}
            </>
          )}

          {/* Discount row / Extra Bonus — hidden in return mode */}
          <div className={clsx('overflow-hidden transition-all duration-300 ease-in-out', isReturnMode ? 'max-h-0 opacity-0' : 'max-h-[60px] opacity-100')}>
          <div className="flex items-center justify-between pt-1 border-t border-border/30">
            <div className="flex items-center gap-1.5">
              {isScrapMode ? (
                <>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-sm flex items-center gap-1">
                    <span className="text-[10px] px-1 py-0.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded font-bold leading-none">+</span>
                    Extra / Bonus
                  </span>
                  <span className="inline-flex items-center justify-center min-w-[20px] h-4.5 px-1.5 text-[9px] font-black rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 leading-none shadow-xs">F8</span>
                  {extraBonus > 0 && (
                    <span className="text-xs font-black text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">+{formatCurrency(extraBonus)}</span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-muted-foreground font-semibold text-sm">Discount</span>
                  <span className="inline-flex items-center justify-center min-w-[20px] h-4.5 px-1.5 text-[9px] font-black rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 leading-none shadow-xs">F8</span>
                  {discount > 0 && (
                    <span className="text-xs font-black text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">-{formatCurrency(discount)}</span>
                  )}
                </>
              )}
            </div>
            {/* Merged 2-Column Discount Input (Percentage % | Flat Amount ₹) */}
            {(() => {
              const discBase = isScrapMode ? scrapTotal : subtotal;

              let pctVal = '';
              let flatVal = '';

              if (activeDiscField === 'PCT') {
                pctVal = localDiscText;
                const p = parseFloat(localDiscText);
                if (discBase > 0 && !isNaN(p) && p > 0) {
                  flatVal = String(+((discBase * p) / 100).toFixed(2));
                }
              } else if (activeDiscField === 'FLAT') {
                flatVal = localDiscText;
                const f = parseFloat(localDiscText);
                if (discBase > 0 && !isNaN(f) && f > 0) {
                  pctVal = String(+((f / discBase) * 100).toFixed(2));
                }
              } else {
                if (discountType === 'PERCENTAGE') {
                  pctVal = discountValue > 0 ? String(discountValue) : '';
                  flatVal = discBase > 0 && discountValue > 0 ? String(+((discBase * discountValue) / 100).toFixed(2)) : '';
                } else {
                  flatVal = discountValue > 0 ? String(discountValue) : '';
                  pctVal = discBase > 0 && discountValue > 0 ? String(+((discountValue / discBase) * 100).toFixed(2)) : '';
                }
              }

              if (pctVal === '0' || pctVal === '0.00' || pctVal === '0.0') pctVal = '';
              if (flatVal === '0' || flatVal === '0.00' || flatVal === '0.0') flatVal = '';

              const commonKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, isPct: boolean) => {
                if (e.key === 'Delete' || e.key === 'Backspace') {
                  const input = e.target as HTMLInputElement;
                  if (input.selectionStart === 0 && input.selectionEnd === input.value.length) {
                    setDiscount(0, discountType);
                    setActiveDiscField(null);
                    setLocalDiscText('');
                  }
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCheckout();
                } else if (e.key === 'ArrowRight' && isPct) {
                  e.preventDefault();
                  discountRef.current?.focus();
                  discountRef.current?.select();
                } else if (e.key === 'ArrowLeft' && !isPct) {
                  e.preventDefault();
                  discountPercentRef.current?.focus();
                  discountPercentRef.current?.select();
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (paymentMethod === 'CASH' || paymentMethod === 'CREDIT') {
                    receivedInputRef.current?.focus();
                    receivedInputRef.current?.select();
                  } else {
                    paymentOptionRefs.current[paymentMethod]?.focus();
                  }
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (showDescriptionState && descriptionInputRef.current) {
                    descriptionInputRef.current.focus();
                    descriptionInputRef.current.select();
                  } else if (items.length > 0) {
                    const lastItem = items[items.length - 1];
                    qtyRefs.current[lastItem.product_id]?.focus();
                    qtyRefs.current[lastItem.product_id]?.select();
                  } else {
                    searchRef.current?.focus();
                    searchRef.current?.select();
                  }
                }
              };

              return (
                <div className={clsx(
                  "flex items-center border rounded-xl overflow-hidden shadow-xs transition-all",
                  isScrapMode
                    ? "bg-emerald-500/10 border-emerald-500/30 focus-within:border-emerald-500/60"
                    : "bg-muted/30 border-border/70 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15"
                )}>
                  {/* Percentage Input Column */}
                  <div className="flex items-center px-2 py-0.5 gap-1">
                    <Percent className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0 pointer-events-none" />
                    <input
                      ref={discountPercentRef}
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      inputMode="decimal"
                      value={pctVal}
                      onChange={e => {
                        const raw = e.target.value;
                        setActiveDiscField('PCT');
                        setLocalDiscText(raw);
                        if (activeTab?.manualTotalOverride) updateActiveTab({ manualTotalOverride: null });
                        if (raw === '' || raw === null || parseFloat(raw) === 0) {
                          setDiscount(0, 'PERCENTAGE');
                        } else {
                          const parsed = Number(raw);
                          if (!isNaN(parsed) && parsed >= 0) {
                            setDiscount(parsed, 'PERCENTAGE');
                          }
                        }
                      }}
                      onFocus={e => {
                        setActiveDiscField('PCT');
                        if (discountType === 'PERCENTAGE' && discountValue > 0) {
                          setLocalDiscText(String(discountValue));
                        }
                        e.target.select();
                      }}
                      onBlur={() => {
                        setActiveDiscField(null);
                      }}
                      onKeyDown={e => commonKeyDown(e, true)}
                      placeholder=""
                      className="w-11 h-7 text-center bg-transparent border-0 text-xs font-bold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>

                  {/* Vertical Separator */}
                  <span className="w-px h-4 bg-border/50 shrink-0" />

                  {/* Flat Amount Input Column */}
                  <div className="flex items-center px-2 py-0.5 gap-1">
                    <span className="text-xs font-black text-muted-foreground/60 shrink-0 pointer-events-none select-none">₹</span>
                    <input
                      ref={discountRef}
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={flatVal}
                      onChange={e => {
                        const raw = e.target.value;
                        setActiveDiscField('FLAT');
                        setLocalDiscText(raw);
                        if (activeTab?.manualTotalOverride) updateActiveTab({ manualTotalOverride: null });
                        if (raw === '' || raw === null || parseFloat(raw) === 0) {
                          setDiscount(0, 'FIXED');
                        } else {
                          const parsed = Number(raw);
                          if (!isNaN(parsed) && parsed >= 0) {
                            setDiscount(parsed, 'FIXED');
                          }
                        }
                      }}
                      onFocus={e => {
                        setActiveDiscField('FLAT');
                        if (discountType === 'FIXED' && discountValue > 0) {
                          setLocalDiscText(String(discountValue));
                        }
                        e.target.select();
                      }}
                      onBlur={() => {
                        setActiveDiscField(null);
                      }}
                      onKeyDown={e => commonKeyDown(e, false)}
                      placeholder=""
                      className="w-14 h-7 text-right pr-0.5 bg-transparent border-0 text-xs font-bold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>
              );
            })()}
          </div>
          </div>



        {/* ── Adjustment Block (Normal Mode Only): combined scrap + return deduction ── */}
        {uiConfig.orientation !== 'horizontal-stack' && (
        <div className={clsx(
          'transition-all duration-400 ease-in-out',
          !isScrapMode && !isQuotationMode && !isReturnMode && (isScrapModuleEnabled || isReturnModuleEnabled || isLoyaltyModuleEnabled || storeScrapDeduction > 0 || storeReturnDeduction > 0 || pointsRedeemedDiscountCalc > 0)
            ? 'max-h-[500px] opacity-100 scale-100'
            : 'max-h-0 opacity-0 scale-95 pointer-events-none'
        )}>
          <div className={clsx(
            "px-0 py-0 mt-1 border rounded-2xl overflow-hidden transition-all duration-300 shadow-sm",
            ((storeScrapDeduction > 0 ? 1 : 0) + (storeReturnDeduction > 0 ? 1 : 0) + (pointsRedeemedDiscountCalc > 0 ? 1 : 0)) > 1
              ? "border-primary/20 bg-muted/5"
              : storeScrapDeduction > 0
                ? "border-orange-500/25 bg-orange-500/[0.01]"
                : storeReturnDeduction > 0
                  ? "border-rose-500/25 bg-rose-500/[0.01]"
                  : pointsRedeemedDiscountCalc > 0
                    ? "border-emerald-500/25 bg-emerald-500/[0.01]"
                    : "border-border/60 bg-muted/5"
          )}>
            {/* Applied Credits Summary Row */}
            {(storeScrapDeduction > 0 || storeReturnDeduction > 0 || pointsRedeemedDiscountCalc > 0) && (
              <div className="p-2 space-y-1.5 bg-muted/40 border-b border-border/50">
                <div className="flex items-center justify-between px-1 mb-0.5">
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Applied Credits</p>
                  {((storeScrapDeduction > 0 ? 1 : 0) + (storeReturnDeduction > 0 ? 1 : 0) + (pointsRedeemedDiscountCalc > 0 ? 1 : 0)) > 1 && (
                    <span className="text-[9px] font-bold text-foreground bg-primary/10 px-2 py-0.5 rounded-full">
                      Total Adj: -{formatCurrency((storeScrapDeduction || 0) + (storeReturnDeduction || 0) + (pointsRedeemedDiscountCalc || 0))}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 items-center">
                  {storeScrapDeduction > 0 && (
                    <div className="flex items-center justify-between p-1.5 bg-orange-500/5 hover:bg-orange-500/10 border border-orange-500/10 rounded-xl transition-all duration-200 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <div className="p-1 bg-orange-500/10 text-orange-600 rounded-lg shrink-0">
                          <Recycle className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[8px] font-black text-orange-600 uppercase tracking-wider leading-none">Scrap Credit</p>
                          <p className="text-[10px] font-mono font-bold text-foreground truncate mt-0.5">{storeScrapInvoiceNumber}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        <span className="text-[11px] font-black text-orange-600">-{formatCurrency(storeScrapDeduction)}</span>
                        <button
                          type="button"
                          onClick={() => clearScrapDeduction()}
                          title="Remove Scrap Credit"
                          className="p-0.5 text-orange-600/50 hover:text-destructive hover:bg-destructive/10 rounded transition-all cursor-pointer shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}

                  {storeReturnDeduction > 0 && (
                    <div className="flex items-center justify-between p-1.5 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 rounded-xl transition-all duration-200 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <div className="p-1 bg-rose-500/10 text-rose-600 rounded-lg shrink-0">
                          <ArrowLeftRight className="w-3.5 h-3.5 text-rose-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[8px] font-black text-rose-600 uppercase tracking-wider leading-none">Return Credit</p>
                          <p className="text-[10px] font-mono font-bold text-foreground truncate mt-0.5">{storeReturnInvoiceNumber}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        <span className="text-[11px] font-black text-rose-600">-{formatCurrency(storeReturnDeduction)}</span>
                        <button
                          type="button"
                          onClick={() => clearReturnDeduction()}
                          title="Remove Return Credit"
                          className="p-0.5 text-rose-600/50 hover:text-destructive hover:bg-destructive/10 rounded transition-all cursor-pointer shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}

                  {pointsRedeemedDiscountCalc > 0 && (
                    <div className="flex items-center justify-between p-1.5 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 rounded-xl transition-all duration-200 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <div className="p-1 bg-emerald-500/10 text-emerald-600 rounded-lg shrink-0">
                          <Coins className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[8px] font-black text-emerald-600 uppercase tracking-wider leading-none">Points Credit</p>
                          <p className="text-[10px] font-mono font-bold text-foreground truncate mt-0.5">{pointsRedeemedCalc} pts</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        <span className="text-[11px] font-black text-emerald-600">-{formatCurrency(pointsRedeemedDiscountCalc)}</span>
                        <button
                          type="button"
                          onClick={() => setPointsToRedeem(0)}
                          title="Remove Points Credit"
                          className="p-0.5 text-emerald-600/50 hover:text-destructive hover:bg-destructive/10 rounded transition-all cursor-pointer shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Deduction Tabs (Scrap / Return / Points) */}
            {(isScrapModuleEnabled || isReturnModuleEnabled || isLoyaltyModuleEnabled) && (
              <div>
                <div className="flex bg-muted/20 p-0.5 border-b border-border/40 gap-1">
                  {isScrapModuleEnabled && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeductionTabMode('scrap');
                        setReturnDeductionSearchMode(false);
                        setTimeout(() => scrapDeductionInputRef.current?.focus(), 50);
                      }}
                      className={clsx('flex-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wider transition-all duration-200 cursor-pointer rounded-lg flex items-center justify-center gap-1.5',
                        effectiveDeductionMode === 'scrap'
                          ? 'bg-orange-500/10 text-orange-600 shadow-sm'
                          : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                      )}
                    >
                      <Recycle className="w-3.5 h-3.5" />
                      <span>Scrap</span>
                      <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 text-[9px] font-black rounded-full leading-none shadow-xs bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">F9</span>
                    </button>
                  )}

                  {isReturnModuleEnabled && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeductionTabMode('return');
                        setReturnDeductionSearchMode(true);
                        setTimeout(() => returnDeductionInputRef.current?.focus(), 50);
                      }}
                      className={clsx('flex-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wider transition-all duration-200 cursor-pointer rounded-lg flex items-center justify-center gap-1.5',
                        effectiveDeductionMode === 'return'
                          ? 'bg-rose-500/10 text-rose-600 shadow-sm'
                          : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                      )}
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      <span>Return</span>
                      <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 text-[9px] font-black rounded-full leading-none shadow-xs bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">F10</span>
                    </button>
                  )}

                  {isLoyaltyModuleEnabled && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeductionTabMode('points');
                        setTimeout(() => pointsDeductionInputRef.current?.focus(), 50);
                      }}
                      className={clsx('flex-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wider transition-all duration-200 cursor-pointer rounded-lg flex items-center justify-center gap-1.5',
                        effectiveDeductionMode === 'points'
                          ? 'bg-emerald-500/10 text-emerald-600 shadow-sm'
                          : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                      )}
                    >
                      <Coins className="w-3.5 h-3.5" />
                      <span>Points</span>
                      <span className="inline-flex items-center justify-center min-w-[20px] h-4 px-1 text-[9px] font-black rounded-full leading-none shadow-xs bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">Alt+L</span>
                    </button>
                  )}
                </div>

                {/* Dynamic Single Input Row */}
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <div className="flex-1 relative">
                    {effectiveDeductionMode === 'scrap' ? (
                      storeScrapDeduction > 0 ? (
                        <div className="flex items-center justify-between px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-xl text-xs font-bold text-orange-600">
                          <div className="flex items-center gap-1.5 truncate">
                            <Recycle className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">Scrap #{storeScrapInvoiceNumber}: -{formatCurrency(storeScrapDeduction)} applied</span>
                          </div>
                          <button type="button" onClick={() => clearScrapDeduction()} className="text-orange-600/70 hover:text-destructive p-0.5 cursor-pointer shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <input
                          ref={scrapDeductionInputRef}
                          type="text"
                          placeholder="Type scrap invoice number & Enter..."
                          value={scrapDeductionSearchQuery}
                          onChange={e => setScrapDeductionSearchQuery(e.target.value.toUpperCase())}
                          onKeyDown={async e => {
                            if (e.key === 'Enter') {
                              const q = scrapDeductionSearchQuery.trim();
                              if (!q) return;
                              try {
                                const res = await window.electronAPI!.dbGetScrapInvoiceByNumber({ tenant_id: tenantId || '', scrap_invoice_number: q });
                                if (res && res.totalAmount) {
                                  if (res.paymentStatus === 'SETTLED') {
                                    setHardwareError(`Scrap credit ${q} has already been redeemed.`);
                                    return;
                                  }
                                  setScrapDeduction(res.totalAmount, q);
                                  setScrapDeductionSearchQuery('');
                                  setScrapDeductionResults([]);
                                  setScrapDeductionDropdownStyle(null);
                                } else {
                                  const getNumPart = getNumericPart;
                                  const numQ = getNumPart(q);
                                  const list = await window.electronAPI!.dbGetScrapInvoiceList({ tenant_id: tenantId || '' });
                                  if (Array.isArray(list)) {
                                    const match = list.find(inv =>
                                      inv.payment_status === 'PENDING' && getNumPart(String(inv.invoice_number)).includes(numQ)
                                    );
                                    if (match) {
                                      const detailRes = await window.electronAPI!.dbGetScrapInvoiceByNumber({ tenant_id: tenantId || '', scrap_invoice_number: match.invoice_number });
                                      if (detailRes && detailRes.totalAmount) {
                                        if (detailRes.paymentStatus === 'SETTLED') {
                                          setHardwareError(`Scrap credit ${match.invoice_number} has already been redeemed.`);
                                          return;
                                        }
                                        setScrapDeduction(detailRes.totalAmount, match.invoice_number);
                                        setScrapDeductionSearchQuery('');
                                        setScrapDeductionResults([]);
                                        setScrapDeductionDropdownStyle(null);
                                        return;
                                      }
                                    }
                                  }
                                  setHardwareError(`Scrap invoice "${q}" not found`);
                                }
                              } catch {
                                setHardwareError('Failed to fetch scrap invoice');
                              }
                            }
                            if (e.key === 'Escape') { setScrapDeductionResults([]); setScrapDeductionSearchQuery(''); setScrapDeductionDropdownStyle(null); }
                          }}
                          className="w-full pl-2.5 pr-2.5 py-1.5 bg-background border border-border hover:border-orange-500/40 rounded-xl text-xs font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 uppercase transition-all duration-200"
                        />
                      )
                    ) : effectiveDeductionMode === 'return' ? (
                      storeReturnDeduction > 0 ? (
                        <div className="flex items-center justify-between px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-bold text-rose-600">
                          <div className="flex items-center gap-1.5 truncate">
                            <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">Return #{storeReturnInvoiceNumber}: -{formatCurrency(storeReturnDeduction)} applied</span>
                          </div>
                          <button type="button" onClick={() => clearReturnDeduction()} className="text-rose-600/70 hover:text-destructive p-0.5 cursor-pointer shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <input
                          ref={returnDeductionInputRef}
                          type="text"
                          placeholder="Type return number & Enter..."
                          value={returnDeductionSearchQuery}
                          onChange={e => setReturnDeductionSearchQuery(e.target.value.toUpperCase())}
                          onKeyDown={async e => {
                            if (e.key === 'Enter') {
                              const q = returnDeductionSearchQuery.trim();
                              if (!q) return;
                              try {
                                const res = await window.electronAPI!.dbGetReturnInvoiceByNumber({ tenant_id: tenantId || '', return_number: q });
                                if (res && res.grand_total) {
                                  const remaining = res.grand_total - (res.adjusted_amount || 0);
                                  if (remaining > 0) {
                                    setReturnDeduction(remaining, q);
                                    setReturnDeductionSearchQuery('');
                                    setReturnDeductionResults([]);
                                    setReturnDeductionDropdownStyle(null);
                                  } else {
                                    setHardwareError('Return already fully adjusted');
                                  }
                                } else {
                                  const getNumPart = getNumericPart;
                                  const numQ = getNumPart(q);
                                  const list = await window.electronAPI!.dbGetPendingReturnInvoices({ tenant_id: tenantId || '' });
                                  if (Array.isArray(list)) {
                                    const match = list.find((r: any) => getNumPart(String(r.return_number)).includes(numQ));
                                    if (match) {
                                      const detailRes = await window.electronAPI!.dbGetReturnInvoiceByNumber({ tenant_id: tenantId || '', return_number: match.return_number });
                                      if (detailRes && detailRes.grand_total) {
                                        const remaining = detailRes.grand_total - (detailRes.adjusted_amount || 0);
                                        if (remaining > 0) {
                                          setReturnDeduction(remaining, match.return_number);
                                          setReturnDeductionSearchQuery('');
                                          setReturnDeductionResults([]);
                                          setReturnDeductionDropdownStyle(null);
                                          return;
                                        }
                                      }
                                    }
                                  }
                                  setHardwareError(`Return "${q}" not found`);
                                }
                              } catch {
                                setHardwareError('Failed to fetch return');
                              }
                            }
                            if (e.key === 'Escape') { setReturnDeductionResults([]); setReturnDeductionSearchQuery(''); setReturnDeductionDropdownStyle(null); }
                          }}
                          className="w-full pl-2.5 pr-2.5 py-1.5 bg-background border border-border hover:border-rose-500/40 rounded-xl text-xs font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 uppercase transition-all duration-200"
                        />
                      )
                    ) : (
                      /* Points Dynamic Input */
                      <div className="flex items-center gap-1.5 w-full">
                        <input
                          ref={pointsDeductionInputRef}
                          type="text"
                          inputMode="numeric"
                          placeholder={customerPointsBalance > 0 ? `Enter points to redeem (Max ${customerPointsBalance} pts)...` : "0 pts available"}
                          disabled={customerPointsBalance <= 0}
                          value={pointsToRedeem > 0 ? pointsToRedeem : ''}
                          onChange={e => {
                            const clean = e.target.value.replace(/\D/g, '');
                            const num = clean === '' ? 0 : Number(clean);
                            const val = Math.max(0, Math.min(num, customerPointsBalance));
                            setPointsToRedeem(clean === '' ? 0 : val);
                          }}
                          className="w-full pl-2.5 pr-2 py-1.5 bg-background border border-border hover:border-emerald-500/40 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-mono font-bold text-foreground placeholder:text-muted-foreground/30 focus:outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        {customerPointsBalance > 0 && (
                          <button
                            type="button"
                            onClick={() => setPointsToRedeem(customerPointsBalance)}
                            className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 rounded-xl border border-emerald-500/20 transition-all shrink-0 cursor-pointer"
                            title="Redeem maximum available points"
                          >
                            Max
                          </button>
                        )}
                        {pointsRedeemedDiscountCalc > 0 && (
                          <div className="flex items-center gap-1 text-xs font-black text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-xl shrink-0">
                            <span>-{formatCurrency(pointsRedeemedDiscountCalc)}</span>
                            <button
                              type="button"
                              onClick={() => setPointsToRedeem(0)}
                              className="p-0.5 text-muted-foreground hover:text-destructive cursor-pointer"
                              title="Clear Points"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {/* Scrap items row — shown in scrap mode with scrap cart items */}
        <div className={clsx(
          'overflow-hidden transition-all duration-300 ease-in-out',
          scrapTotal > 0 && isScrapMode && !isQuotationMode && enableScrap
            ? 'max-h-[80px] opacity-100'
            : 'max-h-0 opacity-0'
        )}>
          <div className="flex justify-between items-center pt-1 border-t border-border/30">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-orange-600">Scrap Items</span>
              {Object.values(
                items.filter(i => i.isScrap).reduce((acc, s) => {
                  const key = s.scrap_category_id || '';
                  if (!acc[key]) acc[key] = { name: s.name, quantity: 0 };
                  acc[key].quantity += Number(s.quantity || 0);
                  return acc;
                }, {} as Record<string, { name: string; quantity: number }>)
              ).map(s => (
                <span key={s.name} className="text-[10px] text-orange-600 bg-orange-500/10 px-1.5 py-0.5 rounded-full ml-1">
                  {s.name} {s.quantity.toFixed(3)}Kg
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-orange-600 bg-orange-500/10 px-1.5 py-0.5 rounded-full">
                {formatCurrency(scrapTotal)}
              </span>
            </div>
          </div>
        </div>

        </div>

        {/* Loyalty Redemption Discount in Totals */}
        {pointsRedeemedDiscountCalc > 0 && (
          <div className="mx-3 mb-1 px-3 py-2 bg-amber-500/10 border border-amber-500/25 rounded-xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Gift className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300 truncate">
                Loyalty Discount ({pointsRedeemedCalc} pts)
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs font-black text-amber-600 dark:text-amber-400 font-mono">
                -{formatCurrency(pointsRedeemedDiscountCalc)}
              </span>
              <button
                onClick={() => { setPointsToRedeem(0); setShowLoyaltyRedemption(false); }}
                title="Remove Loyalty Discount"
                className="p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Grand Total + Received + Change */}
        <div className="mx-3 my-1.5 flex items-center gap-1.5 px-3 py-3 bg-primary/10 border-2 border-primary/25 rounded-2xl">
          {/* Total amount */}
          <div className={clsx(
            'flex min-w-0 items-start justify-between gap-2',
            refundAmount > 0 && !isLoadingEditBill && paymentMethod !== 'CASH' && paymentMethod !== 'CREDIT' ? 'flex-[1.5]' : 'flex-1'
          )}>
            <div className="min-w-0 shrink-0">
              <p className="text-[9px] font-black text-primary uppercase tracking-wider">
                {isReturnMode ? 'Return Total' : isScrapMode ? 'Scrap Total' : (storeScrapDeduction > 0 || storeReturnDeduction > 0) ? 'After Adj.' : 'Total'}
              </p>
              {isLoadingEditBill ? (
                <Skeleton className="h-6 w-28 my-1 rounded-md" />
              ) : isEditingTotal ? (
                <div className="relative mt-1">
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-sm font-black text-primary select-none">₹</span>
                  <input
                    ref={totalOverrideInputRef}
                    type="number"
                    step="any"
                    min="0"
                    value={overrideTotalInput}
                    onChange={(e) => setOverrideTotalInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitTotalOverride();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setIsEditingTotal(false);
                      }
                    }}
                    onBlur={() => commitTotalOverride()}
                    placeholder={String(rawDisplayGrandTotal)}
                    className="w-32 pl-5 pr-2 py-0.5 bg-background border-2 border-primary rounded-xl text-xl font-black text-foreground outline-none no-spinners shadow-xs"
                    autoFocus
                  />
                </div>
              ) : (
                <p
                  onClick={startEditingTotal}
                  title="Click to edit total"
                  className="text-xl font-black text-foreground leading-none cursor-pointer mt-0.5 hover:text-primary transition-colors select-none"
                >
                  {formatCurrency(displayGrandTotal)}
                </p>
              )}
              {isGrandTotalOverridden && !isLoadingEditBill && (
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md border border-amber-500/20">
                    Overridden (Base: {formatCurrency(rawDisplayGrandTotal + (discount || 0))})
                  </span>
                  <button
                    type="button"
                    onClick={handleResetGrandTotalOverride}
                    title="Reset to calculated total"
                    className="text-[9px] font-extrabold text-destructive hover:underline cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              )}
              {refundAmount > 0 && !isLoadingEditBill && (
                <p className="mt-1.5 text-[10px] font-black text-orange-600">
                  Refund: {formatCurrency(refundAmount)}
                </p>
              )}
            </div>
            {refundAmount > 0 && !isLoadingEditBill && paymentMethod !== 'CASH' && paymentMethod !== 'CREDIT' && (
              <div className="mt-1 ml-auto flex shrink-0 flex-col items-end gap-1">
                <div className="inline-flex w-[190px] max-w-full items-center justify-between gap-2 rounded-xl border border-orange-400/40 bg-orange-500/10 px-2.5 py-1.5 shadow-sm">
                  <span className="text-[10px] font-black uppercase tracking-wide text-orange-700 dark:text-orange-300">Paid</span>
                  <div className="relative w-28 shrink-0">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-orange-600/70">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={actualRefundPaid || ''}
                      placeholder={String(refundAmount)}
                      onChange={e => updateActiveTab({ actualRefundPaid: e.target.value === '' ? 0 : Number(e.target.value) })}
                      onFocus={e => e.target.select()}
                      aria-label="Amount paid as refund"
                      className="no-spinners h-8 w-full rounded-lg border border-orange-300/50 bg-background/90 pl-6 pr-2 text-right text-sm font-black tabular-nums text-orange-700 shadow-inner transition-colors placeholder:text-orange-400/60 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-400/30 dark:text-orange-300"
                    />
                  </div>
                </div>
                {actualRefundPaid > refundAmount && (
                  <p className="text-[9px] font-bold text-rose-500">
                    Over by {formatCurrency(actualRefundPaid - refundAmount)}
                  </p>
                )}
              </div>
            )}
          </div>
          {/* Divider — hidden in scrap/return/quotation/PENDING/CARD/UPI mode */}
          <div className={clsx('w-px h-8 bg-primary/20 transition-all duration-300', isScrapMode || isReturnMode || isQuotationMode || editingQuotationId || paymentMethod === 'PENDING' || paymentMethod === 'CARD' || paymentMethod === 'UPI' ? 'opacity-0' : 'opacity-100')} />
          {/* Received input — hidden in scrap/return/quotation/PENDING/CARD/UPI mode */}
          <div className={clsx('flex-1 min-w-0 transition-all duration-300', isScrapMode || isReturnMode || isQuotationMode || editingQuotationId || paymentMethod === 'PENDING' || paymentMethod === 'CARD' || paymentMethod === 'UPI' ? 'opacity-0 pointer-events-none' : 'opacity-100')}>
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-wider mb-0.5">
              {paymentMethod === 'CREDIT' ? 'Paid' : 'Received'}
            </p>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-muted-foreground/60">₹</span>
              <input
                ref={receivedInputRef}
                type="number"
                min="0"
                step="any"
                value={receivedAmount || ''}
                onChange={e => updateActiveTab({ receivedAmount: e.target.value === '' ? 0 : Number(e.target.value) })}
                onFocus={e => e.target.select()}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    focusDescriptionOrDiscount();
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    focusDescriptionOrDiscount();
                  } else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) {
                    e.preventDefault();
                    paymentOptionRefs.current[paymentMethod]?.focus();
                  }
                }}
                placeholder={(Number(grandTotal) || 0).toFixed(2)}
                inputMode="decimal"
                className="w-full pl-5 pr-2 py-1.5 bg-background/80 border border-border focus:border-primary focus:ring-1 focus:ring-primary/15 rounded-lg text-sm font-black text-right text-foreground placeholder:text-muted-foreground/35 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>
          {/* Change / New Total Due input — hidden in scrap/return/quotation/PENDING/CARD/UPI mode */}
          {(() => {
            const effectivePaid = paymentMethod === 'CREDIT'
              ? (receivedAmount || 0)
              : paymentMethod === 'SPLIT'
              ? (splitTotal > 0 ? splitTotal : Math.max(0, displayGrandTotal - (Number(splitDetails?.credit) || 0)))
              : paymentMethod === 'PENDING'
              ? 0
              : ((receivedAmount && receivedAmount > 0) ? receivedAmount : displayGrandTotal);

            const selectedPartyObj = findMatchingParty(customerName, customerPhone);
            const uiPartyKey = `${(customerName || '').trim().toLowerCase()}|${(customerPhone || '').trim()}`;
            const uiIsStaffParty = String(selectedPartyObj?.party_type || '').toUpperCase() === 'STAFF';
            const uiEditingContribution = editingActive && !uiIsStaffParty && activeTab?.editingInvoicePartyKey === uiPartyKey
              ? (Number(activeTab?.editingInvoiceContribution) || 0)
              : 0;
            const partyOldBalance = selectedPartyObj ? (Number(selectedPartyObj.balance) || 0) - uiEditingContribution : 0;
            const isCreditCustomer = partyOldBalance !== 0 || paymentMethod === 'CREDIT' || (paymentMethod === 'SPLIT' && Number(splitDetails?.credit) > 0);

            if (isCreditCustomer) {
              const netNewDue = partyOldBalance + displayGrandTotal - effectivePaid;
              const isDue = netNewDue > 0;
              return (
                <div className={clsx('flex-1 min-w-0 max-w-[150px] transition-all duration-300', isScrapMode || isReturnMode || isQuotationMode || editingQuotationId ? 'opacity-0 pointer-events-none' : 'opacity-100')}>
                  <p className="text-[9px] font-black uppercase tracking-wider mb-0.5 text-amber-600 dark:text-amber-400">
                    {isDue ? 'New Total Due' : 'Advance Balance'}
                  </p>
                  <div className="relative">
                    <span className={clsx(
                      'absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black',
                      isDue ? 'text-amber-500' : 'text-emerald-500'
                    )}>₹</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={Math.abs(netNewDue).toFixed(2)}
                      readOnly
                      inputMode="decimal"
                      className={clsx(
                        'w-full pl-5 pr-2 py-1.5 border rounded-lg text-sm font-black text-right transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                        isDue
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                      )}
                    />
                  </div>
                </div>
              );
            }

            // Regular Cash / Non-Credit Customer:
            const isOverpaid = effectivePaid >= displayGrandTotal;
            const changeVal = Math.abs(effectivePaid - displayGrandTotal);

            return (
              <div className={clsx('flex-1 min-w-0 max-w-[140px] transition-all duration-300', isScrapMode || isReturnMode || isQuotationMode || editingQuotationId || paymentMethod === 'PENDING' || paymentMethod === 'CARD' || paymentMethod === 'UPI' ? 'opacity-0 pointer-events-none' : 'opacity-100')}>
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-wider mb-0.5">
                  Change
                </p>
                <div className="relative">
                  <span className={clsx(
                    'absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black',
                    isOverpaid ? 'text-emerald-500' : 'text-amber-500'
                  )}>₹</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={changeVal.toFixed(2)}
                    readOnly
                    inputMode="decimal"
                    className={clsx(
                      'w-full pl-5 pr-2 py-1.5 border rounded-lg text-sm font-black text-right transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                      isOverpaid
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                    )}
                  />
                </div>
              </div>
            );
          })()}
        </div>



        {/* Action buttons (Dynamic responsive scaling based on desktop screen size) */}
        <div className="flex gap-1.5 sm:gap-2 md:gap-2.5 px-2.5 py-2 sm:px-3.5 sm:py-2.5 md:px-4 md:py-3 transition-all">
          {isQuotationActive ? (
            /* ── Quotation Mode (Create or Edit) ── */
            <>
              <button
                onClick={() => handleSaveQuotation(false)}
                disabled={quotationSaving || items.length === 0}
                className="w-[20%] sm:w-[22%] md:w-[25%] py-2 sm:py-2.5 md:py-3 rounded-xl border-2 border-blue-400/60 text-blue-600 dark:text-blue-400 font-black text-xs sm:text-xs md:text-sm lg:text-base flex items-center justify-center gap-1 sm:gap-1.5 hover:bg-blue-500/10 hover:border-blue-400 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-xs cursor-pointer shrink-0"
              >
                <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>Save</span>
              </button>
              <button
                onClick={handleWhatsAppSendActiveBill}
                disabled={isSendingWhatsApp || items.length === 0}
                className="px-2.5 sm:px-3 md:px-3.5 py-2 sm:py-2.5 md:py-3 rounded-xl border-2 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-black text-xs sm:text-xs md:text-sm lg:text-base flex items-center justify-center gap-1 sm:gap-1.5 hover:bg-emerald-500/10 hover:border-emerald-500 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-xs cursor-pointer shrink-0"
                title="Send Active Bill via WhatsApp"
              >
                {isSendingWhatsApp ? (
                  <div className="w-3.5 h-3.5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin shrink-0" />
                ) : (
                  <WhatsAppIcon className="w-4 h-4 fill-emerald-500 text-emerald-500 shrink-0" />
                )}
                <span className="hidden sm:inline">WhatsApp</span>
              </button>
              <button
                onClick={() => handleSaveQuotation(true)}
                disabled={quotationSaving || items.length === 0}
                className="flex-1 min-w-0 py-2 sm:py-2.5 md:py-3 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-blue-500 text-white font-black text-xs sm:text-xs md:text-sm lg:text-base shadow-md hover:bg-blue-600 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed tracking-wide cursor-pointer"
              >
                {quotationSaving ? (
                  <>
                    <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                    <span className="truncate">SAVING...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-4.5 lg:h-4.5 shrink-0" />
                    <span className="truncate">{editingQuotationId ? 'UPDATE & PRINT (F12)' : 'SAVE & PRINT (F12)'}</span>
                  </>
                )}
              </button>
            </>
          ) : isReturnMode ? (
            /* ── Return Mode ── */
            <>
              <button
                onClick={() => handleProcessReturnFromCart(true)}
                disabled={returnProcessing || items.length === 0}
                className="w-[18%] sm:w-[20%] md:w-[22%] py-2 sm:py-2.5 md:py-3 rounded-xl border-2 border-rose-400/60 text-rose-600 dark:text-rose-400 font-black text-xs sm:text-xs md:text-sm lg:text-base flex items-center justify-center gap-1 sm:gap-1.5 hover:bg-rose-500/10 hover:border-rose-400 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-xs cursor-pointer shrink-0"
              >
                <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>Save</span>
              </button>
              <button
                onClick={() => handleProcessReturnFromCart()}
                disabled={returnProcessing || items.length === 0}
                className="flex-1 min-w-0 py-2 sm:py-2.5 md:py-3 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-rose-500 text-white font-black text-xs sm:text-xs md:text-sm lg:text-base shadow-md hover:bg-rose-600 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed tracking-wide cursor-pointer"
              >
                {returnProcessed ? (
                  <><CheckCircle2 className="w-4 h-4 shrink-0" /><span className="truncate">RETURN PROCESSED!</span></>
                ) : returnProcessing ? (
                  <>
                    <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                    <span className="truncate">PROCESSING...</span>
                  </>
                ) : (
                  <>
                    <ArrowLeftRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-4.5 lg:h-4.5 shrink-0" />
                    <span className="truncate">PROCESS &amp; PRINT (F12)</span>
                  </>
                )}
              </button>
            </>
          ) : isScrapMode ? (
            /* ── Scrap Mode ── */
            <>
              <button
                onClick={() => handleCheckout(true)}
                disabled={isCheckingOut || items.length === 0}
                className="w-[18%] sm:w-[20%] md:w-[22%] py-2 sm:py-2.5 md:py-3 rounded-xl border-2 border-orange-400/60 text-orange-600 dark:text-orange-400 font-black text-xs sm:text-xs md:text-sm lg:text-base flex items-center justify-center gap-1 sm:gap-1.5 hover:bg-orange-500/10 hover:border-orange-400 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-xs cursor-pointer shrink-0"
              >
                <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>Save</span>
              </button>
              <button
                onClick={() => handleCheckout()}
                disabled={isCheckingOut || items.length === 0}
                className="flex-1 min-w-0 py-2 sm:py-2.5 md:py-3 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-orange-500 text-white font-black text-xs sm:text-xs md:text-sm lg:text-base shadow-md hover:bg-orange-600 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed tracking-wide cursor-pointer"
              >
                {isCheckingOut ? (
                  <>
                    <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                    <span className="truncate">SAVING...</span>
                  </>
                ) : (
                  <>
                    <Recycle className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-4.5 lg:h-4.5 shrink-0" />
                    <span className="truncate">SAVE &amp; PRINT (F12)</span>
                  </>
                )}
              </button>
            </>
          ) : (
            /* ── Normal Billing Mode ── */
            <>
              <button
                onClick={handleHoldBill}
                disabled={items.length === 0}
                className="relative w-[18%] sm:w-[20%] md:w-[22%] py-2 sm:py-2.5 md:py-3 rounded-xl border-2 border-border text-muted-foreground font-black text-xs sm:text-xs md:text-sm lg:text-base hover:bg-muted hover:text-foreground hover:border-muted-foreground/30 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-xs cursor-pointer flex items-center justify-center gap-1 shrink-0"
                title="Hold Bill (F3)"
              >
                <span>Hold</span>
                <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[18px] sm:min-w-[20px] h-4 sm:h-4.5 px-1 sm:px-1.5 text-[8px] sm:text-[9px] font-black rounded-full leading-none shadow-xs border-2 border-background bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">F3</span>
              </button>
              <button
                onClick={() => handleCheckout(true)}
                disabled={isCheckingOut || items.length === 0}
                className="w-[18%] sm:w-[20%] md:w-[22%] py-2 sm:py-2.5 md:py-3 rounded-xl border-2 border-amber-400/60 text-amber-600 dark:text-amber-400 font-black text-xs sm:text-xs md:text-sm lg:text-base flex items-center justify-center gap-1 sm:gap-1.5 hover:bg-amber-500/10 hover:border-amber-400 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-xs cursor-pointer shrink-0"
              >
                <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>Save</span>
              </button>
              <button
                ref={checkoutBtnRef}
                onClick={() => handleCheckout()}
                disabled={isCheckingOut || items.length === 0}
                className="flex-1 min-w-0 py-2 sm:py-2.5 md:py-3 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-primary text-primary-foreground font-black text-xs sm:text-xs md:text-sm lg:text-base shadow-md hover:bg-primary/90 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed tracking-wide cursor-pointer"
              >
                {isCheckingOut ? (
                  <>
                    <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin shrink-0" />
                    <span className="truncate">FINALIZING...</span>
                  </>
                ) : editingActive ? (
                  <>
                    <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-4.5 lg:h-4.5 shrink-0" />
                    <span className="truncate">UPDATE &amp; PRINT (F12)</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-4.5 lg:h-4.5 shrink-0" />
                    <span className="truncate">PRINT (F12)</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>

      </div>
  );
};
