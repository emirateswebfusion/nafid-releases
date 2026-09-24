import { useState } from 'react';
import { 
  POS_LAYOUT_MODELS_DATA, 
  DEFAULT_BILLING_UI_CONFIG,
  useBillingUIStore,
  type BillingUIConfig, 
  type POSLayoutModel 
} from '../store/billingUIStore';
import { 
  LayoutGrid, Columns, Sliders, RotateCcw, Check, Sparkles, 
  Eye, Monitor, Touchpad, Layers, Save, Undo2, X, AlertCircle,
  ShoppingCart, DollarSign, User, Search, Plus, Scale, Clock,
  FileText, ArrowLeftRight, Recycle, Banknote, Store, TrendingUp, PauseCircle, Truck, Settings
} from 'lucide-react';
import clsx from 'clsx';

interface BillingUICustomizerProps {
  config: BillingUIConfig;
  onChange: (newConfig: BillingUIConfig) => void;
}

export function BillingUICustomizer({ config, onChange }: BillingUICustomizerProps) {
  const [activeTab, setActiveTab] = useState<'models' | 'preview' | 'controls'>('models');

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
    if (window.electronAPI?.settingsSet) {
      window.electronAPI.settingsSet({ tenant_id: 'global', key: 'billing_ui_config', value: DEFAULT_BILLING_UI_CONFIG }).catch(() => {});
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 relative">
      
      {/* ─── TOP BANNER ─── */}
      <div className="bg-card border border-border/80 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-primary text-white shadow-md">
              <LayoutGrid className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-foreground">Billing Workspace Designer</h2>
            <span className="px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
              Layout Only
            </span>
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
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Select Layout Model Architecture</h3>
            <span className="text-xs text-muted-foreground font-medium">Click any model below — use top Save Changes button to save</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {(Object.keys(POS_LAYOUT_MODELS_DATA) as POSLayoutModel[]).map((modelId) => {
              const m = POS_LAYOUT_MODELS_DATA[modelId];
              const isSelected = config.layoutModel === modelId;
              return (
                <button
                  key={modelId}
                  type="button"
                  onClick={() => handleSelectModel(modelId)}
                  className={clsx(
                    "p-5 rounded-2xl border-2 text-left space-y-4 transition-all cursor-pointer relative flex flex-col justify-between group bg-card",
                    isSelected 
                      ? "border-primary bg-primary/5 text-foreground shadow-lg ring-2 ring-primary/20" 
                      : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground hover:shadow-md"
                  )}
                >
                  {isSelected && (
                    <span className="absolute top-4 right-4 p-1.5 rounded-full bg-primary text-white shadow-xs">
                      <Check className="w-4 h-4" />
                    </span>
                  )}

                  {/* High Resolution Wireframe Diagram */}
                  <div className="h-28 w-full rounded-xl bg-muted/30 border border-border p-2 flex flex-col gap-1.5 overflow-hidden pointer-events-none shadow-inner">
                    {modelId === 'classic-split' && (
                      <div className="flex h-full gap-2">
                        <div className="w-[58%] bg-primary/25 rounded-lg border border-primary/40 flex flex-col justify-center items-center gap-1 text-[10px] font-bold text-primary p-1">
                          <span>Search & Cart</span>
                          <span className="text-[9px] font-mono opacity-80">(58% Width)</span>
                        </div>
                        <div className="w-[42%] bg-emerald-500/25 rounded-lg border border-emerald-500/40 flex flex-col justify-center items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 p-1">
                          <span>Payment Console</span>
                          <span className="text-[9px] font-mono opacity-80">(42% Width)</span>
                        </div>
                      </div>
                    )}
                    {modelId === 'reverse-split' && (
                      <div className="flex h-full gap-2">
                        <div className="w-[42%] bg-emerald-500/25 rounded-lg border border-emerald-500/40 flex flex-col justify-center items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 p-1">
                          <span>Payment Console</span>
                          <span className="text-[9px] font-mono opacity-80">(42% Width)</span>
                        </div>
                        <div className="w-[58%] bg-primary/25 rounded-lg border border-primary/40 flex flex-col justify-center items-center gap-1 text-[10px] font-bold text-primary p-1">
                          <span>Search & Cart</span>
                          <span className="text-[9px] font-mono opacity-80">(58% Width)</span>
                        </div>
                      </div>
                    )}
                    {modelId === 'horizontal-stack' && (
                      <div className="flex flex-col h-full gap-1.5">
                        <div className="h-[60%] bg-primary/25 rounded-lg border border-primary/40 flex items-center justify-center text-[10px] font-bold text-primary">
                          Top Search Bar & Full-Width Cart Items Table
                        </div>
                        <div className="h-[40%] bg-emerald-500/25 rounded-lg border border-emerald-500/40 flex items-center justify-center text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          Bottom Horizontal Payment & Checkout Bar
                        </div>
                      </div>
                    )}
                    {modelId === 'supermarket-3col' && (
                      <div className="flex h-full gap-1.5">
                        <div className="w-[22%] bg-amber-500/25 rounded-lg border border-amber-500/40 flex items-center justify-center text-[9px] font-bold text-amber-600 dark:text-amber-400 text-center leading-tight">
                          Category Keys
                        </div>
                        <div className="w-[48%] bg-primary/25 rounded-lg border border-primary/40 flex items-center justify-center text-[10px] font-bold text-primary">
                          Cart Items Table
                        </div>
                        <div className="w-[30%] bg-emerald-500/25 rounded-lg border border-emerald-500/40 flex items-center justify-center text-[9px] font-bold text-emerald-600 dark:text-emerald-400 text-center">
                          Payment Console
                        </div>
                      </div>
                    )}
                    {modelId === 'focus-wide-cart' && (
                      <div className="flex h-full gap-2">
                        <div className="w-[72%] bg-primary/25 rounded-lg border border-primary/40 flex flex-col justify-center items-center gap-1 text-[10px] font-bold text-primary p-1">
                          <span>Wide Cart Table (70% Space)</span>
                        </div>
                        <div className="w-[28%] bg-emerald-500/25 rounded-lg border border-emerald-500/40 flex flex-col justify-center items-center gap-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 p-1 text-center">
                          <span>Compact Payment</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <h4 className="text-sm font-black text-foreground">{m.name}</h4>
                    <div className="text-xs font-bold text-primary" dangerouslySetInnerHTML={{ __html: m.subtitle }} />
                    <p className="text-xs text-muted-foreground leading-relaxed">{m.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex justify-end pt-3">
            <button
              onClick={() => setActiveTab('preview')}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white font-bold text-xs rounded-xl shadow-md hover:bg-primary/90 transition-all cursor-pointer"
            >
              <span>View Live Workspace Preview</span>
              <Eye className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ─── TAB 2: EXACT 1:1 LIVE BILLING PAGE PREVIEW ─── */}
      {activeTab === 'preview' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="w-4.5 h-4.5 text-primary" />
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Exact POS Workspace Live Preview</h3>
              <span className="text-xs text-muted-foreground font-medium">(Interactive replica of your selected layout)</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-muted-foreground bg-muted px-3 py-1 rounded-lg">
              <span>Model: {config.layoutModel}</span>
              <span>&bull;</span>
              <span>Split: {config.splitRatio}</span>
            </div>
          </div>

          {/* EXACT MINI REPLICA CONTAINER OF BILLING PAGE */}
          <div className="border-2 border-border rounded-2xl overflow-hidden bg-background shadow-inner flex flex-col min-h-[500px] text-xs transition-all duration-300">
            
            {/* 1. TOP HEADER */}
            <header className="shrink-0 border-b border-border bg-card px-5 py-2.5 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Store className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground text-xs">Billing Terminal</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <div className="flex items-center gap-2 text-[10px] mt-0.5">
                    <span className="font-mono px-2 py-0.5 rounded bg-primary/10 text-primary font-bold border border-primary/20">GST-INV-0042</span>
                    <span className="text-muted-foreground bg-muted px-2 py-0.5 rounded font-semibold">Staff</span>
                  </div>
                </div>
              </div>

              {/* Quick Action Header Buttons */}
              {config.showQuickActions && (
                <div className="flex items-center gap-2 text-xs font-bold">
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted text-muted-foreground border border-transparent">
                    <TrendingUp className="w-3.5 h-3.5 text-primary" /> History
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20">
                    <PauseCircle className="w-3.5 h-3.5 text-amber-500" /> Held Bills
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500/10 text-orange-600 border border-orange-500/20">
                    <Recycle className="w-3.5 h-3.5 text-orange-500" /> Scrap (F5)
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 text-blue-600 border border-blue-500/20">
                    <FileText className="w-3.5 h-3.5 text-blue-500" /> Quotation (F6)
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-600 border border-rose-500/20">
                    <ArrowLeftRight className="w-3.5 h-3.5 text-rose-500" /> Return (F7)
                  </span>
                  <span className="p-1.5 rounded-xl text-muted-foreground hover:bg-muted">
                    <Settings className="w-4 h-4" />
                  </span>
                </div>
              )}
            </header>

            {/* 2. TABS BAR */}
            <div className="shrink-0 bg-muted/20 border-b border-border px-4 py-1.5 flex items-center gap-2 text-xs">
              <div className="px-4 py-1.5 bg-card border border-border border-b-0 rounded-t-xl font-bold text-primary flex items-center gap-2 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span>POS Main Tab</span>
              </div>
              <div className="px-4 py-1.5 text-muted-foreground hover:bg-muted rounded-t-xl font-medium">Tab 2</div>
              <div className="px-2.5 py-1 text-muted-foreground font-bold text-xs">+</div>
            </div>

            {/* 3. DYNAMIC MAIN POS WORKSPACE */}
            <div 
              className={clsx(
                "flex flex-1 overflow-hidden transition-all duration-300",
                config.orientation === 'horizontal-stack' ? "flex-col" : 
                config.layoutPosition === 'cart-right' ? "flex-row-reverse" : "flex-row"
              )}
            >

              {/* 3A. OPTIONAL 3RD COLUMN (Express Most Sold Products) */}
              {config.orientation === 'three-column' && (
                <div className="w-[22%] border-r border-border bg-muted/30 p-3 space-y-2 shrink-0">
                  <div className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-2 flex items-center justify-between">
                    <span>Products - Most Sold</span>
                    <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <div className="space-y-2">
                    {[
                      { name: 'Gold Ring 22K', price: '₹14,500' },
                      { name: 'Silver Chain 925', price: '₹2,400' },
                      { name: 'Diamond Bangle', price: '₹45,000' },
                      { name: 'Titan Watch Classic', price: '₹5,200' },
                      { name: 'Gold Coin 5g', price: '₹36,000' }
                    ].map((item, i) => (
                      <div key={item.name} className={clsx("p-2.5 rounded-xl border text-xs font-bold transition-all shadow-xs flex flex-col gap-0.5", i === 0 ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400" : "bg-card border-border text-foreground")}>
                        <div className="truncate">{item.name}</div>
                        <div className="text-[10px] opacity-75 font-mono">{item.price}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3B. CART & SEARCH COLUMN */}
              <div 
                className={clsx(
                  "flex flex-col transition-all duration-300",
                  config.orientation === 'horizontal-stack' ? "w-full flex-1 border-b-2 border-border bg-muted/10" :
                  config.orientation === 'three-column' ? "w-[48%] border-r border-border bg-muted/10" :
                  config.splitRatio === '50-50' ? "w-[50%] border-r border-border bg-muted/10" :
                  config.splitRatio === '65-35' ? "w-[65%] border-r border-border bg-muted/10" :
                  config.splitRatio === '70-30' ? "w-[70%] border-r border-border bg-muted/10" : "w-[58%] border-r border-border bg-muted/10"
                )}
              >
                {config.entryFocusOrder === 'customer-first' ? (
                  <>
                    {/* Customer Info Header */}
                    <div className="px-4 py-2.5 bg-card border-b border-border flex items-center gap-3">
                      <div className="relative flex-1">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
                        <input
                          type="text"
                          disabled
                          value="Walk-in Customer"
                          className="w-full pl-9 pr-3 py-1.5 bg-background border border-primary/50 rounded-xl text-xs font-bold text-foreground ring-2 ring-primary/30"
                        />
                      </div>
                      <input
                        type="text"
                        disabled
                        placeholder="Customer Phone"
                        className="w-44 px-3 py-1.5 bg-background border border-border rounded-xl text-xs font-medium text-foreground"
                      />
                    </div>

                    {/* Search Bar */}
                    <div className="p-3 bg-card border-b border-border">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input
                            type="text"
                            disabled
                            placeholder="Search products or scan barcode... (Press F2)"
                            className="w-full pl-10 pr-3 py-2 bg-background border border-border rounded-xl text-xs font-medium text-foreground placeholder:text-muted-foreground/60"
                          />
                        </div>
                        {config.showScaleButton && (
                          <button className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 text-amber-600 rounded-xl text-xs font-bold border border-amber-500/20">
                            <Scale className="w-4 h-4" />
                            <span>Read Scale</span>
                          </button>
                        )}
                        <button className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold border border-primary/20">
                          <Plus className="w-4 h-4" />
                          <span>Add Product</span>
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Search Bar */}
                    <div className="p-3 bg-card border-b border-border">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input
                            type="text"
                            disabled
                            placeholder="Search products or scan barcode... (Press F2)"
                            className="w-full pl-10 pr-3 py-2 bg-background border border-primary/50 rounded-xl text-xs font-medium text-foreground placeholder:text-muted-foreground/60 ring-2 ring-primary/30"
                          />
                        </div>
                        {config.showScaleButton && (
                          <button className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 text-amber-600 rounded-xl text-xs font-bold border border-amber-500/20">
                            <Scale className="w-4 h-4" />
                            <span>Read Scale</span>
                          </button>
                        )}
                        <button className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold border border-primary/20">
                          <Plus className="w-4 h-4" />
                          <span>Add Product</span>
                        </button>
                      </div>
                    </div>

                    {/* Customer Info Header */}
                    <div className="px-4 py-2.5 bg-card border-b border-border flex items-center gap-3">
                      <div className="relative flex-1">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
                        <input
                          type="text"
                          disabled
                          value="Walk-in Customer"
                          className="w-full pl-9 pr-3 py-1.5 bg-background border border-border rounded-xl text-xs font-bold text-foreground"
                        />
                      </div>
                      <input
                        type="text"
                        disabled
                        placeholder="Customer Phone"
                        className="w-44 px-3 py-1.5 bg-background border border-border rounded-xl text-xs font-medium text-foreground"
                      />
                    </div>
                  </>
                )}

                {/* Cart Table Items */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  <div className="grid grid-cols-12 text-xs font-black uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
                    <div className="col-span-6">Item Name</div>
                    <div className="col-span-2 text-center">Qty</div>
                    <div className="col-span-2 text-right">Rate</div>
                    <div className="col-span-2 text-right">Amount</div>
                  </div>

                  {/* Sample Items */}
                  <div className="grid grid-cols-12 items-center p-3 bg-background border border-border rounded-xl text-xs font-semibold shadow-xs">
                    <div className="col-span-6 font-bold text-foreground">Gold Ring 22K (2.500g)</div>
                    <div className="col-span-2 text-center font-mono font-bold">1.00</div>
                    <div className="col-span-2 text-right font-mono text-muted-foreground">₹15,400</div>
                    <div className="col-span-2 text-right font-mono font-bold text-primary">₹15,400.00</div>
                  </div>

                  <div className="grid grid-cols-12 items-center p-3 bg-background border border-border rounded-xl text-xs font-semibold shadow-xs">
                    <div className="col-span-6 font-bold text-foreground font-sans">Silver Chain 925 (10.00g)</div>
                    <div className="col-span-2 text-center font-mono font-bold">1.00</div>
                    <div className="col-span-2 text-right font-mono text-muted-foreground">₹1,250</div>
                    <div className="col-span-2 text-right font-mono font-bold text-primary">₹1,250.00</div>
                  </div>
                </div>
              </div>

              {/* 3C. PAYMENT & TRANSACTION CONSOLE COLUMN */}
              <div 
                className={clsx(
                  "bg-card border-border transition-all duration-300",
                  config.orientation === 'horizontal-stack' 
                    ? "w-full flex flex-row h-[190px] shrink-0 border-t-2 border-border p-4 gap-4 overflow-hidden" 
                    : "flex flex-col border-l p-4 justify-between " + (
                      config.orientation === 'three-column' ? "w-[30%]" :
                      config.splitRatio === '50-50' ? "w-[50%]" :
                      config.splitRatio === '65-35' ? "w-[35%]" :
                      config.splitRatio === '70-30' ? "w-[30%]" : "w-[42%]"
                    )
                )}
              >
                {/* Payment Mode Selector (Left Side of Bottom Bar in Horizontal Stack) */}
                <div className={clsx(config.orientation === 'horizontal-stack' ? "w-1/2 border-r border-border pr-4 space-y-2" : "space-y-4")}>
                  <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Payment Methods</span>
                  <div className="grid grid-cols-4 gap-2 text-xs font-bold">
                    <div className="p-2 text-center rounded-xl border-2 border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold shadow-xs">CASH</div>
                    <div className="p-2 text-center rounded-xl border border-border bg-background text-muted-foreground">CARD</div>
                    <div className="p-2 text-center rounded-xl border border-border bg-background text-muted-foreground">UPI</div>
                    <div className="p-2 text-center rounded-xl border border-border bg-background text-muted-foreground">CREDIT</div>
                  </div>
                  {config.orientation === 'horizontal-stack' && (
                    <div className="p-2 rounded-xl border border-orange-500/20 bg-orange-500/5 text-[10px] font-bold text-orange-600 flex items-center justify-between">
                      <span>Scrap / Return Credit (F9/F10)</span>
                      <span className="font-mono">-[Credit Input]</span>
                    </div>
                  )}
                </div>

                {/* Subtotal, Grand Total & Complete Invoice (Right Side of Bottom Bar in Horizontal Stack) */}
                <div className={clsx(config.orientation === 'horizontal-stack' ? "w-1/2 flex flex-col justify-between space-y-2" : "space-y-4")}>
                  <div className="p-3 rounded-2xl border border-border bg-muted/20 space-y-1.5 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal:</span>
                      <span className="font-mono font-semibold">₹16,650.00</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>GST (3%):</span>
                      <span className="font-mono font-semibold">₹499.50</span>
                    </div>
                    <div className="flex justify-between text-sm font-black text-foreground pt-1.5 border-t border-border">
                      <span>Grand Total:</span>
                      <span className="font-mono text-base text-primary">₹17,149.50</span>
                    </div>
                  </div>

                  <button 
                    className={clsx(
                      "w-full py-2.5 rounded-xl bg-primary text-white font-black text-xs shadow-md transition-all text-center uppercase tracking-wider",
                      config.touchMode ? "py-3 text-sm" : ""
                    )}
                  >
                    COMPLETE INVOICE (F12)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
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
                    onClick={() => handleUpdate({ splitRatio: ratio.id as any })}
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

            {/* Component Visibility Toggles */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
                Header Component Visibility
              </label>
              <div className="space-y-2.5">
                <label className="flex items-center gap-3 p-3 bg-background border border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={config.showQuickActions}
                    onChange={(e) => handleUpdate({ showQuickActions: e.target.checked })}
                    className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                  />
                  <span className="text-xs font-bold text-foreground">Header Mode Buttons (History, Scrap, Return, etc.)</span>
                </label>

                <label className="flex items-center gap-3 p-3 bg-background border border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={config.showScaleButton}
                    onChange={(e) => handleUpdate({ showScaleButton: e.target.checked })}
                    className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                  />
                  <span className="text-xs font-bold text-foreground">Weighing Scale Read Button</span>
                </label>

                <label className="flex items-start gap-3 p-3 bg-background border border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={config.showPurchasePriceInPOS ?? false}
                    onChange={(e) => handleUpdate({ showPurchasePriceInPOS: e.target.checked })}
                    className="w-4 h-4 mt-0.5 rounded text-primary focus:ring-primary cursor-pointer"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground">Show Product Purchase Cost in Price Override Menu</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">Displays purchase cost in price tier/override dropdown for reference (View Only, non-selectable).</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
