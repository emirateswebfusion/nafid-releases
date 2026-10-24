import React from 'react';
import { POS_LAYOUT_MODELS_DATA, type POSLayoutModel } from '../../../store/billingUIStore';
import clsx from 'clsx';
import { Check, Eye } from 'lucide-react';
import type { BillingUIConfig } from '../../../store/billingUIStore';

export interface LayoutModelsTabProps {
  config: BillingUIConfig;
  handleSelectModel: (modelId: POSLayoutModel) => void;
  setActiveTab: React.Dispatch<React.SetStateAction<"models" | "preview" | "controls">>;
}

/** POS layout model cards; picking one applies that model's billing page layout. */
export function LayoutModelsTab({
  config, handleSelectModel, setActiveTab,
}: LayoutModelsTabProps) {
  return (
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
                {modelId === 'erp-grid-b2c' && (
                  <div className="flex flex-col h-full gap-1">
                    <div className="h-[25%] bg-blue-500/20 rounded-md border border-blue-500/40 flex items-center justify-between px-2 text-[8px] font-bold text-blue-600 dark:text-blue-400">
                      <span>ERP Header Metadata (Inv, Party, Date, Rep)</span>
                    </div>
                    <div className="h-[50%] bg-emerald-500/20 rounded-md border border-emerald-500/40 flex items-center justify-center text-[9px] font-bold text-emerald-600 dark:text-emerald-400 text-center">
                      Full-Width Item Table Grid (Barcode, SKU, Tax, Net)
                    </div>
                    <div className="h-[25%] bg-amber-500/20 rounded-md border border-amber-500/40 flex items-center justify-between px-2 text-[8px] font-bold text-amber-600 dark:text-amber-400">
                      <span>Stock: XX | Totals</span>
                      <span>Bottom Settlement (Cooly, Disc, Pay)</span>
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
  );
}
