import { localizeTaxText } from '../../../../utils/localization/storeProfile';
import { getCurrencyPrefix } from '../../../../utils/localization/storeProfile';
import { Skeleton } from '../../../ui/Skeleton';
import { BookOpen, PlusCircle, ArrowDown, ArrowUp, Hash, TrendingUp, FileText, Eye, Pencil, Trash } from 'lucide-react';
import clsx from 'clsx';
import { PaymentMethodIcon } from '../../partyHelpers';
import { formatDateTime, toLocalInputValue } from '../../partyUtils';
import { WhatsAppIcon } from '../../../ui/WhatsAppIcon';
import type { PartyLedgerViewProps } from '../PartyLedgerView';

export interface LedgerEntriesProps {
  dateSortOrder: PartyLedgerViewProps['dateSortOrder'];
  displayLedger: PartyLedgerViewProps['displayLedger'];
  enablePartyEstimate: boolean;
  enablePartyGst: boolean;
  handleDeleteTx: PartyLedgerViewProps['handleDeleteTx'];
  handleOpenBillForLedgerEntry: PartyLedgerViewProps['handleOpenBillForLedgerEntry'];
  handleSendWhatsAppForEntry: PartyLedgerViewProps['handleSendWhatsAppForEntry'];
  isOwner: boolean;
  ledger: PartyLedgerViewProps['ledger'];
  ledgerLayoutMode: PartyLedgerViewProps['ledgerLayoutMode'];
  ledgerLoading: boolean;
  ledgerStartDate: string;
  openTxForm: PartyLedgerViewProps['openTxForm'];
  setDateSortOrder: PartyLedgerViewProps['setDateSortOrder'];
  setEditingTx: PartyLedgerViewProps['setEditingTx'];
  setTxForm: PartyLedgerViewProps['setTxForm'];
  setView: PartyLedgerViewProps['setView'];
  statementData: PartyLedgerViewProps['statementData'];
  tLabels: PartyLedgerViewProps['tLabels'];
  totalCreditSum: number;
  totalDebitSum: number;
}

