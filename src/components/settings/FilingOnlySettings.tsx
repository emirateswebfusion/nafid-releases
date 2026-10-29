import { useCallback, useEffect, useRef, useState } from 'react';
import { FileCheck2, Info, TrendingUp } from 'lucide-react';
import { getSetting, setSetting } from '../../data/settings';
import { DEFAULT_FILING_OPTIONS, type FilingOptions } from '../billing/hooks/useFilingSettings';
import { SectionSaveBar, SettingsCard, SwitchField } from './views/SettingsControls';

const FILING_SUB_OPTIONS = [
  ['reduceStock', 'Reduce stock', 'Items on a filing-only bill are taken out of stock like a normal sale.'],
  ['countInRevenue', 'Include in revenue', 'Filing-only bills are added to sales totals and revenue reports.'],
  ['showB2bInSalesCategory', 'Show filing-only B2B bills in their Sales History category', 'Also list them under B2B in Sales History, not only under Filing-only.'],
] as const;

function parseBoolSetting(val: unknown): boolean {
  return val === true || val === 'true' || val === 1 || val === '1';
}

function parseFilingModeSetting(mode: unknown): FilingOptions {
  if (!mode) return DEFAULT_FILING_OPTIONS;
  let parsed = mode;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return DEFAULT_FILING_OPTIONS; }
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    return {
      enabled: parseBoolSetting(obj.enabled),
      reduceStock: parseBoolSetting(obj.reduceStock),
      countInRevenue: parseBoolSetting(obj.countInRevenue),
      showB2bInSalesCategory: obj.showB2bInSalesCategory !== false && obj.showB2bInSalesCategory !== 'false',
    };
  }
  return DEFAULT_FILING_OPTIONS;
}

