import { roundMoney, moneyFixed } from '../../../utils/pricing/moneyRounding';
import { getCurrencyDecimals } from '../../../utils/localization/storeProfile';
import { getCurrencyPrefix, localizeCurrencyText } from '../../../utils/localization/storeProfile';
import React, { Fragment } from 'react';
import { Search, CheckCircle2, Receipt, Zap, User } from 'lucide-react';
import clsx from 'clsx';
import { formatCurrency } from '../../../utils/pricing/money';
import { Select } from '../../ui/Select';
import { type PaymentMethod, PAYMENT_OPTIONS } from '../cashierFormat';
import { cashierApi } from '../../../data/cashier';
import type { CashDrawerRow, CashierInvoiceRow } from '../cashierTypes';

export interface PendingSettlementPanelProps {
  drawer: CashDrawerRow | null;
  drawerClosed: boolean;
  getRawNet: (inv: CashierInvoiceRow) => number;
  groupedInvoicesByDate: Record<string, CashierInvoiceRow[]>;
  handleDiscFlatChange: (invoiceId: string, val: string) => void;
  handleDiscPercentChange: (invoiceId: string, val: string) => void;
  handleNetChange: (invoiceId: string, val: string) => void;
  handlePlusFlatChange: (invoiceId: string, val: string) => void;
  handlePlusPercentChange: (invoiceId: string, val: string) => void;
  handleViewInvoice: (inv: CashierInvoiceRow) => Promise<void>;
  load: () => Promise<void>;
  newArrivalIds: Set<string>;
  openSplitModal: (inv: CashierInvoiceRow) => void;
  payingRow: string | null;
  pendingInvoices: CashierInvoiceRow[];
  rowDiscInputs: Record<string, string>;
  rowDiscPercentInputs: Record<string, string>;
  rowDiscPercents: Record<string, number>;
  rowDiscs: Record<string, number>;
  rowMethods: Record<string, PaymentMethod>;
  rowNetInputs: Record<string, string>;
  rowPluses: Record<string, number>;
  rowPlusInputs: Record<string, string>;
  rowPlusPercentInputs: Record<string, string>;
  rowPlusPercents: Record<string, number>;
  searchQuery: string;
  setPayingRow: React.Dispatch<React.SetStateAction<string | null>>;
  setRowDiscInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setRowDiscPercentInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setRowMethods: React.Dispatch<React.SetStateAction<Record<string, PaymentMethod>>>;
  setRowNetInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setRowPlusInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setRowPlusPercentInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  tenantId: string | null;
  userId: string | null;
  userName: string | null;
}