/** Ledger entries: loading skeleton, empty state, the accounting statement table or the cards stream. */
export function LedgerEntries({
  dateSortOrder, displayLedger, enablePartyEstimate, enablePartyGst, handleDeleteTx, handleOpenBillForLedgerEntry,
  handleSendWhatsAppForEntry, isOwner, ledger, ledgerLayoutMode, ledgerLoading, ledgerStartDate, openTxForm,
  setDateSortOrder, setEditingTx, setTxForm, setView, statementData, tLabels, totalCreditSum, totalDebitSum,
}: LedgerEntriesProps) {
  return (
    <>
    {ledgerLoading ? (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
      </div>
    ) : ledger.length === 0 ? (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <BookOpen className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <div>
          <p className="text-base font-bold text-foreground">No transactions yet</p>
          <p className="text-sm text-muted-foreground mt-0.5">Add the first entry to start the ledger</p>
        </div>
        {isOwner && (
          <button
            onClick={() => openTxForm('CREDIT')}
            className="mt-2 flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-sm hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" /> Add Transaction
          </button>
        )}
      </div>
    ) : ledgerLayoutMode === 'table' ? (
      /* ── Standard Accounting Statement Table ── */
      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-muted/70 text-muted-foreground font-bold border-b border-border uppercase tracking-wider text-[11px] select-none sticky top-0 backdrop-blur-md">
              <th
                className="py-3 px-4 cursor-pointer hover:bg-muted/90 transition-colors"
                onClick={() => setDateSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                title="Click to toggle Date Sort (Ascending / Descending)"
              >
                <div className="flex items-center gap-1.5 text-foreground">
                  <span>Date & Time</span>
                  {dateSortOrder === 'desc' ? (
                    <ArrowDown className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <ArrowUp className="w-3.5 h-3.5 text-primary" />
                  )}
                </div>
              </th>
              <th className="py-3 px-4">Voucher / Ref #</th>
              <th className="py-3 px-4">Particulars / Description</th>
              <th className="py-3 px-4">Mode</th>
              <th className="py-3 px-4 text-right text-rose-600 dark:text-rose-400 font-extrabold bg-rose-500/5 border-l border-r border-border/40">
                {tLabels.paid || 'Gave Cash'} (Gave / Sale {getCurrencyPrefix()})
              </th>
              <th className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400 font-extrabold bg-emerald-500/5 border-r border-border/40">
                {tLabels.received || 'Got Cash'} (Got / Payment {getCurrencyPrefix()})
              </th>
              <th className="py-3 px-4 text-right font-extrabold">Running Bal ({getCurrencyPrefix()})</th>
              <th className="py-3 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {/* Opening Balance Row if period filtered or opening balance exists */}
            {statementData && (ledgerStartDate || statementData.openingBalance !== 0) && (
              <tr className="bg-muted/40 font-bold border-b-2 border-border/70 select-none">
                <td className="py-2.5 px-4 font-semibold text-muted-foreground text-[11px] whitespace-nowrap">
                  {statementData.startDateFormatted || 'Initial'}
                </td>
                <td className="py-2.5 px-4 font-mono font-bold text-muted-foreground whitespace-nowrap">
                  —
                </td>
                <td className="py-2.5 px-4">
                  <p className="font-bold text-muted-foreground text-xs italic">
                    Opening Balance {statementData.startDateFormatted ? `(as of ${statementData.startDateFormatted})` : ''}
                  </p>
                </td>
                <td className="py-2.5 px-4 font-medium text-muted-foreground text-[11px] whitespace-nowrap">
                  —
                </td>
                <td className="py-2.5 px-4 text-right text-muted-foreground font-mono text-xs">
                  —
                </td>
                <td className="py-2.5 px-4 text-right text-muted-foreground font-mono text-xs">
                  —
                </td>
                <td className="py-2.5 px-4 text-right">
                  <span className={clsx(
                    "font-mono font-black text-sm block",
                    statementData.openingBalance > 0 ? "text-rose-600 dark:text-rose-400" :
                    statementData.openingBalance < 0 ? "text-emerald-600 dark:text-emerald-400" :
                    "text-muted-foreground"
                  )}>
                    {getCurrencyPrefix()}{Math.abs(statementData.openingBalance).toFixed(2)}
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                    {statementData.openingBalance > 0 ? tLabels.receivable : statementData.openingBalance < 0 ? tLabels.payable : 'Settled'}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-center"></td>
              </tr>
            )}
            {displayLedger.map((entry) => {
              return (
                <tr
                  key={entry.ledger_id}
                  onClick={() => handleOpenBillForLedgerEntry(entry)}
                  className="hover:bg-muted/40 transition-colors cursor-pointer group"
                >
                  {/* Date & Time */}
                  <td className="py-3 px-4 font-medium text-muted-foreground text-[11px] whitespace-nowrap">
                    {formatDateTime(entry.transaction_date)}
                  </td>

                  {/* Ref # */}
                  <td className="py-3 px-4 font-mono font-bold text-foreground whitespace-nowrap">
                    {entry.reference_number ? (
                      <span className="inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded text-[11px] border border-border">
                        <Hash className="w-3 h-3 text-muted-foreground" />
                        {entry.reference_number}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/30">—</span>
                    )}
                  </td>

                  {/* Particulars */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-foreground text-xs leading-snug group-hover:text-primary transition-colors">
                        {entry.description}
                      </p>
                      {enablePartyGst && enablePartyEstimate && (
                        entry.balance_type === 'ESTIMATE' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30 shrink-0">
                            <TrendingUp className="w-2.5 h-2.5" />
                            Estimate
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30 shrink-0">
                            <FileText className="w-2.5 h-2.5" />
                            {localizeTaxText("GST")}
                          </span>
                        )
                      )}
                    </div>
                  </td>

                  {/* Payment Method */}
                  <td className="py-3 px-4 font-medium text-muted-foreground text-[11px] whitespace-nowrap">
                    {entry.payment_method ? (
                      <span className="inline-flex items-center gap-1 bg-muted/60 px-2 py-0.5 rounded text-[11px] border border-border/40">
                        <PaymentMethodIcon method={entry.payment_method} />
                        {entry.payment_method === 'CASH' ? 'Cash' : entry.payment_method === 'BANK_TRANSFER' ? 'Bank' : entry.payment_method === 'UPI' ? 'UPI' : entry.payment_method === 'CARD' ? 'Card' : entry.payment_method === 'CHEQUE' ? 'Cheque' : 'Other'}
                      </span>
                    ) : (
                      <span>—</span>
                    )}
                  </td>

                  {/* Gave / Sale Amount (Red) */}
                  <td className="py-3 px-4 text-right font-mono font-black text-sm text-rose-600 dark:text-rose-400 bg-rose-500/5 border-l border-r border-border/40">
                    {entry.credit_amount > 0 ? `${getCurrencyPrefix()}${entry.credit_amount.toFixed(2)}` : <span className="text-muted-foreground/30 font-normal">—</span>}
                  </td>

                  {/* Got / Payment Amount (Green) */}
                  <td className="py-3 px-4 text-right font-mono font-black text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 border-r border-border/40">
                    {entry.debit_amount > 0 ? `${getCurrencyPrefix()}${entry.debit_amount.toFixed(2)}` : <span className="text-muted-foreground/30 font-normal">—</span>}
                  </td>

                  {/* Running Balance */}
                  <td className="py-3 px-4 text-right">
                    {(() => {
                      const runBal = (entry as typeof entry & { contextRunningBalance: number }).contextRunningBalance !== undefined ? (entry as typeof entry & { contextRunningBalance: number }).contextRunningBalance : entry.running_balance;
                      return (
                        <>
                          <span className={clsx(
                            "font-mono font-black text-sm block",
                            runBal > 0 ? "text-rose-600 dark:text-rose-400" :
                            runBal < 0 ? "text-emerald-600 dark:text-emerald-400" :
                            "text-muted-foreground"
                          )}>
                            {getCurrencyPrefix()}{Math.abs(runBal).toFixed(2)}
                          </span>
                          <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                            {runBal > 0 ? tLabels.receivable : runBal < 0 ? tLabels.payable : 'Settled'}
                          </span>
                        </>
                      );
                    })()}
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-4 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenBillForLedgerEntry(entry)}
                        className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                        title="View Voucher / Bill"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendWhatsAppForEntry(entry)}
                        className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                        title="Send WhatsApp Message"
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5 fill-current text-emerald-600" />
                      </button>
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTx(entry);
                            const amt = entry.credit_amount > 0 ? entry.credit_amount : entry.debit_amount;
                            setTxForm({
                              amount: String(amt),
                              transaction_type: entry.credit_amount > 0 ? 'CREDIT' : 'DEBIT',
                              description: entry.description,
                              transaction_date: toLocalInputValue(entry.transaction_date),
                              reference_number: entry.reference_number || '',
                              balance_type: (entry.balance_type === 'ESTIMATE' ? 'ESTIMATE' : 'GST'),
                              payment_method: (entry.payment_method as import('../../hooks/usePartyManagerState').PartyManagerState['txForm']['payment_method']) || 'CASH',
                              send_whatsapp: false,
                            });
                            setView('tx_form');
                          }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                          title="Edit Entry"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => handleDeleteTx(entry)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                          title="Delete Entry"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Standard Ledger Summary Footer */}
          <tfoot>
            {(() => {
              const entryCount = statementData ? statementData.entryCount : ledger.length;
              const closingBal = statementData ? statementData.closingBalance : (totalCreditSum - totalDebitSum);
              return (
                <tr className="bg-muted/90 text-foreground font-black border-t-2 border-border text-xs select-none">
                  <td colSpan={4} className="py-3.5 px-4 font-extrabold uppercase tracking-wider text-right">
                    Statement Totals ({entryCount} {entryCount === 1 ? 'entry' : 'entries'}):
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-sm text-rose-600 dark:text-rose-400 bg-rose-500/10 border-l border-r border-border/40">
                    {getCurrencyPrefix()}{totalCreditSum.toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-r border-border/40">
                    {getCurrencyPrefix()}{totalDebitSum.toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <span className={clsx(
                      "font-mono font-black text-sm block",
                      closingBal > 0 ? "text-rose-600 dark:text-rose-400" :
                      closingBal < 0 ? "text-emerald-600 dark:text-emerald-400" :
                      "text-foreground"
                    )}>
                      {getCurrencyPrefix()}{Math.abs(closingBal).toFixed(2)}
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                      {closingBal > 0 ? tLabels.receivable : closingBal < 0 ? tLabels.payable : 'Settled'}
                    </span>
                  </td>
                  <td></td>
                </tr>
              );
            })()}
          </tfoot>
        </table>
      </div>
    ) : (
      /* ── Cards View Stream (Polished Modern Cards) ── */
      <div className="space-y-2.5">
        {displayLedger.map((entry) => {
          const isCreditSale = entry.credit_amount > 0;
          const amount = isCreditSale ? entry.credit_amount : entry.debit_amount;
          return (
            <div
              key={entry.ledger_id}
              onClick={() => handleOpenBillForLedgerEntry(entry)}
              className={clsx(
                'rounded-2xl border bg-card dark:bg-card p-4 shadow-xs hover:shadow-md hover:border-primary/40 transition-all cursor-pointer group flex items-center justify-between gap-4',
                isCreditSale ? 'border-l-4 border-l-rose-500 border-border' : 'border-l-4 border-l-emerald-500 border-border'
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {entry.reference_number && (
                    <span className="text-[10px] font-mono font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
                      #{entry.reference_number}
                    </span>
                  )}
                  {enablePartyGst && enablePartyEstimate && (
                    entry.balance_type === 'ESTIMATE' ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30 shrink-0">
                        <TrendingUp className="w-2.5 h-2.5" />
                        Estimate
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30 shrink-0">
                        <FileText className="w-2.5 h-2.5" />
                        {localizeTaxText("GST")}
                      </span>
                    )
                  )}
                </div>
                <p className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">{entry.description}</p>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground font-medium flex-wrap">
                  <span>{formatDateTime(entry.transaction_date)}</span>
                  {entry.payment_method && <span>· {entry.payment_method}</span>}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSendWhatsAppForEntry(entry);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                    title="Send WhatsApp Alert"
                  >
                    <WhatsAppIcon className="w-3 h-3 fill-current text-emerald-600" />
                    <span>WhatsApp</span>
                  </button>
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className={clsx('text-lg font-black font-mono', isCreditSale ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                  {isCreditSale ? '+' : '−'}{getCurrencyPrefix()}{amount.toFixed(2)}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                  Bal: {getCurrencyPrefix()}{Math.abs((entry as typeof entry & { contextRunningBalance: number }).contextRunningBalance !== undefined ? (entry as typeof entry & { contextRunningBalance: number }).contextRunningBalance : entry.running_balance).toFixed(2)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    )}
    </>
  );
}
