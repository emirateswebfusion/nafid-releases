import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowDownToLine, BookOpen, CreditCard, Info, Lock } from 'lucide-react';
import { getSetting, setSetting } from '../../../data/settings';
import { useAuthStore } from '../../../store/authStore';
import { isAdminRole } from '../../../utils/security/permissions';
import { Select } from '../../ui/Select';
import { SwitchField } from '../views/SettingsControls';

const KEYS = ['cash_register_include_scrap_sales', 'cash_register_deduct_returns', 'cash_register_ledger_mode', 'cash_register_payment_methods'] as const;
const METHODS = ['UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE'];
const DEFAULT_OPTIONS = { scrap: true, returns: true, ledger: 'all', methods: [] as string[] };
type Options = typeof DEFAULT_OPTIONS;

function GroupTitle({ icon: Icon, title, hint }: { icon: typeof Info; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-2.5 mb-3">
      <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0"><Icon className="w-3.5 h-3.5" /></div>
      <div>
        <p className="text-xs font-black text-foreground uppercase tracking-wider">{title}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
      </div>
    </div>
  );
}

/** Owner options for cash register reconciliation and payment display. */
export function CashRegisterSettings() {
  const tenantId = useAuthStore(s => s.tenantId) || 'global';
  const role = useAuthStore(s => s.role);
  const canEdit = isAdminRole(role);
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS);
  const [savedOptions, setSavedOptions] = useState<Options>(DEFAULT_OPTIONS);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const stateRef = useRef({ options, savedOptions, ready });
  useEffect(() => {
    stateRef.current = { options, savedOptions, ready };
  }, [options, savedOptions, ready]);

  useEffect(() => {
    let active = true;
    Promise.all(KEYS.map(key => getSetting({ tenant_id: tenantId, key }))).then(([scrap, returns, ledger, methods]) => {
      if (!active) return;
      const loaded = { scrap: scrap !== false, returns: returns !== false, ledger: ledger === 'off' || ledger === 'today' ? ledger : 'all', methods: Array.isArray(methods) ? methods.filter((m): m is string => typeof m === 'string' && METHODS.includes(m)) : [] };
      setOptions(loaded); setSavedOptions(loaded);
      setReady(true);
    }).catch(() => { if (active) setStatus({ text: 'Could not load cash register options. Reopen settings to retry.', type: 'error' }); });
    return () => { active = false; };
  }, [tenantId]);

  const update = (patch: Partial<Options>) => { setOptions({ ...options, ...patch }); setStatus(null); };

  const save = useCallback(async () => {
    setSaving(true); setStatus(null);
    try {
      const cur = stateRef.current;
      const values = [cur.options.scrap, cur.options.returns, cur.options.ledger, cur.options.methods];
      await Promise.all(KEYS.map((key, index) => setSetting({ tenant_id: tenantId, key, value: values[index] })));
      setSavedOptions(cur.options);
      setStatus({ text: 'Cash register options saved. Reopen the register to see updated totals.', type: 'success' });
    } catch {
      setStatus({ text: 'Could not save all cash register options. Please retry.', type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [tenantId]);

  const dirty = JSON.stringify(options) !== JSON.stringify(savedOptions);
  const locked = !ready || saving || !canEdit;

  useEffect(() => {
    if (ready) {
      window.dispatchEvent(new CustomEvent('settings:section-dirty', { detail: { dirty } }));
    }
  }, [dirty, ready]);

  useEffect(() => {
    const handleRequestSave = () => {
      const cur = stateRef.current;
      if (cur.ready && JSON.stringify(cur.options) !== JSON.stringify(cur.savedOptions)) {
        void save();
      }
    };
    window.addEventListener('settings:request-save', handleRequestSave);
    return () => window.removeEventListener('settings:request-save', handleRequestSave);
  }, [save]);

  return <fieldset disabled={locked} className="space-y-6 min-w-0">
    <legend className="sr-only">Cash register totals and payment display</legend>
    {!canEdit && (
      <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-700 dark:text-amber-400">
        <Lock className="w-3.5 h-3.5 shrink-0" /> Only the shop owner or an admin can change these options.
      </div>
    )}

    <div>
      <GroupTitle icon={ArrowDownToLine} title="Cash in the drawer" hint="What is added to or taken from the expected cash" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SwitchField id="cash-register-scrap" label="Include cash received from scrap sales in Cash In"
          description="Cash paid by customers on scrap bills counts as cash in the drawer."
          checked={options.scrap} onChange={scrap => update({ scrap })} disabled={locked} />
        <SwitchField id="cash-register-returns" label="Deduct cash return refunds from the cash register"
          description="Cash refunded on returns is taken out of the expected drawer cash."
          checked={options.returns} onChange={returns => update({ returns })} disabled={locked} />
      </div>
    </div>

    <div>
      <GroupTitle icon={BookOpen} title="Direct cash ledger entries" hint="Cash received or paid directly in party ledgers" />
      <div className="p-4 bg-muted/30 border border-border rounded-2xl space-y-2.5">
        <Select value={options.ledger} onChange={ledger => update({ ledger })} options={[
          { value: 'off', label: 'Exclude ledger entries' },
          { value: 'today', label: 'Include entries dated the register business day' },
          { value: 'all', label: 'Include entries entered during this session, with any date' },
        ]} disabled={locked} />
        <p className="flex items-start gap-2 text-[11px] text-muted-foreground leading-relaxed">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Older ledger cash entries use their cash-entry date because their original ledger date was not linked. Drawers closed before session tracking keep their saved cash totals.
        </p>
      </div>
    </div>

    <div>
      <GroupTitle icon={CreditCard} title="Other payments to show" hint="Shown separately from drawer cash, for reference" />
      <div className="flex flex-wrap gap-2">
        {METHODS.map(method => {
          const on = options.methods.includes(method);
          return (
            <label key={method} className={clsx('relative inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all select-none',
              locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
              on ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border text-muted-foreground hover:border-primary/40 hover:text-foreground')}>
              <input type="checkbox" className="w-3.5 h-3.5 accent-[var(--primary)] cursor-[inherit]" checked={on}
                onChange={e => update({ methods: e.target.checked ? [...options.methods, method] : options.methods.filter(m => m !== method) })} />
              {method === 'BANK_TRANSFER' ? 'Bank Transfer' : method}
            </label>
          );
        })}
      </div>
    </div>

    {status?.type === 'error' && (
      <p role="status" className="text-xs font-semibold text-destructive">{status.text}</p>
    )}
  </fieldset>;
}
