import { useState, useEffect } from 'react';
import { POS_LAYOUT_MODELS_DATA, DEFAULT_BILLING_UI_CONFIG, useBillingUIStore, type BillingUIConfig, type POSLayoutModel } from '../../store/billingUIStore';
import { LayoutGrid, Columns, Sliders, RotateCcw, Eye, Touchpad, X, AlertCircle, User, Search } from 'lucide-react';
import clsx from 'clsx';
import { hasBridge } from '../../data/client';
import { settingsApi } from '../../data/settings';
import { PostPrintModeSection } from './views/PostPrintModeSection';
import { ComponentVisibilitySection } from './views/ComponentVisibilitySection';
import { HeaderButtonsSection } from './views/HeaderButtonsSection';
import { EntryFieldFlowSection } from './views/EntryFieldFlowSection';
import { PreviewTab } from './views/PreviewTab';
import { LayoutModelsTab } from './views/LayoutModelsTab';

interface BillingUICustomizerProps {
  config: BillingUIConfig;
  onChange: (newConfig: BillingUIConfig) => void;
}

export function BillingUICustomizer({ config, onChange }: BillingUICustomizerProps) {
  const [activeTab, setActiveTab] = useState<'models' | 'preview' | 'controls'>('models');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const handleUpdate = (partial: Partial<BillingUIConfig>) => {
    onChange({ ...config, ...partial });
  };

  const handleSelectModel = (modelId: POSLayoutModel) => {
    const modelData = POS_LAYOUT_MODELS_DATA[modelId];
    if (modelData) {
      onChange({ ...config, ...modelData.config });
    }
  };

  const handleResetToFactoryDefaults = () => {
    onChange(DEFAULT_BILLING_UI_CONFIG);
    useBillingUIStore.getState().resetConfig();
    if (hasBridge('settingsSet')) {
      settingsApi.set({ tenant_id: 'global', key: 'billing_ui_config', value: DEFAULT_BILLING_UI_CONFIG }).catch(() => {});
    }
  };
  return (
    <div className="space-y-6 w-full pb-12 relative">
      
      {/* ─── TOP BANNER ─── */}
      <div className="bg-card border border-border/80 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-primary text-white shadow-md">
              <LayoutGrid className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-foreground">Billing Workspace Designer</h2>
          </div>
          <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
            Customize spatial arrangement, panel ordering, and density. Click <strong>"Save Changes"</strong> in the Settings top header to apply.
          </p>
        </div>

        <button
          onClick={handleResetToFactoryDefaults}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted bg-background border border-border rounded-xl transition-all active:scale-95 cursor-pointer shadow-xs shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Defaults</span>
        </button>
      </div>

      {/* ─── SPACIOUS SUB-NAVIGATION TABS ─── */}
      <div className="flex items-center gap-2 border-b border-border pb-px overflow-x-auto">
        <button
          onClick={() => setActiveTab('models')}
          className={clsx(
            "flex items-center gap-2 px-5 py-3 rounded-t-xl text-xs font-bold transition-all border-b-2 cursor-pointer whitespace-nowrap",
            activeTab === 'models'
              ? "border-primary text-primary bg-primary/10 font-extrabold shadow-xs"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          <Columns className="w-4 h-4" />
          <span>1. Choose POS Layout Model</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-muted font-mono">{POS_LAYOUT_MODELS_DATA[config.layoutModel]?.name}</span>
        </button>

        <button
          onClick={() => setActiveTab('preview')}
          className={clsx(
            "flex items-center gap-2 px-5 py-3 rounded-t-xl text-xs font-bold transition-all border-b-2 cursor-pointer whitespace-nowrap",
            activeTab === 'preview'
              ? "border-primary text-primary bg-primary/10 font-extrabold shadow-xs"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          <Eye className="w-4 h-4" />
          <span>2. Live Workspace Preview</span>
        </button>

        <button
          onClick={() => setActiveTab('controls')}
          className={clsx(
            "flex items-center gap-2 px-5 py-3 rounded-t-xl text-xs font-bold transition-all border-b-2 cursor-pointer whitespace-nowrap",
            activeTab === 'controls'
              ? "border-primary text-primary bg-primary/10 font-extrabold shadow-xs"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          <Sliders className="w-4 h-4" />
          <span>3. Density & Visibility Toggles</span>
        </button>
      </div>

      {/* ─── TAB 1: SPACIOUS POS LAYOUT MODELS (2 or 3 CARDS PER ROW) ─── */}
      {activeTab === 'models' && (
        <LayoutModelsTab
          config={config} handleSelectModel={handleSelectModel} setActiveTab={setActiveTab}
        />
      )}

      {/* ─── TAB 2: EXACT 1:1 LIVE BILLING PAGE PREVIEW ─── */}
      {activeTab === 'preview' && (
        <PreviewTab
          config={config}
        />
      )}

      {/* ─── TAB 3: CONTROLS & TOUCH DENSITY ─── */}
      {activeTab === 'controls' && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-6 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Sliders className="w-5 h-5 text-primary" />
            <div>
              <h3 className="text-base font-bold text-foreground">Detailed Width & Touch Density Controls</h3>
              <p className="text-xs text-muted-foreground">Adjust column width ratios, touchscreen target sizes, and component visibility.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Column Split Ratio */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
                Column Width Ratio
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { id: '58-42', label: '58% / 42%', desc: 'Balanced POS' },
                  { id: '50-50', label: '50% / 50%', desc: 'Equal Columns' },
                  { id: '65-35', label: '65% / 35%', desc: 'Wide Cart' },
                  { id: '70-30', label: '70% / 30%', desc: 'Max Products' },
                ].map((ratio) => (
                  <button
                    key={ratio.id}
                    type="button"
                    onClick={() => handleUpdate({ splitRatio: ratio.id as BillingUIConfig['splitRatio'] })}
                    className={clsx(
                      "p-3 rounded-xl border text-center space-y-1 transition-all cursor-pointer",
                      config.splitRatio === ratio.id 
                        ? "border-primary bg-primary/10 text-primary font-black shadow-xs" 
                        : "border-border hover:bg-muted text-foreground"
                    )}
                  >
                    <div className="text-xs font-black">{ratio.label}</div>
                    <div className="text-[10px] text-muted-foreground">{ratio.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Touch POS Mode */}
            <div className="space-y-3 bg-muted/20 border border-border p-4 rounded-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Touchpad className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-foreground">Touch Screen POS Mode</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.touchMode}
                  onChange={(e) => handleUpdate({ touchMode: e.target.checked })}
                  className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Enlarges checkout buttons, input boxes, and touch targets for touchscreen hardware monitors.
              </p>
            </div>

            {/* Input Order & Initial Focus */}
            <div className="space-y-3 col-span-1 md:col-span-3 bg-muted/20 border border-border p-4 rounded-xl">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
                Workspace Order & Initial Focus (Cursor Position)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleUpdate({ entryFocusOrder: 'search-first' })}
                  className={clsx(
                    "p-3.5 rounded-xl border text-left space-y-1 transition-all cursor-pointer",
                    config.entryFocusOrder !== 'customer-first' 
                      ? "border-primary bg-primary/10 text-primary font-black shadow-xs" 
                      : "border-border hover:bg-muted text-foreground bg-background"
                  )}
                >
                  <div className="text-xs font-bold flex items-center gap-2">
                    <Search className="w-4 h-4" />
                    <span>Product Search Bar First (Default)</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed">
                    Product search bar is positioned at the top. Cursor automatically starts in Product Search box when opening billing page.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleUpdate({ entryFocusOrder: 'customer-first' })}
                  className={clsx(
                    "p-3.5 rounded-xl border text-left space-y-1 transition-all cursor-pointer",
                    config.entryFocusOrder === 'customer-first' 
                      ? "border-primary bg-primary/10 text-primary font-black shadow-xs" 
                      : "border-border hover:bg-muted text-foreground bg-background"
                  )}
                >
                  <div className="text-xs font-bold flex items-center gap-2">
                    <User className="w-4 h-4" />
                    <span>Customer Details First</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed">
                    Customer details positioned at the top. Cursor automatically starts in Customer Name input box when opening billing page.
                  </div>
                </button>
              </div>
            </div>
          
            {/* Entry Field Navigation Flow */}
            <EntryFieldFlowSection
              config={config} handleUpdate={handleUpdate}
            />

            {/* ─── HEADER BUTTONS & QUICK PAGES (COMBINED SELECTION) ─── */}
            <HeaderButtonsSection
              config={config} handleUpdate={handleUpdate} setToastMessage={setToastMessage}
            />

            {/* Other Component Visibility & Cart Navigation Toggles */}
            <ComponentVisibilitySection
              config={config} handleUpdate={handleUpdate}
            />

            {/* Post-Print Mode Persistence Controls */}
            <PostPrintModeSection
              config={config} handleUpdate={handleUpdate}
            />
          </div>
        </div>
      )}
      {/* ─── FLOATING TOAST NOTIFICATION ─── */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="p-1.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
            <AlertCircle className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-white">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="p-1 hover:bg-slate-700/50 rounded-lg transition-colors cursor-pointer text-slate-400 hover:text-white shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