/** Pending invoices awaiting settlement, with select / settle actions per payment method. */
export function PendingSettlementPanel({
  drawer, drawerClosed, getRawNet, groupedInvoicesByDate, handleDiscFlatChange, handleDiscPercentChange,
  handleNetChange, handlePlusFlatChange, handlePlusPercentChange, handleViewInvoice, load, newArrivalIds,
  openSplitModal, payingRow, pendingInvoices, rowDiscInputs, rowDiscPercentInputs, rowDiscPercents, rowDiscs,
  rowMethods, rowNetInputs, rowPluses, rowPlusInputs, rowPlusPercentInputs, rowPlusPercents, searchQuery,
  setPayingRow, setRowDiscInputs, setRowDiscPercentInputs, setRowMethods, setRowNetInputs, setRowPlusInputs,
  setRowPlusPercentInputs, setSearchQuery, tenantId, userId, userName,
}: PendingSettlementPanelProps) {
  return (
    <div className="flex-1 min-w-0 flex flex-col border-r border-border">

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/10 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search invoice or customer…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-card border border-border rounded-xl outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 text-foreground placeholder:text-muted-foreground/50 transition-all duration-200"
          />
        </div>
        {/* Pending count badge */}
        <div className={clsx(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border shrink-0',
          pendingInvoices.length > 0
            ? 'bg-amber-500/10 border-amber-500/25'
            : 'bg-emerald-500/10 border-emerald-500/25'
        )}>
          <span className={clsx('text-sm font-black tabular-nums leading-none', pendingInvoices.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>
            {pendingInvoices.length > 999 ? '999+' : pendingInvoices.length}
          </span>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider leading-tight">
            Pending
          </span>
        </div>
        {/* Sales badge */}
        {drawer && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 shrink-0" title="Cash Sales = CASH payments + Cash portion of SPLIT payments">
            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums leading-none">
              {formatCurrency(drawerClosed ? 0 : (drawer.cash_sales || 0))}
            </span>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider leading-tight">
              Cash Sales
            </span>
          </div>
        )}
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1.2fr_1.3fr_1fr_1.3fr_1fr_1.1fr_0.9fr] gap-x-3 px-4 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/20 shrink-0">
        <span>Invoice</span>
        <span>Customer</span>
        <span className="text-right">Amount</span>
        <span className="text-center">Discount / Plus</span>
        <span className="text-right">Net</span>
        <span className="text-center">Payment</span>
        <span className="text-right">Action</span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/40">
        {pendingInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-10">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 flex items-center justify-center shadow-inner">
              <CheckCircle2 className="w-8 h-8 text-emerald-500/70" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-foreground">All Settled!</p>
              <p className="text-xs text-muted-foreground/70 mt-1">No pending invoices for today</p>
            </div>
          </div>
        ) : (
          Object.entries(groupedInvoicesByDate).map(([dateLabel, invoices]) => (
            <Fragment key={dateLabel}>
              {/* ── Date group header ── */}
              <div className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs px-4 py-1.5 text-xs font-black text-primary uppercase tracking-wider border-b border-border shadow-2xs">
                {dateLabel}
              </div>
              {invoices.map((inv) => {
            const rd  = rowDiscs[inv.invoice_id] ?? 0;
            const plusVal = rowPluses[inv.invoice_id] ?? 0;
            const rm  = rowMethods[inv.invoice_id] ?? 'CASH';
            const rawNet = getRawNet(inv);
            const isMinus = rawNet < 0;
            const calculatedNet = isMinus ? rawNet + plusVal : Math.max(0, rawNet - rd);
            const net = roundMoney(calculatedNet);
            const absNet = roundMoney(Math.abs(net));
            const absRawNet = roundMoney(Math.abs(rawNet));

            const isPaying = payingRow === inv.invoice_id;
            const scrapD = Number(inv.scrap_deduction) || 0;
            const returnD = Number(inv.return_deduction) || 0;
            const totalDeductions = scrapD + returnD;
            const sub = Number(inv.subtotal) || 0;
            const tax = Number(inv.tax_total) || 0;
            const disc = Number(inv.discount_total) || 0;
            const ptsDisc = Number(inv.points_redeemed_discount) || 0;
            const preDeductionTotal = Math.max(0, sub + tax - disc - ptsDisc);
            const refundAmount = totalDeductions > preDeductionTotal ? totalDeductions - preDeductionTotal : 0;
            const displayAmount = refundAmount > 0 ? preDeductionTotal : inv.grand_total;

            const isNewArrival = newArrivalIds.has(inv.invoice_id);

            return (
              <div
                key={inv.invoice_id}
                className={clsx(
                  'grid grid-cols-[1.2fr_1.3fr_1fr_1.3fr_1fr_1.1fr_0.9fr] gap-x-3 px-4 py-3.5 items-center transition-all duration-150 group',
                  isPaying ? 'bg-primary/5' : 'hover:bg-primary/5',
                  isNewArrival && 'ring-2 ring-emerald-500/80 bg-emerald-500/10 animate-pulse'
                )}
              >
                {/* Invoice + status */}
                <div className="flex items-center justify-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/15 to-blue-500/5 text-blue-500 shadow-inner shrink-0 self-center">
                    <Receipt className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex flex-col justify-center items-center text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleViewInvoice(inv)}
                        className="text-xs font-extrabold text-foreground truncate block cursor-pointer hover:text-primary hover:underline transition-colors"
                        title="View invoice"
                      >
                        {inv.invoice_number}
                      </button>
                      {isNewArrival && (
                        <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8px] font-black bg-emerald-500 text-white animate-bounce shrink-0">
                          <Zap className="w-2.5 h-2.5 fill-white" /> NEW
                        </span>
                      )}
                    </div>
                    {(returnD > 0 || scrapD > 0) && (
                      <div className="flex items-center justify-center gap-1 flex-wrap mt-0.5">
                        {returnD > 0 && (
                          <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25">
                            Return {getCurrencyPrefix()}{returnD}
                          </span>
                        )}
                        {scrapD > 0 && (
                          <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/25">
                            Scrap {getCurrencyPrefix()}{scrapD}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Customer */}
                <span className="text-xs text-muted-foreground truncate flex items-center gap-1.5 min-w-0">
                  <User className="w-3 h-3 shrink-0 opacity-50" />
                  <span className="truncate">{inv.customer_name || 'Walk-in Customer'}</span>
                </span>

                {/* Amount */}
                <span className="text-xs font-bold text-foreground text-right tabular-nums block">{formatCurrency(displayAmount)}</span>

                {/* Discount / Plus inputs grouped */}
                {isMinus ? (
                  <div className="flex items-center border border-emerald-500/30 rounded-xl overflow-hidden focus-within:border-emerald-500 transition-all bg-card" title="Plus / Addition for minus amount">
                    <input
                      type="number"
                      value={rowPlusPercentInputs[inv.invoice_id] !== undefined ? rowPlusPercentInputs[inv.invoice_id] : (rowPlusPercents[inv.invoice_id] || '')}
                      onChange={(e) => handlePlusPercentChange(inv.invoice_id, e.target.value)}
                      onBlur={() => setRowPlusPercentInputs((p) => { const n = { ...p }; delete n[inv.invoice_id]; return n; })}
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      className="w-full py-2 text-[10px] font-bold bg-transparent outline-none text-foreground tabular-nums text-center no-spinners"
                      step="0.01" min="0" placeholder="%"
                    />
                    <span className="w-px h-5 bg-emerald-500/20 shrink-0" />
                    <input
                      type="number"
                      value={rowPlusInputs[inv.invoice_id] !== undefined ? rowPlusInputs[inv.invoice_id] : (rowPluses[inv.invoice_id] || '')}
                      onChange={(e) => handlePlusFlatChange(inv.invoice_id, e.target.value)}
                      onBlur={() => setRowPlusInputs((p) => { const n = { ...p }; delete n[inv.invoice_id]; return n; })}
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      className="w-full py-2 text-[10px] font-bold bg-transparent outline-none text-emerald-600 dark:text-emerald-400 tabular-nums text-center no-spinners"
                      step="any" placeholder={localizeCurrencyText("+₹")}
                    />
                  </div>
                ) : (
                  <div className="flex items-center border border-amber-500/20 rounded-xl overflow-hidden focus-within:border-amber-500/60 transition-all bg-card">
                    <input
                      type="number"
                      value={rowDiscPercentInputs[inv.invoice_id] !== undefined ? rowDiscPercentInputs[inv.invoice_id] : (rowDiscPercents[inv.invoice_id] || '')}
                      onChange={(e) => handleDiscPercentChange(inv.invoice_id, e.target.value)}
                      onBlur={() => setRowDiscPercentInputs((p) => { const n = { ...p }; delete n[inv.invoice_id]; return n; })}
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      className="w-full py-2 text-[10px] font-bold bg-transparent outline-none text-foreground tabular-nums text-center no-spinners"
                      step="0.01" min="0" placeholder="%"
                    />
                    <span className="w-px h-5 bg-amber-500/20 shrink-0" />
                    <input
                      type="number"
                      value={rowDiscInputs[inv.invoice_id] !== undefined ? rowDiscInputs[inv.invoice_id] : (rd || '')}
                      onChange={(e) => handleDiscFlatChange(inv.invoice_id, e.target.value)}
                      onBlur={() => setRowDiscInputs((p) => { const n = { ...p }; delete n[inv.invoice_id]; return n; })}
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      className="w-full py-2 text-[10px] font-bold bg-transparent outline-none text-foreground tabular-nums text-center no-spinners"
                      step="any" min="0" placeholder={localizeCurrencyText("₹")}
                    />
                  </div>
                )}

                {/* Net editable input */}
                <span className="text-xs font-black text-right tabular-nums block">
                  {isMinus ? (
                    <div className="flex items-center justify-center">
                      <div className="flex items-center border border-emerald-500/30 rounded-lg overflow-hidden focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/10 transition-all bg-card w-full max-w-[105px]">
                        <span className="pl-2 shrink-0 whitespace-nowrap text-[10px] font-black text-emerald-600 dark:text-emerald-400 select-none leading-none">-{getCurrencyPrefix()}</span>
                        <input
                          type="number"
                          value={rowNetInputs[inv.invoice_id] !== undefined ? rowNetInputs[inv.invoice_id] : (absNet === 0 ? '' : absNet.toFixed(getCurrencyDecimals()))}
                          onChange={(e) => handleNetChange(inv.invoice_id, e.target.value)}
                          onBlur={() => setRowNetInputs((p) => { const n = { ...p }; delete n[inv.invoice_id]; return n; })}
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-full py-1 pr-2 pl-1 text-[10px] font-black bg-transparent outline-none text-emerald-600 dark:text-emerald-400 tabular-nums text-center no-spinners"
                          step="any" min="0" placeholder={moneyFixed(absRawNet)}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center">
                      <div className="flex items-center border border-primary/30 rounded-lg overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 transition-all bg-card w-full max-w-[90px]">
                        <span className="pl-2 shrink-0 whitespace-nowrap text-[10px] font-black text-primary select-none leading-none">{getCurrencyPrefix()}</span>
                        <input
                          type="number"
                          value={rowNetInputs[inv.invoice_id] !== undefined ? rowNetInputs[inv.invoice_id] : (net === 0 ? '' : net.toFixed(getCurrencyDecimals()))}
                          onChange={(e) => handleNetChange(inv.invoice_id, e.target.value)}
                          onBlur={() => setRowNetInputs((p) => { const n = { ...p }; delete n[inv.invoice_id]; return n; })}
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-full py-1 pr-2 pl-0.5 text-[10px] font-black bg-transparent outline-none text-primary tabular-nums text-center no-spinners"
                          step="any" min="0" placeholder={moneyFixed(displayAmount)}
                        />
                      </div>
                    </div>
                  )}
                </span>

                {/* Payment method dropdown */}
                <div className="flex justify-center">
                  <Select
                    value={rm}
                    onChange={(v) => {
                      setRowMethods((p) => ({ ...p, [inv.invoice_id]: v as PaymentMethod }));
                      if (v === 'SPLIT') {
                        openSplitModal(inv);
                      }
                    }}
                    options={PAYMENT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                    size="sm"
                  />
                </div>

                {/* Pay button */}
                <div className="flex justify-end">
                  <button
                    onClick={async () => {
                      if (payingRow) return;
                      if (rm === 'SPLIT') {
                        openSplitModal(inv);
                        return;
                      }
                      setPayingRow(inv.invoice_id);
                      const r = await cashierApi.settlePayment({
                        tenant_id: tenantId!, invoice_id: inv.invoice_id,
                        received_amount: net,
                        discount_amount: rawNet < 0 ? 0 : (Number(rowDiscs[inv.invoice_id]) || 0),
                        payment_method: rm,
                        user_id: userId!, user_name: userName || undefined,
                      });
                      setPayingRow(null);
                      if (r.success) await load();
                    }}
                    disabled={isPaying}
                    className="flex items-center gap-1 px-3.5 py-2 rounded-xl text-[10px] font-black text-white transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-40 shadow-sm bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 hover:shadow-md"
                  >
                    {isPaying ? (
                      <span className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3" />
                    )}
                    {isPaying ? '' : 'Settle'}
                  </button>
                </div>
              </div>
            );
              })}
            </Fragment>
          ))
        )}
      </div>
    </div>
  );
}
