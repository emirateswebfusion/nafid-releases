import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import React from 'react';
import { Activity, TrendingUp, TrendingDown, Loader2, Save } from 'lucide-react';
import clsx from 'clsx';
import { formatStock } from '../scrapFormat';
import type { ScrapCategory } from '../scrapTypes';

export interface ScrapTxFormProps {
  fieldCls: "w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm";
  handleFormKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  handleSaveTransaction: (e: React.FormEvent) => Promise<void>;
  isSavingTx: boolean;
  /** Rendered only while a category is selected. */
  selectedCategory: ScrapCategory;
  setTxForm: React.Dispatch<React.SetStateAction<{ type: "PURCHASE" | "SALE"; categoryId: string; quantity: string; rate: string; party_name: string; notes: string; }>>;
  txForm: { type: "PURCHASE" | "SALE"; categoryId: string; quantity: string; rate: string; party_name: string; notes: string; };
}

/** Record a scrap purchase / adjustment transaction for a category. */
export function ScrapTxForm({
  fieldCls, handleFormKeyDown, handleSaveTransaction, isSavingTx, selectedCategory, setTxForm, txForm,
}: ScrapTxFormProps) {
  return (
    <form onSubmit={handleSaveTransaction} className="flex flex-col flex-1 min-h-0 bg-background">
      <div className="flex-1 overflow-y-auto p-5 space-y-4" onKeyDown={handleFormKeyDown} data-enter-nav>
        <section className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Activity className="w-4 h-4" />
            </div>
            <span className="text-xs font-black uppercase tracking-wider text-primary">Transaction Details</span>
            <span className="ml-auto text-xs text-muted-foreground font-medium">
              Category: <span className="font-bold text-foreground">{selectedCategory.name}</span>
            </span>
          </div>

          <div className="mb-5">
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Transaction Type</label>
            <div className="grid grid-cols-2 gap-3 max-w-sm">
              <button
                type="button"
                onClick={() => setTxForm(f => ({ ...f, type: 'PURCHASE', rate: selectedCategory ? String(selectedCategory.purchase_price) : f.rate }))}
                className={clsx(
                  'py-3.5 px-4 rounded-xl border-2 text-sm font-black transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center gap-2',
                  txForm.type === 'PURCHASE'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 shadow-sm'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted'
                )}
              >
                <TrendingUp className="w-4 h-4" /> Purchase
              </button>
              <button
                type="button"
                onClick={() => setTxForm(f => ({ ...f, type: 'SALE', rate: selectedCategory ? String(selectedCategory.selling_price) : f.rate }))}
                className={clsx(
                  'py-3.5 px-4 rounded-xl border-2 text-sm font-black transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center gap-2',
                  txForm.type === 'SALE'
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 shadow-sm'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted'
                )}
              >
                <TrendingDown className="w-4 h-4" /> Sale
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Quantity ({selectedCategory.unit}) *</label>
              <input
                required
                type="number"
                step="0.001"
                min="0.001"
                placeholder="0.000"
                value={txForm.quantity}
                onChange={e => setTxForm(f => ({ ...f, quantity: e.target.value }))}
                onWheel={e => (e.target as HTMLInputElement).blur()}
                className={clsx(fieldCls, 'no-spinners text-lg font-black')}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Rate ({getCurrencyPrefix()}) *</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm pointer-events-none">{getCurrencyPrefix()}</span>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={txForm.rate}
                  onChange={e => setTxForm(f => ({ ...f, rate: e.target.value }))}
                  onWheel={e => (e.target as HTMLInputElement).blur()}
                  className={clsx(fieldCls, 'pl-8 no-spinners text-lg font-black')}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Party / Customer</label>
              <input
                type="text"
                placeholder="Party name (optional)"
                value={txForm.party_name}
                onChange={e => setTxForm(f => ({ ...f, party_name: e.target.value }))}
                className={fieldCls}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Notes</label>
              <input
                type="text"
                placeholder="Optional notes"
                value={txForm.notes}
                onChange={e => setTxForm(f => ({ ...f, notes: e.target.value }))}
                className={fieldCls}
              />
            </div>
          </div>

          {txForm.quantity && txForm.rate && Number(txForm.quantity) > 0 && Number(txForm.rate) > 0 && (
            <div className="pt-3 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground font-semibold">Total Amount</span>
                <span className={clsx(
                  'text-xl font-black',
                  txForm.type === 'PURCHASE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                )}>
                  {(Number(txForm.quantity) * Number(txForm.rate)).toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="shrink-0 border-t border-border bg-card px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground font-medium">
            Current Stock: <span className="font-bold text-foreground">{formatStock(selectedCategory.current_stock)} {selectedCategory.unit}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isSavingTx}
              className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              {isSavingTx ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSavingTx ? 'Saving…' : `Record ${txForm.type === 'PURCHASE' ? 'Purchase' : 'Sale'}`}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
