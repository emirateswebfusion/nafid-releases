import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import { Input } from '../../ui/Input';
import { Lock, Check } from 'lucide-react';
import type { PaymentMethodsState } from '../hooks/usePaymentMethodsState';

export interface PaymentSourceFormFieldsProps {
  saveSource: () => Promise<void>;
  pmState: PaymentMethodsState;
}

/** Add / edit form inputs: type-specific credentials with presets, balances and rules, toggles, submit actions. */
export function PaymentSourceFormFields({
  saveSource, pmState,
}: PaymentSourceFormFieldsProps) {
  const { editing, form, isSaving, setForm } = pmState;
  return (
    <div className="lg:col-span-7 space-y-6">
      
      {/* Method Credentials Panel */}
      <div className="bg-card/80 border border-border/80 rounded-3xl p-6 shadow-sm space-y-5 backdrop-blur-md">
        <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block border-b border-border/40 pb-2">
          2. Method Details &amp; Identifiers
        </span>

        <div>
          <label className="text-xs font-bold text-foreground mb-1.5 block">Method Display Name *</label>
          <Input
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. HDFC Main Current A/C"
          />
          <p className="text-[11px] text-muted-foreground mt-1">This display title will appear on payment selection dropdowns during checkout.</p>
        </div>

        {/* Bank Account Fields & Presets */}
        {form.type === 'BANK' && (
          <div className="space-y-4 pt-1">
            <div>
              <label className="text-xs font-bold text-foreground mb-1.5 block">Bank Name</label>
              <Input
                value={form.bank_name}
                onChange={e => setForm({ ...form, bank_name: e.target.value })}
                placeholder="e.g. HDFC Bank"
              />
              {/* Quick Bank Presets */}
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Popular:</span>
                {['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Bank'].map(b => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setForm({ ...form, bank_name: b })}
                    className="px-2 py-0.5 text-[10px] font-semibold bg-muted/60 hover:bg-muted border border-border/50 text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-foreground mb-1.5 block">Account Number</label>
                <Input
                  value={form.account_number}
                  onChange={e => setForm({ ...form, account_number: e.target.value })}
                  placeholder="e.g. 501002938472"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-foreground mb-1.5 block">Account Holder Name</label>
                <Input
                  value={form.holder_name}
                  onChange={e => setForm({ ...form, holder_name: e.target.value })}
                  placeholder="Business / Legal Name"
                />
              </div>
            </div>
          </div>
        )}

        {/* Card Fields & Presets */}
        {form.type === 'CARD' && (
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-foreground mb-1.5 block">Card Network / POS Provider</label>
                <Input
                  value={form.bank_name}
                  onChange={e => setForm({ ...form, bank_name: e.target.value })}
                  placeholder="e.g. Visa Business / HDFC POS"
                />
                {/* Quick Network Presets */}
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  {['Visa Business', 'Mastercard', 'RuPay Corporate', 'Amex'].map(net => (
                    <button
                      key={net}
                      type="button"
                      onClick={() => setForm({ ...form, bank_name: net })}
                      className="px-2 py-0.5 text-[10px] font-semibold bg-muted/60 hover:bg-muted border border-border/50 text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
                    >
                      {net}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-foreground mb-1.5 block">Last 4 Digits</label>
                <Input
                  value={form.account_number}
                  maxLength={4}
                  onChange={e => setForm({ ...form, account_number: e.target.value.replace(/\D/g, '') })}
                  placeholder="e.g. 4829"
                />
              </div>
            </div>
          </div>
        )}

        {/* UPI VPA Fields & Suffix Presets */}
        {form.type === 'UPI' && (
          <div className="space-y-4 pt-1">
            <div>
              <label className="text-xs font-bold text-foreground mb-1.5 block">UPI VPA Handle *</label>
              <Input
                value={form.upi_id}
                onChange={e => setForm({ ...form, upi_id: e.target.value })}
                placeholder="e.g. storename@okhdfcbank"
              />
              {/* Quick UPI Handle Suffix Chips */}
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Suffixes:</span>
                {['@okhdfcbank', '@ybl', '@paytm', '@ibl', '@axl', '@sbi'].map(suf => (
                  <button
                    key={suf}
                    type="button"
                    onClick={() => {
                      const base = form.upi_id.split('@')[0] || 'store';
                      setForm({ ...form, upi_id: `${base}${suf}` });
                    }}
                    className="px-2 py-0.5 text-[10px] font-semibold bg-muted/60 hover:bg-muted border border-border/50 text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer font-mono"
                  >
                    {suf}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Balances & Rules Panel */}
      <div className="bg-card/80 border border-border/80 rounded-3xl p-6 shadow-sm space-y-5 backdrop-blur-md">
        <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block border-b border-border/40 pb-2">
          3. Initial Balance &amp; Permissions
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-foreground mb-1.5 block flex items-center justify-between">
              <span>Opening Balance ({getCurrencyPrefix()})</span>
              {!!editing && (editing.transaction_count ?? 0) > 0 && (
                <span className="text-[10px] text-amber-500 font-bold flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Locked
                </span>
              )}
            </label>
            <Input
              type="number"
              step="any"
              min="0"
              value={form.opening_balance}
              onChange={e => setForm({ ...form, opening_balance: e.target.value })}
              disabled={!!editing && (editing.transaction_count ?? 0) > 0}
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-foreground mb-1.5 block">Display Order Preference</label>
            <Input
              type="number"
              value={String(form.sort_order)}
              onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
              placeholder="0"
            />
          </div>
        </div>

        {/* Toggle Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
          <label className="flex items-start gap-3 p-4 bg-muted/40 border border-border/60 rounded-2xl cursor-pointer hover:bg-muted/70 transition-colors">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={e => setForm({ ...form, is_default: e.target.checked })}
              className="mt-0.5 w-4 h-4 accent-primary rounded cursor-pointer"
            />
            <div>
              <div className="text-xs font-bold text-foreground">Primary Default Gateway</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Auto-selected channel when settling bills</div>
            </div>
          </label>

          <label className="flex items-start gap-3 p-4 bg-muted/40 border border-border/60 rounded-2xl cursor-pointer hover:bg-muted/70 transition-colors">
            <input
              type="checkbox"
              checked={form.is_enabled}
              onChange={e => setForm({ ...form, is_enabled: e.target.checked })}
              className="mt-0.5 w-4 h-4 accent-primary rounded cursor-pointer"
            />
            <div>
              <div className="text-xs font-bold text-foreground">Active for Billing</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Enable receiving transactions on this method</div>
            </div>
          </label>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/60">
          <button
            type="button"
            onClick={saveSource}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-md shadow-primary/25 disabled:opacity-50 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{isSaving ? 'Saving Payment Method...' : editing ? 'Save Changes' : 'Link Payment Method'}</span>
          </button>
        </div>

      </div>

    </div>
  );
}
