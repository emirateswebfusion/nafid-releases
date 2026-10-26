import React from 'react';
import { Pencil, X, Recycle as RecycleIcon, Loader2, Save } from 'lucide-react';
import { Select } from '../../ui/Select';
import type { UpiPageConfig } from '../../../utils/upiConfig';
import type { ScrapInvoiceRow, ScrapUpiSourceRow } from '../scrapTypes';

export interface EditInvoiceHeaderDialogProps {
  editHeaderForm: { party_name: string; customer_phone: string; customer_address: string; payment_status: string; };
  editHeaderInvoice: ScrapInvoiceRow | null;
  fieldCls: "w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm";
  handleFormKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  handleSaveInvoiceHeader: (e: React.FormEvent) => Promise<void>;
  isSavingHeader: boolean;
  scrapUpiSourceId: string;
  setEditHeaderForm: React.Dispatch<React.SetStateAction<{ party_name: string; customer_phone: string; customer_address: string; payment_status: string; }>>;
  setEditHeaderInvoice: React.Dispatch<React.SetStateAction<ScrapInvoiceRow | null>>;
  setScrapUpiSourceId: React.Dispatch<React.SetStateAction<string>>;
  upiPageConfig: UpiPageConfig;
  upiSources: ScrapUpiSourceRow[];
}

/** Edit a scrap invoice's header (customer, date, payment). */
export function EditInvoiceHeaderDialog({
  editHeaderForm, editHeaderInvoice, fieldCls, handleFormKeyDown, handleSaveInvoiceHeader, isSavingHeader,
  scrapUpiSourceId, setEditHeaderForm, setEditHeaderInvoice, setScrapUpiSourceId, upiPageConfig, upiSources,
}: EditInvoiceHeaderDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <form onSubmit={handleSaveInvoiceHeader} className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4" onKeyDown={handleFormKeyDown} data-enter-nav>
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Pencil className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Edit Scrap Invoice Header</h3>
              <p className="text-xs text-muted-foreground">{(editHeaderInvoice as ScrapInvoiceRow).invoice_number || (editHeaderInvoice as ScrapInvoiceRow).scrap_invoice_number}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditHeaderInvoice(null)}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Customer / Party Name</label>
            <input
              type="text"
              placeholder="Customer Name"
              value={editHeaderForm.party_name}
              onChange={e => setEditHeaderForm(f => ({ ...f, party_name: e.target.value }))}
              className={fieldCls}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Customer Phone</label>
            <input
              type="text"
              placeholder="Phone number"
              value={editHeaderForm.customer_phone}
              onChange={e => setEditHeaderForm(f => ({ ...f, customer_phone: e.target.value }))}
              className={fieldCls}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Customer Address</label>
            <input
              type="text"
              placeholder="Address"
              value={editHeaderForm.customer_address}
              onChange={e => setEditHeaderForm(f => ({ ...f, customer_address: e.target.value }))}
              className={fieldCls}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Payment Status</label>
            <Select
              value={editHeaderForm.payment_status}
              onChange={v => setEditHeaderForm(f => ({ ...f, payment_status: v }))}
              options={[
                { value: 'CASH', label: 'CASH' },
                { value: 'UPI', label: 'UPI' },
                { value: 'CARD', label: 'CARD' },
                { value: 'CREDIT', label: 'CREDIT' },
                { value: 'PAID', label: 'PAID' },
              ]}
            />
          </div>

          {/* UPI Account Selector (Page-wise Config: Scrap Manager) */}
          {editHeaderForm.payment_status === 'UPI' && upiPageConfig.scrap && upiSources.length > 0 && (
            <div className="p-3 bg-violet-500/10 border border-violet-500/30 rounded-xl space-y-1">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <RecycleIcon className="w-3.5 h-3.5 text-violet-500" />
                Select Scrap UPI Account
              </label>
              <Select
                value={scrapUpiSourceId || upiSources[0]?.source_id || ''}
                onChange={(val) => setScrapUpiSourceId(val)}
                options={upiSources.map((s: ScrapUpiSourceRow) => ({
                  value: s.source_id,
                  label: `${s.name} (${s.upi_id || 'No UPI ID'})`
                }))}
                className="w-full text-xs"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="submit"
            disabled={isSavingHeader}
            className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-bold transition-all shadow-sm cursor-pointer"
          >
            {isSavingHeader ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}
