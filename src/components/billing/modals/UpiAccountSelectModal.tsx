import type * as B from '../billingTypes';
import React, { useEffect, useRef } from 'react';
import { Smartphone, X } from 'lucide-react';
import clsx from 'clsx';

export interface UpiAccountSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  upiSources: B.UpiSource[];
  currentSelectedUpi: B.SelectedUpi;
  updateActiveTab: B.UpdateTab;
  setUpiAccountToast: (toast: string | null) => void;
  focusDescriptionOrDiscount: () => void;
  paymentOptionRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
}

export const UpiAccountSelectModal: React.FC<UpiAccountSelectModalProps> = ({
  isOpen,
  onClose,
  upiSources,
  currentSelectedUpi,
  updateActiveTab,
  setUpiAccountToast,
  focusDescriptionOrDiscount,
  paymentOptionRefs,
}) => {
  const upiSourceRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (isOpen && upiSources.length > 0) {
      const active = currentSelectedUpi
        ? upiSources.find((s) => s.source_id === currentSelectedUpi.source_id || (s.upi_id && s.upi_id === currentSelectedUpi.upi_id))
        : (upiSources.find((s) => s.is_default === 1) || upiSources[0]);

      const keyId = active?.source_id || active?.upi_id || upiSources[0]?.source_id || upiSources[0]?.upi_id || '0';

      const timer = setTimeout(() => {
        upiSourceRefs.current[keyId]?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, upiSources]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[150] animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[151] flex items-center justify-center p-4 select-none">
        <div className="w-full max-w-md bg-card border border-border rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
          {/* Modal Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/80 bg-violet-500/5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-violet-500/20 text-violet-600 dark:text-violet-400">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-foreground tracking-tight">Select UPI Account</h3>
                <p className="text-[11px] text-muted-foreground font-medium">Choose receiving account for UPI payments</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-destructive hover:bg-destructive/10 border border-destructive/30 transition-all cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5 text-destructive" />
            </button>
          </div>

          {/* Modal Content - UPI Account Options */}
          <div className="p-5 overflow-y-auto space-y-2.5 flex-1">
            {upiSources.map((s, idx: number) => {
              const isSelected = currentSelectedUpi
                ? (s.source_id === currentSelectedUpi.source_id || (s.upi_id && s.upi_id === currentSelectedUpi.upi_id))
                : (s.is_default === 1 || upiSources[0]?.source_id === s.source_id);
              const keyId = s.source_id || s.upi_id || String(idx);

              const selectThisUpi = () => {
                updateActiveTab({
                  paymentMethod: 'UPI',
                  selectedUpiId: s.upi_id || s.source_id || '',
                  selectedUpiSourceId: s.source_id || '',
                  selectedUpiName: s.name,
                });
                try {
                  localStorage.setItem('last_selected_upi_source_id', s.source_id || s.upi_id || '');
                } catch { /* ignore */ }
                onClose();
                setUpiAccountToast(`${s.name}${s.upi_id ? ` (${s.upi_id})` : ''}`);
                setTimeout(() => setUpiAccountToast(null), 3500);
                focusDescriptionOrDiscount();
              };

              return (
                <button
                  key={keyId}
                  ref={el => { upiSourceRefs.current[keyId] = el; }}
                  type="button"
                  onClick={selectThisUpi}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      const nextIdx = (idx + 1) % upiSources.length;
                      const next = upiSources[nextIdx];
                      const nextKey = next?.source_id || next?.upi_id || String(nextIdx);
                      upiSourceRefs.current[nextKey]?.focus();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      const prevIdx = (idx - 1 + upiSources.length) % upiSources.length;
                      const prev = upiSources[prevIdx];
                      const prevKey = prev?.source_id || prev?.upi_id || String(prevIdx);
                      upiSourceRefs.current[prevKey]?.focus();
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      selectThisUpi();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      onClose();
                      setTimeout(() => paymentOptionRefs.current['UPI']?.focus(), 50);
                    }
                  }}
                  className={clsx(
                    'w-full p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-violet-500',
                    isSelected
                      ? 'bg-violet-500/15 border-violet-500 text-violet-700 dark:text-violet-300 font-extrabold shadow-sm ring-1 ring-violet-500/50'
                      : 'bg-background hover:bg-muted/50 border-border/80 text-foreground'
                  )}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-xs font-black truncate flex items-center gap-2">
                      {s.name}
                      {s.is_default === 1 && (
                        <span className="px-1.5 py-0.5 text-[9px] bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-md font-black tracking-wider uppercase">
                          DEFAULT
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-mono text-muted-foreground truncate">
                      {s.upi_id || 'No UPI ID'}
                    </div>
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-black shrink-0 shadow-xs">
                      ✓
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Modal Footer */}
          <div className="p-4 border-t border-border/80 bg-muted/30 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
