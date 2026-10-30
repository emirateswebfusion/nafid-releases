import { localizeTaxText } from '../../../../utils/localization/storeProfile';
import { getCurrencyPrefix } from '../../../../utils/localization/storeProfile';
import clsx from 'clsx';
import { FileText, TrendingUp, Wallet } from 'lucide-react';
import type { PartyLedgerViewProps } from '../PartyLedgerView';

export interface PartyBalanceCardsProps {
  activeEstimateBal: number;
  activeGstBal: number;
  enablePartyEstimate: boolean;
  enablePartyGst: boolean;
  getPartyBalance: PartyLedgerViewProps['getPartyBalance'];
  ledgerBalanceFilter: PartyLedgerViewProps['ledgerBalanceFilter'];
  ledgerEndDate: string;
  ledgerStartDate: string;
  selectedParty: PartyLedgerViewProps['selectedParty'];
  setLedgerBalanceFilter: PartyLedgerViewProps['setLedgerBalanceFilter'];
  statementData: PartyLedgerViewProps['statementData'];
  tLabels: PartyLedgerViewProps['tLabels'];
}

/** Party balance cards: current balance, totals and credit position. */
export function PartyBalanceCards({
  activeEstimateBal, activeGstBal, enablePartyEstimate, enablePartyGst, getPartyBalance, ledgerBalanceFilter,
  ledgerEndDate, ledgerStartDate, selectedParty, setLedgerBalanceFilter, statementData, tLabels,
}: PartyBalanceCardsProps) {
  return (
    <>
    <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
      {(() => {
        const currentTotalBal = getPartyBalance(selectedParty);
        const isPeriodFiltered = Boolean(ledgerStartDate || ledgerEndDate);
        const activeBal = (isPeriodFiltered && statementData) ? statementData.closingBalance : currentTotalBal;
        const showBoth = enablePartyGst && enablePartyEstimate;
        const showOnlyGst = enablePartyGst && !enablePartyEstimate;
        const showOnlyEstimate = !enablePartyGst && enablePartyEstimate;

        if (showBoth) {
          return (
            <div className="flex items-center gap-2 flex-wrap">
              {/* GST Balance Card */}
              <button
                type="button"
                onClick={() => setLedgerBalanceFilter(prev => prev === 'GST' ? 'ALL' : 'GST')}
                className={clsx(
                  'group flex flex-col justify-center px-3.5 py-2 rounded-xl border transition-all cursor-pointer text-left select-none min-w-[125px]',
                  ledgerBalanceFilter === 'GST'
                    ? 'bg-sky-500/10 border-sky-500/40 ring-1 ring-sky-500/30'
                    : 'bg-card/70 border-border hover:border-sky-500/30 hover:bg-sky-500/5'
                )}
                title={localizeTaxText("Click to filter transactions by GST Balance")}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <FileText className="w-3 h-3 text-sky-500" /> {localizeTaxText("GST")}
                  </span>
                  <span className={clsx(
                    "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded font-mono",
                    activeGstBal > 0 ? "bg-rose-500/10 text-rose-500" : activeGstBal < 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
                  )}>
                    {activeGstBal > 0 ? tLabels.receivable : activeGstBal < 0 ? tLabels.payable : 'Settled'}
                  </span>
                </div>
                <p className="text-sm font-black font-mono tracking-tight text-foreground">
                  {getCurrencyPrefix()}{Math.abs(activeGstBal).toFixed(2)}
                </p>
              </button>

              {/* Estimate Balance Card */}
              <button
                type="button"
                onClick={() => setLedgerBalanceFilter(prev => prev === 'ESTIMATE' ? 'ALL' : 'ESTIMATE')}
                className={clsx(
                  'group flex flex-col justify-center px-3.5 py-2 rounded-xl border transition-all cursor-pointer text-left select-none min-w-[125px]',
                  ledgerBalanceFilter === 'ESTIMATE'
                    ? 'bg-violet-500/10 border-violet-500/40 ring-1 ring-violet-500/30'
                    : 'bg-card/70 border-border hover:border-violet-500/30 hover:bg-violet-500/5'
                )}
                title="Click to filter transactions by Estimate Balance"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-violet-500" /> Estimate
                  </span>
                  <span className={clsx(
                    "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded font-mono",
                    activeEstimateBal > 0 ? "bg-rose-500/10 text-rose-500" : activeEstimateBal < 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
                  )}>
                    {activeEstimateBal > 0 ? tLabels.receivable : activeEstimateBal < 0 ? tLabels.payable : 'Settled'}
                  </span>
                </div>
                <p className="text-sm font-black font-mono tracking-tight text-foreground">
                  {getCurrencyPrefix()}{Math.abs(activeEstimateBal).toFixed(2)}
                </p>
              </button>

              {/* Net Total Balance Card */}
              <button
                type="button"
                onClick={() => setLedgerBalanceFilter('ALL')}
                className={clsx(
                  'flex flex-col justify-center px-4 py-2 rounded-xl border transition-all cursor-pointer text-left select-none min-w-[145px]',
                  ledgerBalanceFilter === 'ALL' ? 'ring-1 ring-border shadow-xs' : '',
                  activeBal > 0
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                    : activeBal < 0
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                    : 'bg-muted/50 border-border text-muted-foreground'
                )}
                title="Click to show All Transactions"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 opacity-80">
                    <Wallet className="w-3 h-3" /> Net Total
                  </span>
                  <span className={clsx(
                    "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded font-mono",
                    activeBal > 0 ? "bg-rose-500/20 text-rose-600 dark:text-rose-300" : activeBal < 0 ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300" : "bg-muted text-muted-foreground"
                  )}>
                    {activeBal > 0 ? tLabels.receivable : activeBal < 0 ? tLabels.payable : 'Settled'}
                  </span>
                </div>
                <p className="text-base font-black font-mono tracking-tight">
                  {getCurrencyPrefix()}{Math.abs(activeBal).toFixed(2)}
                </p>
              </button>
            </div>
          );
        }

        // If ONLY ONE is on ("if one then view one")
        const singleBal = showOnlyEstimate ? activeEstimateBal : (showOnlyGst ? activeGstBal : activeBal);
        const singleLabel = showOnlyEstimate ? 'Estimate' : (showOnlyGst ? localizeTaxText('GST') : 'Net Total');
        const SingleIcon = showOnlyEstimate ? TrendingUp : (showOnlyGst ? FileText : Wallet);

        return (
          <div className="flex items-center gap-2">
            <div className={clsx(
              'flex flex-col justify-center px-4 py-2 rounded-xl border select-none min-w-[150px]',
              singleBal > 0
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                : singleBal < 0
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-muted/50 border-border text-muted-foreground'
            )}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 opacity-80">
                  <SingleIcon className="w-3 h-3" /> {singleLabel}
                </span>
                <span className={clsx(
                  "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded font-mono",
                  singleBal > 0 ? "bg-rose-500/20 text-rose-600 dark:text-rose-300" : singleBal < 0 ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300" : "bg-muted text-muted-foreground"
                )}>
                  {singleBal > 0 ? tLabels.receivable : singleBal < 0 ? tLabels.payable : 'Settled'}
                </span>
              </div>
              <p className="text-base font-black font-mono tracking-tight">
                {getCurrencyPrefix()}{Math.abs(singleBal).toFixed(2)}
              </p>
            </div>
          </div>
        );
      })()}
    </div>
    </>
  );
}
