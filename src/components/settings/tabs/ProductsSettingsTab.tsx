import React from 'react';
import { Key, Tags, Upload, Package } from 'lucide-react';
import clsx from 'clsx';
import { Input } from '../../ui/Input';
import type { SettingsForm } from '../settingsFormTypes';

export interface ProductsSettingsTabProps {
  isAdminRole: boolean;
  activeProductsTab: string;
  setActiveProductsTab: SettingsForm['setActiveProductsTab'];
  priceCoding: Record<string, string>;
  setPriceCoding: (v: Record<string, string>) => void;
  serviceChargeBarcode: string;
  setServiceChargeBarcode: (v: string) => void;
  enableRealPaperStock: boolean;
  setEnableRealPaperStock: (v: boolean) => void;
  showZeroPaperStock: boolean;
  setShowZeroPaperStock: (v: boolean) => void;
  showPaperStockInGst: boolean;
  setShowPaperStockInGst: (v: boolean) => void;
  showPaperStockInEstimate: boolean;
  setShowPaperStockInEstimate: (v: boolean) => void;
  showBulkSheet: boolean;
  setShowBulkSheet: (v: boolean) => void;
  showPaperOnlyProducts: boolean;
  setShowPaperOnlyProducts: (v: boolean) => void;
}

export const ProductsSettingsTab: React.FC<ProductsSettingsTabProps> = ({
  isAdminRole,
  activeProductsTab,
  setActiveProductsTab,
  priceCoding,
  setPriceCoding,
  serviceChargeBarcode,
  setServiceChargeBarcode,
  enableRealPaperStock,
  setEnableRealPaperStock,
  showZeroPaperStock,
  setShowZeroPaperStock,
  showPaperStockInGst,
  setShowPaperStockInGst,
  showPaperStockInEstimate,
  setShowPaperStockInEstimate,
  setShowBulkSheet,
  showPaperOnlyProducts,
  setShowPaperOnlyProducts,
}) => {
  const productTabs = [
    { id: 'coding', label: 'Price Coding', icon: Key, ownerOnly: true },
    { id: 'bulk', label: 'Bulk Import', icon: Upload, ownerOnly: true },
  ].filter(t => !t.ownerOnly || isAdminRole);

  return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Top Sub-tabs (only show if role is OWNER, since cashier only sees Grades) */}
            {productTabs.length > 1 && (
              <div className="flex gap-1.5 p-1.5 bg-muted/50 dark:bg-muted/20 border border-border rounded-2xl overflow-x-auto scrollbar-none w-full max-w-fit shadow-inner mx-auto">
                {productTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isTabActive = activeProductsTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveProductsTab(tab.id as Parameters<typeof setActiveProductsTab>[0])}
                      className={clsx(
                        "flex items-center justify-center gap-2 py-2 px-3.5 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0",
                        isTabActive
                          ? "bg-background shadow-md shadow-foreground/[0.03] text-primary border-border/40 font-extrabold scale-100"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0 text-current" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Content pane */}

            {activeProductsTab === 'coding' && (
              <div className="space-y-6">
                <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm space-y-6">
                  <div className="flex items-center gap-3 pb-4 border-b border-border">
                    <Key className="w-4.5 h-4.5 text-primary" />
                    <span className="text-xs font-black uppercase tracking-widest text-foreground">Purchase Price Coding System</span>
                  </div>
                  <p className="text-xs text-muted-foreground/80 leading-relaxed">
                    Assign a unique, non-repeating letter to each digit (0-9). This lets you print encoded purchase prices on product labels (e.g. code "BHXY" for ₹1250).
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                      <div key={digit} className="flex items-center justify-between gap-3 bg-muted/40 dark:bg-muted/10 p-3 rounded-2xl border border-border hover:border-primary/30 hover:bg-background/80 hover:shadow-sm transition-all duration-300 select-none">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center justify-center font-black text-xs w-8 h-8 rounded-xl bg-primary/10 text-primary shrink-0 shadow-inner">{digit}</span>
                          <span className="text-muted-foreground/50 text-xs font-bold">=</span>
                        </div>
                        <Input type="text" maxLength={1} value={priceCoding[digit.toString()] || ''} onChange={(e) => setPriceCoding({ ...priceCoding, [digit.toString()]: e.target.value.toUpperCase() })} className="w-12 h-10 text-center font-extrabold text-base uppercase bg-card dark:bg-background border border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-1 block shadow-sm transition-all duration-200" style={{ color: 'var(--foreground)' }} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm space-y-6">
                  <div className="flex items-center gap-3 pb-4 border-b border-border">
                    <Tags className="w-4.5 h-4.5 text-primary" />
                    <span className="text-xs font-black uppercase tracking-widest text-foreground">Service Charge Configuration</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-extrabold text-foreground">Service Charge Barcode</p>
                      <p className="text-xs text-muted-foreground/80 leading-relaxed">
                        Customize the barcode used to quickly scan/add the Service Charge item in the billing panel.
                      </p>
                    </div>
                    <div className="w-full sm:w-48">
                      <Input
                        type="text"
                        placeholder="Enter barcode (e.g. 99)"
                        value={serviceChargeBarcode}
                        onChange={(e) => setServiceChargeBarcode(e.target.value.trim())}
                        className="w-full font-bold text-sm bg-card border border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-3 py-2"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeProductsTab === 'bulk' && (
              <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-border">
                  <Upload className="w-4.5 h-4.5 text-primary" />
                  <span className="text-xs font-black uppercase tracking-widest text-foreground">Bulk Product Import</span>
                </div>
                <p className="text-xs text-muted-foreground/80 leading-relaxed">
                  Quickly upload products and generate barcode labels in bulk using a spreadsheet layout.
                </p>
                <div>
                  <button type="button" onClick={() => setShowBulkSheet(true)}
                    className="flex items-center gap-2 px-5 py-3 text-xs font-bold bg-primary/10 hover:bg-primary hover:text-primary-foreground rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer border border-primary/20 hover:border-primary shadow-sm shadow-primary/5">
                    <Upload className="w-4 h-4 shrink-0" /> Open Bulk Import Sheet
                  </button>
                </div>
              </div>
            )}

            {/* Card: Dedicated Paper Stock Settings */}
            <div className="bg-purple-500/5 border border-purple-500/20 rounded-[28px] p-6 md:p-8 shadow-sm space-y-5 transition-all duration-300">
              {/* Card Header with Master Switch in Header */}
              <div className="flex items-center justify-between gap-4 pb-4 border-b border-purple-500/15">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 shadow-[0_4px_12px_rgba(147,51,234,0.1)] shrink-0">
                    <Package className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xs font-black text-purple-600 dark:text-purple-400 uppercase tracking-widest flex items-center gap-2">
                        <span className={clsx("w-2 h-2 rounded-full", enableRealPaperStock ? "bg-purple-500 animate-pulse" : "bg-muted-foreground/40")} />
                        Paper Stock Settings
                      </h3>
                      <span className={clsx(
                        "text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider border",
                        enableRealPaperStock
                          ? "bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30"
                          : "bg-muted/50 text-muted-foreground border-border"
                      )}>
                        {enableRealPaperStock ? "ENABLED" : "DISABLED"}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-medium mt-0.5 truncate sm:whitespace-normal">
                      Configure Real vs Paper stock separation, billing visibility, and inventory display
                    </p>
                  </div>
                </div>

                {/* Master Switch: Enable Paper Stock Feature in Header */}
                <div className="flex items-center gap-3 shrink-0 pl-2">
                  <span className="text-xs font-bold text-foreground hidden sm:inline select-none">
                    {enableRealPaperStock ? 'Feature Active' : 'Feature Off'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEnableRealPaperStock(!enableRealPaperStock)}
                    className={clsx(
                      'relative w-12 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer',
                      enableRealPaperStock ? 'bg-purple-600 shadow-[0_2px_8px_rgba(147,51,234,0.3)]' : 'bg-muted-foreground/30'
                    )}
                    title={enableRealPaperStock ? 'Click to Disable Paper Stock Feature' : 'Click to Enable Paper Stock Feature'}
                  >
                    <span
                      className={clsx(
                        'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300 flex items-center justify-center text-[10px]',
                        enableRealPaperStock ? 'translate-x-6 text-purple-600 font-bold' : 'translate-x-0 text-muted-foreground'
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Expandable Sub-Settings: Visible ONLY when Enable Paper Stock Feature is ON */}
              {enableRealPaperStock ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                      Manage Paper Stock Settings
                    </span>
                    <span className="text-[10px] text-muted-foreground">Detailed preferences for paper stock tracking</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 1. Show Zero Paper Stock Tag in Inventory */}
                    <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border bg-card border-border/80 hover:border-purple-500/30 transition-all">
                      <div className="flex-1 min-w-0">
                        <label className="text-xs font-bold text-foreground block flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-sky-500" />
                          Show Zero Paper Stock Tag (Paper: 0)
                        </label>
                        <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-relaxed">
                          Display Paper: 0 tag in product list even when paper stock is 0.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowZeroPaperStock(!showZeroPaperStock)}
                        className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', showZeroPaperStock ? 'bg-sky-600 shadow-[0_2px_8px_rgba(14,165,233,0.3)]' : 'bg-muted-foreground/20')}
                        title={showZeroPaperStock ? 'Enabled' : 'Disabled'}
                      >
                        <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', showZeroPaperStock ? 'translate-x-5' : 'translate-x-0')} />
                      </button>
                    </div>

                    {/* 2. Show Paper-Only Products in Inventory */}
                    <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border bg-card border-border/80 hover:border-purple-500/30 transition-all">
                      <div className="flex-1 min-w-0">
                        <label className="text-xs font-bold text-foreground block flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-purple-500" />
                          Show Paper-Only Products in Inventory
                        </label>
                        <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-relaxed">
                          Show products with Paper Stock (and 0 Real Shop Stock) in the inventory product list.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPaperOnlyProducts(!showPaperOnlyProducts)}
                        className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', showPaperOnlyProducts ? 'bg-purple-600 shadow-[0_2px_8px_rgba(147,51,234,0.3)]' : 'bg-muted-foreground/20')}
                        title={showPaperOnlyProducts ? 'Enabled' : 'Disabled'}
                      >
                        <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', showPaperOnlyProducts ? 'translate-x-5' : 'translate-x-0')} />
                      </button>
                    </div>

                    {/* 3. Show Paper Stock in GST Billing */}
                    <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border bg-card border-border/80 hover:border-purple-500/30 transition-all">
                      <div className="flex-1 min-w-0">
                        <label className="text-xs font-bold text-foreground block flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-purple-500" />
                          Show Paper Stock in GST Billing
                        </label>
                        <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-relaxed">
                          Show and allow Paper products &amp; Paper Stock when billing in GST Invoice mode.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPaperStockInGst(!showPaperStockInGst)}
                        className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', showPaperStockInGst ? 'bg-purple-600 shadow-[0_2px_8px_rgba(147,51,234,0.3)]' : 'bg-muted-foreground/20')}
                        title={showPaperStockInGst ? 'Enabled' : 'Disabled'}
                      >
                        <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', showPaperStockInGst ? 'translate-x-5' : 'translate-x-0')} />
                      </button>
                    </div>

                    {/* 4. Show Paper Stock in Estimate Billing */}
                    <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border bg-card border-border/80 hover:border-purple-500/30 transition-all">
                      <div className="flex-1 min-w-0">
                        <label className="text-xs font-bold text-foreground block flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          Show Paper Stock in Estimate Billing
                        </label>
                        <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-relaxed">
                          Show and allow Paper products &amp; Paper Stock when billing in Estimate mode.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPaperStockInEstimate(!showPaperStockInEstimate)}
                        className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', showPaperStockInEstimate ? 'bg-emerald-600 shadow-[0_2px_8px_rgba(16,185,129,0.3)]' : 'bg-muted-foreground/20')}
                        title={showPaperStockInEstimate ? 'Enabled' : 'Disabled'}
                      >
                        <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', showPaperStockInEstimate ? 'translate-x-5' : 'translate-x-0')} />
                      </button>
                    </div>

                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl border border-dashed border-purple-500/20 bg-purple-500/5 text-center space-y-1.5 animate-in fade-in duration-200">
                  <p className="text-xs font-bold text-muted-foreground">Paper Stock Feature is Disabled</p>
                  <p className="text-[11px] text-muted-foreground/75 max-w-md mx-auto">
                    Turn on &quot;Enable Paper Stock Feature&quot; in the header above to expand and manage paper stock options across Inventory, Billing, and Reports.
                  </p>
                </div>
              )}
            </div>
          </div>
  );
};
