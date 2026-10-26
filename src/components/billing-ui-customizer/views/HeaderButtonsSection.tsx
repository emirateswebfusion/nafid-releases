import React from 'react';
import { getTotalSelectedHeaderButtonsCount, INTERNAL_HEADER_BUTTON_CAPACITY, isHeaderButtonVisible, DEFAULT_HEADER_BUTTON_CONFIG, QUICK_PAGES_LIST } from '../../../store/billingUIStore';
import { Sliders, Banknote, Recycle, FileText, ArrowLeftRight, TrendingUp, PauseCircle, Truck, RotateCcw, BookOpen } from 'lucide-react';
import clsx from 'clsx';
import type { BillingUIConfig } from '../../../store/billingUIStore';

export interface HeaderButtonsSectionProps {
  config: BillingUIConfig;
  handleUpdate: (partial: Partial<BillingUIConfig>) => void;
  setToastMessage: React.Dispatch<React.SetStateAction<string | null>>;
}

/** Billing page controls: header buttons and quick pages selection, within the header capacity. */
export function HeaderButtonsSection({
  config, handleUpdate, setToastMessage,
}: HeaderButtonsSectionProps) {
  return (
    <>
    {(() => {
      const totalSelected = getTotalSelectedHeaderButtonsCount(config);
      const maxLimit = INTERNAL_HEADER_BUTTON_CAPACITY;
      const isOverallLimitReached = totalSelected >= maxLimit;

      return (
        <div className="space-y-6 col-span-1 md:col-span-3 bg-muted/20 border border-border p-5 rounded-2xl">
          {/* Top Bar Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-primary" />
                  Header Action Buttons & Quick Pages (Selection)
                </h4>
                <span className={clsx(
                  "px-2.5 py-0.5 text-[10px] font-black rounded-full border uppercase tracking-wider",
                  isOverallLimitReached
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                )}>
                  {totalSelected} / {maxLimit} Active Selected
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Select any combination of Header Mode buttons and Quick Page shortcuts (e.g. <strong>Ledger</strong>). The system capacity allows up to {maxLimit} active header buttons.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0 self-start sm:self-auto">
              <label className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-xl cursor-pointer text-xs font-bold shrink-0">
                <input
                  type="checkbox"
                  checked={config.showQuickActions}
                  onChange={(e) => handleUpdate({ showQuickActions: e.target.checked })}
                  className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                />
                <span>Master Header Toggle</span>
              </label>
            </div>
          </div>

          {config.showQuickActions ? (
            <div className="space-y-6">
              {/* Section 1: Header Mode Action Buttons */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Banknote className="w-3.5 h-3.5 text-primary" /> Header Action Mode Buttons
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { key: 'showRegister' as const, label: 'Register', icon: Banknote, desc: 'Cash Register drawer panel button', color: 'text-purple-500', bg: 'bg-purple-500/10' },
                    { key: 'showScrap' as const, label: 'Scrap (F5)', icon: Recycle, desc: 'Scrap billing mode toggle', color: 'text-orange-500', bg: 'bg-orange-500/10' },
                    { key: 'showQuotation' as const, label: 'Quotation (F6)', icon: FileText, desc: 'Quotation mode toggle', color: 'text-blue-500', bg: 'bg-blue-500/10' },
                    { key: 'showReturn' as const, label: 'Return (F7)', icon: ArrowLeftRight, desc: 'Sales return mode toggle', color: 'text-rose-500', bg: 'bg-rose-500/10' },
                    { key: 'showHistory' as const, label: 'History', icon: TrendingUp, desc: 'Sales & Scrap history logs', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                    { key: 'showHeldBills' as const, label: 'Held Bills', icon: PauseCircle, desc: 'Draft & held invoices panel', color: 'text-amber-500', bg: 'bg-amber-500/10' },
                    { key: 'showTransport' as const, label: 'Transport', icon: Truck, desc: 'Transporter & E-Way details', color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
                    { key: 'showClearCart' as const, label: 'Clear Cart', icon: RotateCcw, desc: 'Reset active cart items button', color: 'text-destructive', bg: 'bg-destructive/10' },
                  ].map((btn) => {
                    const Icon = btn.icon;
                    const isChecked = isHeaderButtonVisible(config, btn.key);
                    const isDisabled = !isChecked && isOverallLimitReached;

                    return (
                      <label
                        key={btn.key}
                        onClick={(e) => {
                          if (isDisabled) {
                            e.preventDefault();
                            setToastMessage(`Maximum capacity reached (${totalSelected}/${maxLimit}). Uncheck an active button first.`);
                          }
                        }}
                        className={clsx(
                          "flex items-start gap-3 p-3 rounded-xl border transition-all select-none relative",
                          isChecked
                            ? "bg-card border-primary/50 ring-1 ring-primary/20 shadow-xs cursor-pointer"
                            : isDisabled
                              ? "bg-muted/20 border-border opacity-50 cursor-not-allowed"
                              : "bg-muted/40 border-border hover:bg-card hover:border-primary/40 cursor-pointer"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isDisabled}
                          onChange={(e) => {
                            const currentHb = config.headerButtons || DEFAULT_HEADER_BUTTON_CONFIG;
                            handleUpdate({
                              headerButtons: {
                                ...currentHb,
                                [btn.key]: e.target.checked,
                              },
                            });
                          }}
                          className="w-4 h-4 mt-0.5 rounded text-primary focus:ring-primary cursor-pointer shrink-0 disabled:cursor-not-allowed"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={clsx("p-1 rounded-md shrink-0", btn.bg)}>
                              <Icon className={clsx("w-3.5 h-3.5", btn.color)} />
                            </span>
                            <span className="text-xs font-extrabold text-foreground truncate">{btn.label}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1 leading-tight">{btn.desc}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Quick Page Entry Shortcuts */}
              <div className="space-y-2.5 pt-3 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-500" /> Quick Page Shortcuts (Easy Enter)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {QUICK_PAGES_LIST.map((page) => {
                    const activeList = config.quickPageShortcuts || ['ledger'];
                    const isChecked = activeList.includes(page.key);
                    const isDisabled = !isChecked && isOverallLimitReached;

                    return (
                      <label
                        key={page.key}
                        onClick={(e) => {
                          if (isDisabled) {
                            e.preventDefault();
                            setToastMessage(`Maximum capacity reached (${totalSelected}/${maxLimit}). Uncheck an active button first.`);
                          }
                        }}
                        className={clsx(
                          "flex items-start gap-3 p-3 rounded-xl border transition-all select-none relative",
                          isChecked
                            ? "bg-card border-emerald-500/50 ring-1 ring-emerald-500/20 shadow-xs cursor-pointer"
                            : isDisabled
                              ? "bg-muted/20 border-border opacity-50 cursor-not-allowed"
                              : "bg-muted/40 border-border hover:bg-card hover:border-primary/40 cursor-pointer"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isDisabled}
                          onChange={(e) => {
                            if (e.target.checked) {
                              if (!isOverallLimitReached) {
                                handleUpdate({ quickPageShortcuts: [...activeList, page.key] });
                              }
                            } else {
                              handleUpdate({ quickPageShortcuts: activeList.filter(k => k !== page.key) });
                            }
                          }}
                          className="w-4 h-4 mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0 disabled:cursor-not-allowed"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-extrabold text-foreground truncate">{page.label}</span>
                            {page.key === 'ledger' && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                                Ledger
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1 leading-tight">{page.desc}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-semibold">
              Header buttons are currently disabled by the Master Toggle. Check "Master Header Toggle" above to turn on and configure individual buttons.
            </div>
          )}
        </div>
      );
    })()}
    </>
  );
}
