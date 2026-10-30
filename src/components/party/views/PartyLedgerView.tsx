import { getStoreLocale } from '../../../utils/localization/storeProfile';
import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import React from 'react';
import { AlertTriangle, MinusCircle, PlusCircle } from 'lucide-react';
import { LedgerEntries } from './ledger/LedgerEntries';
import { LedgerToolbar } from './ledger/LedgerToolbar';
import { PartyBalanceCards } from './ledger/PartyBalanceCards';
import { PartyProfileCard } from './ledger/PartyProfileCard';

export interface PartyLedgerViewProps {
  selectedParty: NonNullable<import('../hooks/usePartyManagerState').PartyManagerState['selectedParty']>;
  ledger: import('../hooks/usePartyManagerState').PartyManagerState['ledger'];
  ledgerLoading: boolean;
  ledgerStartDate: string;
  setLedgerStartDate: (v: string) => void;
  ledgerEndDate: string;
  setLedgerEndDate: (v: string) => void;
  ledgerBalanceFilter: import('../hooks/usePartyManagerState').PartyManagerState['ledgerBalanceFilter'];
  setLedgerBalanceFilter: import('../hooks/usePartyManagerState').PartyManagerState['setLedgerBalanceFilter'];
  ledgerLayoutMode: import('../hooks/usePartyManagerState').PartyManagerState['ledgerLayoutMode'];
  setLedgerLayoutMode: import('../hooks/usePartyManagerState').PartyManagerState['setLedgerLayoutMode'];
  dateSortOrder: import('../hooks/usePartyManagerState').PartyManagerState['dateSortOrder'];
  setDateSortOrder: import('../hooks/usePartyManagerState').PartyManagerState['setDateSortOrder'];
  isExportingPdf: boolean;
  isSendingWhatsAppPdf: boolean;
  enablePartyEstimate: boolean;
  enablePartyGst: boolean;
  isOwner: boolean;
  tLabels: import('../../../store/terminologyStore').TerminologyLabels;
  getPartyBalance: (p: import('../partyTypes').Party) => number;
  statementData: import('../../../utils/print/partyLedgerPdfGenerator').StatementReconciliation | null;
  activeGstBal: number;
  activeEstimateBal: number;
  displayLedger: import('../partyTypes').LedgerEntry[];
  totalCreditSum: number;
  totalDebitSum: number;
  gstEntriesCount: number;
  estimateEntriesCount: number;
  handleDownloadPdf: () => void;
  handleSendWhatsAppPdf: () => void;
  handleOpenBillForLedgerEntry: (entry: import('../partyTypes').LedgerEntry) => void;
  handleDeleteTx: (entry: import('../partyTypes').LedgerEntry) => void;
  handleSendWhatsAppForEntry: (entry: import('../partyTypes').LedgerEntry) => void;
  openTxForm: (type?: 'CREDIT' | 'DEBIT') => void;
  startEditingParty: (party: import('../partyTypes').Party, returnTo?: 'list' | 'ledger') => void;
  setShowConnectModal: (v: boolean) => void;
  setConnectCodeInput: (v: string) => void;
  setSearchResult: import('../hooks/usePartyManagerState').PartyManagerState['setSearchResult'];
  showStatus: (text: string, type: 'success' | 'error') => void;
  setParties: import('../hooks/usePartyManagerState').PartyManagerState['setParties'];
  setSelectedParty: import('../hooks/usePartyManagerState').PartyManagerState['setSelectedParty'];
  setEditingTx: import('../hooks/usePartyManagerState').PartyManagerState['setEditingTx'];
  setTxForm: import('../hooks/usePartyManagerState').PartyManagerState['setTxForm'];
  setView: import('../hooks/usePartyManagerState').PartyManagerState['setView'];
}

