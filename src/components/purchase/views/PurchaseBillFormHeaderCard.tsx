import React from 'react';
import { User, UserPlus, Tag, X } from 'lucide-react';
import clsx from 'clsx';
import { localizeTaxText } from '../../../utils/localization/storeProfile';

export interface PurchaseBillFormHeaderCardProps {
  billDateInputRef: React.RefObject<HTMLInputElement | null>;
  billDate: string;
  setBillDate: (v: string) => void;
  supplierInputRef: React.RefObject<HTMLInputElement | null>;
  supplierSearch: string;
  setSupplierSearch: (v: string) => void;
  supplierName: string;
  setSupplierName: (v: string) => void;
  setSupplierId: (v: string) => void;
  highlightedSupplierIndex: number;
  setHighlightedSupplierIndex: React.Dispatch<React.SetStateAction<number>>;
  filteredSuppliers: Array<{ name: string; party_id: string; phone?: string | null }>;
  supplierOptionsRef: React.RefObject<HTMLDivElement | null>;
  selectSupplier: (s: { name: string; party_id: string }) => void;
  onOpenCreateSupplier: () => void;
  billType: 'GST' | 'ESTIMATE';
  setBillType: (v: 'GST' | 'ESTIMATE') => void;
  gstHasItems: boolean;
  estHasItems: boolean;
  billNotes: string;
  setBillNotes: (v: string) => void;
}

