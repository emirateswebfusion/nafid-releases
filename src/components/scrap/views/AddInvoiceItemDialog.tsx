import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import React from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import { Select } from '../../ui/Select';
import type { ScrapCategory } from '../scrapTypes';

export interface AddInvoiceItemDialogProps {
  addItemForm: { categoryId: string; quantity: string; rate: string; notes: string; };
  categories: ScrapCategory[];
  fieldCls: "w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm";
  handleAddLineItemToInvoice: (e: React.FormEvent) => Promise<void>;
  handleFormKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  isAddingItemSaving: boolean;
  selectedInvoiceNumber: string;
  setAddItemForm: React.Dispatch<React.SetStateAction<{ categoryId: string; quantity: string; rate: string; notes: string; }>>;
  setIsAddingItem: React.Dispatch<React.SetStateAction<boolean>>;
}

/** Add a scrap item line to a saved scrap invoice. */
export function AddInvoiceItemDialog({
  addItemForm, categories, fieldCls, handleAddLineItemToInvoice, handleFormKeyDown, isAddingItemSaving,
  selectedInvoiceNumber, setAddItemForm, setIsAddingItem,
}: AddInvoiceItemDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <form onSubmit={handleAddLineItemToInvoice} className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4" onKeyDown={handleFormKeyDown} data-enter-nav>
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Add Item to Invoice</h3>
              <p className="text-xs text-muted-foreground">Invoice #{selectedInvoiceNumber}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsAddingItem(false)}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Select Scrap Category *</label>
            <Select
              value={addItemForm.categoryId}
              onChange={v => {
                const selected = categories.find(c => c.scrap_category_id === v);
                setAddItemForm(f => ({
                  ...f,
                  categoryId: v,
                  rate: selected ? String(selected.purchase_price || '') : f.rate,
                }));
              }}
              options={[
                { value: '', label: '-- Select Category --' },
                ...categories.map(c => ({ value: c.scrap_category_id, label: `${c.name} (${c.unit}) - ${getCurrencyPrefix()}${c.purchase_price}/${c.unit}` })),
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Quantity *</label>
              <input
                required
                type="number"
                step="0.001"
                min="0.001"
                placeholder="0.000"
                value={addItemForm.quantity}
                onChange={e => setAddItemForm(f => ({ ...f, quantity: e.target.value }))}
                className={fieldCls}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Rate ({getCurrencyPrefix()}) *</label>
              <input
                required
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={addItemForm.rate}
                onChange={e => setAddItemForm(f => ({ ...f, rate: e.target.value }))}
                className={fieldCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Notes</label>
            <input
              type="text"
              placeholder="Item notes (optional)"
              value={addItemForm.notes}
              onChange={e => setAddItemForm(f => ({ ...f, notes: e.target.value }))}
              className={fieldCls}
            />
          </div>

          {addItemForm.quantity && addItemForm.rate && Number(addItemForm.quantity) > 0 && Number(addItemForm.rate) > 0 && (
            <div className="pt-2 flex items-center justify-between text-sm border-t border-border font-bold">
              <span className="text-muted-foreground">Line Total:</span>
              <span className="text-orange-500 text-base">{getCurrencyPrefix()}{(Number(addItemForm.quantity) * Number(addItemForm.rate)).toFixed(2)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="submit"
            disabled={isAddingItemSaving}
            className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-bold transition-all shadow-sm cursor-pointer"
          >
            {isAddingItemSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Item
          </button>
        </div>
      </form>
    </div>
  );
}
