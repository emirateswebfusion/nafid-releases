import React from 'react';
import { ALL_QUICK_COLUMNS, type QuickProductColumnId, DEFAULT_QUICK_COLUMNS } from './types';
import { Check, X, SlidersHorizontal, RotateCcw } from 'lucide-react';

export interface QuickProductColumnsModalProps {
  isOpen: boolean;
  onClose: () => void;
  visibleColumns: QuickProductColumnId[];
  onToggleColumn: (colId: QuickProductColumnId) => void;
  onSetColumns: (cols: QuickProductColumnId[]) => void;
}

export const QuickProductColumnsModal: React.FC<QuickProductColumnsModalProps> = ({
  isOpen,
  onClose,
  visibleColumns,
  onToggleColumn,
  onSetColumns,
}) => {
  if (!isOpen) return null;

  const presets: { name: string; cols: QuickProductColumnId[] }[] = [
    { name: 'Name + Rate', cols: ['name', 'basePrice'] },
    { name: 'Name + Rate + Qty (Default)', cols: DEFAULT_QUICK_COLUMNS },
    { name: 'Standard (+ Cost, Category)', cols: ['name', 'basePrice', 'qty', 'purchasePrice', 'category'] },
    { name: 'All Fields', cols: ALL_QUICK_COLUMNS.map(c => c.id) },
  ];

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Configure Columns</h3>
              <p className="text-[11px] text-muted-foreground">Select fields to show in rapid entry table</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Presets */}
        <div className="px-5 pt-3.5 pb-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">
            Quick Presets
          </span>
          <div className="flex flex-wrap gap-1.5">
            {presets.map(p => (
              <button
                key={p.name}
                type="button"
                onClick={() => onSetColumns(p.cols)}
                className="px-2.5 py-1 text-xs font-medium rounded-lg border border-border bg-muted/40 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-all cursor-pointer"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Column Toggles */}
        <div className="p-5 space-y-1.5 max-h-[50vh] overflow-y-auto">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">
            Field Visibility
          </span>
          {ALL_QUICK_COLUMNS.map(col => {
            const isChecked = visibleColumns.includes(col.id);
            const isRequired = col.required;

            return (
              <label
                key={col.id}
                className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-all cursor-pointer ${
                  isChecked
                    ? 'border-primary/30 bg-primary/5 text-foreground'
                    : 'border-border/50 bg-background/50 text-muted-foreground hover:bg-muted/30'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                      isChecked
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-muted-foreground/40 bg-background'
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <div>
                    <span className="text-sm font-semibold block leading-tight">{col.label}</span>
                    <span className="text-[10px] text-muted-foreground">{col.shortLabel}</span>
                  </div>
                </div>
                {isRequired ? (
                  <span className="text-[10px] font-bold text-amber-500 uppercase px-1.5 py-0.5 rounded bg-amber-500/10">
                    Mandatory
                  </span>
                ) : (
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isChecked}
                    onChange={() => onToggleColumn(col.id)}
                  />
                )}
              </label>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/20">
          <button
            type="button"
            onClick={() => onSetColumns(DEFAULT_QUICK_COLUMNS)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-lg transition-all shadow-xs cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
