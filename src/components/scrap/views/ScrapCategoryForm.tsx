import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import React from 'react';
import { Recycle, Loader2, Save } from 'lucide-react';
import { CurrencyIcon } from '../../ui/CurrencyIcon';
import { Select } from '../../ui/Select';
import clsx from 'clsx';
import type { ScrapCategory } from '../scrapTypes';

export interface ScrapCategoryFormProps {
  editingCategory: ScrapCategory | null;
  fieldCls: "w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm";
  formData: { name: string; purchase_price: string; selling_price: string; current_stock: string; unit: string; };
  handleFormKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  handleSaveCategory: () => Promise<void>;
  isSavingCategory: boolean;
  setFormData: React.Dispatch<React.SetStateAction<{ name: string; purchase_price: string; selling_price: string; current_stock: string; unit: string; }>>;
}

/** Create / edit a scrap category (name, unit, rates). */
export function ScrapCategoryForm({
  editingCategory, fieldCls, formData, handleFormKeyDown, handleSaveCategory, isSavingCategory, setFormData,
}: ScrapCategoryFormProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      <div className="flex-1 overflow-y-auto p-5 space-y-4" onKeyDown={handleFormKeyDown} data-enter-nav>
        <section className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
            <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500">
              <Recycle className="w-4 h-4" />
            </div>
            <span className="text-xs font-black uppercase tracking-wider text-orange-500">Category Identity</span>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Category Name *</label>
              <input
                type="text"
                placeholder="e.g. Iron Scrap"
                value={formData.name}
                onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                className={fieldCls}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Unit</label>
              <Select
                value={formData.unit}
                onChange={v => setFormData(f => ({ ...f, unit: v }))}
                options={[
                  { value: 'Kgs', label: 'Kgs' },
                  { value: 'Pcs', label: 'Pcs' },
                  { value: 'Grams', label: 'Grams' },
                  { value: 'Ltrs', label: 'Ltrs' },
                ]}
              />
            </div>
          </div>
        </section>

        <section className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
              <CurrencyIcon className="w-4 h-4" />
            </div>
            <span className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Pricing & Stock</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Purchase Rate ({getCurrencyPrefix()})</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm pointer-events-none">{getCurrencyPrefix()}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formData.purchase_price}
                  onChange={e => setFormData(f => ({ ...f, purchase_price: e.target.value }))}
                  onWheel={e => (e.target as HTMLInputElement).blur()}
                  className={clsx(fieldCls, 'pl-8 no-spinners')}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Selling Rate ({getCurrencyPrefix()})</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm pointer-events-none">{getCurrencyPrefix()}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formData.selling_price}
                  onChange={e => setFormData(f => ({ ...f, selling_price: e.target.value }))}
                  onWheel={e => (e.target as HTMLInputElement).blur()}
                  className={clsx(fieldCls, 'pl-8 no-spinners')}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{editingCategory ? 'Current Stock' : 'Opening Stock'}</label>
              <input
                type="number"
                step="0.001"
                min="0"
                placeholder="0"
                value={formData.current_stock}
                onChange={e => setFormData(f => ({ ...f, current_stock: e.target.value }))}
                onWheel={e => (e.target as HTMLInputElement).blur()}
                className={clsx(fieldCls, 'no-spinners')}
              />
            </div>
          </div>
        </section>
      </div>

      <div className="shrink-0 border-t border-border bg-card px-5 py-3">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isSavingCategory}
            onClick={handleSaveCategory}
            className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
          >
            {isSavingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSavingCategory ? 'Saving…' : editingCategory ? 'Update Category' : 'Create Category'}
          </button>
        </div>
      </div>
    </div>
  );
}