export function PurchaseBillFormHeaderCard({
  billDateInputRef,
  billDate,
  setBillDate,
  supplierInputRef,
  supplierSearch,
  setSupplierSearch,
  supplierName,
  setSupplierName,
  setSupplierId,
  highlightedSupplierIndex,
  setHighlightedSupplierIndex,
  filteredSuppliers,
  supplierOptionsRef,
  selectSupplier,
  onOpenCreateSupplier,
  billType,
  setBillType,
  gstHasItems,
  estHasItems,
  billNotes,
  setBillNotes,
}: PurchaseBillFormHeaderCardProps) {
  return (
    <div className="bg-card border border-border rounded-[28px] shadow-sm px-6 py-4 shrink-0">
      <div className="flex items-center gap-4 flex-wrap">
        <input
          ref={billDateInputRef}
          type="date"
          value={billDate}
          onChange={e => setBillDate(e.target.value)}
          className="bg-background/50 border border-border rounded-xl px-3 py-2.5 text-xs font-semibold text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background focus:outline-none transition-all shrink-0"
        />
        <div className="relative flex-1">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <input
            ref={supplierInputRef}
            type="text"
            placeholder="Search or select supplier..."
            value={supplierSearch || supplierName}
            onChange={e => {
              setSupplierSearch(e.target.value);
              setSupplierName(e.target.value);
              setSupplierId('');
              setHighlightedSupplierIndex(-1);
            }}
            onKeyDown={event => {
              if (event.key === 'ArrowDown' && filteredSuppliers.length > 0) {
                event.preventDefault();
                setHighlightedSupplierIndex(index => (index + 1) % filteredSuppliers.length);
              } else if (event.key === 'ArrowUp' && filteredSuppliers.length > 0) {
                event.preventDefault();
                setHighlightedSupplierIndex(index => index < 0 ? filteredSuppliers.length - 1 : (index - 1 + filteredSuppliers.length) % filteredSuppliers.length);
              } else if (event.key === 'Enter' && supplierSearch && filteredSuppliers.length > 0) {
                event.preventDefault();
                event.stopPropagation();
                selectSupplier(filteredSuppliers[highlightedSupplierIndex] || filteredSuppliers[0]);
              } else if (event.key === 'Escape' && supplierSearch) {
                event.preventDefault();
                event.stopPropagation();
                setSupplierSearch('');
              }
            }}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={Boolean(supplierSearch && filteredSuppliers.length > 0)}
            aria-controls="purchase-supplier-options"
            aria-activedescendant={highlightedSupplierIndex >= 0 ? `purchase-supplier-option-${highlightedSupplierIndex}` : undefined}
            className="w-full pl-10 pr-8 py-2.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-semibold text-foreground"
          />
          {(supplierSearch || supplierName) && (
            <button
              onClick={() => {
                setSupplierSearch('');
                setSupplierName('');
                setSupplierId('');
                setHighlightedSupplierIndex(-1);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-1 hover:bg-muted rounded-lg transition-colors cursor-pointer"
              type="button"
              aria-label="Clear supplier"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {supplierSearch && filteredSuppliers.length > 0 && (
            <div
              ref={supplierOptionsRef}
              id="purchase-supplier-options"
              role="listbox"
              className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-50 max-h-[200px] overflow-y-auto"
            >
              {filteredSuppliers.map((s, index) => (
                <button
                  key={s.party_id}
                  type="button"
                  id={`purchase-supplier-option-${index}`}
                  role="option"
                  aria-selected={index === highlightedSupplierIndex}
                  onMouseDown={event => { event.preventDefault(); selectSupplier(s); }}
                  onMouseEnter={() => setHighlightedSupplierIndex(index)}
                  className={clsx(
                    'w-full flex items-center gap-2 px-3 py-2 text-left border-b border-border/40 last:border-0 cursor-pointer',
                    index === highlightedSupplierIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted/40'
                  )}
                >
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-foreground truncate">{s.name}</div>
                    {s.phone && <div className="text-[10px] text-muted-foreground">{s.phone}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenCreateSupplier}
          className="p-2.5 rounded-xl text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-all active:scale-95 cursor-pointer shrink-0 shadow-inner"
          title="Create Supplier"
        >
          <UserPlus className="w-4 h-4" />
        </button>
        <div className="flex gap-1.5 p-1.5 bg-muted/50 dark:bg-muted/20 border border-border rounded-2xl overflow-x-auto scrollbar-none shadow-inner select-none shrink-0">
          {/* Tab: GST */}
          <button
            type="button"
            onClick={() => setBillType('GST')}
            className={clsx(
              "flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0",
              billType === 'GST'
                ? "bg-background shadow-md shadow-foreground/[0.03] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-extrabold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <span className={clsx(
              "w-1.5 h-1.5 rounded-full shrink-0",
              billType === 'GST' ? "bg-emerald-500" : "bg-muted-foreground/40"
            )} />
            {localizeTaxText("GST")}
            <span className={clsx(
              "flex items-center justify-center w-4 h-4 rounded-md text-[10px] font-black transition-opacity",
              billType === 'GST' ? "bg-emerald-500/15 text-emerald-600" : "bg-muted-foreground/15 text-muted-foreground",
              gstHasItems ? "opacity-100" : "opacity-0"
            )}>✓</span>
          </button>
          {/* Tab: Estimate */}
          <button
            type="button"
            onClick={() => setBillType('ESTIMATE')}
            className={clsx(
              "flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0",
              billType === 'ESTIMATE'
                ? "bg-background shadow-md shadow-foreground/[0.03] text-amber-600 dark:text-amber-400 border-amber-500/30 font-extrabold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <span className={clsx(
              "w-1.5 h-1.5 rounded-full shrink-0",
              billType === 'ESTIMATE' ? "bg-amber-500" : "bg-muted-foreground/40"
            )} />
            Estimate
            <span className={clsx(
              "flex items-center justify-center w-4 h-4 rounded-md text-[10px] font-black transition-opacity",
              billType === 'ESTIMATE' ? "bg-amber-500/15 text-amber-600" : "bg-muted-foreground/15 text-muted-foreground",
              estHasItems ? "opacity-100" : "opacity-0"
            )}>✓</span>
          </button>
        </div>
      </div>

      {/* ── Notes Row ── */}
      <div className="mt-3.5 pt-3.5 border-t border-border/50 flex items-center gap-3">
        <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
          <Tag className="w-3.5 h-3.5" />
        </div>
        <input
          type="text"
          placeholder="Notes / Remarks (optional)"
          value={billNotes}
          onChange={e => setBillNotes(e.target.value)}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
        />
        {billNotes && (
          <button
            type="button"
            onClick={() => setBillNotes('')}
            className="text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
