import { getCurrencyDecimals } from '../../../../utils/localization/storeProfile';
import { getCurrencyPrefix } from '../../../../utils/localization/storeProfile';
import React from 'react';
import clsx from 'clsx';
import { formatCurrency } from '../../BillingConstants';
import { Lock, Percent } from 'lucide-react';
import { useBillingPermissions } from '../../../../hooks/useBillingPermissions';
import { PERMISSION_LOCK_HINTS } from '../../../../utils/security/permissions';
import type { CartItem } from '../../../../store/cartStore';
import type { Tab } from '../../../../store/tabStore';
import type { BillingTotalsPanelProps } from '../BillingTotalsPanel';

export interface DiscountRowProps {
  activeDiscField: BillingTotalsPanelProps['activeDiscField'];
  activeTab: BillingTotalsPanelProps['activeTab'];
  descriptionInputRef: BillingTotalsPanelProps['descriptionInputRef'];
  discount: number;
  discountPercentRef: BillingTotalsPanelProps['discountPercentRef'];
  discountRef: BillingTotalsPanelProps['discountRef'];
  discountType: "FIXED" | "PERCENTAGE";
  discountValue: number;
  extraBonus: number;
  handleCheckout: BillingTotalsPanelProps['handleCheckout'];
  isReturnMode: boolean;
  isScrapMode: boolean;
  items: CartItem[];
  localDiscText: BillingTotalsPanelProps['localDiscText'];
  paymentMethod: BillingTotalsPanelProps['paymentMethod'];
  paymentOptionRefs: BillingTotalsPanelProps['paymentOptionRefs'];
  qtyRefs: BillingTotalsPanelProps['qtyRefs'];
  receivedInputRef: BillingTotalsPanelProps['receivedInputRef'];
  scrapTotal: number;
  searchRef: BillingTotalsPanelProps['searchRef'];
  setActiveDiscField: BillingTotalsPanelProps['setActiveDiscField'];
  setDiscount: (value: number, type: "FIXED" | "PERCENTAGE") => void;
  setLocalDiscText: BillingTotalsPanelProps['setLocalDiscText'];
  showDescriptionState: boolean;
  subtotal: number;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
}

/** Discount row (percentage / flat) and extra bonus; hidden in return mode. */
export function DiscountRow({
  activeDiscField, activeTab, descriptionInputRef, discount, discountPercentRef, discountRef, discountType,
  discountValue, extraBonus, handleCheckout, isReturnMode, isScrapMode, items, localDiscText, paymentMethod,
  paymentOptionRefs, qtyRefs, receivedInputRef, scrapTotal, searchRef, setActiveDiscField, setDiscount,
  setLocalDiscText, showDescriptionState, subtotal, updateActiveTab,
}: DiscountRowProps) {
  const { canDiscount } = useBillingPermissions();
  const discountLocked = !isScrapMode && !canDiscount;
  return (
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
            {discountLocked && <span title={PERMISSION_LOCK_HINTS.discount}><Lock className="w-3 h-3 text-muted-foreground/70" aria-label={PERMISSION_LOCK_HINTS.discount} /></span>}
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
            flatVal = String(+((discBase * p) / 100).toFixed(getCurrencyDecimals()));
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
            flatVal = discBase > 0 && discountValue > 0 ? String(+((discBase * discountValue) / 100).toFixed(getCurrencyDecimals())) : '';
          } else {
            flatVal = discountValue > 0 ? String(discountValue) : '';
            pctVal = discBase > 0 && discountValue > 0 ? String(+((discountValue / discBase) * 100).toFixed(2)) : '';
          }
        }

        if (pctVal === '0' || pctVal === '0.00' || pctVal === '0.0') pctVal = '';
        if (flatVal === '0' || flatVal === '0.00' || flatVal === '0.0') flatVal = '';

        const commonKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, isPct: boolean) => {
          if (!discountLocked && (e.key === 'Delete' || e.key === 'Backspace')) {
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
                readOnly={discountLocked}
                title={discountLocked ? PERMISSION_LOCK_HINTS.discount : undefined}
                onChange={e => {
                  if (discountLocked) return;
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
              <span className="text-xs font-black text-muted-foreground/60 shrink-0 pointer-events-none select-none">{getCurrencyPrefix()}</span>
              <input
                ref={discountRef}
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={flatVal}
                readOnly={discountLocked}
                title={discountLocked ? PERMISSION_LOCK_HINTS.discount : undefined}
                onChange={e => {
                  if (discountLocked) return;
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
  );
}
