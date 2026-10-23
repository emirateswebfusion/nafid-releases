import React, { Fragment } from 'react';
import { IndianRupee, Layers, TrendingUp, Percent, Receipt, BarChart3, Loader2, Search, X, SlidersHorizontal, Building, User, FileText, ShieldAlert, CheckCheck, ArrowDownRight, RefreshCw } from 'lucide-react';
import { formatCurrency } from '../../../utils/money';
import clsx from 'clsx';
import { ResponsiveContainer, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, Area } from 'recharts';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { TAX_RATES, formatDate } from '../salesHistoryFormat';
import { isAdminRole } from '../../../utils/permissions';
import { useAuthStore } from '../../../store/authStore';
import { Skeleton } from '../../ui/Skeleton';
import { InvoiceRow } from './InvoiceRow';
import type { InvoiceProductRow } from '../../../utils/salesHistoryTax';
import type { SalesInvoiceRow, UpiSourceOption } from '../salesTypes';

export interface SalesBillsViewProps {
  accountingView: "REAL_SALES" | "TAX_FILING" | "ALL";
  convertibleInvoicesInView: SalesInvoiceRow[];
  convertibleMap: Record<string, boolean>;
  dailySales: { date: string; sales: number; }[];
  enableConvertToGst: boolean;
  groupedInvoices: { date: string; items: SalesInvoiceRow[]; }[];
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  handleSelectInvoice: (inv: SalesInvoiceRow) => Promise<void>;
  hasMore: boolean;
  invoices: SalesInvoiceRow[];
  invoiceTypeFilter: string;
  isFetching: boolean;
  isSearching: boolean;
  isStaff: boolean;
  loading: boolean;
  loadInvoices: (reset?: boolean) => Promise<void>;
  maskedAvgOrder: { displayAmount: number; isHidden: boolean; isMasked: boolean; };
  maskedRevenue: { displayAmount: number; isMasked: boolean; isHidden: boolean; };
  maskedTotalSales: { displayAmount: number; isMasked: boolean; isHidden: boolean; };
  paymentFilter: string;
  prefetchInvoice: (invoiceId: string) => void;
  search: string;
  selectedBosInvoices: SalesInvoiceRow[];
  selectedInvoice: SalesInvoiceRow | null;
  selectedInvoiceIds: Set<string>;
  selectionMode: boolean;
  sentinelRef: React.RefObject<HTMLTableRowElement | null>;
  setAccountingView: React.Dispatch<React.SetStateAction<"REAL_SALES" | "TAX_FILING" | "ALL">>;
  setConversionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setDebouncedSearch: React.Dispatch<React.SetStateAction<string>>;
  setInvoiceTypeFilter: React.Dispatch<React.SetStateAction<string>>;
  setPaymentFilter: React.Dispatch<React.SetStateAction<string>>;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  setSelectedInvoiceIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectionMode: React.Dispatch<React.SetStateAction<boolean>>;
  setShowGraphBanner: React.Dispatch<React.SetStateAction<boolean>>;
  setTaxPercentageFilter: React.Dispatch<React.SetStateAction<string>>;
  showGraphBanner: boolean;
  summary: { totalSales: number; totalSalesBeforeDeductions: number; totalInvoices: number; totalTax: number; totalDiscount: number; avgOrder: number; };
  summaryLoading: boolean;
  taxFilterActive: boolean;
  taxPercentageFilter: string;
  taxProductLoading: boolean;
  taxProductRows: InvoiceProductRow[];
  upiSources: UpiSourceOption[];
}