export const PartyLedgerView: React.FC<PartyLedgerViewProps> = ({
  selectedParty,
  ledger,
  ledgerLoading,
  ledgerStartDate,
  setLedgerStartDate,
  ledgerEndDate,
  setLedgerEndDate,
  ledgerBalanceFilter,
  setLedgerBalanceFilter,
  ledgerLayoutMode,
  setLedgerLayoutMode,
  dateSortOrder,
  setDateSortOrder,
  isExportingPdf,
  isSendingWhatsAppPdf,
  enablePartyEstimate,
  enablePartyGst,
  isOwner,
  tLabels,
  getPartyBalance,
  statementData,
  activeGstBal,
  activeEstimateBal,
  displayLedger,
  totalCreditSum,
  totalDebitSum,
  gstEntriesCount,
  estimateEntriesCount,
  handleDownloadPdf,
  handleSendWhatsAppPdf,
  handleOpenBillForLedgerEntry,
  handleDeleteTx,
  handleSendWhatsAppForEntry,
  openTxForm,
  startEditingParty,
  setShowConnectModal,
  setConnectCodeInput,
  setSearchResult,
  showStatus,
  setParties,
  setSelectedParty,
  setEditingTx,
  setTxForm,
  setView,
}) => {
  return (
        <div className="flex flex-col flex-1 min-h-0 bg-background">

          {/* ── Redesigned Party Banner ── */}
          <div className="shrink-0 px-6 py-4 border-b border-border bg-card/40 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-6 flex-wrap">
              {/* Left Column: Party Profile & Identity */}
              <PartyProfileCard
                isOwner={isOwner} ledger={ledger} selectedParty={selectedParty}
                setConnectCodeInput={setConnectCodeInput} setParties={setParties} setSearchResult={setSearchResult}
                setSelectedParty={setSelectedParty} setShowConnectModal={setShowConnectModal} showStatus={showStatus}
                startEditingParty={startEditingParty}
              />

              {/* Right Column: Financial Balance Cards */}
              <PartyBalanceCards
                activeEstimateBal={activeEstimateBal} activeGstBal={activeGstBal}
                enablePartyEstimate={enablePartyEstimate} enablePartyGst={enablePartyGst}
                getPartyBalance={getPartyBalance} ledgerBalanceFilter={ledgerBalanceFilter}
                ledgerEndDate={ledgerEndDate} ledgerStartDate={ledgerStartDate} selectedParty={selectedParty}
                setLedgerBalanceFilter={setLedgerBalanceFilter} statementData={statementData} tLabels={tLabels}
              />
            </div>
          </div>

          {/* ── Ledger Toolbar (Date Range Filter & PDF Download) ── */}
          <LedgerToolbar
            dateSortOrder={dateSortOrder} enablePartyEstimate={enablePartyEstimate} enablePartyGst={enablePartyGst}
            estimateEntriesCount={estimateEntriesCount} gstEntriesCount={gstEntriesCount}
            handleDownloadPdf={handleDownloadPdf} handleSendWhatsAppPdf={handleSendWhatsAppPdf}
            isExportingPdf={isExportingPdf} isSendingWhatsAppPdf={isSendingWhatsAppPdf} ledger={ledger}
            ledgerBalanceFilter={ledgerBalanceFilter} ledgerEndDate={ledgerEndDate} ledgerLayoutMode={ledgerLayoutMode}
            ledgerLoading={ledgerLoading} ledgerStartDate={ledgerStartDate} selectedParty={selectedParty}
            setDateSortOrder={setDateSortOrder} setLedgerBalanceFilter={setLedgerBalanceFilter}
            setLedgerEndDate={setLedgerEndDate} setLedgerLayoutMode={setLedgerLayoutMode}
            setLedgerStartDate={setLedgerStartDate} statementData={statementData}
          />

          {/* Overdue Warning Banner */}
          {selectedParty.has_overdue && (
            <div className="shrink-0 px-5 py-3 bg-rose-500/10 border-b border-rose-500/20 text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 animate-pulse shrink-0" />
                <div>
                  <span className="font-bold">Overdue Payment Warning: </span>
                  <span>
                    This customer has {selectedParty.overdue_bills_count || 'pending'} overdue credit bill(s) totaling {getCurrencyPrefix()}{Number(selectedParty.overdue_amount || 0).toLocaleString(getStoreLocale())}.
                    {selectedParty.restrict_on_credit_expiry !== false && selectedParty.restrict_on_credit_expiry !== 0
                      ? ' New credit billing is restricted.'
                      : ' Credit purchases allowed (Warning only).'}
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[10px] font-black uppercase tracking-wider shrink-0">
                {selectedParty.oldest_overdue_days ? `${selectedParty.oldest_overdue_days}d Overdue` : 'Overdue'}
              </span>
            </div>
          )}

          {/* ── Ledger entries ── */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <LedgerEntries
              dateSortOrder={dateSortOrder} displayLedger={displayLedger} enablePartyEstimate={enablePartyEstimate}
              enablePartyGst={enablePartyGst} handleDeleteTx={handleDeleteTx}
              handleOpenBillForLedgerEntry={handleOpenBillForLedgerEntry}
              handleSendWhatsAppForEntry={handleSendWhatsAppForEntry} isOwner={isOwner} ledger={ledger}
              ledgerLayoutMode={ledgerLayoutMode} ledgerLoading={ledgerLoading} ledgerStartDate={ledgerStartDate}
              openTxForm={openTxForm} setDateSortOrder={setDateSortOrder} setEditingTx={setEditingTx}
              setTxForm={setTxForm} setView={setView} statementData={statementData} tLabels={tLabels}
              totalCreditSum={totalCreditSum} totalDebitSum={totalDebitSum}
            />
          </div>

          {/* ── Bottom Action Bar for Ledger ── */}
          {isOwner && (
            <div className="shrink-0 border-t border-border bg-card px-5 py-3 flex items-center justify-between gap-3 shadow-lg">
              <p className="text-xs text-muted-foreground font-medium truncate hidden sm:block">
                Record new entry for <span className="font-bold text-foreground">{selectedParty.name}</span>
              </p>
              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <button
                  onClick={() => openTxForm('CREDIT')}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" /> + {tLabels.paid || 'Paid'} (Credit)
                </button>
                <button
                  onClick={() => openTxForm('DEBIT')}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  <MinusCircle className="w-4 h-4" /> − {tLabels.received || 'Received'} (Debit)
                </button>
              </div>
            </div>
          )}
        </div>

  );
};
