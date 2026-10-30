import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import React from 'react';
import { Pencil, X, Loader2, Save } from 'lucide-react';
import { Select } from '../../ui/Select';
import type { ScrapCategory } from '../scrapTypes';
import type { ScrapInvoiceTxRow } from '../scrapTypes';

export interface EditScrapTxDialogProps {
  categories: ScrapCategory[];
  editTxForm: { scrap_category_id: string; quantity: string; rate: string; party_name: string; notes: string; };
  fieldCls: "w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm";
  handleFormKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  handleSaveEditTx: (e: React.FormEvent) => Promise<void>;
  isSavingTx: boolean;
  setEditingTxItem: React.Dispatch<React.SetStateAction<ScrapInvoiceTxRow | null>>;
  setEditTxForm: React.Dispatch<React.SetStateAction<{ scrap_category_id: string; quantity: string; rate: string; party_name: string; notes: string; }>>;
}

/** Edit one scrap transaction (weight, rate, notes). */
export function EditScrapTxDialog({
  categories, editTxForm, fieldCls, handleFormKeyDown, handleSaveEditTx, isSavingTx, setEditingTxItem, setEditTxForm,
}: EditScrapTxDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <form onSubmit={handleSaveEditTx} className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4" onKeyDown={handleFormKeyDown} data-enter-nav>
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <Pencil className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Edit Scrap Line Item</h3>
              <p className="text-xs text-muted-foreground">Modify category, quantity or rate</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditingTxItem(null)}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Scrap Category *</label>
            <Select
              value={editTxForm.scrap_category_id}
              onChange={v => {
                const selected = categories.find(c => c.scrap_category_id === v);
                setEditTxForm(f => ({
                  ...f,
                  scrap_category_id: v,
                  rate: selected ? String(selected.purchase_price || f.rate) : f.rate,
                }));
              }}
              options={categories.map(c => ({
                value: c.scrap_category_id,
                label: `${c.name} (${c.unit}) - Default: ${getCurrencyPrefix()}${c.purchase_price}/${c.unit}`
              }))}
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
                value={editTxForm.quantity}
                onChange={e => setEditTxForm(f => ({ ...f, quantity: e.target.value }))}
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
                value={editTxForm.rate}
                onChange={e => setEditTxForm(f => ({ ...f, rate: e.target.value }))}
                className={fieldCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Party / Customer Name</label>
            <input
              type="text"
              placeholder="Customer name"
              value={editTxForm.party_name}
              onChange={e => setEditTxForm(f => ({ ...f, party_name: e.target.value }))}
              className={fieldCls}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Notes</label>
            <input
              type="text"
              placeholder="Notes"
              value={editTxForm.notes}
              onChange={e => setEditTxForm(f => ({ ...f, notes: e.target.value }))}
              className={fieldCls}
            />
          </div>

          {editTxForm.quantity && editTxForm.rate && Number(editTxForm.quantity) > 0 && Number(editTxForm.rate) > 0 && (
            <div className="pt-3 border-t border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">New Line Total:</span>
              <span className="text-lg font-black text-orange-500">
                {getCurrencyPrefix()}{(Number(editTxForm.quantity) * Number(editTxForm.rate)).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="submit"
            disabled={isSavingTx}
            className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-bold transition-all shadow-sm cursor-pointer"
          >
            {isSavingTx ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Item
          </button>
        </div>
      </form>
    </div>
  );
}
