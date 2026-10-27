import { useEffect, useState } from 'react';
import { FileCheck2, Info, TrendingUp } from 'lucide-react';
import { getSetting, setSetting } from '../../data/settings';
import { DEFAULT_FILING_OPTIONS, type FilingOptions } from '../billing/hooks/useFilingSettings';
import { SectionSaveBar, SettingsCard, SwitchField } from './views/SettingsControls';

const FILING_SUB_OPTIONS = [
  ['reduceStock', 'Reduce stock', 'Items on a filing-only bill are taken out of stock like a normal sale.'],
  ['countInRevenue', 'Include in revenue', 'Filing-only bills are added to sales totals and revenue reports.'],
  ['showB2bInSalesCategory', 'Show filing-only B2B bills in their Sales History category', 'Also list them under B2B in Sales History, not only under Filing-only.'],
] as const;

/** Revenue rules for new B2B / B2C bills and the filing-only bill mode; saved with its own button. */
export function FilingOnlySettings({ tenantId }: { tenantId: string | null }) {
  const [options, setOptions] = useState<FilingOptions>(DEFAULT_FILING_OPTIONS);
  const [b2b, setB2b] = useState(false);
  const [b2c, setB2c] = useState(false);
  const [saved, setSaved] = useState('');
  const [status, setStatus] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const tenant_id = tenantId || 'global';
  const snapshot = JSON.stringify([options, b2b, b2c]);
  useEffect(() => {
    let active = true;
    void Promise.all(['filing_only_mode', 'exclude_b2b_from_revenue', 'exclude_b2c_from_revenue'].map(key => getSetting({ tenant_id, key }))).then(([mode, b, c]) => {
      if (!active) return;
      const next = { ...DEFAULT_FILING_OPTIONS, ...(mode && typeof mode === 'object' ? mode : {}) };
      setOptions(next); setB2b(b === true); setB2c(c === true); setLoaded(true);
      setSaved(JSON.stringify([next, b === true, c === true]));
    }).catch(() => { if (active) setStatus({ text: 'Unable to load billing settings', type: 'error' }); });
    return () => { active = false; };
  }, [tenant_id]);
  async function save() {
    setSaving(true); setStatus(null);
    try {
      await setSetting({ tenant_id, key: 'filing_only_mode', value: options });
      await setSetting({ tenant_id, key: 'exclude_b2b_from_revenue', value: b2b });
      await setSetting({ tenant_id, key: 'exclude_b2c_from_revenue', value: b2c });
      window.dispatchEvent(new Event('settings:updated'));
      setSaved(snapshot); setStatus({ text: 'Saved', type: 'success' });
    } catch { setStatus({ text: 'Unable to save billing settings', type: 'error' }); }
    finally { setSaving(false); }
  }
  const change = (fn: () => void) => { fn(); setStatus(null); };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="p-4 bg-blue-500/[0.04] border border-blue-500/20 rounded-2xl flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-400 font-medium leading-relaxed">
          Choices apply to new bills. Existing bills keep their saved revenue and stock treatment.
        </p>
      </div>

      <SettingsCard icon={TrendingUp} title="Revenue from GST bills" subtitle="Leave GST bills out of revenue totals (they are still saved and printed)">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SwitchField id="filing-exclude-b2b" label="Exclude new B2B bills from revenue"
            description="GST bills with a customer GSTIN are not counted in revenue."
            checked={b2b} onChange={v => change(() => setB2b(v))} disabled={!loaded} />
          <SwitchField id="filing-exclude-b2c" label="Exclude new B2C bills from revenue"
            description="GST bills without a customer GSTIN are not counted in revenue."
            checked={b2c} onChange={v => change(() => setB2c(v))} disabled={!loaded} />
        </div>
      </SettingsCard>

      <SettingsCard icon={FileCheck2} title="Filing-only bill" subtitle="GST bills made only for tax filing; they never change cash, customer balance or loyalty points">
        <div className="space-y-4">
          <SwitchField id="filing-enabled" label="Enable Filing-only bill"
            description='Shows a "Filing-only" button on the Billing screen header.'
            checked={options.enabled} onChange={v => change(() => setOptions({ ...options, enabled: v }))} disabled={!loaded} />
          <div className="pl-4 ml-2 border-l-2 border-primary/20 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">
              {options.enabled ? 'Filing-only bills should' : 'Turn on Filing-only bill to change these options'}
            </p>
            {FILING_SUB_OPTIONS.map(([key, label, description]) => (
              <SwitchField key={key} id={`filing-${key}`} label={label} description={description}
                checked={options[key]} onChange={v => change(() => setOptions({ ...options, [key]: v }))}
                disabled={!loaded || !options.enabled} />
            ))}
          </div>
        </div>
      </SettingsCard>

      <SectionSaveBar label="Save revenue settings" onSave={() => void save()} saving={saving} disabled={!loaded}
        dirty={loaded && snapshot !== saved} status={status} />
    </div>
  );
}
