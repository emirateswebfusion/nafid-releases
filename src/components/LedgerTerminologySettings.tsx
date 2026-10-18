import React from 'react';
import { useTerminologyStore, TERMINOLOGY_PRESETS, type TerminologyPreset, DEFAULT_CUSTOM_LABELS } from '../store/terminologyStore';
import { BookOpen, Check, Eye, HelpCircle, ArrowUpRight, ArrowDownLeft, Wallet, Info } from 'lucide-react';
import clsx from 'clsx';
import { Input } from './ui/Input';

export const LedgerTerminologySettings: React.FC = () => {
  const { preset, customLabels, setPreset, setCustomLabels, getLabels } = useTerminologyStore();
  const currentLabels = getLabels();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="p-6 rounded-[24px] bg-gradient-to-r from-emerald-500/10 via-primary/5 to-transparent border border-emerald-500/20 shadow-sm relative overflow-hidden">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 shrink-0">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-foreground uppercase tracking-wider">
                  Ledger Terminology Style
                </h3>
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
                Choose the terminology that best fits your business. Replace complex accounting terms like <span className="font-bold text-foreground">Receivable & Payable</span> with easy everyday words like <span className="font-bold text-emerald-600 dark:text-emerald-400">You'll Get & You'll Give</span>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Preset Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['SIMPLE', 'ACCOUNTING', 'CASHFLOW'] as const).map((key) => {
          const item = TERMINOLOGY_PRESETS[key];
          const isSelected = preset === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPreset(key)}
              className={clsx(
                "relative text-left p-5 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between group",
                isSelected
                  ? "bg-card border-primary ring-2 ring-primary/20 shadow-md scale-[1.01]"
                  : "bg-card/60 border-border hover:border-border/80 hover:bg-card hover:shadow-sm"
              )}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className={clsx(
                    "text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border",
                    key === 'SIMPLE' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400" :
                    key === 'ACCOUNTING' ? "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400" :
                    "bg-purple-500/10 text-purple-600 border-purple-500/20 dark:text-purple-400"
                  )}>
                    {key === 'SIMPLE' ? '⭐ Recommended' : key === 'ACCOUNTING' ? 'Accounting' : 'Cash Flow'}
                  </span>
                  <div className={clsx(
                    "w-5 h-5 rounded-full flex items-center justify-center border transition-all",
                    isSelected ? "bg-primary border-primary text-primary-foreground scale-110" : "border-border text-transparent"
                  )}>
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                </div>

                <h4 className="text-sm font-black text-foreground mb-1 group-hover:text-primary transition-colors">
                  {item.title}
                </h4>
                <p className="text-[11px] text-muted-foreground font-medium mb-4 leading-relaxed">
                  {item.subtitle}
                </p>

                {/* Term Chips Preview */}
                <div className="space-y-1.5 pt-3 border-t border-border/60 text-[11px]">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground font-medium">Customer Owed:</span>
                    <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{item.labels.receivable}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground font-medium">Supplier Owed:</span>
                    <span className="font-extrabold text-rose-600 dark:text-rose-400">{item.labels.payable}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground font-medium">Payment Received:</span>
                    <span className="font-bold text-foreground">{item.labels.received}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-border/40 text-[10px] text-muted-foreground/90 italic font-medium">
                {item.descriptionMl}
              </div>
            </button>
          );
        })}
      </div>

      {/* Custom Preset Selection & Editor */}
      <div className={clsx(
        "p-5 rounded-2xl border transition-all duration-200 bg-card",
        preset === 'CUSTOM' ? "border-primary ring-2 ring-primary/20 shadow-md" : "border-border"
      )}>
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPreset('CUSTOM')}
              className={clsx(
                "w-5 h-5 rounded-full flex items-center justify-center border transition-all cursor-pointer",
                preset === 'CUSTOM' ? "bg-primary border-primary text-primary-foreground" : "border-border text-transparent"
              )}
            >
              <Check className="w-3 h-3 stroke-[3]" />
            </button>
            <div>
              <h4 className="text-sm font-black text-foreground">Custom Terminology</h4>
              <p className="text-xs text-muted-foreground">Type your own custom names for each ledger term (e.g. English or custom store jargon).</p>
            </div>
          </div>
          {preset !== 'CUSTOM' && (
            <button
              type="button"
              onClick={() => setPreset('CUSTOM')}
              className="px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs transition cursor-pointer"
            >
              Customize Terms
            </button>
          )}
        </div>

        {preset === 'CUSTOM' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-border">
            <div>
              <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">
                Receivable Term
              </label>
              <Input
                value={customLabels.receivable}
                onChange={(e) => setCustomLabels({ receivable: e.target.value })}
                placeholder="e.g. You'll Get"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">
                Payable Term
              </label>
              <Input
                value={customLabels.payable}
                onChange={(e) => setCustomLabels({ payable: e.target.value })}
                placeholder="e.g. You'll Give"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">
                Received Term
              </label>
              <Input
                value={customLabels.received}
                onChange={(e) => setCustomLabels({ received: e.target.value })}
                placeholder="e.g. Got Cash"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">
                Paid Term
              </label>
              <Input
                value={customLabels.paid}
                onChange={(e) => setCustomLabels({ paid: e.target.value })}
                placeholder="e.g. Gave Cash"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">
                Credit Entry Tag
              </label>
              <Input
                value={customLabels.credit}
                onChange={(e) => setCustomLabels({ credit: e.target.value })}
                placeholder="e.g. Credit (+)"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">
                Debit Entry Tag
              </label>
              <Input
                value={customLabels.debit}
                onChange={(e) => setCustomLabels({ debit: e.target.value })}
                placeholder="e.g. Debit (-)"
              />
            </div>
          </div>
        )}
      </div>

      {/* Live Sample Preview Card */}
      <div className="p-6 rounded-2xl bg-card border border-border space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" />
            <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
              Live Preview — How it looks in your Ledgers
            </h4>
          </div>
          <span className="text-[11px] text-muted-foreground font-semibold">Active Style: <strong className="text-primary uppercase">{preset}</strong></span>
        </div>

        {/* Sample Customer Balance Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              Customer Outstanding ({currentLabels.receivable})
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">₹ 14,500.00</span>
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-md">
                {currentLabels.receivable}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground font-medium">
              {currentLabels.receivableSub}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-1">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-700 dark:text-rose-400">
              Supplier Outstanding ({currentLabels.payable})
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-xl font-black text-rose-600 dark:text-rose-400">₹ 8,200.00</span>
              <span className="text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-500/15 px-2 py-0.5 rounded-md">
                {currentLabels.payable}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground font-medium">
              {currentLabels.payableSub}
            </p>
          </div>
        </div>

        {/* Sample Ledger Table Mockup */}
        <div className="border border-border/80 rounded-xl overflow-hidden text-xs">
          <div className="bg-muted/60 px-4 py-2 font-bold text-muted-foreground grid grid-cols-12 gap-2 text-[11px] uppercase tracking-wider">
            <div className="col-span-3">Date</div>
            <div className="col-span-4">Particulars</div>
            <div className="col-span-2 text-right">{currentLabels.credit}</div>
            <div className="col-span-3 text-right">Status / Entry</div>
          </div>
          <div className="divide-y divide-border/40 bg-card">
            <div className="px-4 py-2.5 grid grid-cols-12 gap-2 items-center">
              <div className="col-span-3 text-muted-foreground font-mono text-[11px]">24 Sep 2026</div>
              <div className="col-span-4 font-bold text-foreground">Cash Payment — Rahul Traders</div>
              <div className="col-span-2 text-right font-black text-emerald-600 dark:text-emerald-400">₹ 2,000.00</div>
              <div className="col-span-3 text-right">
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
                  {currentLabels.received}
                </span>
              </div>
            </div>
            <div className="px-4 py-2.5 grid grid-cols-12 gap-2 items-center">
              <div className="col-span-3 text-muted-foreground font-mono text-[11px]">23 Sep 2026</div>
              <div className="col-span-4 font-bold text-foreground">Purchase Payment — Standard Wholesalers</div>
              <div className="col-span-2 text-right font-black text-rose-600 dark:text-rose-400">₹ 5,000.00</div>
              <div className="col-span-3 text-right">
                <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-bold border border-rose-500/20">
                  {currentLabels.paid}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
