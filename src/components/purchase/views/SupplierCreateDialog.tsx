import { localizeTaxText } from '../../../utils/localization/storeProfile';
import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import React from 'react';
import { UserCircle, X, Phone, MapPin, Banknote, Loader2, UserPlus } from 'lucide-react';

export interface SupplierCreateDialogProps {
  handleCreateParty: () => Promise<void>;
  handlePartyFormKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  isSavingParty: boolean;
  newPartyForm: { name: string; phone: string; address: string; gstin: string; opening_balance: string; balance_type: "PAYABLE"; notes: string; };
  setNewPartyForm: React.Dispatch<React.SetStateAction<{ name: string; phone: string; address: string; gstin: string; opening_balance: string; balance_type: "PAYABLE"; notes: string; }>>;
  setShowPartyCreateForm: React.Dispatch<React.SetStateAction<boolean>>;
}

/** Create supplier dialog opened from the purchase bill screen. */
export function SupplierCreateDialog({
  handleCreateParty, handlePartyFormKeyDown, isSavingParty, newPartyForm, setNewPartyForm, setShowPartyCreateForm,
}: SupplierCreateDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowPartyCreateForm(false)}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-3xl bg-background border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
        onKeyDown={handlePartyFormKeyDown}
      >
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-border/60 flex items-center justify-between bg-card">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <UserCircle className="w-4 h-4" />
            </div>
            <span className="text-xs font-black uppercase tracking-wider text-primary">Create Supplier</span>
</div>
        <label className="text-red-500 font-bold text-sm flex items-center" aria-hidden="true">*</label>
        <button
            type="button"
            onClick={() => setShowPartyCreateForm(false)}
            className="p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4 text-destructive" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 max-h-[70vh]" data-enter-nav>
          {/* Supplier Name */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Supplier Name *</label>
            <input
              type="text"
              placeholder="e.g. Rajan Traders"
              value={newPartyForm.name}
              onChange={e => setNewPartyForm(f => ({ ...f, name: e.target.value }))}
              className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm"
              autoFocus
            />
          </div>

          {/* Phone + GSTIN */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Phone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Phone number"
                  value={newPartyForm.phone}
                  onChange={e => setNewPartyForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{localizeTaxText("GSTIN")}</label>
              <input
                type="text"
                placeholder="Optional"
                value={newPartyForm.gstin}
                onChange={e => setNewPartyForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm font-mono tracking-wider"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Address</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <textarea
                placeholder="Optional address"
                rows={2}
                value={newPartyForm.address}
                onChange={e => setNewPartyForm(f => ({ ...f, address: e.target.value }))}
                className="w-full bg-background border border-border rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm resize-none"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Notes</label>
            <textarea
              placeholder="Internal notes about this party (optional)"
              rows={2}
              value={newPartyForm.notes}
              onChange={e => setNewPartyForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm resize-none"
            />
          </div>

          {/* Opening Balance */}
          <div className="bg-card border border-border/60 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
              <Banknote className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Opening Balance (Optional)</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Type</label>
                <div className="flex h-[36px] items-center">
                  <span className="inline-flex items-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-black text-emerald-700 dark:text-emerald-400">
                    ↓ Supplier payable
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Amount ({getCurrencyPrefix()})</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-xs pointer-events-none">{getCurrencyPrefix()}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={newPartyForm.opening_balance}
                    onChange={e => setNewPartyForm(f => ({ ...f, opening_balance: e.target.value }))}
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    className="w-full bg-background border border-border rounded-xl pl-7 pr-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm no-spinners"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border/60 bg-card px-6 py-4 flex items-center justify-end gap-2">
          <button
            type="button"
            data-enter-submit
            disabled={isSavingParty || !newPartyForm.name.trim()}
            onClick={handleCreateParty}
            className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
          >
            {isSavingParty ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {isSavingParty ? 'Creating…' : 'Create Supplier'}
          </button>
        </div>
      </div>
    </div>
  );
}
