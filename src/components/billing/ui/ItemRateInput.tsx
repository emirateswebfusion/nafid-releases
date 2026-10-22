import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import { MRP_TIER_ID } from '../../../utils/pricingTierHelper';
import { createPortal } from 'react-dom';

interface ItemRateInputProps {
  productId: string;
  rate: number;
  qty: number;
  unitLabel: string;
  placeholder: string;
  title: string;
  containerClassName?: string;
  inputClassName?: string;
  unitClassName?: string;
  purchasePrice?: number;
  showPurchasePrice?: boolean;
  tierPricesMap?: Record<string, number>;
  pricingTiers?: any[];
  basePrice?: number;
  selectedTierId?: string | null;
  onSelectTier?: (productId: string, tierId: string | null, tierName: string | null, newPrice: number) => void;
  onUpdateOfferPrice: (productId: string, unitPrice: number) => void;
  syncActiveSnapshot: () => void;
  inputRef?: (el: HTMLInputElement | null) => void;
  onKeyDownNext?: () => void;
  onKeyDownBack?: () => void;
  onKeyDownUp?: () => void;
  onKeyDownDown?: () => void;
  onFocus?: () => void;
  customPpk?: number;
  setLocalPcStr?: (val: string) => void;
  setLocalKgStr?: (val: string) => void;
}

