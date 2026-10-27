import { useEffect, useState } from 'react';
import { getSetting, setSetting } from '../../data/settings';
import { DEFAULT_FILING_OPTIONS, type FilingOptions } from '../billing/hooks/useFilingSettings';
export function FilingOnlySettings({ tenantId }: { tenantId: string | null }) {
  const [options, setOptions] = useState<FilingOptions>(DEFAULT_FILING_OPTIONS);
  const [b2b, setB2b] = useState(false);
  const [b2c, setB2c] = useState(false);
  const [status, setStatus] = useState('');
  const [loaded, setLoaded] = useState(false);
  const tenant_id = tenantId || 'global';
  useEffect(() => {
    let active = true;
    void Promise.all(['filing_only_mode', 'exclude_b2b_from_revenue', 'exclude_b2c_from_revenue'].map(key => getSetting({ tenant_id, key }))).then(([mode, b, c]) => {
      if (!active) return;
      setOptions({ ...DEFAULT_FILING_OPTIONS, ...(mode && typeof mode === 'object' ? mode : {}) }); setB2b(b === true); setB2c(c === true); setLoaded(true);
    }).catch(() => { if (active) setStatus('Unable to load billing settings'); });
    return () => { active = false; };
  }, [tenant_id]);
  async function save() {
    try {
      await setSetting({ tenant_id, key: 'filing_only_mode', value: options });
      await setSetting({ tenant_id, key: 'exclude_b2b_from_revenue', value: b2b });
      await setSetting({ tenant_id, key: 'exclude_b2c_from_revenue', value: b2c });
      window.dispatchEvent(new Event('settings:updated')); setStatus('Saved');
    } catch { setStatus('Unable to save billing settings'); }
  }
  return <section className="space-y-5 p-6 bg-card rounded-xl border">
    <h2 className="text-xl font-bold">Revenue &amp; Filing-only bill</h2>
    <p>Choices apply to new bills. Existing bills keep their saved revenue and stock treatment.</p>
    <label className="block"><input type="checkbox" checked={b2b} onChange={e => setB2b(e.target.checked)} /> Exclude new B2B bills from revenue</label>
    <label className="block"><input type="checkbox" checked={b2c} onChange={e => setB2c(e.target.checked)} /> Exclude new B2C bills from revenue</label>
    {([['enabled', 'Enable Filing-only bill'], ['reduceStock', 'Reduce stock'], ['countInRevenue', 'Include in revenue'], ['showB2bInSalesCategory', 'Show filing-only B2B bills in their Sales History category']] as const).map(([key, label]) => <label key={key} className="block"><input type="checkbox" checked={options[key]} onChange={e => setOptions({ ...options, [key]: e.target.checked })} /> {label}</label>)}
    <button type="button" disabled={!loaded} onClick={() => void save()} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">Save revenue settings</button>
    <p role="status">{status}</p>
  </section>;
}