/** Bills tab of Sales History: summary cards, filters (payment, invoice type, tax rate, accounting view), GST conversion selection, the day-grouped invoice list or the tax-rate product table, and Load More. */
export function SalesBillsView({
  accountingView, convertibleInvoicesInView, convertibleMap, dailySales, enableConvertToGst, groupedInvoices,
  handleScroll, handleSelectInvoice, hasMore, invoices, invoiceTypeFilter, isFetching, isSearching, isStaff, loading,
  loadInvoices, maskedAvgOrder, maskedRevenue, maskedTotalSales, paymentFilter, prefetchInvoice, search,
  selectedBosInvoices, selectedInvoice, selectedInvoiceIds, selectionMode, sentinelRef, setAccountingView,
  setConversionOpen, setDebouncedSearch, setInvoiceTypeFilter, setPaymentFilter, setSearch, setSelectedInvoiceIds,
  setSelectionMode, setShowGraphBanner, setTaxPercentageFilter, showGraphBanner, summary, summaryLoading,
  taxFilterActive, taxPercentageFilter, taxProductLoading, taxProductRows, upiSources,
}: SalesBillsViewProps) {
  return (
    <div className="flex flex-col flex-1 overflow-hidden w-full">

      {/* Compact Single-Row High-Density KPI Bar */}
      <div className="px-4 py-2 border-b border-border/70 bg-card/60 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* KPI 1: Total Revenue / GST Turnover */}
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-background border border-border/60 shadow-2xs min-w-[170px] transition-all">
              <div className="p-1.5 rounded-lg shrink-0 transition-colors bg-emerald-500/10 text-emerald-500">
                <IndianRupee className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block leading-none">
                    {accountingView === 'TAX_FILING' ? 'GST Turnover' : accountingView === 'REAL_SALES' ? 'BOS Turnover' : 'Total Revenue'}
                  </span>
                  {maskedRevenue.isMasked && !isStaff && (
                    <span className="text-[8px] bg-primary/10 text-primary px-1 rounded font-bold leading-none">BOS</span>
                  )}
                </div>
                <span className="text-xs font-black font-mono tabular-nums leading-tight block mt-0.5 text-emerald-600 dark:text-emerald-400">
                  {summaryLoading ? '…' : maskedRevenue.isHidden ? '••••••••' : formatCurrency(maskedRevenue.displayAmount)}
                </span>
              </div>
            </div>

            {/* KPI: Total Sales */}
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-background border border-border/60 shadow-2xs min-w-[155px] transition-all">
              <div className="p-1.5 rounded-lg shrink-0 bg-teal-500/10 text-teal-500">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block leading-none">
                  Total Sales
                </span>
                <span className="text-xs font-black font-mono tabular-nums leading-tight block mt-0.5 text-teal-600 dark:text-teal-400">
                  {summaryLoading ? '…' : maskedTotalSales.isHidden ? '••••••••' : formatCurrency(maskedTotalSales.displayAmount)}
                </span>
              </div>
            </div>

            {/* KPI 2: Avg Order Value */}
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-background border border-border/60 shadow-2xs min-w-[160px]">
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 shrink-0">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block leading-none">
                  {accountingView === 'TAX_FILING' ? 'Avg GST Invoice' : accountingView === 'REAL_SALES' ? 'Avg BOS Order' : 'Avg Order Value'}
                </span>
                <span className="text-xs font-black text-blue-600 dark:text-blue-400 font-mono tabular-nums leading-tight block mt-0.5">
                  {summaryLoading ? '…' : maskedAvgOrder.isHidden ? '••••••••' : formatCurrency(maskedAvgOrder.displayAmount)}
                </span>
              </div>
            </div>

            {/* KPI 3: Total Tax */}
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-background border border-border/60 shadow-2xs min-w-[150px]">
              <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-500 shrink-0">
                <Percent className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block leading-none">
                  {accountingView === 'TAX_FILING' ? 'Declared GST Tax' : 'Total Tax'}
                </span>
                <span className="text-xs font-black text-violet-600 dark:text-violet-400 font-mono tabular-nums leading-tight block mt-0.5">
                  {summaryLoading ? '…' : maskedRevenue.isHidden ? '••••••••' : formatCurrency(summary.totalTax)}
                </span>
              </div>
            </div>

            {/* KPI 4: Total Invoices / Discounts */}
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-background border border-border/60 shadow-2xs min-w-[150px]">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
                <Receipt className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block leading-none">
                  {accountingView === 'TAX_FILING' ? 'GST Invoices' : accountingView === 'REAL_SALES' ? 'BOS Invoices' : 'Total Invoices'}
                </span>
                <span className="text-xs font-black text-foreground font-mono tabular-nums leading-tight block mt-0.5">
                  {summaryLoading ? '…' : `${summary.totalInvoices} Bills`}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Toggle for Collapsible Trend Banner */}
          <button
            type="button"
            onClick={() => setShowGraphBanner(!showGraphBanner)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer border shadow-2xs shrink-0 active:scale-95',
              showGraphBanner
                ? 'bg-primary text-primary-foreground border-primary shadow-xs shadow-primary/20'
                : 'bg-background text-muted-foreground hover:text-foreground hover:bg-muted/40 border-border/80'
            )}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>{showGraphBanner ? 'Hide Trend Chart' : 'Show Trend Chart'}</span>
          </button>
        </div>
      </div>

      {/* Smooth Collapsible Revenue Trend Banner */}
      {showGraphBanner && !loading && invoices.length > 1 && (
        <div className="p-4 border-b border-border bg-card/80 transition-all duration-300 shrink-0">
          <div className="bg-background border border-border/80 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/40">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                <span className="text-xs font-black uppercase tracking-widest text-foreground">Daily Revenue Trend</span>
              </div>
              <span className="text-[10px] font-extrabold text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
                {dailySales.length} Days Tracked
              </span>
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailySales} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))', fontWeight: 700 }}
                    axisLine={false} tickLine={false} dy={4}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))', fontWeight: 700 }}
                    axisLine={false} tickLine={false} width={50}
                    tickFormatter={(v: number) => v >= 1000 ? `₹${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `₹${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 12, fontSize: 11, fontWeight: 800,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      padding: '6px 12px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 900, marginBottom: 2 }}
                    itemStyle={{ color: 'hsl(var(--primary))' }}
                    formatter={(v: any) => [formatCurrency(Number(v)), 'Revenue']}
                    cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1.5, strokeDasharray: '4 4' }}
                  />
                  <Area
                    type="monotone" dataKey="sales"
                    stroke="hsl(var(--primary))" strokeWidth={2}
                    fill="url(#salesGrad)"
                    dot={{ r: 3, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Search + Payment Method Filter Toolbar */}
      <div className="px-4 py-3 flex items-center gap-3 shrink-0 border-b border-border bg-card flex-wrap">
        {/* Accounting View Switcher: BOS vs GST */}
        <div className="inline-flex items-center bg-muted/80 dark:bg-muted/40 p-1 rounded-2xl border border-border/80 shadow-inner gap-1 backdrop-blur-xs shrink-0">
          <button
            type="button"
            onClick={() => {
              setAccountingView('REAL_SALES');
              setInvoiceTypeFilter('');
              setTaxPercentageFilter('');
            }}
            className={clsx(
              'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 flex items-center gap-2 cursor-pointer active:scale-[0.97] select-none',
              accountingView === 'REAL_SALES'
                ? 'bg-emerald-600 text-white shadow-xs shadow-emerald-600/30 border border-emerald-500/40 ring-1 ring-emerald-500/20'
                : 'text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10'
            )}
            title="Bill of Supply / Counter Sales (BOS)"
          >
            <span className="relative flex items-center justify-center">
              <Receipt className="w-3.5 h-3.5" />
              {accountingView === 'REAL_SALES' && (
                <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
              )}
            </span>
            <span>BOS</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAccountingView('TAX_FILING');
              if (invoiceTypeFilter === 'BILL_OF_SUPPLY') setInvoiceTypeFilter('');
              setTaxPercentageFilter('');
            }}
            className={clsx(
              'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 flex items-center justify-center cursor-pointer active:scale-[0.97] select-none',
              accountingView === 'TAX_FILING'
                ? 'bg-card text-foreground border border-border shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
            )}
            title="Official Statutory GST Invoices (GST)"
          >
            <span>GST</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAccountingView('ALL');
              setTaxPercentageFilter('');
            }}
            className={clsx(
              'px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 flex items-center gap-1 cursor-pointer active:scale-[0.97] select-none',
              accountingView === 'ALL'
                ? 'bg-card text-foreground border border-border shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
            )}
            title="All Invoices & Filing Copies"
          >
            <span>All</span>
          </button>
        </div>

        <span className="w-px h-6 bg-border/60 mx-0.5 shrink-0" />

        <div className="relative flex-1 max-w-xs">
          {isSearching ? (
            <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary animate-spin pointer-events-none" />
          ) : (
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          )}
          <Input
            type="text"
            placeholder="Search invoice or customer…"
            className="pl-9 pr-8 h-8.5 text-xs bg-background border-border/80 font-medium rounded-xl"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setDebouncedSearch('');
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-1 hover:bg-muted rounded-lg transition-colors cursor-pointer active:scale-90"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5 text-destructive" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Select
            value={paymentFilter}
            onChange={setPaymentFilter}
            options={[
              { value: '', label: 'All' },
              { value: 'PENDING', label: 'Pending' },
              { value: 'CASH', label: 'Cash' },
              { value: 'CARD', label: 'Card' },
              { value: 'UPI', label: 'UPI' },
              { value: 'CHEQUE', label: 'Cheque' },
              { value: 'CREDIT', label: 'Credit' },
              { value: 'SPLIT', label: 'Split' },
            ]}
            size="xs"
            className="w-36"
            triggerClassName="rounded-xl h-8.5 border px-3 transition-all bg-background border-border/80 hover:bg-muted/30"
          />
          <span className="w-px h-5 bg-border/60 mx-1 shrink-0" />
          {accountingView !== 'REAL_SALES' && (() => {
            const typeOptions = accountingView === 'TAX_FILING'
              ? [
                  { value: '', label: 'All GST Types' },
                  { value: 'GST_B2B', label: 'B2B' },
                  { value: 'GST_B2C', label: 'B2C' },
                ]
              : [
                  { value: '', label: 'All Types' },
                  { value: 'GST_B2B', label: 'B2B' },
                  { value: 'GST_B2C', label: 'B2C' },
                  { value: 'BILL_OF_SUPPLY', label: 'Bill of Supply' },
                ];

            const typeChipColors: Record<string, { bg: string; text: string; border: string }> = {
              '': { bg: 'bg-background border-border/80 hover:bg-muted/30', text: 'text-foreground', border: 'border-border/80' },
              GST_B2B: { bg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/25' },
              GST_B2C: { bg: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/25', text: 'text-violet-600 dark:text-violet-400', border: 'border-violet-500/25' },
              BILL_OF_SUPPLY: { bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/25' },
            };
            const colors = typeChipColors[invoiceTypeFilter] || typeChipColors[''];
            return (
              <Select
                value={invoiceTypeFilter}
                onChange={setInvoiceTypeFilter}
                options={typeOptions}
                size="xs"
                className="w-40"
                triggerClassName={clsx('rounded-xl h-8.5 border px-3 transition-all font-semibold', colors.bg, colors.text, colors.border)}
                renderOption={(opt) => {
                  const typeIcon: Record<string, any> = { '': Receipt, GST_B2B: Building, GST_B2C: User, BILL_OF_SUPPLY: FileText };
                  const typeColor: Record<string, string> = { '': 'text-foreground', GST_B2B: 'text-blue-500', GST_B2C: 'text-violet-500', BILL_OF_SUPPLY: 'text-amber-500' };
                  const Icon = typeIcon[opt.value];
                  return (
                    <span className={clsx('flex items-center gap-2 text-xs font-bold', typeColor[opt.value])}>
                      <Icon className="w-3.5 h-3.5" />
                      {opt.label}
                    </span>
                  );
                }}
              />
            );
          })()}
          {accountingView !== 'REAL_SALES' && invoiceTypeFilter !== 'BILL_OF_SUPPLY' && (
            <>
              <Select
                value={taxPercentageFilter}
                onChange={setTaxPercentageFilter}
                options={TAX_RATES}
                size="xs"
                className="w-28"
                triggerClassName="rounded-xl h-8.5 border px-3 transition-all bg-background border-border/80 hover:bg-muted/30 font-semibold"
                renderOption={(opt) => (
                  <span className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <Percent className="w-3 h-3 text-muted-foreground" />
                    {opt.label}
                  </span>
                )}
              />
              {taxFilterActive && (
                <button
                  type="button"
                  onClick={() => setTaxPercentageFilter('')}
                  className="h-8.5 px-2.5 rounded-xl text-xs font-bold bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/25 hover:bg-violet-500/20 active:scale-95 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs shrink-0"
                  title="Clear GST tax rate filter and return to bills list"
                >
                  <span>{taxPercentageFilter}% GST</span>
                  <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                </button>
              )}
            </>
          )}
        </div>
        <div className="ml-auto text-[10px] text-muted-foreground font-semibold shrink-0">
          {summaryLoading
            ? '…'
            : taxFilterActive
              ? (
                <span className="flex items-center gap-2">
                  <span>{`${taxProductRows.length} product${taxProductRows.length !== 1 ? 's' : ''} from ${summary.totalInvoices} bill${summary.totalInvoices !== 1 ? 's' : ''}`}</span>
                  <button
                    type="button"
                    onClick={() => setTaxPercentageFilter('')}
                    className="px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-[10px] font-bold text-foreground hover:text-destructive transition-colors cursor-pointer border border-border/60"
                    title="Clear tax rate filter"
                  >
                    Clear
                  </button>
                </span>
              )
              : invoices.length === summary.totalInvoices
                ? `${summary.totalInvoices} record${summary.totalInvoices !== 1 ? 's' : ''}`
                : `Showing ${invoices.length} of ${summary.totalInvoices} records`}
        </div>

        {!taxFilterActive && enableConvertToGst && isAdminRole(useAuthStore.getState().role) && (
          !selectionMode ? (
            <button
              type="button"
              onClick={() => setSelectionMode(true)}
              className="h-8.5 px-3.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer border bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20 active:scale-95 flex items-center gap-1.5 shrink-0 shadow-2xs hover:shadow-amber-500/10"
              title="Select eligible Bill of Supply sales to convert into statutory GST invoices"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Convert to GST</span>
            </button>
          ) : (
            <div className="inline-flex items-center bg-muted/80 dark:bg-muted/40 p-1 rounded-2xl border border-border/80 shadow-inner gap-1 backdrop-blur-xs shrink-0 animate-in fade-in zoom-in-95 duration-150">
              <button
                type="button"
                onClick={() => {
                  if (selectedInvoiceIds.size === convertibleInvoicesInView.length && convertibleInvoicesInView.length > 0) {
                    setSelectedInvoiceIds(new Set());
                  } else {
                    setSelectedInvoiceIds(new Set(convertibleInvoicesInView.map(i => i.invoice_id)));
                  }
                }}
                className={clsx(
                  'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer active:scale-[0.97] select-none',
                  selectedInvoiceIds.size === convertibleInvoicesInView.length && convertibleInvoicesInView.length > 0
                    ? 'bg-card text-foreground border border-border shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
                )}
                title="Select or deselect all convertible bills"
              >
                <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {selectedInvoiceIds.size === convertibleInvoicesInView.length && convertibleInvoicesInView.length > 0
                    ? 'Deselect All'
                    : `Select All (${convertibleInvoicesInView.length})`}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setConversionOpen(true)}
                disabled={selectedBosInvoices.length === 0}
                className={clsx(
                  'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 flex items-center gap-1.5 select-none',
                  selectedBosInvoices.length > 0
                    ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs shadow-amber-500/25 border border-amber-400/40 ring-1 ring-amber-400/20 cursor-pointer active:scale-[0.97]'
                    : 'text-muted-foreground/50 cursor-not-allowed opacity-60'
                )}
                title={selectedBosInvoices.length === 0 ? 'Select at least 1 Bill of Supply to convert' : 'Click to convert selected bills to GST'}
              >
                <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Convert Selected{selectedBosInvoices.length > 0 ? ` (${selectedBosInvoices.length})` : ''}
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setSelectionMode(false); setSelectedInvoiceIds(new Set()); }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 flex items-center gap-1 cursor-pointer active:scale-[0.97] select-none text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10"
                title="Exit selection mode"
              >
                <X className="w-3.5 h-3.5 shrink-0" />
                <span>Cancel</span>
              </button>
            </div>
          )
        )}
      </div>
    {/* Table */}
    <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
      {taxFilterActive ? (
        taxProductLoading ? (
          <table className="w-full">
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="px-4 py-3.5"><Skeleton className="h-3 w-20" /></td>
                  <td className="px-4 py-3.5"><Skeleton className="h-3 w-24" /></td>
                  <td className="px-4 py-3.5"><Skeleton className="h-3 w-40" /></td>
                  <td className="px-4 py-3.5"><Skeleton className="h-5 w-14 rounded-full" /></td>
                  <td className="px-4 py-3.5 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                  <td className="px-4 py-3.5 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                  <td className="px-4 py-3.5 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : taxProductRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-muted/40 border border-border flex items-center justify-center">
              <Percent className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground/60">No products found for {taxPercentageFilter}% GST</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Try adjusting your search or filters</p>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-muted/60 border-b border-border">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Invoice</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Date &amp; Time</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Product</th>
                <th className="px-4 py-2.5 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">GST</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">Qty</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">Taxable</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">GST Amt</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {taxProductRows.map((row, index) => {
                const formatted = formatDate(row.createdAt);
                return (
                  <tr
                    key={`${row.invoiceId}-${row.item?.item_id || index}`}
                    onClick={() => handleSelectInvoice(row.invoice)}
                    className="cursor-pointer transition-colors hover:bg-primary/5"
                  >
                    <td className="px-4 py-3">
                      <div className="font-mono font-black text-xs text-foreground">{row.invoiceNumber}</div>
                      <div className="text-[10px] text-muted-foreground font-semibold truncate max-w-[150px]">{row.invoice?.customer_name || 'Walk-in Customer'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <div className="font-bold text-foreground">{formatted.date}</div>
                      <div>{formatted.time}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-xs text-foreground">{row.name}</div>
                      {row.hsn && <div className="text-[10px] font-mono text-muted-foreground">HSN: {row.hsn}</div>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/25">
                        {row.gstRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-foreground">{row.quantity} <span className="text-[10px] text-muted-foreground">{row.uom}</span></td>
                    <td className="px-4 py-3 text-right text-xs font-mono font-bold text-foreground">{formatCurrency(row.taxable)}</td>
                    <td className="px-4 py-3 text-right text-xs font-mono font-bold text-violet-600 dark:text-violet-400">{formatCurrency(row.tax)}</td>
                    <td className="px-4 py-3 text-right text-xs font-mono font-black text-foreground">{formatCurrency(row.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      ) : loading ? (
        <table className="w-full">
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-border">
                <td className="px-4 py-3.5"><div className="flex items-center gap-2.5"><Skeleton className="w-8 h-8 rounded-xl shrink-0" /><div className="space-y-1.5"><Skeleton className="h-3 w-24" /><Skeleton className="h-2.5 w-16" /></div></div></td>
                <td className="px-4 py-3.5"><Skeleton className="h-3 w-20" /></td>
                <td className="px-4 py-3.5"><Skeleton className="h-3 w-24" /></td>
                <td className="px-4 py-3.5"><Skeleton className="h-5 w-16 rounded-full" /></td>
                <td className="px-4 py-3.5 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                <td className="px-3 py-3.5" />
              </tr>
            ))}
          </tbody>
        </table>
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-muted/40 border border-border flex items-center justify-center">
            <Receipt className="w-7 h-7 text-muted-foreground/50" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground/60">No records found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Try adjusting your search or filters</p>
          </div>
        </div>
      ) : (
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-muted/60 border-b border-border">
            <tr>
              <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                <div className="flex items-center gap-2">
                  {selectionMode && convertibleInvoicesInView.length > 0 && (
                    <input
                      type="checkbox"
                      checked={selectedInvoiceIds.size === convertibleInvoicesInView.length && convertibleInvoicesInView.length > 0}
                      onChange={() => {
                        if (selectedInvoiceIds.size === convertibleInvoicesInView.length) {
                          setSelectedInvoiceIds(new Set());
                        } else {
                          setSelectedInvoiceIds(new Set(convertibleInvoicesInView.map(i => i.invoice_id)));
                        }
                      }}
                      className="w-4 h-4 rounded-md border-2 border-border text-primary focus:ring-primary/20 transition-all cursor-pointer"
                      title="Select / Deselect All Convertible Bills"
                    />
                  )}
                  <span>Invoice</span>
                </div>
              </th>
              <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Type</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Date &amp; Time</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Customer</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Payment</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {groupedInvoices.map((group) => (
              <Fragment key={group.date}>
                <tr className="sticky top-9 z-[5] bg-muted">
                  <td colSpan={7} className="px-6 py-1.5 text-xs font-black text-primary uppercase tracking-wider border-b border-border">
                    {group.date}
                  </td>
                </tr>
                {group.items.map((inv) => (
                  <InvoiceRow
                    key={inv.invoice_id}
                    inv={inv}
                    isSelected={selectedInvoice?.invoice_id === inv.invoice_id}
                    onMouseEnter={() => prefetchInvoice(inv.invoice_id)}
                    onClick={() => {
                      if (selectionMode) {
                        if (inv.invoice_type === 'BILL_OF_SUPPLY' && convertibleMap[inv.invoice_id]) {
                          setSelectedInvoiceIds(prev => {
                            const next = new Set(prev);
                            if (next.has(inv.invoice_id)) {
                              next.delete(inv.invoice_id);
                            } else {
                              next.add(inv.invoice_id);
                            }
                            return next;
                          });
                        }
                      } else {
                        handleSelectInvoice(inv);
                      }
                    }}
                    selectionMode={selectionMode}
                    isChecked={selectedInvoiceIds.has(inv.invoice_id)}
                    convertible={convertibleMap[inv.invoice_id]}
                    onCheck={() => {
                      if (inv.invoice_type !== 'BILL_OF_SUPPLY' || !convertibleMap[inv.invoice_id]) return;
                      setSelectedInvoiceIds(prev => {
                        const next = new Set(prev);
                        if (next.has(inv.invoice_id)) {
                          next.delete(inv.invoice_id);
                        } else {
                          next.add(inv.invoice_id);
                        }
                        return next;
                      });
                    }}
                    upiSources={upiSources}
                  />
                ))}
              </Fragment>
            ))}
            {hasMore && (
              <tr ref={sentinelRef}>
                <td colSpan={7} className="py-5 text-center">
                  <button
                    type="button"
                    onClick={() => loadInvoices(false)}
                    disabled={isFetching}
                    className="h-9 px-5 rounded-xl border border-border/80 bg-card hover:bg-muted text-xs font-bold text-foreground transition-all duration-150 cursor-pointer inline-flex items-center gap-2 active:scale-95 shadow-2xs hover:shadow-xs disabled:opacity-50"
                  >
                    <RefreshCw className={clsx("w-3.5 h-3.5 text-primary", isFetching && "animate-spin")} />
                    <span>{isFetching ? 'Loading more records…' : `Load More Records (${invoices.length} of ${summary.totalInvoices} loaded)`}</span>
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  </div>
  );
}
