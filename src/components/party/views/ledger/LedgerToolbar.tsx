import { localizeTaxText } from '../../../../utils/localization/storeProfile';
import { DateRangeFilter } from '../../../ui/DateRangeFilter';
import clsx from 'clsx';
import { FileText, TrendingUp, X, ArrowUpDown, Table, LayoutList, Loader2, FileDown } from 'lucide-react';
import { WhatsAppIcon } from '../../../ui/WhatsAppIcon';
import type { PartyLedgerViewProps } from '../PartyLedgerView';

export interface LedgerToolbarProps {
  dateSortOrder: PartyLedgerViewProps['dateSortOrder'];
  enablePartyEstimate: boolean;
  enablePartyGst: boolean;
  estimateEntriesCount: number;
  gstEntriesCount: number;
  handleDownloadPdf: () => void;
  handleSendWhatsAppPdf: () => void;
  isExportingPdf: boolean;
  isSendingWhatsAppPdf: boolean;
  ledger: PartyLedgerViewProps['ledger'];
  ledgerBalanceFilter: PartyLedgerViewProps['ledgerBalanceFilter'];
  ledgerEndDate: string;
  ledgerLayoutMode: PartyLedgerViewProps['ledgerLayoutMode'];
  ledgerLoading: boolean;
  ledgerStartDate: string;
  selectedParty: PartyLedgerViewProps['selectedParty'];
  setDateSortOrder: PartyLedgerViewProps['setDateSortOrder'];
  setLedgerBalanceFilter: PartyLedgerViewProps['setLedgerBalanceFilter'];
  setLedgerEndDate: (v: string) => void;
  setLedgerLayoutMode: PartyLedgerViewProps['setLedgerLayoutMode'];
  setLedgerStartDate: (v: string) => void;
  statementData: PartyLedgerViewProps['statementData'];
}

/** Ledger toolbar: date range and adjust-against filters, sort, view switcher, PDF and WhatsApp statement. */
export function LedgerToolbar({
  dateSortOrder, enablePartyEstimate, enablePartyGst, estimateEntriesCount, gstEntriesCount, handleDownloadPdf,
  handleSendWhatsAppPdf, isExportingPdf, isSendingWhatsAppPdf, ledger, ledgerBalanceFilter, ledgerEndDate,
  ledgerLayoutMode, ledgerLoading, ledgerStartDate, selectedParty, setDateSortOrder, setLedgerBalanceFilter,
  setLedgerEndDate, setLedgerLayoutMode, setLedgerStartDate, statementData,
}: LedgerToolbarProps) {
  return (
    <div className="shrink-0 px-5 py-2.5 bg-card/60 border-b border-border flex items-center justify-between gap-3 flex-wrap">
      {/* Left: Date Range Filter + Adjust Against Filter Tabs + Reset */}
      <div className="flex items-center gap-2 flex-wrap">
        <DateRangeFilter
          startDate={ledgerStartDate}
          endDate={ledgerEndDate}
          onChange={(start, end) => {
            setLedgerStartDate(start);
            setLedgerEndDate(end);
          }}
        />

        {/* Adjust Against Filter Tabs when on 2 */}
        {enablePartyGst && enablePartyEstimate && (
          <div className="flex items-center p-0.5 rounded-xl bg-background/80 backdrop-blur-md border border-border shadow-xs text-xs font-bold select-none">
            <button
              type="button"
              onClick={() => setLedgerBalanceFilter('ALL')}
              className={clsx(
                "px-2.5 py-1 rounded-lg transition-all cursor-pointer",
                ledgerBalanceFilter === 'ALL'
                  ? "bg-primary text-primary-foreground shadow-xs font-black"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              All ({ledger.length})
            </button>
            <button
              type="button"
              onClick={() => setLedgerBalanceFilter('GST')}
              className={clsx(
                "px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1",
                ledgerBalanceFilter === 'GST'
                  ? "bg-sky-600 text-white shadow-xs font-black"
                  : "text-muted-foreground hover:text-sky-600 dark:hover:text-sky-400"
              )}
            >
              <FileText className="w-3 h-3" />
              {localizeTaxText("GST")} ({gstEntriesCount})
            </button>
            <button
              type="button"
              onClick={() => setLedgerBalanceFilter('ESTIMATE')}
              className={clsx(
                "px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1",
                ledgerBalanceFilter === 'ESTIMATE'
                  ? "bg-violet-600 text-white shadow-xs font-black"
                  : "text-muted-foreground hover:text-violet-600 dark:hover:text-violet-400"
              )}
            >
              <TrendingUp className="w-3 h-3" />
              Estimate ({estimateEntriesCount})
            </button>
          </div>
        )}

        {(ledgerStartDate || ledgerEndDate) && (
          <button
            type="button"
            onClick={() => {
              setLedgerStartDate('');
              setLedgerEndDate('');
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-xs font-bold border border-border transition-all cursor-pointer"
            title="Clear date filter (Show All Entries)"
          >
            <X className="w-3.5 h-3.5" />
            <span>Clear Filter</span>
          </button>
        )}

        {statementData && (
          <span className="text-xs font-semibold text-muted-foreground hidden sm:inline-block">
            {statementData.entryCount} {statementData.entryCount === 1 ? 'entry' : 'entries'} in period
            {ledgerStartDate || ledgerEndDate ? ` (${statementData.periodLabel})` : ''}
          </span>
        )}
      </div>

      {/* Right: Sort, View Switcher, Download PDF & WhatsApp Statement */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Date Sort Toggle Button */}
        <button
          type="button"
          onClick={() => setDateSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-background hover:bg-muted border border-border text-xs font-semibold transition-all cursor-pointer text-foreground shadow-xs"
          title={dateSortOrder === 'desc' ? 'Current: Newest First (Click to sort Oldest First)' : 'Current: Oldest First (Click to sort Newest First)'}
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
          <span>{dateSortOrder === 'desc' ? 'Newest' : 'Oldest'}</span>
        </button>

        {/* View Switcher buttons */}
        <div className="flex items-center p-0.5 rounded-lg bg-background border border-border shadow-xs">
          <button
            type="button"
            onClick={() => setLedgerLayoutMode('table')}
            className={clsx(
              'p-1.5 rounded text-xs font-bold transition-all flex items-center justify-center cursor-pointer',
              ledgerLayoutMode === 'table'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title="Statement Table View"
          >
            <Table className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setLedgerLayoutMode('cards')}
            className={clsx(
              'p-1.5 rounded text-xs font-bold transition-all flex items-center justify-center cursor-pointer',
              ledgerLayoutMode === 'cards'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title="Cards View"
          >
            <LayoutList className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Download PDF Button */}
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={isExportingPdf || ledgerLoading}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-xs hover:bg-primary/90 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="Download Party Ledger Statement as PDF"
        >
          {isExportingPdf ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FileDown className="w-3.5 h-3.5" />
          )}
          <span>{isExportingPdf ? 'Generating PDF...' : 'Download PDF'}</span>
        </button>

        {/* Send Statement on WhatsApp */}
        {selectedParty.phone && (
          <button
            type="button"
            onClick={handleSendWhatsAppPdf}
            disabled={isSendingWhatsAppPdf || ledgerLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            title="Share Statement PDF directly to WhatsApp"
          >
            {isSendingWhatsAppPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <WhatsAppIcon className="w-3.5 h-3.5 fill-current text-white" />
            )}
            <span className="hidden md:inline">{isSendingWhatsAppPdf ? 'Sending...' : 'WhatsApp PDF'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
