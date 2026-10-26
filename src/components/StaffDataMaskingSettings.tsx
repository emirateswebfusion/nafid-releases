import { useState, useEffect } from 'react';
import { EyeOff, Shield, Eye, CheckCircle2, AlertCircle, Calendar, Package } from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import { 
  type StaffDataMaskingConfig, 
  STAFF_DATA_MASKING_KEY, 
  DEFAULT_STAFF_DATA_MASKING_CONFIG, 
  parseStaffDataMaskingConfig 
} from '../utils/staffDataMasking';
import { isDesktopRuntime } from '../data/client';
import { settingsApi } from '../data/settings';
import { formatCurrency } from '../utils/money';

export interface StaffDataMaskingSettingsProps {
  config?: StaffDataMaskingConfig;
  onChange?: (config: StaffDataMaskingConfig) => void;
}

export function StaffDataMaskingSettings({ config: propConfig, onChange: propOnChange }: StaffDataMaskingSettingsProps = {}) {
  const { tenantId } = useAuthStore();
  const [internalConfig, setInternalConfig] = useState<StaffDataMaskingConfig>(DEFAULT_STAFF_DATA_MASKING_CONFIG);
  const [loading, setLoading] = useState(propConfig === undefined);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const isControlled = propConfig !== undefined && propOnChange !== undefined;
  const config = isControlled ? propConfig : internalConfig;

  const setConfig = (newCfg: StaffDataMaskingConfig | ((prev: StaffDataMaskingConfig) => StaffDataMaskingConfig)) => {
    if (isControlled) {
      const next = typeof newCfg === 'function' ? newCfg(propConfig) : newCfg;
      propOnChange(next);
    } else {
      setInternalConfig(newCfg);
    }
  };

  useEffect(() => {
    if (!isControlled) {
      loadConfig();
    }
  }, [tenantId, isControlled]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      if (isDesktopRuntime()) {
        const raw = await settingsApi.get({
          tenant_id: tenantId || 'global',
          key: STAFF_DATA_MASKING_KEY,
        });
        setConfig(parseStaffDataMaskingConfig(raw));
      }
    } catch (err) {
      console.error('[StaffDataMaskingSettings] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const serialized = JSON.stringify(config);
      if (isDesktopRuntime()) {
        await settingsApi.set({
          tenant_id: tenantId || 'global',
          key: STAFF_DATA_MASKING_KEY,
          value: serialized,
        });
      }
      setStatusMessage({ text: 'Staff Data Masking settings updated successfully!', type: 'success' });
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err) {
      console.error('[StaffDataMaskingSettings] Save error:', err);
      setStatusMessage({ text: 'Failed to save settings: ' + ((err as Error).message || 'Unknown error'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const formatWholeRupees = (amount: number) => formatCurrency(amount, { decimals: 0 });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-3" />
        <span className="text-sm font-semibold">Loading Privacy & Masking Settings...</span>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-300 pb-12 select-none">
      {/* Toast */}
      {statusMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className={clsx(
            "px-4 py-3 rounded-2xl flex items-center gap-3 shadow-2xl border text-sm font-bold",
            statusMessage.type === 'success' ? "bg-slate-900 text-emerald-400 border-emerald-500/30" : "bg-red-950 text-red-200 border-red-500/30"
          )}>
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertCircle className="w-5 h-5 text-rose-400" />}
            <span>{statusMessage.text}</span>
          </div>
        </div>
      )}

      {/* Main Header Card */}
      <div className="bg-card border border-border/80 rounded-3xl p-6 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-primary/10 via-indigo-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shadow-inner shrink-0">
              <EyeOff className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-foreground">Staff Privacy & Data Masking</h2>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                  Owner Control
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                Mask aggregate stock valuations and control sales history visibility for staff accounts.
              </p>
            </div>
          </div>

          {/* Master Switch */}
          <div className="flex items-center gap-3 bg-muted/40 p-2 px-3 rounded-2xl border border-border/80">
            <span className="text-xs font-bold text-foreground">
              {config.enabled ? 'Masking Active' : 'Masking Disabled'}
            </span>
            <button
              type="button"
              onClick={() => setConfig({ ...config, enabled: !config.enabled })}
              className={clsx(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                config.enabled ? "bg-emerald-500" : "bg-muted-foreground/30"
              )}
            >
              <span
                className={clsx(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  config.enabled ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>
        </div>

        {/* Informational Guidance Alert */}
        <div className="mt-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-xs leading-relaxed text-amber-900 dark:text-amber-200 font-medium">
          <Shield className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <span className="font-bold">Important Safeguard:</span> This feature <strong>only alters summary / aggregate figures</strong> seen by staff users. 
            Individual product quantities (stock counts) and retail unit prices are <strong>never modified</strong> so staff can reliably check stock availability and bill customers accurately. 
            Store Owners and Administrators always see 100% genuine, unmasked numbers.
          </div>
        </div>
      </div>

      {config.enabled && (
        <>
          {/* Section 1: Stock Report & Inventory Valuation Controls */}
          <div className="bg-card border border-border/80 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-border/60">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-foreground">1. Stock Report Valuation Controls</h3>
                <p className="text-xs text-muted-foreground font-medium">
                  Configure how the total inventory valuation card appears to staff members.
                </p>
              </div>
            </div>

            {/* Valuation Mode Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  id: 'ORIGINAL',
                  title: 'Original Live Value',
                  desc: 'Staff sees actual total stock value.',
                  badge: 'Unmasked',
                },
                {
                  id: 'HIDDEN',
                  title: 'Hide Value (••••••)',
                  desc: 'Total stock valuation is completely masked.',
                  badge: 'Masked',
                },
                {
                  id: 'FIXED_OVERRIDE',
                  title: 'Fixed Override Amount',
                  desc: 'Show a specific fixed figure (e.g. ₹20,00,000).',
                  badge: 'Custom ₹',
                },
                {
                  id: 'PERCENTAGE_OFFSET',
                  title: 'Percentage Scale',
                  desc: 'Show a percentage of actual stock (e.g. 60%).',
                  badge: 'Scaled %',
                },
              ].map(opt => (
                <div
                  key={opt.id}
                  onClick={() => setConfig({ ...config, stock_valuation_mode: opt.id as typeof config.stock_valuation_mode })}
                  className={clsx(
                    "p-4 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col justify-between",
                    config.stock_valuation_mode === opt.id
                      ? "bg-primary/10 border-primary text-foreground shadow-sm ring-2 ring-primary/20"
                      : "bg-background/50 border-border/80 hover:border-primary/40 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black uppercase tracking-wider">{opt.badge}</span>
                      <div className={clsx(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                        config.stock_valuation_mode === opt.id ? "border-primary bg-primary text-white" : "border-muted-foreground/40"
                      )}>
                        {config.stock_valuation_mode === opt.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <p className="text-sm font-bold text-foreground">{opt.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Dynamic Inputs for Stock Valuation */}
            {config.stock_valuation_mode === 'FIXED_OVERRIDE' && (
              <div className="p-4 bg-muted/30 border border-border/80 rounded-2xl space-y-2 animate-in fade-in duration-150">
                <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">
                  Display Stock Valuation For Staff (₹)
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-black text-sm">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="10000"
                      value={config.stock_fixed_amount}
                      onChange={e => setConfig({ ...config, stock_fixed_amount: Math.max(0, Number(e.target.value)) })}
                      className="w-full pl-8 pr-4 py-2.5 bg-background border border-border rounded-xl text-sm font-black font-mono text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      placeholder="e.g. 2000000"
                    />
                  </div>
                  <span className="text-xs font-bold text-muted-foreground">
                    Formatted: <span className="font-mono text-primary font-black">{formatWholeRupees(config.stock_fixed_amount)}</span>
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground font-medium">
                  Regardless of the actual stock value (e.g. ₹35,00,000), staff members will see {formatWholeRupees(config.stock_fixed_amount)} as the total stock valuation.
                </p>
              </div>
            )}

            {config.stock_valuation_mode === 'PERCENTAGE_OFFSET' && (
              <div className="p-4 bg-muted/30 border border-border/80 rounded-2xl space-y-2 animate-in fade-in duration-150">
                <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">
                  Percentage of Actual Stock To Show Staff (%)
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1 max-w-xs">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={config.stock_percentage_offset}
                      onChange={e => setConfig({ ...config, stock_percentage_offset: Math.min(100, Math.max(1, Number(e.target.value))) })}
                      className="w-full px-4 pr-8 py-2.5 bg-background border border-border rounded-xl text-sm font-black font-mono text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      placeholder="e.g. 60"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-black text-sm">%</span>
                  </div>
                  <span className="text-xs font-bold text-muted-foreground">
                    Staff will see <span className="text-primary font-black font-mono">{config.stock_percentage_offset}%</span> of true valuation
                  </span>
                </div>
              </div>
            )}

            {/* Additional Stock Checkboxes */}
            <div className="pt-2 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.hide_purchase_cost_for_staff}
                  onChange={e => setConfig({ ...config, hide_purchase_cost_for_staff: e.target.checked })}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                <span className="text-xs font-bold text-foreground">
                  Hide Purchase Price & Profit Margins for Staff in Stock Reports & Inventory
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.stock_mask_total_qty}
                  onChange={e => setConfig({ ...config, stock_mask_total_qty: e.target.checked })}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                <span className="text-xs font-bold text-foreground">
                  Also mask the "Total Stock Units" count card (shows •••••• for total pieces)
                </span>
              </label>
            </div>
          </div>

          {/* Section 2: Sales History & Revenue Controls */}
          <div className="bg-card border border-border/80 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-border/60">
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-foreground">2. Sales History & Revenue Controls</h3>
                <p className="text-xs text-muted-foreground font-medium">
                  Control what date range of invoices staff can view and how total revenue figures are presented.
                </p>
              </div>
            </div>

            {/* Sub-item: Sales Scope Range */}
            <div className="space-y-3">
              <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">
                Invoices Date Scope for Staff
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { id: 'TODAY', label: "Today's Bills", desc: 'Only invoices billed today' },
                  { id: 'THIS_WEEK', label: "This Week", desc: 'From Monday to today' },
                  { id: 'THIS_MONTH', label: "This Month", desc: '1st of month to today' },
                  { id: 'LAST_N_DAYS', label: `Last ${config.sales_history_days} Days`, desc: 'Configurable rolling window' },
                  { id: 'ALL', label: 'All Time', desc: 'Full sales history' },
                ].map(scope => (
                  <div
                    key={scope.id}
                    onClick={() => setConfig({ ...config, sales_history_scope: scope.id as typeof config.sales_history_scope })}
                    className={clsx(
                      "p-3.5 rounded-2xl border cursor-pointer transition-all duration-200 text-left",
                      config.sales_history_scope === scope.id
                        ? "bg-indigo-500/10 border-indigo-500 text-foreground ring-2 ring-indigo-500/20"
                        : "bg-background/50 border-border/80 hover:border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-black text-foreground">{scope.label}</span>
                      {config.sales_history_scope === scope.id && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{scope.desc}</p>
                  </div>
                ))}
              </div>

              {config.sales_history_scope === 'LAST_N_DAYS' && (
                <div className="p-4 bg-muted/30 border border-border/80 rounded-2xl flex items-center gap-4 animate-in fade-in duration-150 max-w-sm">
                  <label className="text-xs font-bold text-foreground whitespace-nowrap">Number of Days:</label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={config.sales_history_days}
                    onChange={e => setConfig({ ...config, sales_history_days: Math.max(1, Number(e.target.value)) })}
                    className="w-24 px-3 py-2 bg-background border border-border rounded-xl text-xs font-black font-mono text-foreground focus:outline-none focus:border-primary"
                  />
                  <span className="text-xs text-muted-foreground font-semibold">days</span>
                </div>
              )}
            </div>

            {/* Sub-item: Revenue Amount Mode */}
            <div className="space-y-3 pt-3 border-t border-border/60">
              <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">
                Total Revenue StatCard Display Mode
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { id: 'ORIGINAL', label: 'Original Revenue', desc: 'Display actual sales total' },
                  { id: 'HIDDEN', label: 'Hide (••••••)', desc: 'Mask total revenue card' },
                  { id: 'FIXED_OVERRIDE', label: 'Demo / Fixed Amount', desc: 'Display custom override revenue' },
                  { id: 'PERCENTAGE_OFFSET', label: 'Percentage Scale', desc: 'Scale revenue down by %' },
                ].map(mode => (
                  <div
                    key={mode.id}
                    onClick={() => setConfig({ ...config, sales_revenue_mode: mode.id as typeof config.sales_revenue_mode })}
                    className={clsx(
                      "p-3.5 rounded-2xl border cursor-pointer transition-all duration-200 text-left",
                      config.sales_revenue_mode === mode.id
                        ? "bg-primary/10 border-primary text-foreground ring-2 ring-primary/20"
                        : "bg-background/50 border-border/80 hover:border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-black text-foreground">{mode.label}</span>
                      {config.sales_revenue_mode === mode.id && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{mode.desc}</p>
                  </div>
                ))}
              </div>

              {config.sales_revenue_mode === 'FIXED_OVERRIDE' && (
                <div className="p-4 bg-muted/30 border border-border/80 rounded-2xl space-y-2 animate-in fade-in duration-150 max-w-md">
                  <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">
                    Fixed Revenue Figure To Display For Staff (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-black text-sm">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="5000"
                      value={config.sales_revenue_fixed_amount}
                      onChange={e => setConfig({ ...config, sales_revenue_fixed_amount: Math.max(0, Number(e.target.value)) })}
                      className="w-full pl-8 pr-4 py-2 bg-background border border-border rounded-xl text-sm font-black font-mono text-foreground focus:outline-none focus:border-primary"
                      placeholder="e.g. 50000"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground font-medium">
                    Displays {formatWholeRupees(config.sales_revenue_fixed_amount)} on staff Sales History cards.
                  </p>
                </div>
              )}

              {config.sales_revenue_mode === 'PERCENTAGE_OFFSET' && (
                <div className="p-4 bg-muted/30 border border-border/80 rounded-2xl space-y-2 animate-in fade-in duration-150 max-w-sm">
                  <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">
                    Revenue Display Percentage (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={config.sales_revenue_percentage}
                      onChange={e => setConfig({ ...config, sales_revenue_percentage: Math.min(100, Math.max(1, Number(e.target.value))) })}
                      className="w-full px-4 pr-8 py-2 bg-background border border-border rounded-xl text-sm font-black font-mono text-foreground focus:outline-none focus:border-primary"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-black text-sm">%</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Live Preview Comparison */}
          <div className="bg-card border border-border/80 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-black uppercase tracking-wider text-foreground">Live Simulation Preview</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Admin View */}
              <div className="p-4 rounded-2xl bg-muted/30 border border-border/70 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-border/50">
                  <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                    👑 Admin / Owner View (Actual Figures)
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
                    Live
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stock Valuation:</span>
                    <span className="font-mono font-bold text-foreground">₹ 35,00,000</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sales Revenue:</span>
                    <span className="font-mono font-bold text-foreground">₹ 1,50,000</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sales Date Scope:</span>
                    <span className="font-mono font-bold text-foreground">All Time (Unrestricted)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Individual Item Stock:</span>
                    <span className="font-mono font-bold text-emerald-600">Exact / Real-time</span>
                  </div>
                </div>
              </div>

              {/* Staff View */}
              <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-indigo-500/20">
                  <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                    👤 Staff / Biller View (Masked Mode)
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500">
                    Protected
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stock Valuation:</span>
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {config.stock_valuation_mode === 'HIDDEN'
                        ? '••••••'
                        : config.stock_valuation_mode === 'FIXED_OVERRIDE'
                        ? formatWholeRupees(config.stock_fixed_amount)
                        : config.stock_valuation_mode === 'PERCENTAGE_OFFSET'
                        ? formatWholeRupees((3500000 * config.stock_percentage_offset) / 100)
                        : '₹ 35,00,000'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sales Revenue:</span>
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {config.sales_revenue_mode === 'HIDDEN'
                        ? '••••••'
                        : config.sales_revenue_mode === 'FIXED_OVERRIDE'
                        ? formatWholeRupees(config.sales_revenue_fixed_amount)
                        : config.sales_revenue_mode === 'PERCENTAGE_OFFSET'
                        ? formatWholeRupees((150000 * config.sales_revenue_percentage) / 100)
                        : '₹ 1,50,000'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sales Date Scope:</span>
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {config.sales_history_scope === 'TODAY'
                        ? "Today's Sales Only"
                        : config.sales_history_scope === 'THIS_WEEK'
                        ? "This Week's Sales"
                        : config.sales_history_scope === 'THIS_MONTH'
                        ? "This Month's Sales"
                        : config.sales_history_scope === 'LAST_N_DAYS'
                        ? `Last ${config.sales_history_days} Days`
                        : "All Records"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Individual Item Stock:</span>
                    <span className="font-mono font-bold text-emerald-600">Exact / 100% Billing Ready</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Save Button Bar (only shown when standalone) */}
      {!isControlled && (
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/80">
          <button
            type="button"
            onClick={loadConfig}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/95 hover:to-indigo-600/95 transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Privacy Settings'}
          </button>
        </div>
      )}
    </div>
  );
}