/** Revenue rules for new B2B / B2C bills, dashboard sales display metric and the filing-only bill mode; saved with its own button. */
export function FilingOnlySettings({ tenantId }: { tenantId: string | null }) {
  const [options, setOptions] = useState<FilingOptions>(DEFAULT_FILING_OPTIONS);
  const [b2b, setB2b] = useState(false);
  const [b2c, setB2c] = useState(false);
  const [dashboardSalesMetric, setDashboardSalesMetric] = useState<'GROSS_SALES' | 'NET_REVENUE'>('GROSS_SALES');
  const [saved, setSaved] = useState('');
  const [status, setStatus] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const tenant_id = tenantId || 'global';
  const snapshot = JSON.stringify([options, b2b, b2c, dashboardSalesMetric]);

  const stateRef = useRef({ options, b2b, b2c, dashboardSalesMetric, snapshot, loaded });
  const savedRef = useRef(saved);

  useEffect(() => {
    stateRef.current = { options, b2b, b2c, dashboardSalesMetric, snapshot, loaded };
  }, [options, b2b, b2c, dashboardSalesMetric, snapshot, loaded]);

  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  useEffect(() => {
    let active = true;
    const loadKey = async (key: string) => {
      let val = await getSetting({ tenant_id, key });
      if ((val === null || val === undefined) && tenant_id !== 'global') {
        val = await getSetting({ tenant_id: 'global', key });
      }
      return val;
    };

    void Promise.all([
      loadKey('filing_only_mode'),
      loadKey('exclude_b2b_from_revenue'),
      loadKey('exclude_b2c_from_revenue'),
      loadKey('dashboard_sales_metric'),
    ]).then(([mode, b, c, metric]) => {
      if (!active) return;
      const next = parseFilingModeSetting(mode);
      const nextB2b = parseBoolSetting(b);
      const nextB2c = parseBoolSetting(c);
      const nextMetric = metric === 'NET_REVENUE' ? 'NET_REVENUE' : 'GROSS_SALES';
      setOptions(next);
      setB2b(nextB2b);
      setB2c(nextB2c);
      setDashboardSalesMetric(nextMetric);
      setLoaded(true);
      setSaved(JSON.stringify([next, nextB2b, nextB2c, nextMetric]));
    }).catch(() => { if (active) setStatus({ text: 'Unable to load billing settings', type: 'error' }); });
    return () => { active = false; };
  }, [tenant_id]);

  useEffect(() => {
    const isDirty = loaded && snapshot !== saved;
    window.dispatchEvent(new CustomEvent('settings:section-dirty', { detail: { dirty: isDirty } }));
  }, [loaded, snapshot, saved]);

  const save = useCallback(async () => {
    setSaving(true); setStatus(null);
    try {
      const cur = stateRef.current;
      const targets = tenant_id !== 'global' ? [tenant_id, 'global'] : [tenant_id];
      for (const tid of targets) {
        await setSetting({ tenant_id: tid, key: 'filing_only_mode', value: cur.options });
        await setSetting({ tenant_id: tid, key: 'exclude_b2b_from_revenue', value: cur.b2b });
        await setSetting({ tenant_id: tid, key: 'exclude_b2c_from_revenue', value: cur.b2c });
        await setSetting({ tenant_id: tid, key: 'dashboard_sales_metric', value: cur.dashboardSalesMetric });
      }
      window.dispatchEvent(new Event('settings:updated'));
      window.dispatchEvent(new CustomEvent('settings:section-dirty', { detail: { dirty: false } }));
      setSaved(cur.snapshot); setStatus({ text: 'Saved', type: 'success' });
    } catch { setStatus({ text: 'Unable to save billing settings', type: 'error' }); }
    finally { setSaving(false); }
  }, [tenant_id]);

  useEffect(() => {
    const handleRequestSave = () => {
      if (stateRef.current.loaded && stateRef.current.snapshot !== savedRef.current) {
        void save();
      }
    };
    window.addEventListener('settings:request-save', handleRequestSave);
    return () => window.removeEventListener('settings:request-save', handleRequestSave);
  }, [save]);

  const change = (fn: () => void) => { fn(); setStatus(null); };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="p-4 bg-blue-500/[0.04] border border-blue-500/20 rounded-2xl flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-400 font-medium leading-relaxed">
          Choices apply to new bills and dashboard summaries. Existing bills keep their saved revenue and stock treatment.
        </p>
      </div>

      <SettingsCard icon={TrendingUp} title="Dashboard Sales Metric" subtitle="Choose what the main dashboard header displays for daily sales">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex items-start gap-3 p-3.5 rounded-xl border border-border hover:border-primary/40 bg-card cursor-pointer transition-colors">
            <input
              type="radio"
              name="dashboardSalesMetric"
              value="GROSS_SALES"
              aria-label="Total Sales (Gross Product Sales)"
              checked={dashboardSalesMetric === 'GROSS_SALES'}
              onChange={() => change(() => setDashboardSalesMetric('GROSS_SALES'))}
              className="mt-1 accent-primary"
            />
            <div className="flex-1">
              <span className="text-xs font-bold text-foreground block">
                Total Sales (Gross Product Sales)
              </span>
              <span className="text-[11px] text-muted-foreground block mt-1 leading-relaxed">
                Displays the full value of goods sold before scrap or return deductions. For example, if ₹500 scrap is exchanged to buy ₹300 goods, the dashboard counts <strong>₹300 Sales Today</strong>.
              </span>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3.5 rounded-xl border border-border hover:border-primary/40 bg-card cursor-pointer transition-colors">
            <input
              type="radio"
              name="dashboardSalesMetric"
              value="NET_REVENUE"
              aria-label="Total Revenue (Net Realized Cash)"
              checked={dashboardSalesMetric === 'NET_REVENUE'}
              onChange={() => change(() => setDashboardSalesMetric('NET_REVENUE'))}
              className="mt-1 accent-primary"
            />
            <div className="flex-1">
              <span className="text-xs font-bold text-foreground block">
                Total Revenue (Net Realized Cash)
              </span>
              <span className="text-[11px] text-muted-foreground block mt-1 leading-relaxed">
                Displays only net cash/money received after subtracting scrap and return deductions. In the example above, the net revenue is <strong>₹0 Revenue Today</strong>.
              </span>
            </div>
          </label>
        </div>
      </SettingsCard>

      <SettingsCard icon={TrendingUp} title="Revenue from GST bills" subtitle="Choose which GST sales count toward your daily revenue (they are still saved and printed)">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SwitchField id="filing-exclude-b2b" label="Exclude new B2B bills from revenue"
            description="Wholesale / business bills (issued with a customer GSTIN) are not counted in daily revenue."
            checked={b2b} onChange={v => change(() => setB2b(v))} disabled={!loaded} />
          <SwitchField id="filing-exclude-b2c" label="Exclude new B2C bills from revenue"
            description="Retail / walk-in consumer bills (issued without a customer GSTIN) are not counted in daily revenue."
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
