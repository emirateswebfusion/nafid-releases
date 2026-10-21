import React from 'react';
import clsx from 'clsx';
import { ArrowLeftRight, Banknote, BookOpen, CheckCircle2, Clock, Coins, CreditCard, FileText, Gift, Recycle, Smartphone, Split, Users, Wallet, X } from 'lucide-react';
import { BillDescriptionCard } from '../ui/BillDescriptionCard';
import { useCartStore } from '../../../store/cartStore';
import { useTabStore, type SplitDetails } from '../../../store/tabStore';
import { formatCurrency } from '../BillingConstants';
import type { BillingUIConfig } from '../../../store/billingUIStore';

export interface BillingPaymentPanelProps {
  uiConfig: BillingUIConfig;
  currentSelectedUpi: any;
  customerPointsBalance: any;
  descriptionInputRef: React.MutableRefObject<any>;
  discountRef: React.MutableRefObject<any>;
  displayGrandTotal: number;
  effectiveDeductionMode: any;
  fillRestForField: any;
  focusDescriptionOrDiscount: any;
  getNumericPart: any;
  handleSplitInputKeyDown: any;
  isLoyaltyModuleEnabled: boolean;
  isReturnModuleEnabled: boolean;
  isScrapModuleEnabled: boolean;
  paymentMethod: any;
  paymentOptionRefs: any;
  paymentOptions: any;
  pointsDeductionInputRef: React.MutableRefObject<any>;
  pointsRedeemedCalc: number;
  pointsRedeemedDiscountCalc: number;
  pointsToRedeem: number;
  quotationTerms: any;
  receivedInputRef: React.MutableRefObject<any>;
  returnDeductionInputRef: React.MutableRefObject<any>;
  returnDeductionSearchQuery: any;
  scrapDeductionInputRef: React.MutableRefObject<any>;
  scrapDeductionSearchQuery: any;
  scrapPaymentStatus: any;
  selectedReturnInvoice: any;
  setDeductionTabMode: (v: any) => void;
  setHardwareError: (v: any) => void;
  setInfoToast: (v: any) => void;
  setIsUpiSelectModalOpen: (v: any) => void;
  setPointsToRedeem: (v: any) => void;
  setQuotationTerms: (v: any) => void;
  setReturnDeductionDropdownStyle: (v: any) => void;
  setReturnDeductionResults: (v: any) => void;
  setReturnDeductionSearchMode: (v: any) => void;
  setReturnDeductionSearchQuery: (v: any) => void;
  setScrapDeductionDropdownStyle: (v: any) => void;
  setScrapDeductionResults: (v: any) => void;
  setScrapDeductionSearchQuery: (v: any) => void;
  showDescriptionState: boolean;
  splitCardInputRef: React.MutableRefObject<any>;
  splitCashInputRef: React.MutableRefObject<any>;
  splitChequeInputRef: React.MutableRefObject<any>;
  splitCreditInputRef: React.MutableRefObject<any>;
  splitDetails: any;
  splitUpiInputRef: React.MutableRefObject<any>;
  tenantId: any;
  upiPageConfig: any;
  upiSources: any;
}

