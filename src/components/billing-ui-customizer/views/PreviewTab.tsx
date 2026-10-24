import { Eye, Store, RotateCcw, TrendingUp, PauseCircle, Truck, Recycle, FileText, ArrowLeftRight, Banknote, BookOpen, Settings, User, Search, Scale, Plus } from 'lucide-react';
import { isHeaderButtonVisible, QUICK_PAGES_LIST } from '../../../store/billingUIStore';
import clsx from 'clsx';
import type { BillingUIConfig } from '../../../store/billingUIStore';

export interface PreviewTabProps {
  config: BillingUIConfig;
}

/** Live preview of the billing page with the current layout, entry order and visible components. */
export function PreviewTab({
  config,
}: PreviewTabProps) {
  return (
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
              {isHeaderButtonVisible(config, 'showClearCart') && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 text-[11px]">
                  <RotateCcw className="w-3 h-3" /> Clear Cart
                </span>
              )}
              {isHeaderButtonVisible(config, 'showHistory') && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-muted text-muted-foreground border border-transparent text-[11px]">
                  <TrendingUp className="w-3.5 h-3.5 text-primary" /> History
                </span>
              )}
              {isHeaderButtonVisible(config, 'showHeldBills') && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[11px]">
                  <PauseCircle className="w-3.5 h-3.5 text-amber-500" /> Held Bills
                </span>
              )}
              {isHeaderButtonVisible(config, 'showTransport') && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-cyan-500/10 text-cyan-600 border border-cyan-500/20 text-[11px]">
                  <Truck className="w-3.5 h-3.5 text-cyan-500" /> Transport
                </span>
              )}
              {isHeaderButtonVisible(config, 'showScrap') && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-orange-500/10 text-orange-600 border border-orange-500/20 text-[11px]">
                  <Recycle className="w-3.5 h-3.5 text-orange-500" /> Scrap (F5)
                </span>
              )}
              {isHeaderButtonVisible(config, 'showQuotation') && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-500/10 text-blue-600 border border-blue-500/20 text-[11px]">
                  <FileText className="w-3.5 h-3.5 text-blue-500" /> Quotation (F6)
                </span>
              )}
              {isHeaderButtonVisible(config, 'showReturn') && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-500/10 text-rose-600 border border-rose-500/20 text-[11px]">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-rose-500" /> Return (F7)
                </span>
              )}
              {isHeaderButtonVisible(config, 'showRegister') && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-500/10 text-purple-600 border border-purple-500/20 text-[11px]">
                  <Banknote className="w-3.5 h-3.5 text-purple-500" /> Register
                </span>
              )}
              {(config.quickPageShortcuts || ['ledger']).map((pageKey) => {
                const pageDef = QUICK_PAGES_LIST.find(p => p.key === pageKey);
                if (!pageDef) return null;
                return (
                  <span key={pageKey} className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[11px]">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-500" /> {pageDef.label.split(' ')[0]}
                  </span>
                );
              })}
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
  );
}
