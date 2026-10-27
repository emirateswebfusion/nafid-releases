import { useEffect, useState } from 'react';
import { getSetting, setSetting } from '../../../data/settings';
import { useAuthStore } from '../../../store/authStore';
import { isAdminRole } from '../../../utils/security/permissions';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Select';

const KEYS = ['cash_register_include_scrap_sales', 'cash_register_deduct_returns', 'cash_register_ledger_mode', 'cash_register_payment_methods'] as const;
const METHODS = ['UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE'];

/** Independently saved owner options, using the same tenant settings as drawer reconciliation. */
export function CashRegisterSettings() {
  const tenantId = useAuthStore(s => s.tenantId) || 'global';
  const role = useAuthStore(s => s.role);
  const [options, setOptions] = useState({ scrap: true, returns: true, ledger: 'all', methods: [] as string[] });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all(KEYS.map(key => getSetting({ tenant_id: tenantId, key }))).then(([scrap, returns, ledger, methods]) => {
      if (!active) return;
      setOptions({ scrap: scrap !== false, returns: returns !== false, ledger: ledger === 'off' || ledger === 'today' ? ledger : 'all', methods: Array.isArray(methods) ? methods.filter((m): m is string => typeof m === 'string' && METHODS.includes(m)) : [] });
      setReady(true);
    }).catch(() => { if (active) setMessage('Could not load cash register options. Reopen settings to retry.'); });
    return () => { active = false; };
  }, [tenantId]);
  const save = async () => {
    setSaving(true); setMessage('');
    try {
      const values = [options.scrap, options.returns, options.ledger, options.methods];
      await Promise.all(KEYS.map((key, index) => setSetting({ tenant_id: tenantId, key, value: values[index] })));
      setMessage('Cash register options saved. Reopen the register to see updated totals.');
    } catch { setMessage('Could not save all cash register options. Please retry.'); }
    finally { setSaving(false); }
  };
  return <fieldset disabled={!ready || saving || !isAdminRole(role)} className="space-y-3 rounded-2xl border border-border p-4">
    <legend className="text-sm font-bold">Cash register totals and payment display</legend>
    <label className="flex gap-2 text-xs"><input type="checkbox" checked={options.scrap} onChange={e => setOptions({ ...options, scrap: e.target.checked })} />Include cash received from scrap sales in Cash In</label>
    <label className="flex gap-2 text-xs"><input type="checkbox" checked={options.returns} onChange={e => setOptions({ ...options, returns: e.target.checked })} />Deduct cash return refunds from the cash register</label>
    <label className="block text-xs">Direct cash ledger entries
      <Select value={options.ledger} onChange={ledger => setOptions({ ...options, ledger })} options={[
        { value: 'off', label: 'Exclude ledger entries' },
        { value: 'today', label: 'Include entries dated the register business day' },
        { value: 'all', label: 'Include entries entered during this session, with any date' },
      ]} disabled={!ready || saving || !isAdminRole(role)} />
    </label>
    <p className="text-xs text-muted-foreground">Older ledger cash entries use their cash-entry date because their original ledger date was not linked. Drawers closed before session tracking keep their saved cash totals.</p>
    <p className="text-xs font-bold">Additional payment collections to display</p>
    {METHODS.map(method => <label key={method} className="inline-flex gap-2 mr-3 text-xs"><input type="checkbox" checked={options.methods.includes(method)} onChange={e => setOptions({ ...options, methods: e.target.checked ? [...options.methods, method] : options.methods.filter(m => m !== method) })} />{method === 'BANK_TRANSFER' ? 'Bank Transfer' : method}</label>)}
    <p className="text-xs text-muted-foreground">Payment collections are shown separately from cash in the drawer. Save these options using this button.</p>
    <Button type="button" size="sm" onClick={save}>Save cash register options</Button>
    <p role="status" className="text-xs">{message}</p>
  </fieldset>;
}