export const BillingPaymentPanel: React.FC<BillingPaymentPanelProps> = ({
  uiConfig,
  currentSelectedUpi,
  customerPointsBalance,
  descriptionInputRef,
  discountRef,
  displayGrandTotal,
  effectiveDeductionMode,
  fillRestForField,
  focusDescriptionOrDiscount,
  getNumericPart,
  handleSplitInputKeyDown,
  isLoyaltyModuleEnabled,
  isReturnModuleEnabled,
  isScrapModuleEnabled,
  paymentMethod,
  paymentOptionRefs,
  paymentOptions,
  pointsDeductionInputRef,
  pointsRedeemedCalc,
  pointsRedeemedDiscountCalc,
  pointsToRedeem,
  quotationTerms,
  receivedInputRef,
  returnDeductionInputRef,
  returnDeductionSearchQuery,
  scrapDeductionInputRef,
  scrapDeductionSearchQuery,
  scrapPaymentStatus,
  selectedReturnInvoice,
  setDeductionTabMode,
  setHardwareError,
  setInfoToast,
  setIsUpiSelectModalOpen,
  setPointsToRedeem,
  setQuotationTerms,
  setReturnDeductionDropdownStyle,
  setReturnDeductionResults,
  setReturnDeductionSearchMode,
  setReturnDeductionSearchQuery,
  setScrapDeductionDropdownStyle,
  setScrapDeductionResults,
  setScrapDeductionSearchQuery,
  showDescriptionState,
  splitCardInputRef,
  splitCashInputRef,
  splitChequeInputRef,
  splitCreditInputRef,
  splitDetails,
  splitUpiInputRef,
  tenantId,
  upiPageConfig,
  upiSources,
}) => {
  const activeTabId = useTabStore(s => s.activeTabId);
  const clearReturnDeduction = useCartStore(s => s.clearReturnDeduction);
  const clearScrapDeduction = useCartStore(s => s.clearScrapDeduction);
  const editingQuotationId = useCartStore(s => s.editingQuotationId);
  const isQuotationMode = useCartStore(s => s.isQuotationMode);
  const isReturnMode = useCartStore(s => s.isReturnMode);
  const isScrapMode = useCartStore(s => s.isScrapMode);
  const returnRefundMethod = useCartStore(s => s.returnRefundMethod);
  const setReturnDeduction = useCartStore(s => s.setReturnDeduction);
  const setReturnRefundMethod = useCartStore(s => s.setReturnRefundMethod);
  const setScrapDeduction = useCartStore(s => s.setScrapDeduction);
  const storeReturnDeduction = useCartStore(s => s.returnDeduction);
  const storeReturnInvoiceNumber = useCartStore(s => s.returnInvoiceNumber);
  const storeScrapDeduction = useCartStore(s => s.scrapDeduction);
  const storeScrapInvoiceNumber = useCartStore(s => s.scrapInvoiceNumber);
  const updateActiveTab = useTabStore(s => s.updateActiveTab);

  return (
      <div className={clsx(
        uiConfig.orientation === 'horizontal-stack'
          ? "w-1/2 border-r border-border h-full overflow-y-auto px-5 py-3 shrink-0"
          : "flex-1 overflow-y-auto px-5 py-2"
      )}>
        {/* Payment / Refund method grid — replaced by Quotation/Return Details in those modes */}
        <div className={clsx(
          'overflow-hidden transition-all duration-400 ease-in-out',
          isQuotationMode || editingQuotationId
            ? 'max-h-0 opacity-0 scale-95 py-0'
            : 'max-h-[500px] opacity-100 scale-100'
        )}>
          {isScrapMode ? (
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { value: 'PENDING' as const, label: 'Pending', icon: Clock, color: 'text-gray-500', activeBg: 'bg-gray-500/10', activeText: 'text-gray-600 dark:text-gray-400', activeBorder: 'border-gray-500', activeIconBg: 'bg-gray-500/15' },
              { value: 'SETTLED' as const, label: 'Settled', icon: CheckCircle2, color: 'text-blue-500', activeBg: 'bg-blue-500/10', activeText: 'text-blue-600 dark:text-blue-400', activeBorder: 'border-blue-500', activeIconBg: 'bg-blue-500/15' },
              { value: 'CASH' as const, label: 'Cash', icon: Banknote, color: 'text-emerald-500', activeBg: 'bg-emerald-500/10', activeText: 'text-emerald-600 dark:text-emerald-400', activeBorder: 'border-emerald-500', activeIconBg: 'bg-emerald-500/15' },
              { value: 'CREDIT' as const, label: 'Credit', icon: Users, color: 'text-amber-500', activeBg: 'bg-amber-500/10', activeText: 'text-amber-600 dark:text-amber-400', activeBorder: 'border-amber-500', activeIconBg: 'bg-amber-500/15' },
            ].map(opt => {
              const isActive = scrapPaymentStatus === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => updateActiveTab({ scrapPaymentStatus: opt.value })}
                  className={clsx(
                    'flex flex-col items-center justify-center gap-1 py-2 rounded-2xl border-2 transition-all duration-200 active:scale-95 cursor-pointer col-span-1',
                    isActive
                      ? `${opt.activeBg} ${opt.activeBorder} ${opt.activeText} shadow-sm`
                      : 'border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:border-border'
                  )}
                >
                  <div className={clsx(
                    'p-2 rounded-xl transition-colors',
                    isActive ? opt.activeIconBg : 'bg-muted'
                  )}>
                    <opt.icon className="w-4.5 h-4.5" />
                  </div>
                  <span className="text-xs font-extrabold">{opt.label}</span>
                </button>
              );
            })}
          </div>
          ) : isReturnMode ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-6 gap-1.5">
              {[
                { value: 'CREDIT' as const, label: 'Credit Balance', icon: CreditCard, activeBg: 'bg-amber-500/10', activeText: 'text-amber-600 dark:text-amber-400', activeBorder: 'border-amber-500', activeIconBg: 'bg-amber-500/15' },
                { value: 'ADJUST_BILL' as const, label: 'Adjust Bill', icon: ArrowLeftRight, activeBg: 'bg-rose-500/10', activeText: 'text-rose-600 dark:text-rose-400', activeBorder: 'border-rose-500', activeIconBg: 'bg-rose-500/15' },
                { value: 'CASH' as const, label: 'Cash', icon: Banknote, activeBg: 'bg-emerald-500/10', activeText: 'text-emerald-600 dark:text-emerald-400', activeBorder: 'border-emerald-500', activeIconBg: 'bg-emerald-500/15' },
                { value: 'UPI' as const, label: 'UPI', icon: Smartphone, activeBg: 'bg-violet-500/10', activeText: 'text-violet-600 dark:text-violet-400', activeBorder: 'border-violet-500', activeIconBg: 'bg-violet-500/15' },
                { value: 'CARD' as const, label: 'Card', icon: Wallet, activeBg: 'bg-blue-500/10', activeText: 'text-blue-600 dark:text-blue-400', activeBorder: 'border-blue-500', activeIconBg: 'bg-blue-500/15' },
                { value: 'STORE_CREDIT' as const, label: 'Store Credit', icon: Gift, activeBg: 'bg-purple-500/10', activeText: 'text-purple-600 dark:text-purple-400', activeBorder: 'border-purple-500', activeIconBg: 'bg-purple-500/15' },
              ].map(opt => {
                const isActive = returnRefundMethod === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setReturnRefundMethod(opt.value)}
                    className={clsx(
                      'flex flex-col items-center justify-center gap-1 py-2 rounded-2xl border-2 transition-all duration-200 active:scale-95 cursor-pointer col-span-2',
                      isActive
                        ? `${opt.activeBg} ${opt.activeBorder} ${opt.activeText} shadow-sm`
                        : 'border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:border-border'
                    )}
                  >
                    <div className={clsx(
                      'p-2 rounded-xl transition-colors',
                      isActive ? opt.activeIconBg : 'bg-muted'
                    )}>
                      <opt.icon className="w-4.5 h-4.5" />
                    </div>
                    <span className="text-xs font-extrabold">{opt.label}</span>
                  </button>
                );
              })}
            </div>
            {selectedReturnInvoice && (
              <div className="flex items-center justify-between px-3 py-2 bg-rose-500/5 border border-rose-500/10 rounded-xl mt-1">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Original Invoice: <span className="font-bold text-foreground">{selectedReturnInvoice.invoice_number}</span></span>
                  {(() => {
                    const pm = (selectedReturnInvoice.payment_method || '').toUpperCase();
                    let splitCredit = 0;
                    if (selectedReturnInvoice.split_details) {
                      try {
                        const s = typeof selectedReturnInvoice.split_details === 'string' ? JSON.parse(selectedReturnInvoice.split_details) : selectedReturnInvoice.split_details;
                        splitCredit = Number(s?.credit) || 0;
                      } catch {}
                    }
                    const isCredit = pm === 'CREDIT' || splitCredit > 0 || (Number(selectedReturnInvoice.balance_amount) > 0 && pm !== 'CASH');
                    if (isCredit) {
                      const due = Number(selectedReturnInvoice.balance_amount || selectedReturnInvoice.grand_total) || 0;
                      return (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                          Credit Bill · Balance Due: ₹{due.toFixed(2)}
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400">{selectedReturnInvoice.customer_name || 'Walk-in'}</span>
              </div>
            )}
          </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1.5 px-0.5">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                  Payment Method
                </span>
                <span className="text-[10px] font-bold text-muted-foreground/70 bg-muted/60 px-2 py-0.5 rounded-full">
                  Arrows: Select &middot; Enter: Confirm / Print
                </span>
              </div>
              <div className="grid grid-cols-8 gap-2">
                  {paymentOptions.map((opt, idx) => {
                    const isActive = paymentMethod === opt.value;
                    const span = opt.value === 'SPLIT'
                      ? 'col-span-2 col-start-7 row-start-1 row-span-2'
                      : 'col-span-2';

                    const handlePaymentSelect = () => {
                      if (opt.value === 'UPI') {
                        updateActiveTab({ paymentMethod: 'UPI' });
                        if (upiPageConfig.billing && upiSources.length > 0) {
                          setIsUpiSelectModalOpen(true);
                        }
                      } else if (opt.value === 'SPLIT') {
                        if (paymentMethod !== 'SPLIT') {
                          const prevMethod = paymentMethod;
                          let initialSplit: SplitDetails = { cash: 0, card: 0, upi: 0, cheque: 0, credit: 0, bank_transfer: 0 };
                          if (displayGrandTotal > 0) {
                            if (prevMethod === 'UPI') initialSplit.upi = displayGrandTotal;
                            else if (prevMethod === 'CARD') initialSplit.card = displayGrandTotal;
                            else if (prevMethod === 'CREDIT') initialSplit.credit = displayGrandTotal;
                            else if (prevMethod === 'CHEQUE') initialSplit.cheque = displayGrandTotal;
                            else initialSplit.cash = displayGrandTotal;

                            updateActiveTab({ paymentMethod: 'SPLIT', splitDetails: initialSplit, receivedAmount: (initialSplit.credit ? 0 : displayGrandTotal) });
                          } else {
                            updateActiveTab({ paymentMethod: 'SPLIT' });
                          }
                        }
                        setTimeout(() => {
                          splitCashInputRef.current?.focus();
                          splitCashInputRef.current?.select();
                        }, 40);
                      } else if (opt.value === 'CREDIT') {
                        if (paymentMethod !== 'CREDIT') {
                          const initialCreditSplit: SplitDetails = {
                            cash: 0,
                            card: 0,
                            upi: 0,
                            cheque: 0,
                            credit: displayGrandTotal,
                            bank_transfer: 0,
                          };
                          updateActiveTab({
                            paymentMethod: 'CREDIT',
                            splitDetails: initialCreditSplit,
                            receivedAmount: 0,
                          });
                        }
                        setTimeout(() => {
                          splitCreditInputRef.current?.focus();
                          splitCreditInputRef.current?.select();
                        }, 40);
                      } else {
                        updateActiveTab({ paymentMethod: opt.value });
                      }
                    };

                    const handlePaymentOptionKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
                      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        const prevIdx = (idx - 1 + paymentOptions.length) % paymentOptions.length;
                        const prevOpt = paymentOptions[prevIdx];
                        if (prevOpt.value !== 'CREDIT' && prevOpt.value !== 'SPLIT') {
                          updateActiveTab({ paymentMethod: prevOpt.value });
                        }
                        setTimeout(() => paymentOptionRefs.current[prevOpt.value]?.focus(), 15);
                      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        const nextIdx = (idx + 1) % paymentOptions.length;
                        const nextOpt = paymentOptions[nextIdx];
                        if (nextOpt.value !== 'CREDIT' && nextOpt.value !== 'SPLIT') {
                          updateActiveTab({ paymentMethod: nextOpt.value });
                        }
                        setTimeout(() => paymentOptionRefs.current[nextOpt.value]?.focus(), 15);
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        handlePaymentSelect();
                        if (opt.value === 'CASH') {
                          setTimeout(() => {
                            receivedInputRef.current?.focus();
                            receivedInputRef.current?.select();
                          }, 30);
                        } else if (opt.value === 'SPLIT' || opt.value === 'CREDIT') {
                          // Focus automatically shifts to split/credit input inside handlePaymentSelect
                        } else if (opt.value === 'UPI') {
                          if (!upiPageConfig.billing || upiSources.length === 0) {
                            focusDescriptionOrDiscount();
                          }
                        } else {
                          focusDescriptionOrDiscount();
                        }
                      }
                    };

                    // ── In SPLIT or CREDIT mode: Morph Cash, Card, UPI, Cheque, and Credit buttons into interactive input tiles ──
                    if (paymentMethod === 'SPLIT' || paymentMethod === 'CREDIT') {
                      if (opt.value === 'CASH') {
                        return (
                          <div key="CASH" className={clsx(span, 'flex flex-col justify-between p-1.5 rounded-2xl border-2 border-emerald-500 bg-emerald-500/10 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all shadow-xs h-[82px]')}>
                            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs min-w-0">
                              <Banknote className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">Cash</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => fillRestForField('CASH')}
                              title="Fill remaining balance (Shortcut: F)"
                              className="w-full text-[9.5px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 active:scale-95 cursor-pointer bg-emerald-500/15 py-0.5 rounded-md transition-all text-center leading-tight"
                            >
                              Fill Rest [F]
                            </button>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-emerald-500/80">₹</span>
                              <input
                                ref={splitCashInputRef}
                                type="number"
                                min="0"
                                step="any"
                                value={splitDetails.cash || ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 0 : Number(e.target.value);
                                  const nextDetails = { ...splitDetails, cash: val };
                                  const nextRec = val + (Number(nextDetails.card) || 0) + (Number(nextDetails.upi) || 0) + (Number(nextDetails.cheque) || 0) + (Number(nextDetails.bank_transfer) || 0);
                                  updateActiveTab({ splitDetails: nextDetails, receivedAmount: nextRec });
                                }}
                                onKeyDown={(e) => handleSplitInputKeyDown(e, 'CASH')}
                                placeholder="0"
                                className="w-full pl-5 pr-1.5 py-0.5 bg-background/90 border border-emerald-500/30 focus:border-emerald-500 rounded-xl text-xs font-black text-right text-foreground outline-none no-spinners h-6"
                              />
                            </div>
                          </div>
                        );
                      }

                      if (opt.value === 'CARD') {
                        return (
                          <div key="CARD" className={clsx(span, 'flex flex-col justify-between p-1.5 rounded-2xl border-2 border-blue-500 bg-blue-500/10 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all shadow-xs h-[82px]')}>
                            <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-extrabold text-xs min-w-0">
                              <Wallet className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">Card</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => fillRestForField('CARD')}
                              title="Fill remaining balance (Shortcut: F)"
                              className="w-full text-[9.5px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 hover:bg-blue-500/25 active:scale-95 cursor-pointer bg-blue-500/15 py-0.5 rounded-md transition-all text-center leading-tight"
                            >
                              Fill Rest [F]
                            </button>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-blue-500/80">₹</span>
                              <input
                                ref={splitCardInputRef}
                                type="number"
                                min="0"
                                step="any"
                                value={splitDetails.card || ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 0 : Number(e.target.value);
                                  const nextDetails = { ...splitDetails, card: val };
                                  const nextRec = (Number(nextDetails.cash) || 0) + val + (Number(nextDetails.upi) || 0) + (Number(nextDetails.cheque) || 0) + (Number(nextDetails.bank_transfer) || 0);
                                  updateActiveTab({ splitDetails: nextDetails, receivedAmount: nextRec });
                                }}
                                onKeyDown={(e) => handleSplitInputKeyDown(e, 'CARD')}
                                placeholder="0"
                                className="w-full pl-5 pr-1.5 py-0.5 bg-background/90 border border-blue-500/30 focus:border-blue-500 rounded-xl text-xs font-black text-right text-foreground outline-none no-spinners h-6"
                              />
                            </div>
                          </div>
                        );
                      }

                      if (opt.value === 'UPI') {
                        return (
                          <div key="UPI" className={clsx(span, 'flex flex-col justify-between p-1.5 rounded-2xl border-2 border-violet-500 bg-violet-500/10 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/20 transition-all shadow-xs h-[82px]')}>
                            <div
                              className="flex items-center gap-1 text-violet-600 dark:text-violet-400 font-extrabold text-xs cursor-pointer hover:underline min-w-0"
                              onClick={() => {
                                if (upiPageConfig.billing && upiSources.length > 0) {
                                  setIsUpiSelectModalOpen(true);
                                }
                              }}
                              title={currentSelectedUpi ? `Click to change UPI account: ${currentSelectedUpi.name} (${currentSelectedUpi.upi_id || ''})` : undefined}
                            >
                              <Smartphone className="w-3.5 h-3.5 shrink-0" />
                              <span className="shrink-0">UPI</span>
                              {currentSelectedUpi && (
                                <span className="text-[10px] font-medium text-violet-700 dark:text-violet-300 truncate">
                                  ({currentSelectedUpi.name})
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => fillRestForField('UPI')}
                              title="Fill remaining balance (Shortcut: F)"
                              className="w-full text-[9.5px] font-black uppercase tracking-wider text-violet-600 dark:text-violet-400 hover:bg-violet-500/25 active:scale-95 cursor-pointer bg-violet-500/15 py-0.5 rounded-md transition-all text-center leading-tight"
                            >
                              Fill Rest [F]
                            </button>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-violet-500/80">₹</span>
                              <input
                                ref={splitUpiInputRef}
                                type="number"
                                min="0"
                                step="any"
                                value={splitDetails.upi || ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 0 : Number(e.target.value);
                                  const nextDetails = { ...splitDetails, upi: val };
                                  const nextRec = (Number(nextDetails.cash) || 0) + (Number(nextDetails.card) || 0) + val + (Number(nextDetails.cheque) || 0) + (Number(nextDetails.bank_transfer) || 0);
                                  updateActiveTab({ splitDetails: nextDetails, receivedAmount: nextRec });
                                }}
                                onKeyDown={(e) => handleSplitInputKeyDown(e, 'UPI')}
                                placeholder="0"
                                className="w-full pl-5 pr-1.5 py-0.5 bg-background/90 border border-violet-500/30 focus:border-violet-500 rounded-xl text-xs font-black text-right text-foreground outline-none no-spinners h-6"
                              />
                            </div>
                          </div>
                        );
                      }

                      if (opt.value === 'CHEQUE') {
                        return (
                          <div key="CHEQUE" className={clsx(span, 'flex flex-col justify-between p-1.5 rounded-2xl border-2 border-indigo-500 bg-indigo-500/10 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all shadow-xs h-[82px]')}>
                            <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-extrabold text-xs min-w-0">
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">Cheque</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => fillRestForField('CHEQUE')}
                              title="Fill remaining balance (Shortcut: F)"
                              className="w-full text-[9.5px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/25 active:scale-95 cursor-pointer bg-indigo-500/15 py-0.5 rounded-md transition-all text-center leading-tight"
                            >
                              Fill Rest [F]
                            </button>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-indigo-500/80">₹</span>
                              <input
                                ref={splitChequeInputRef}
                                type="number"
                                min="0"
                                step="any"
                                value={splitDetails.cheque || ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 0 : Number(e.target.value);
                                  const nextDetails = { ...splitDetails, cheque: val };
                                  const nextRec = (Number(nextDetails.cash) || 0) + (Number(nextDetails.card) || 0) + (Number(nextDetails.upi) || 0) + val + (Number(nextDetails.bank_transfer) || 0);
                                  updateActiveTab({ splitDetails: nextDetails, receivedAmount: nextRec });
                                }}
                                onKeyDown={(e) => handleSplitInputKeyDown(e, 'CHEQUE')}
                                placeholder="0"
                                className="w-full pl-5 pr-1.5 py-0.5 bg-background/90 border border-indigo-500/30 focus:border-indigo-500 rounded-xl text-xs font-black text-right text-foreground outline-none no-spinners h-6"
                              />
                            </div>
                          </div>
                        );
                      }

                      if (opt.value === 'CREDIT') {
                        return (
                          <div key="CREDIT" className={clsx(span, 'flex flex-col justify-between p-1.5 rounded-2xl border-2 border-amber-500 bg-amber-500/10 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 transition-all shadow-xs h-[82px]')}>
                            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-extrabold text-xs min-w-0">
                              <BookOpen className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">Credit</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => fillRestForField('CREDIT')}
                              title="Fill remaining balance (Shortcut: F)"
                              className="w-full text-[9.5px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 active:scale-95 cursor-pointer bg-amber-500/15 py-0.5 rounded-md transition-all text-center leading-tight"
                            >
                              Fill Rest [F]
                            </button>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-amber-500/80">₹</span>
                              <input
                                ref={splitCreditInputRef}
                                type="number"
                                min="0"
                                step="any"
                                value={splitDetails.credit || ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 0 : Number(e.target.value);
                                  const nextDetails = { ...splitDetails, credit: val };
                                  const nextRec = (Number(nextDetails.cash) || 0) + (Number(nextDetails.card) || 0) + (Number(nextDetails.upi) || 0) + (Number(nextDetails.cheque) || 0) + (Number(nextDetails.bank_transfer) || 0);
                                  updateActiveTab({ splitDetails: nextDetails, receivedAmount: nextRec });
                                }}
                                onKeyDown={(e) => handleSplitInputKeyDown(e, 'CREDIT')}
                                placeholder="0"
                                className="w-full pl-5 pr-1.5 py-0.5 bg-background/90 border border-amber-500/30 focus:border-amber-500 rounded-xl text-xs font-black text-right text-foreground outline-none no-spinners h-6"
                              />
                            </div>
                          </div>
                        );
                      }

                      if (opt.value === 'SPLIT') {
                        const isSplitActive = paymentMethod === 'SPLIT';
                        return (
                          <button
                            key="SPLIT"
                            ref={el => { paymentOptionRefs.current['SPLIT'] = el; }}
                            type="button"
                            onClick={() => {
                              updateActiveTab({ paymentMethod: 'CASH' });
                              setInfoToast('Split Payment Closed (Switched to Cash)');
                              setTimeout(() => setInfoToast(null), 2000);
                              setTimeout(() => paymentOptionRefs.current['CASH']?.focus(), 50);
                            }}
                            onKeyDown={handlePaymentOptionKeyDown}
                            className={clsx(
                              span,
                              'flex flex-col justify-between p-2 rounded-2xl border-2 transition-all duration-200 active:scale-95 cursor-pointer h-[172px] focus:outline-none focus:ring-2 shadow-sm',
                              isSplitActive
                                ? 'border-purple-600 bg-purple-600 text-white dark:bg-purple-600 dark:border-purple-500 focus:ring-purple-400'
                                : 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400 focus:ring-amber-500'
                            )}
                            title="Click or press Esc to close multi-payment breakdown and reset to single Cash payment"
                          >
                            <div className="flex items-center justify-between w-full">
                              <div className="flex items-center gap-1 font-extrabold text-xs">
                                <Split className="w-4 h-4 shrink-0" />
                                <span>{isSplitActive ? 'Split ON' : 'Multi Pay'}</span>
                              </div>
                            </div>
                            <div className="w-full flex flex-col items-center justify-center gap-1 mt-1">
                              <span className={clsx(
                                'text-xs font-black px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-xs transition-colors',
                                isSplitActive
                                  ? 'bg-white/20 text-white hover:bg-white/30'
                                  : 'bg-amber-500/20 text-amber-800 dark:text-amber-200 hover:bg-amber-500/30'
                              )}>
                                <X className="w-3.5 h-3.5 shrink-0 stroke-[3]" />
                                <span>Close</span>
                              </span>
                              <span className="text-[9px] opacity-80 font-mono font-bold tracking-tight">
                                [Esc]
                              </span>
                            </div>
                          </button>
                        );
                      }
                    }

                    // ── Single Mode: Standard button options ──
                    let activeBg = '';
                    let activeText = '';
                    let activeBorder = '';
                    let activeIconBg = '';
                    let activeFocusRing = '';
                    if (opt.value === 'PENDING'){ activeBg = 'bg-gray-500/10';    activeText = 'text-gray-600 dark:text-gray-400';    activeBorder = 'border-gray-500';    activeIconBg = 'bg-gray-500/15'; activeFocusRing = 'focus:ring-gray-500 focus:border-gray-500'; }
                    if (opt.value === 'CASH')   { activeBg = 'bg-emerald-500/10'; activeText = 'text-emerald-600 dark:text-emerald-400'; activeBorder = 'border-emerald-500'; activeIconBg = 'bg-emerald-500/15'; activeFocusRing = 'focus:ring-emerald-500 focus:border-emerald-500'; }
                    if (opt.value === 'CARD')   { activeBg = 'bg-blue-500/10';    activeText = 'text-blue-600 dark:text-blue-400';    activeBorder = 'border-blue-500';    activeIconBg = 'bg-blue-500/15'; activeFocusRing = 'focus:ring-blue-500 focus:border-blue-500'; }
                    if (opt.value === 'UPI')    { activeBg = 'bg-violet-500/10';  activeText = 'text-violet-600 dark:text-violet-400';  activeBorder = 'border-violet-500';  activeIconBg = 'bg-violet-500/15'; activeFocusRing = 'focus:ring-violet-500 focus:border-violet-500'; }
                    if (opt.value === 'CHEQUE'){ activeBg = 'bg-indigo-500/10'; activeText = 'text-indigo-600 dark:text-indigo-400'; activeBorder = 'border-indigo-500'; activeIconBg = 'bg-indigo-500/15'; activeFocusRing = 'focus:ring-indigo-500 focus:border-indigo-500'; }
                    if (opt.value === 'CREDIT') { activeBg = 'bg-amber-500/10';   activeText = 'text-amber-600 dark:text-amber-400';   activeBorder = 'border-amber-500';   activeIconBg = 'bg-amber-500/15'; activeFocusRing = 'focus:ring-amber-500 focus:border-amber-500'; }
                    if (opt.value === 'SPLIT')  { activeBg = 'bg-purple-500/10';  activeText = 'text-purple-600 dark:text-purple-400';  activeBorder = 'border-purple-500';  activeIconBg = 'bg-purple-500/15'; activeFocusRing = 'focus:ring-purple-500 focus:border-purple-500'; }

                    return (
                      <button
                        key={opt.value}
                        ref={el => { paymentOptionRefs.current[opt.value] = el; }}
                        type="button"
                        onClick={handlePaymentSelect}
                        onKeyDown={handlePaymentOptionKeyDown}
                        className={clsx(
                          'flex flex-col items-center justify-center gap-0.5 py-2 rounded-2xl border-2 transition-all duration-200 active:scale-95 cursor-pointer focus:outline-none focus:ring-2',
                          opt.value === 'SPLIT' ? 'h-[172px]' : 'h-[82px]',
                          activeFocusRing,
                          span,
                          isActive
                            ? `${activeBg} ${activeBorder} ${activeText} shadow-sm`
                            : 'border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:border-border'
                        )}
                      >
                        <div className={clsx(
                          'p-1 rounded-lg transition-colors',
                          isActive ? activeIconBg : 'bg-muted'
                        )}>
                          <opt.icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex flex-col items-center leading-tight min-w-0 max-w-full px-1">
                          <span className="text-[11px] font-extrabold">{opt.label}</span>
                          {opt.value === 'UPI' && currentSelectedUpi && (
                            <span
                              className={clsx(
                                'text-[9px] font-black truncate max-w-[110px] mt-0.5 px-1.5 py-0.5 rounded-md shadow-2xs transition-colors',
                                isActive
                                  ? 'bg-violet-600 text-white'
                                  : 'bg-muted-foreground/15 text-foreground'
                              )}
                              title={`${currentSelectedUpi.name}${currentSelectedUpi.upi_id ? ` (${currentSelectedUpi.upi_id})` : ''}`}
                            >
                              {currentSelectedUpi.name}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
        </div>

        {/* ── Quotation Details — smoothly replaces payment methods ── */}
        <div className={clsx(
          'overflow-hidden transition-all duration-400 ease-in-out',
          isQuotationMode || editingQuotationId
            ? 'max-h-[500px] opacity-100 scale-100'
            : 'max-h-0 opacity-0 scale-95'
        )}>
          <div className="p-3.5 bg-blue-500/5 border border-blue-500/20 rounded-2xl mt-1">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Terms & Conditions</label>
              <textarea
                value={quotationTerms}
                onChange={e => setQuotationTerms(e.target.value)}
                rows={3}
                className="w-full bg-background border border-border rounded-lg p-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Scrap & Return Deduction section in Left Panel for Top/Bottom Stack layout */}
        {/* Scrap & Return Deduction section in Left Panel for Top/Bottom Stack layout */}
        {uiConfig.orientation === 'horizontal-stack' && (
          <div className="mt-3">
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
          </div>
        )}

        {/* ── Bill Description Card (Directly Below Payment Methods in Scrollable Area) ── */}
        {showDescriptionState && (
          <BillDescriptionCard
            activeTabId={activeTabId}
            inputRef={descriptionInputRef}
            onKeyDown={() => {
              if (discountRef.current) {
                discountRef.current.focus();
                discountRef.current.select();
              }
            }}
          />
        )}

      </div>
  );
};
