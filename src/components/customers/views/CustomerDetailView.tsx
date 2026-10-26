import React from 'react';
import { getInitials, formatDate, formatDateTime, renderPaymentMethodBadge, renderBillTypeBadge } from '../customerFormat';
import { Phone, MapPin, Calendar, Building2, ExternalLink, Clock, Award, ShoppingBag, Receipt, TrendingUp, Gift, Loader2, FileText, Download, RotateCw, SlidersHorizontal, CreditCard, FilterX, Eye, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { formatCurrency } from '../../../utils/money';
import { DateRangeFilter } from '../../ui/DateRangeFilter';
import { Skeleton } from '../../ui/Skeleton';
import type { Customer, Party, LoyaltyTx, InvoiceRecord, DetailTab } from '../customerTypes';

type MatchedPartyCredit = Party & { credit_period_days?: number; has_overdue?: boolean; overdue_bills_count?: number; overdue_amount?: number; restrict_on_credit_expiry?: boolean | number };

export interface CustomerDetailViewProps {
  billFilterEnd: string;
  billFilterStart: string;
  detailTab: DetailTab;
  exportingFilteredInvoices: boolean;
  exportingPdf: boolean;
  filteredInvoices: InvoiceRecord[];
  handleDownloadFilteredInvoicesCsv: () => Promise<void>;
  handleDownloadFilteredInvoicesPdf: () => Promise<void>;
  handleDownloadInvoiceCsv: (inv: InvoiceRecord) => Promise<void>;
  handleNavigateToParty: () => void;
  handleOpenInvoiceDetail: (inv: InvoiceRecord) => Promise<void>;
  handleRecalculateCustomerPoints: () => Promise<void>;
  invoiceBusyId: string | null;
  invoices: InvoiceRecord[];
  invoicesLoading: boolean;
  loyaltyEnabled: boolean;
  loyaltyTxs: LoyaltyTx[];
  loyaltyTxsLoading: boolean;
  matchedParty: Party | null;
  recalculatingPoints: boolean;
  /** Rendered only once a customer is selected. */
  selectedCustomer: Customer;
  setAdjustPointsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setAdjustPointsReason: React.Dispatch<React.SetStateAction<string>>;
  setAdjustPointsType: React.Dispatch<React.SetStateAction<"ADD" | "DEDUCT">>;
  setAdjustPointsValue: React.Dispatch<React.SetStateAction<number | "">>;
  setBillFilterEnd: React.Dispatch<React.SetStateAction<string>>;
  setBillFilterStart: React.Dispatch<React.SetStateAction<string>>;
  setDetailTab: React.Dispatch<React.SetStateAction<DetailTab>>;
  totalLifetimeSpend: number;
}

/** One customer's detail page: profile, totals, purchases (with filters and exports) and loyalty points history. */
export function CustomerDetailView({
  billFilterEnd, billFilterStart, detailTab, exportingFilteredInvoices, exportingPdf, filteredInvoices,
  handleDownloadFilteredInvoicesCsv, handleDownloadFilteredInvoicesPdf, handleDownloadInvoiceCsv,
  handleNavigateToParty, handleOpenInvoiceDetail, handleRecalculateCustomerPoints, invoiceBusyId, invoices,
  invoicesLoading, loyaltyEnabled, loyaltyTxs, loyaltyTxsLoading, matchedParty, recalculatingPoints,
  selectedCustomer, setAdjustPointsModalOpen, setAdjustPointsReason, setAdjustPointsType, setAdjustPointsValue,
  setBillFilterEnd, setBillFilterStart, setDetailTab, totalLifetimeSpend,
}: CustomerDetailViewProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 w-full px-4 sm:px-6 py-4 space-y-4 overflow-y-auto">
    {/* Profile Banner */}
    <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary/20 via-primary/10 to-emerald-500/20 text-primary border border-primary/30 flex items-center justify-center font-black text-xl shrink-0 shadow-inner">
          {getInitials(selectedCustomer.name)}
        </div>
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-black text-foreground tracking-tight">{selectedCustomer.name}</h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              Active
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium flex-wrap">
            {selectedCustomer.phone && (
              <span className="flex items-center gap-1 bg-muted/50 px-2 py-0.5 rounded-md font-mono text-[11px]">
                <Phone className="w-3 h-3 text-primary" /> {selectedCustomer.phone}
              </span>
            )}
            {selectedCustomer.address && (
              <span className="flex items-center gap-1 bg-muted/50 px-2 py-0.5 rounded-md text-[11px]">
                <MapPin className="w-3 h-3 text-primary" /> {selectedCustomer.address}
              </span>
            )}
            <span className="flex items-center gap-1 text-[11px]">
              <Calendar className="w-3 h-3 text-muted-foreground/60" /> Since {formatDate(selectedCustomer.created_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Party Ledger & Loyalty Point Badges */}
      <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
        {/* Party Ledger Card */}
        {(() => {
          const bal = matchedParty?.balance || 0;
          const isReceivable = bal > 0;
          const isPayable = bal < 0;

          const colorStyles = isReceivable
            ? {
                box: 'bg-rose-500/10 border-rose-500/20',
                title: 'text-rose-600 dark:text-rose-400',
                amount: 'text-rose-600 dark:text-rose-400',
                button: 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border-rose-500/30',
              }
            : isPayable
            ? {
                box: 'bg-emerald-500/10 border-emerald-500/20',
                title: 'text-emerald-600 dark:text-emerald-400',
                amount: 'text-emerald-600 dark:text-emerald-400',
                button: 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
              }
            : {
                box: 'bg-blue-500/10 border-blue-500/20',
                title: 'text-blue-600 dark:text-blue-400',
                amount: 'text-blue-600 dark:text-blue-400',
                button: 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-700 dark:text-blue-300 border-blue-500/30',
              };

          return (
            <div className={clsx("rounded-xl p-3 border flex-1 md:flex-initial min-w-[190px] flex items-center justify-between gap-3 shadow-xs", colorStyles.box)}>
              <div className="min-w-0">
                <div className={clsx("flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider", colorStyles.title)}>
                  <Building2 className="w-3 h-3" />
                  <span>Party Ledger</span>
                </div>
                <p className={clsx("text-sm font-black font-mono tracking-tight mt-0.5 truncate", colorStyles.amount)}>
                  {matchedParty
                    ? (isReceivable ? `+${formatCurrency(bal)}` : isPayable ? `-${formatCurrency(Math.abs(bal))}` : `₹0.00`)
                    : 'No Ledger'}
                </p>
              </div>
              <button
                onClick={handleNavigateToParty}
                className={clsx("py-1 px-2 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer border shrink-0", colorStyles.button)}
              >
                <span>View</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          );
        })()}

        {/* Credit Period & Limit Status Card */}
        {(() => {
          const creditLimit = Number(selectedCustomer.credit_limit || matchedParty?.credit_limit || 0);
          const hasCreditPeriod = Boolean(selectedCustomer.credit_period_enabled || matchedParty?.credit_period_enabled);
          const days = selectedCustomer.credit_period_days || (matchedParty as MatchedPartyCredit | null)?.credit_period_days || 30;
          const isOverdue = Boolean(selectedCustomer.has_overdue || (matchedParty as MatchedPartyCredit | null)?.has_overdue);
          const overdueBillsCount = selectedCustomer.overdue_bills_count || (matchedParty as MatchedPartyCredit | null)?.overdue_bills_count || 0;
          const overdueAmount = Number(selectedCustomer.overdue_amount || (matchedParty as MatchedPartyCredit | null)?.overdue_amount || 0);
          const isRestricted = selectedCustomer.restrict_on_credit_expiry !== false && (selectedCustomer.restrict_on_credit_expiry as unknown) !== 0 && (matchedParty as MatchedPartyCredit | null)?.restrict_on_credit_expiry !== false;

          if (!hasCreditPeriod && creditLimit <= 0) return null;

          return (
            <div className={clsx(
              "rounded-xl p-3 border flex-1 md:flex-initial min-w-[210px] flex items-center justify-between gap-3 shadow-xs",
              isOverdue
                ? "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400"
                : "bg-indigo-500/10 border-indigo-500/20 text-indigo-700 dark:text-indigo-400"
            )}>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{isOverdue ? 'Overdue Payment' : 'Credit Terms'}</span>
                </div>
                <div className="text-xs font-black mt-1 flex items-center gap-2">
                  {isOverdue ? (
                    <span className="text-rose-600 dark:text-rose-400 font-mono">
                      {overdueBillsCount} bill{overdueBillsCount !== 1 ? 's' : ''} ({formatCurrency(overdueAmount)})
                    </span>
                  ) : hasCreditPeriod ? (
                    <span className="font-mono text-foreground font-black">
                      {days} Days Period
                    </span>
                  ) : (
                    <span className="font-mono text-foreground font-black">
                      Limit: {formatCurrency(creditLimit)}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {creditLimit > 0 && <span>Limit: {formatCurrency(creditLimit)} · </span>}
                  {hasCreditPeriod && (
                    <span className={isRestricted && isOverdue ? "text-rose-600 dark:text-rose-400 font-bold" : ""}>
                      {isRestricted ? (isOverdue ? 'Credit Blocked' : 'Strict') : 'Allowed'}
                    </span>
                  )}
                </div>
              </div>
              {isOverdue && (
                <span className="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-rose-500 text-white shadow-xs shrink-0">
                  OVERDUE
                </span>
              )}
            </div>
          );
        })()}

        {/* Available Points Badge */}
        {loyaltyEnabled && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex-1 md:flex-initial min-w-[170px] flex items-center justify-between gap-3 shadow-xs">
            <div>
              <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                <Award className="w-3 h-3" />
                <span>Active Points</span>
              </div>
              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight mt-0.5">
                {(selectedCustomer.current_points_balance || 0).toFixed(0)} pts
              </p>
            </div>
            <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 px-2 py-1 rounded-md font-mono border border-emerald-500/20 shrink-0">
              Earned: {(selectedCustomer.total_points_earned || 0).toFixed(0)}
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Quick Metrics Bar */}
    <div className={clsx("grid gap-3 shrink-0", loyaltyEnabled ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2")}>
      <div className="px-3.5 py-2.5 rounded-xl bg-card border border-border/80 shadow-xs flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
          <ShoppingBag className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider truncate">Lifetime Spend</p>
          <p className="text-sm font-black text-foreground font-mono truncate">{formatCurrency(totalLifetimeSpend)}</p>
        </div>
      </div>

      <div className="px-3.5 py-2.5 rounded-xl bg-card border border-border/80 shadow-xs flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          <Receipt className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider truncate">Total Invoices</p>
          <p className="text-sm font-black text-foreground font-mono truncate">{invoices.length}</p>
        </div>
      </div>

      {loyaltyEnabled && (
        <>
          <div className="px-3.5 py-2.5 rounded-xl bg-card border border-border/80 shadow-xs flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider truncate">Points Earned</p>
              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono truncate">
                +{(selectedCustomer.total_points_earned || 0).toFixed(0)} pts
              </p>
            </div>
          </div>

          <div className="px-3.5 py-2.5 rounded-xl bg-card border border-border/80 shadow-xs flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Gift className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider truncate">Points Redeemed</p>
              <p className="text-sm font-black text-amber-600 dark:text-amber-400 font-mono truncate">
                -{(selectedCustomer.total_points_redeemed || 0).toFixed(0)} pts
              </p>
            </div>
          </div>
        </>
      )}
    </div>

    {/* Interactive Tabbed History Section */}
    <div className="flex-1 flex flex-col bg-card border border-border/80 rounded-2xl shadow-xs overflow-hidden">
      {/* Tab Header */}
      <div className="flex items-center justify-between border-b border-border/80 px-4 py-2.5 bg-muted/20 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDetailTab('purchases')}
            className={clsx(
              'px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer',
              detailTab === 'purchases'
                ? 'bg-card text-foreground shadow-xs border border-border/80'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
          >
            <Receipt className="w-3.5 h-3.5 text-primary" />
            <span>Purchase History</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary font-black">
              {invoices.length}
            </span>
          </button>

          {loyaltyEnabled && (
            <button
              onClick={() => setDetailTab('points')}
              className={clsx(
                'px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer',
                detailTab === 'points'
                  ? 'bg-card text-foreground shadow-xs border border-border/80'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              )}
            >
              <Gift className="w-3.5 h-3.5 text-amber-500" />
              <span>Points Activity Log</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 font-black">
                {loyaltyTxs.length}
              </span>
            </button>
          )}
        </div>

        {/* Bill filter + bulk CSV download */}
        {detailTab === 'purchases' && invoices.length > 0 && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <span className="text-[10px] text-muted-foreground font-bold shrink-0">
              {filteredInvoices.length === invoices.length
                ? `${invoices.length} bill${invoices.length !== 1 ? 's' : ''}`
                : `${filteredInvoices.length} of ${invoices.length} bills`}
            </span>
            <DateRangeFilter
              startDate={billFilterStart}
              endDate={billFilterEnd}
              onChange={(s, e) => { setBillFilterStart(s); setBillFilterEnd(e); }}
              align="right"
            />
            <button
              type="button"
              onClick={handleDownloadFilteredInvoicesPdf}
              disabled={exportingPdf || filteredInvoices.length === 0}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Download/Print filtered bills as PDF (1 bill per page)"
            >
              {exportingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              <span>Download PDF</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadFilteredInvoicesCsv}
              disabled={exportingFilteredInvoices || filteredInvoices.length === 0}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-muted/60 text-foreground hover:bg-muted border border-border/60 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Download filtered bills as CSV spreadsheet"
            >
              {exportingFilteredInvoices ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>CSV</span>
            </button>
          </div>
        )}

        {detailTab === 'points' && loyaltyEnabled && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <button
              type="button"
              onClick={handleRecalculateCustomerPoints}
              disabled={recalculatingPoints}
              className="px-3 py-1.5 rounded-xl text-xs font-bold border border-border bg-card hover:bg-muted text-foreground transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
              title="Recalculate loyalty points balance from customer purchase history"
            >
              {recalculatingPoints ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              ) : (
                <RotateCw className="w-3.5 h-3.5 text-primary" />
              )}
              <span>Recalculate</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAdjustPointsValue('');
                setAdjustPointsReason('');
                setAdjustPointsType('ADD');
                setAdjustPointsModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
              title="Manually add or deduct loyalty points"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Adjust Points</span>
            </button>
          </div>
        )}
      </div>

      {/* Tab Body */}
      <div className="flex-1 p-6 overflow-y-auto">
        {detailTab === 'purchases' && (
          <div>
            {invoicesLoading ? (
              <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
            ) : invoices.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground flex flex-col items-center justify-center gap-3">
                <div className="p-4 bg-muted/30 rounded-2xl border border-border/40">
                  <CreditCard className="w-8 h-8 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-extrabold text-foreground">No purchases recorded yet</p>
                <p className="text-xs text-muted-foreground/75 max-w-sm">
                  Invoices linked to this customer will appear here automatically after checkout.
                </p>
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground flex flex-col items-center justify-center gap-3">
                <div className="p-4 bg-muted/30 rounded-2xl border border-border/40">
                  <FilterX className="w-8 h-8 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-extrabold text-foreground">No bills in selected date range</p>
                <p className="text-xs text-muted-foreground/75 max-w-sm">
                  {`${invoices.length} bill${invoices.length !== 1 ? 's' : ''} exist for this customer. Adjust or clear the date filter to see them.`}
                </p>
                <button
                  onClick={() => { setBillFilterStart(''); setBillFilterEnd(''); }}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-border bg-muted/50 hover:bg-muted text-foreground transition-all cursor-pointer"
                >
                  Clear Date Filter
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredInvoices.map(inv => (
                  <div
                    key={inv.invoice_id}
                    onClick={() => handleOpenInvoiceDetail(inv)}
                    className="p-4 rounded-2xl border border-border/60 bg-card hover:border-primary/40 transition-all shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer group"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="p-3 bg-primary/10 rounded-xl border border-primary/20 text-primary font-mono font-black text-xs shrink-0 group-hover:scale-105 transition-transform flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-primary group-hover:underline font-mono">#{inv.invoice_number}</span>
                          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3 text-muted-foreground/60" /> {formatDateTime(inv.created_at)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground font-bold mt-1">
                          Grand Total: <span className="text-foreground font-black">{formatCurrency(inv.grand_total)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {inv.payment_method && renderPaymentMethodBadge(inv.payment_method)}
                          {inv.invoice_type && renderBillTypeBadge(inv)}
                          {inv.due_date && (
                            <span className="text-[10px] font-mono font-bold text-muted-foreground flex items-center gap-1 bg-muted/60 px-2 py-0.5 rounded-md border border-border/40">
                              Due: {inv.due_date}
                            </span>
                          )}
                          {inv.credit_status === 'OVERDUE' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1">
                              ⚠️ {inv.overdue_days != null ? `${inv.overdue_days}d OVERDUE` : 'OVERDUE'}
                              {inv.outstanding_amount != null && ` (${formatCurrency(inv.outstanding_amount)})`}
                            </span>
                          )}
                          {inv.credit_status === 'DUE_SOON' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                              ⏰ Due in {inv.remaining_days}d
                            </span>
                          )}
                          {inv.credit_status === 'ACTIVE' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                              ⏳ {inv.remaining_days != null ? `${inv.remaining_days}d left` : 'Active Credit'}
                            </span>
                          )}
                          {inv.credit_status === 'PAID' && (inv.payment_method === 'CREDIT' || inv.is_credit_bill) && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                              ✓ Settled
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {loyaltyEnabled && (inv.points_earned ?? 0) > 0 && (
                        <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-mono">
                          +{(inv.points_earned ?? 0).toFixed(0)} pts earned
                        </span>
                      )}
                      {loyaltyEnabled && (inv.points_redeemed ?? 0) > 0 && (
                        <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-500/10 text-amber-600 border border-amber-500/20 font-mono">
                          -{(inv.points_redeemed ?? 0).toFixed(0)} pts ({formatCurrency(inv.points_redeemed_discount)} off)
                        </span>
                      )}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDownloadInvoiceCsv(inv); }}
                          disabled={invoiceBusyId === inv.invoice_id}
                          className="p-2 rounded-lg text-muted-foreground/70 hover:text-blue-600 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/25 transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Download bill as CSV"
                        >
                          {invoiceBusyId === inv.invoice_id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <span className="text-xs font-bold text-primary flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                        View Bill <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {detailTab === 'points' && loyaltyEnabled && selectedCustomer && (
          <div className="space-y-6">
            {/* Summary row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">Available Balance</p>
                <p className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono mt-1">
                  {(Number(selectedCustomer.current_points_balance) || 0).toFixed(0)} <span className="text-xs">pts</span>
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Total Earned</p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-1">
                  +{(Number(selectedCustomer.total_points_earned) || 0).toFixed(0)} <span className="text-xs">pts</span>
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                <p className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">Total Redeemed</p>
                <p className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono mt-1">
                  -{(Number(selectedCustomer.total_points_redeemed) || 0).toFixed(0)} <span className="text-xs">pts</span>
                </p>
              </div>
            </div>

            {loyaltyTxsLoading ? (
              <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
            ) : loyaltyTxs.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground flex flex-col items-center justify-center gap-3">
                <div className="p-4 bg-muted/30 rounded-2xl border border-border/40">
                  <Gift className="w-8 h-8 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-extrabold text-foreground">No points activity yet</p>
                <p className="text-xs text-muted-foreground/75 max-w-sm">
                  Loyalty point earnings, redemptions, and manual adjustments will be logged here.
                </p>
              </div>
            ) : (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
                {loyaltyTxs.map(tx => (
                  <div key={tx.transaction_id} className="relative group">
                    {/* Timeline node */}
                    <div className={clsx(
                      'absolute -left-6 top-3 w-5 h-5 rounded-full border-2 border-card flex items-center justify-center shadow-xs',
                      tx.transaction_type === 'EARNED' ? 'bg-emerald-500 text-white' :
                      tx.transaction_type === 'REDEEMED' ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'
                    )}>
                      <Award className="w-2.5 h-2.5" />
                    </div>

                    <div className="p-4 rounded-2xl border border-border/60 bg-card hover:border-primary/30 transition-all shadow-xs flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={clsx(
                            'text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider',
                            tx.transaction_type === 'EARNED' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                            tx.transaction_type === 'REDEEMED' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' :
                            'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                          )}>
                            {tx.transaction_type}
                          </span>
                          <span className="text-xs text-muted-foreground font-semibold">{formatDateTime(tx.created_at)}</span>
                        </div>
                        {tx.description && (
                          <p className="text-xs font-medium text-foreground">{tx.description}</p>
                        )}
                        {tx.reference_number && (
                          <p className="text-[10px] text-muted-foreground/75 font-mono">Ref: {tx.reference_number}</p>
                        )}
                      </div>

                      <div className="text-right">
                        <p className={clsx(
                          'text-base font-black font-mono tracking-tight',
                          tx.transaction_type === 'EARNED' ? 'text-emerald-600 dark:text-emerald-400' :
                          tx.transaction_type === 'REDEEMED' ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600'
                        )}>
                          {tx.transaction_type === 'EARNED' ? '+' : '-'}{(Number(tx.points) || 0).toFixed(0)} pts
                        </p>
                        <p className="text-[10px] text-muted-foreground font-bold mt-0.5">
                          Balance: {(Number(tx.points_balance_after) || 0).toFixed(0)} pts
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </div>
  );
}
