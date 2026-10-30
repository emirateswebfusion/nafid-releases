import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import React from 'react';
import { Modal } from '../../ui/Modal';
import clsx from 'clsx';
import { Clock, X, Loader2, UserPlus } from 'lucide-react';
import type { PricingTier } from '../customerTypes';

export interface AddCustomerModalProps {
  addForm: { name: string; phone: string; address: string; pricing_tier_id: string; credit_limit: string; credit_period_enabled: boolean; credit_period_days: string; credit_period_basis: string; restrict_on_credit_expiry: boolean; };
  addModalOpen: boolean;
  handleConfirmAddCustomer: () => Promise<void>;
  isSavingAdd: boolean;
  pricingTiers: PricingTier[];
  setAddForm: React.Dispatch<React.SetStateAction<{ name: string; phone: string; address: string; pricing_tier_id: string; credit_limit: string; credit_period_enabled: boolean; credit_period_days: string; credit_period_basis: string; restrict_on_credit_expiry: boolean; }>>;
  setAddModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/** Add customer dialog: details, GSTIN, party link, pricing tier, loyalty and opening balance. */
export function AddCustomerModal({
  addForm, addModalOpen, handleConfirmAddCustomer, isSavingAdd, pricingTiers, setAddForm, setAddModalOpen,
}: AddCustomerModalProps) {
  return (
    <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add New Customer" size="md">
      <div className="space-y-4">
        <div className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Name <span className="text-destructive">*</span></label>
            <input
              type="text"
              value={addForm.name}
              onChange={e => setAddForm(prev => ({ ...prev, name: e.target.value }))}
              className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm"
              placeholder="Customer name"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Phone</label>
              <input
                type="tel"
                value={addForm.phone}
                onChange={e => setAddForm(prev => ({ ...prev, phone: e.target.value }))}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm"
                placeholder="Phone number"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Credit Limit ({getCurrencyPrefix()})</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm pointer-events-none">{getCurrencyPrefix()}</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 50000 (0 = No limit)"
                  value={addForm.credit_limit}
                  onChange={e => setAddForm(prev => ({ ...prev, credit_limit: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl pl-8 pr-3.5 py-2.5 text-sm font-semibold text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm no-spinners"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Address</label>
            <textarea
              value={addForm.address}
              onChange={e => setAddForm(prev => ({ ...prev, address: e.target.value }))}
              rows={2}
              className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm resize-none"
              placeholder="Customer address"
            />
          </div>

          {pricingTiers.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Pricing Tier</label>
              <select
                value={addForm.pricing_tier_id}
                onChange={e => setAddForm(prev => ({ ...prev, pricing_tier_id: e.target.value }))}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm appearance-none"
              >
                <option value="">No Tier (Default Pricing)</option>
                {pricingTiers.map(tier => (
                  <option key={tier.pricing_tier_id} value={tier.pricing_tier_id}>{tier.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Credit Period Section */}
          <div className="pt-2 border-t border-border/70">
            <div className={clsx(
              "rounded-2xl border transition-all duration-200 overflow-hidden",
              addForm.credit_period_enabled
                ? "bg-card border-indigo-500/30 shadow-xs"
                : "bg-muted/15 border-border/60"
            )}>
              {/* Header & Toggle */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={clsx(
                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                    addForm.credit_period_enabled
                      ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                      : "bg-muted text-muted-foreground"
                  )}>
                    <Clock className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-foreground uppercase tracking-wider">Credit Period Management</span>
                      {addForm.credit_period_enabled && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-mono">
                          {addForm.credit_period_days || 30} Days
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      Enforce payment deadlines independently of credit limits.
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    checked={addForm.credit_period_enabled}
                    onChange={e => setAddForm(prev => ({ ...prev, credit_period_enabled: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
                </label>
              </div>

              {addForm.credit_period_enabled && (
                <div className="p-4 pt-2 border-t border-border/60 space-y-4 animate-in fade-in duration-200">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Credit Duration (Days)
                      </label>
                      <span className="text-xs font-extrabold text-primary font-mono">
                        {addForm.credit_period_days || 30} Days Grace Period
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-xl border border-border/70 shrink-0">
                        {[15, 30, 45, 50, 60].map(days => (
                          <button
                            key={days}
                            type="button"
                            onClick={() => setAddForm(prev => ({ ...prev, credit_period_days: String(days) }))}
                            className={clsx(
                              "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95",
                              String(addForm.credit_period_days) === String(days)
                                ? "bg-primary text-primary-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground hover:bg-background/80"
                            )}
                          >
                            {days}d
                          </button>
                        ))}
                      </div>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="Custom days (e.g. 30)"
                          value={addForm.credit_period_days}
                          onChange={e => setAddForm(prev => ({ ...prev, credit_period_days: e.target.value }))}
                          className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs font-bold text-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all shadow-xs no-spinners pr-14"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground pointer-events-none">
                          Days
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Calculation Basis
                    </label>
                    <select
                      value={addForm.credit_period_basis}
                      onChange={e => setAddForm(prev => ({ ...prev, credit_period_basis: e.target.value }))}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs font-bold text-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all shadow-xs"
                    >
                      <option value="BILL_BASED">Option A: Bill-Based (Payment due date calculated separately from each bill)</option>
                      <option value="OLDEST_UNPAID">Option B: Oldest Unpaid Bill (Due date counted from oldest unsettled bill)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                      When Credit Period Expires
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setAddForm(prev => ({ ...prev, restrict_on_credit_expiry: true }))}
                        className={clsx(
                          "p-3 rounded-xl border-2 text-left transition-all cursor-pointer active:scale-98 flex items-start gap-2.5",
                          addForm.restrict_on_credit_expiry
                            ? "border-rose-500 bg-rose-500/10 shadow-xs"
                            : "border-border/80 bg-background hover:bg-muted/30"
                        )}
                      >
                        <span className="text-base leading-none mt-0.5">🚫</span>
                        <div className="min-w-0">
                          <p className={clsx("text-xs font-black", addForm.restrict_on_credit_expiry ? "text-rose-600 dark:text-rose-400" : "text-foreground")}>
                            Restrict Further Credit
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                            Blocks credit purchases if past bills are overdue. Cash sales remain available.
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAddForm(prev => ({ ...prev, restrict_on_credit_expiry: false }))}
                        className={clsx(
                          "p-3 rounded-xl border-2 text-left transition-all cursor-pointer active:scale-98 flex items-start gap-2.5",
                          !addForm.restrict_on_credit_expiry
                            ? "border-emerald-500 bg-emerald-500/10 shadow-xs"
                            : "border-border/80 bg-background hover:bg-muted/30"
                        )}
                      >
                        <span className="text-base leading-none mt-0.5">✅</span>
                        <div className="min-w-0">
                          <p className={clsx("text-xs font-black", !addForm.restrict_on_credit_expiry ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                            Allow Further Credit
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                            Can continue credit purchases even after expiry, subject to available credit limit.
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <button
            type="button"
            onClick={() => setAddModalOpen(false)}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-muted hover:bg-muted/80 text-foreground border border-border transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <X className="w-4 h-4 mr-1.5" /> Cancel
          </button>
          <button
            type="button"
            disabled={isSavingAdd}
            onClick={handleConfirmAddCustomer}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground transition-all flex items-center gap-2 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
          >
            {isSavingAdd ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating Customer...</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Create Customer</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
