import type * as B from '../billingTypes';
import React from 'react';
import clsx from 'clsx';
import { ArrowLeftRight, Coins, Recycle, X } from 'lucide-react';
import { useCartStore } from '../../../store/cartStore';
import { formatCurrency } from '../BillingConstants';
import { findReturnCredit, findScrapCredit } from '../deductionLookup';

/** Scrap / return / loyalty-points deduction editor shown under the bill totals (both layouts). */
/** Scrap / return deduction and loyalty-points state shared by the billing panels and the deduction editor. */
export interface DeductionState {
  customerPointsBalance: number;
  effectiveDeductionMode: 'scrap' | 'return' | 'points';
  isLoyaltyModuleEnabled: boolean;
  isReturnModuleEnabled: boolean;
  isScrapModuleEnabled: boolean;
  pointsDeductionInputRef: React.RefObject<HTMLInputElement | null>;
  pointsRedeemedCalc: number;
  pointsRedeemedDiscountCalc: number;
  pointsToRedeem: number;
  returnDeductionInputRef: React.RefObject<HTMLInputElement | null>;
  returnDeductionSearchQuery: string;
  scrapDeductionInputRef: React.RefObject<HTMLInputElement | null>;
  scrapDeductionSearchQuery: string;
  setDeductionTabMode: React.Dispatch<React.SetStateAction<'scrap' | 'return' | 'points'>>;
  setHardwareError: React.Dispatch<React.SetStateAction<string | null>>;
  setPointsToRedeem: React.Dispatch<React.SetStateAction<number>>;
  setReturnDeductionDropdownStyle: React.Dispatch<React.SetStateAction<React.CSSProperties | null>>;
  // Result rows are untyped in BillingPage state (any[]); typed when that state is.
  setReturnDeductionResults: React.Dispatch<React.SetStateAction<B.ReturnDeductionRow[]>>;
  setReturnDeductionSearchMode: React.Dispatch<React.SetStateAction<boolean>>;
  setReturnDeductionSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setScrapDeductionDropdownStyle: React.Dispatch<React.SetStateAction<React.CSSProperties | null>>;
  setScrapDeductionResults: React.Dispatch<React.SetStateAction<B.ScrapDeductionRow[]>>;
  setScrapDeductionSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  tenantId: string | null;
}

export interface DeductionEditorProps {
  deductions: DeductionState;
}

export function DeductionEditor({ deductions }: DeductionEditorProps) {
  const { customerPointsBalance, effectiveDeductionMode, isLoyaltyModuleEnabled, isReturnModuleEnabled, isScrapModuleEnabled, pointsDeductionInputRef, pointsRedeemedDiscountCalc, pointsToRedeem, returnDeductionInputRef, returnDeductionSearchQuery, scrapDeductionInputRef, scrapDeductionSearchQuery, setDeductionTabMode, setHardwareError, setPointsToRedeem, setReturnDeductionDropdownStyle, setReturnDeductionResults, setReturnDeductionSearchMode, setReturnDeductionSearchQuery, setScrapDeductionDropdownStyle, setScrapDeductionResults, setScrapDeductionSearchQuery, tenantId } = deductions;
  const clearReturnDeduction = useCartStore(s => s.clearReturnDeduction);
  const clearScrapDeduction = useCartStore(s => s.clearScrapDeduction);
  const isQuotationMode = useCartStore(s => s.isQuotationMode);
  const isReturnMode = useCartStore(s => s.isReturnMode);
  const isScrapMode = useCartStore(s => s.isScrapMode);
  const setReturnDeduction = useCartStore(s => s.setReturnDeduction);
  const setScrapDeduction = useCartStore(s => s.setScrapDeduction);
  const storeReturnDeduction = useCartStore(s => s.returnDeduction);
  const storeReturnInvoiceNumber = useCartStore(s => s.returnInvoiceNumber);
  const storeScrapDeduction = useCartStore(s => s.scrapDeduction);
  const storeScrapInvoiceNumber = useCartStore(s => s.scrapInvoiceNumber);


  return (
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
                    {storeScrapDeduction > 0 && <span className="text-[10px] font-bold tabular-nums whitespace-nowrap">-{formatCurrency(storeScrapDeduction)}</span>}
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
                    {storeReturnDeduction > 0 && <span className="text-[10px] font-bold tabular-nums whitespace-nowrap">-{formatCurrency(storeReturnDeduction)}</span>}
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
                    {pointsRedeemedDiscountCalc > 0 && <span className="text-[10px] font-bold tabular-nums whitespace-nowrap">-{formatCurrency(pointsRedeemedDiscountCalc)}</span>}
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
                        <button type="button" title="Remove Scrap Credit" onClick={() => clearScrapDeduction()} className="text-orange-600/70 hover:text-destructive p-0.5 cursor-pointer shrink-0">
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
                              const credit = await findScrapCredit(tenantId || '', q);
                              if (credit.status === 'found') {
                                setScrapDeduction(credit.amount, credit.number);
                                setScrapDeductionSearchQuery('');
                                setScrapDeductionResults([]);
                                setScrapDeductionDropdownStyle(null);
                              } else if (credit.status === 'error') {
                                setHardwareError(credit.message);
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
                        <button type="button" title="Remove Return Credit" onClick={() => clearReturnDeduction()} className="text-rose-600/70 hover:text-destructive p-0.5 cursor-pointer shrink-0">
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
                              const credit = await findReturnCredit(tenantId || '', q);
                              if (credit.status === 'found') {
                                setReturnDeduction(credit.amount, credit.number);
                                setReturnDeductionSearchQuery('');
                                setReturnDeductionResults([]);
                                setReturnDeductionDropdownStyle(null);
                              } else if (credit.status === 'error') {
                                setHardwareError(credit.message);
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
  );
}