export function ItemRateInput({
  productId,
  rate,
  qty,
  unitLabel,
  placeholder,
  title,
  containerClassName,
  inputClassName,
  unitClassName,
  purchasePrice,
  showPurchasePrice,
  tierPricesMap,
  pricingTiers,
  basePrice,
  selectedTierId,
  onSelectTier,
  onUpdateOfferPrice,
  syncActiveSnapshot,
  inputRef,
  onKeyDownNext,
  onKeyDownBack,
  onKeyDownUp,
  onKeyDownDown,
  onFocus,
  customPpk,
  setLocalPcStr,
  setLocalKgStr,
}: ItemRateInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [localVal, setLocalVal] = useState<string>(() =>
    Number.isInteger(rate) ? String(rate) : rate.toFixed(2)
  );

  useEffect(() => {
    if (!isFocused) {
      setLocalVal(Number.isInteger(rate) ? String(rate) : rate.toFixed(2));
    }
  }, [rate, isFocused]);

  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [isNavigatingMenu, setIsNavigatingMenu] = useState(false);
  const menuAnchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionListRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  const options = useMemo(() => {
    if (!pricingTiers || pricingTiers.length === 0) return [];
    const bp = basePrice ?? rate;
    const list: Array<{ tierId: string; name: string; unitPrice: number }> = [];

    pricingTiers.forEach((t: any) => {
      const isMrp = t.is_mrp || t.pricing_tier_id === '' || t.pricing_tier_id === MRP_TIER_ID;
      if (isMrp) {
        list.push({ tierId: '', name: t.name || 'Base (MRP)', unitPrice: bp });
      } else {
        const p = tierPricesMap?.[t.pricing_tier_id];
        if (p != null && p > 0) {
          list.push({ tierId: t.pricing_tier_id, name: t.name, unitPrice: p });
        }
      }
    });
    return list;
  }, [pricingTiers, tierPricesMap, basePrice, rate]);

  const hasTierOptions = options.length > 0;
  const hasPurchaseCost = Boolean(showPurchasePrice && purchasePrice != null && purchasePrice > 0);
  const shouldShowMenu = isFocused && (hasTierOptions || hasPurchaseCost);

  useEffect(() => {
    if (shouldShowMenu && optionListRef.current && selectedOptionIndex >= 0) {
      const container = optionListRef.current;
      const selectedEl = container.querySelector<HTMLElement>(`[data-option-index="${selectedOptionIndex}"]`);
      if (selectedEl) {
        const containerTop = container.scrollTop;
        const containerBottom = containerTop + container.clientHeight;
        const elTop = selectedEl.offsetTop;
        const elBottom = elTop + selectedEl.offsetHeight;

        if (elTop < containerTop) {
          container.scrollTop = elTop;
        } else if (elBottom > containerBottom) {
          container.scrollTop = elBottom - container.clientHeight;
        }
      }
    }
  }, [selectedOptionIndex, shouldShowMenu]);

  const handleChooseOption = (opt: { tierId: string; name: string; unitPrice: number }) => {
    let effectiveUnitPrice = opt.unitPrice;
    if (customPpk && customPpk > 0) {
      const kgPrice = +(opt.unitPrice * customPpk).toFixed(2);
      effectiveUnitPrice = kgPrice;
      if (setLocalPcStr) setLocalPcStr(String(opt.unitPrice));
      if (setLocalKgStr) setLocalKgStr(String(kgPrice));
    } else {
      setLocalVal(Number.isInteger(opt.unitPrice) ? String(opt.unitPrice) : opt.unitPrice.toFixed(2));
    }

    if (onSelectTier) {
      onSelectTier(productId, opt.tierId || null, opt.tierId ? opt.name : null, effectiveUnitPrice);
    } else {
      onUpdateOfferPrice(productId, effectiveUnitPrice);
    }
    setIsFocused(false);
    setIsNavigatingMenu(false);
    syncActiveSnapshot();
    if (onKeyDownNext) {
      onKeyDownNext();
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setIsNavigatingMenu(false);
    if (options.length > 0) {
      const activeIdx = options.findIndex(o => o.tierId === (selectedTierId ?? ''));
      setSelectedOptionIndex(activeIdx >= 0 ? activeIdx : 0);
    }
    e.target.select();
    onFocus?.();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsNavigatingMenu(false);
    const raw = e.target.value;
    setLocalVal(raw);
    const num = parseFloat(raw);
    if (!isNaN(num) && num >= 0) {
      if (customPpk && customPpk > 0) {
        const kgRate = +(num * customPpk).toFixed(2);
        onUpdateOfferPrice(productId, kgRate);
        if (setLocalKgStr) setLocalKgStr(String(kgRate));
      } else {
        onUpdateOfferPrice(productId, num);
      }
      syncActiveSnapshot();
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      setIsFocused(false);
      setIsNavigatingMenu(false);
    }, 150);
    if (!localVal || isNaN(parseFloat(localVal))) {
      setLocalVal(Number.isInteger(rate) ? String(rate) : rate.toFixed(2));
    }
  };

  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (options.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        if (!isFocused) {
          setIsFocused(true);
        }
        setIsNavigatingMenu(true);
        setSelectedOptionIndex(prev => (prev + 1) % options.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        if (!isFocused) {
          setIsFocused(true);
        }
        setIsNavigatingMenu(true);
        setSelectedOptionIndex(prev => (prev - 1 + options.length) % options.length);
        return;
      }
      if (e.key === 'Enter') {
        if (isNavigatingMenu && options[selectedOptionIndex]) {
          e.preventDefault();
          e.stopPropagation();
          handleChooseOption(options[selectedOptionIndex]);
          return;
        }
        if (isFocused && !isNavigatingMenu) {
          e.preventDefault();
          e.stopPropagation();
          setIsFocused(false);
          setIsNavigatingMenu(false);
          if (onKeyDownNext) {
            onKeyDownNext();
          }
          return;
        }
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        setIsFocused(false);
        setIsNavigatingMenu(false);
        if (onKeyDownNext) {
          onKeyDownNext();
        }
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        setIsFocused(false);
        setIsNavigatingMenu(false);
        if (onKeyDownBack) {
          onKeyDownBack();
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsFocused(false);
        setIsNavigatingMenu(false);
        return;
      }
    }

    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      setIsFocused(false);
      setIsNavigatingMenu(false);
      if (onKeyDownNext) {
        onKeyDownNext();
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      setIsFocused(false);
      setIsNavigatingMenu(false);
      if (onKeyDownBack) {
        onKeyDownBack();
      }
    } else if (e.key === 'ArrowDown') {
      if (onKeyDownDown) {
        e.preventDefault();
        e.stopPropagation();
        onKeyDownDown();
      }
    } else if (e.key === 'ArrowUp') {
      if (onKeyDownUp) {
        e.preventDefault();
        e.stopPropagation();
        onKeyDownUp();
      }
    }
  };

  const updateMenuPosition = useCallback(() => {
    const anchor = menuAnchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;

    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const spaceAbove = Math.max(0, rect.top - gap - margin);
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - gap - margin);
    const openAbove = menu.scrollHeight > spaceBelow && spaceAbove > spaceBelow;
    const availableHeight = openAbove ? spaceAbove : spaceBelow;
    const menuHeight = Math.min(menu.scrollHeight, availableHeight);
    const width = menu.offsetWidth || 220;
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    const top = openAbove
      ? Math.max(margin, rect.top - gap - menuHeight)
      : rect.bottom + gap;

    setMenuPosition({ left, top, maxHeight: availableHeight });
  }, []);

  useLayoutEffect(() => {
    if (!shouldShowMenu) {
      setMenuPosition(null);
      return;
    }

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [shouldShowMenu, options.length, hasPurchaseCost, updateMenuPosition]);

  return (
    <div ref={menuAnchorRef} className="inline-block">
      {shouldShowMenu && (
        createPortal(
          <div
            ref={menuRef}
            className="fixed min-w-[210px] bg-card text-foreground border border-border rounded-2xl p-2 shadow-2xl z-[999] select-none"
            style={{
              left: menuPosition?.left ?? 8,
              top: menuPosition?.top ?? 8,
              maxHeight: menuPosition?.maxHeight ?? 'calc(100vh - 16px)',
              maxWidth: 'calc(100vw - 16px)',
              overflowY: 'auto',
              visibility: menuPosition ? 'visible' : 'hidden',
            }}
          >
            {hasTierOptions && (
              <>
                <div className="text-[9px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400 px-2 py-1 border-b border-border mb-1 flex items-center justify-between">
                  <span>Price Tier</span>
                  <span className="text-[8px] text-muted-foreground">{selectedOptionIndex + 1}/{options.length} · ↑↓ Select · Enter</span>
                </div>
                <div ref={optionListRef} className="space-y-0.5 max-h-[220px] overflow-y-auto custom-scrollbar">
                  {options.map((opt, idx) => {
                    const isHighlighted = idx === selectedOptionIndex;
                    return (
                      <button
                        key={opt.tierId || 'base'}
                        data-option-index={idx}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleChooseOption(opt);
                        }}
                        className={clsx(
                          "w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center justify-between transition-colors cursor-pointer",
                          isHighlighted ? "bg-primary text-primary-foreground font-black shadow-xs" : "hover:bg-muted text-foreground"
                        )}
                      >
                        <span className="truncate pr-2">{opt.name}</span>
                        <span className="font-mono text-[11px] font-black shrink-0">₹{opt.unitPrice.toFixed(2)}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {hasPurchaseCost && (
              <div className={clsx(hasTierOptions ? "border-t border-border pt-1.5 mt-1.5" : "")}>
                <div className="px-2.5 py-1.5 bg-amber-500/10 rounded-xl text-amber-700 dark:text-amber-300 text-[10px] font-bold flex items-center justify-between pointer-events-none select-none">
                  <span>Purchase Cost:</span>
                  <span className="font-mono font-black text-amber-800 dark:text-amber-200">
                    ₹{(purchasePrice || 0).toFixed(2)}{qty > 1 ? ` (Total: ₹${((purchasePrice || 0) * qty).toFixed(2)})` : ''}
                  </span>
                </div>
              </div>
            )}
          </div>,
          document.body
        )
      )}

      <div className={containerClassName || "flex items-center gap-0.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-lg px-1.5 py-0.5 transition-colors"}>
        <span className={unitClassName || "text-[9px] font-extrabold text-primary"}>₹</span>
        <input
          type="number" step="any" min="0"
          ref={inputRef}
          className={inputClassName || "w-14 text-center h-6 bg-transparent border-0 text-[11px] font-black text-primary focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"}
          value={localVal}
          onFocus={handleFocus}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDownInternal}
          placeholder={placeholder}
          title={title}
        />
        <span className={unitClassName || "text-[9px] font-extrabold text-primary/70"}>{unitLabel}</span>
      </div>
    </div>
  );
}
