import clsx from 'clsx';
import { ListChecks, RotateCcw, CheckSquare, Square } from 'lucide-react';
import { type ShopClosingChecklist, CHECKLIST_DEFINITIONS } from '../../../utils/time/shopClosingHelper';
import type { ShopClosingOverviewConfig } from '../../../utils/time/shopClosingHelper';

export interface ClosingChecklistSectionProps {
  closingConfig: ShopClosingOverviewConfig;
  handleChecklistToggle: (key: keyof ShopClosingChecklist) => void;
  handleClearAllChecklist: () => void;
  handleRestoreDefaultChecklist: () => void;
  handleSelectAllChecklist: () => void;
  isAdmin: boolean;
  selectedChecklistCount: number;
  totalChecklistCount: number;
}

/** Shop closing report checklist: grouped items and sub-items, select all / clear / restore defaults. */
export function ClosingChecklistSection({
  closingConfig, handleChecklistToggle, handleClearAllChecklist, handleRestoreDefaultChecklist,
  handleSelectAllChecklist, isAdmin, selectedChecklistCount, totalChecklistCount,
}: ClosingChecklistSectionProps) {
  return (
    <div
      className={clsx(
        'p-6 rounded-2xl bg-muted/20 border border-border/80 space-y-4 transition-all',
        !closingConfig.enabled && 'opacity-60'
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/60">
        <div>
          <h4 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-primary" />
            Information Checklist
          </h4>
          <p className="text-[11px] text-muted-foreground">
            Select which metrics and sections the shop owner receives
          </p>
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <button
            type="button"
            disabled={!isAdmin || !closingConfig.enabled}
            onClick={handleRestoreDefaultChecklist}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-card border border-border/80 hover:bg-muted text-foreground cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 text-amber-500" />
            Defaults
          </button>
          <button
            type="button"
            disabled={!isAdmin || !closingConfig.enabled}
            onClick={handleSelectAllChecklist}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-card border border-border/80 hover:bg-muted text-foreground cursor-pointer"
          >
            <CheckSquare className="w-3 h-3 text-emerald-500" />
            Select All
          </button>
          <button
            type="button"
            disabled={!isAdmin || !closingConfig.enabled}
            onClick={handleClearAllChecklist}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-card border border-border/80 hover:bg-muted text-foreground cursor-pointer"
          >
            <Square className="w-3 h-3 text-muted-foreground" />
            Clear
          </button>
        </div>
      </div>

      {/* Counter Tag */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
        <span>Selected Checklist Items:</span>
        <span className="font-bold text-foreground font-mono">
          {selectedChecklistCount} of {totalChecklistCount} selected
        </span>
      </div>

      {/* Categorized Checklist Items Grouped by Domain */}
      <div className="space-y-4 pt-1">
        {[
          {
            groupId: 'core',
            title: '1. General & Shift Information',
            subtitle: 'Basic closing metadata, cashier, register status & terminal details',
            keys: ['dateTime', 'closingStatus', 'counterDetails', 'closingStaff'] as (keyof ShopClosingChecklist)[],
          },
          {
            groupId: 'sales',
            title: '2. Sales Summary & Breakdown',
            subtitle: 'Invoices count, net sales, pre-discount gross sales, discounts, and tax',
            keys: ['invoices', 'sales'] as (keyof ShopClosingChecklist)[],
            subItems: [
              { key: 'grossSales' as keyof ShopClosingChecklist, parentKey: 'sales' as keyof ShopClosingChecklist },
              { key: 'totalDiscount' as keyof ShopClosingChecklist, parentKey: 'sales' as keyof ShopClosingChecklist },
              { key: 'taxCollected' as keyof ShopClosingChecklist, parentKey: 'sales' as keyof ShopClosingChecklist },
            ],
          },
          {
            groupId: 'payments',
            title: '3. Payment Methods Breakdown',
            subtitle: 'Select which payment modes to include or exclude in the closing summary',
            keys: ['paymentMethods'] as (keyof ShopClosingChecklist)[],
            subItems: [
              { key: 'paymentCash' as keyof ShopClosingChecklist, parentKey: 'paymentMethods' as keyof ShopClosingChecklist },
              { key: 'paymentUpi' as keyof ShopClosingChecklist, parentKey: 'paymentMethods' as keyof ShopClosingChecklist },
              { key: 'paymentCard' as keyof ShopClosingChecklist, parentKey: 'paymentMethods' as keyof ShopClosingChecklist },
              { key: 'paymentBank' as keyof ShopClosingChecklist, parentKey: 'paymentMethods' as keyof ShopClosingChecklist },
              { key: 'paymentCheque' as keyof ShopClosingChecklist, parentKey: 'paymentMethods' as keyof ShopClosingChecklist },
              { key: 'paymentCredit' as keyof ShopClosingChecklist, parentKey: 'paymentMethods' as keyof ShopClosingChecklist },
            ],
          },
          {
            groupId: 'cash',
            title: '4. Cash Drawer, Cash Flow & Expenses',
            subtitle: 'Drawer reconciliation, variance, cash-in entries and itemized store expenses',
            keys: ['cashBalances', 'cashDifferences', 'cashInOut', 'cashInList', 'expenses', 'expensesList'] as (keyof ShopClosingChecklist)[],
          },
          {
            groupId: 'ops',
            title: '5. Credit, Ledger, Staff & Operations',
            subtitle: 'Credit sales, ledger payments, party & staff lists, scrap, returns and supplier purchases',
            keys: ['creditSales', 'customerPayments', 'partyTransactions', 'staffTransactions', 'scrap', 'returns', 'refunds', 'purchases'] as (keyof ShopClosingChecklist)[],
            subItems: [{ key: 'scrapSales' as keyof ShopClosingChecklist, parentKey: 'scrap' as keyof ShopClosingChecklist }, { key: 'scrapCategories' as keyof ShopClosingChecklist, parentKey: 'scrap' as keyof ShopClosingChecklist }],
          },
        ].map((group) => {
          return (
            <div
              key={group.groupId}
              className="p-3.5 rounded-xl bg-card border border-border/70 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-foreground block">
                    {group.title}
                  </span>
                  <span className="text-[10px] text-muted-foreground block">
                    {group.subtitle}
                  </span>
                </div>
              </div>

              {/* Primary Items Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {group.keys.map((k) => {
                  const def = CHECKLIST_DEFINITIONS.find((d) => d.key === k);
                  if (!def) return null;
                  const isChecked = Boolean(closingConfig.checklist?.[k]);
                  const isMasterGroup = k === 'paymentMethods' || k === 'sales';

                  return (
                    <label
                      key={k}
                      className={clsx(
                        'flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all cursor-pointer select-none',
                        isChecked
                          ? isMasterGroup
                            ? 'bg-primary/5 border-primary/40 ring-1 ring-primary/20'
                            : 'bg-muted/30 border-border/80'
                          : 'bg-muted/10 border-border/40 opacity-70'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={!isAdmin || !closingConfig.enabled}
                        onChange={() => handleChecklistToggle(k)}
                        className="mt-0.5 rounded border-border text-primary focus:ring-primary/20 h-4 w-4 shrink-0"
                      />
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-foreground block leading-tight flex items-center gap-1.5">
                          {def.label}
                          {isMasterGroup && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-primary/10 text-primary font-bold uppercase">
                              Group
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-muted-foreground block leading-tight">
                          {def.description}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Granular Sub-Items (Indented underneath parent group) */}
              {group.subItems && group.subItems.length > 0 && (
                <div className="pl-3.5 border-l-2 border-primary/30 mt-2 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    Sub-Options (Include / Exclude individually):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.subItems.map((sub) => {
                      const def = CHECKLIST_DEFINITIONS.find((d) => d.key === sub.key);
                      if (!def) return null;
                      const isChecked = (sub.key === 'scrapSales' || sub.key === 'scrapCategories') ? closingConfig.checklist?.[sub.key] !== false : Boolean(closingConfig.checklist?.[sub.key]);
                      const parentChecked = Boolean(closingConfig.checklist?.[sub.parentKey]);

                      return (
                        <label
                          key={sub.key}
                          className={clsx(
                            'flex items-start gap-2 p-2 rounded-lg border text-left transition-all cursor-pointer select-none',
                            !parentChecked && 'opacity-50',
                            isChecked && parentChecked
                              ? 'bg-background border-border shadow-2xs'
                              : 'bg-muted/10 border-border/30 opacity-60'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={!isAdmin || !closingConfig.enabled}
                            onChange={() => handleChecklistToggle(sub.key)}
                            className="mt-0.5 rounded border-border text-primary focus:ring-primary/20 h-3.5 w-3.5 shrink-0"
                          />
                          <div className="space-y-0.5">
                            <span className="text-[11px] font-semibold text-foreground block leading-tight">
                              {def.label}
                            </span>
                            <span className="text-[9px] text-muted-foreground block leading-tight">
                              {def.description}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
