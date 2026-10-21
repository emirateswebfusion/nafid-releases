import React from 'react';
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, BookOpen, Eye,
  FileDown, FileText, Hash, LayoutList, Link, Loader2, MapPin,
  MinusCircle, Pencil, Phone, PlusCircle, Table, Trash, TrendingUp,
  Wallet, Printer, X
} from 'lucide-react';
import clsx from 'clsx';
import { formatDate, formatDateTime, getInitials, nameToHue, PaymentMethodIcon, toLocalInputValue } from '../partyHelpers';
import { DateRangeFilter } from '../../ui/DateRangeFilter';
import { Skeleton } from '../../ui/Skeleton';
import { WhatsAppIcon } from '../../ui/WhatsAppIcon';

export interface PartyLedgerViewProps {
  selectedParty: any;
  ledger: any[];
  ledgerLoading: boolean;
  ledgerStartDate: string;
  setLedgerStartDate: (v: string) => void;
  ledgerEndDate: string;
  setLedgerEndDate: (v: string) => void;
  ledgerBalanceFilter: any;
  setLedgerBalanceFilter: (v: any) => void;
  ledgerLayoutMode: any;
  setLedgerLayoutMode: (v: any) => void;
  dateSortOrder: any;
  setDateSortOrder: (v: any) => void;
  isExportingPdf: boolean;
  isSendingWhatsAppPdf: boolean;
  enablePartyEstimate: boolean;
  enablePartyGst: boolean;
  isOwner: boolean;
  tLabels: any;
  getPartyBalance: (p: any) => number;
  statementData: any;
  activeGstBal: number;
  activeEstimateBal: number;
  displayLedger: any[];
  totalCreditSum: number;
  totalDebitSum: number;
  gstEntriesCount: number;
  estimateEntriesCount: number;
  handleDownloadPdf: () => void;
  handleSendWhatsAppPdf: () => void;
  handleOpenBillForLedgerEntry: (entry: any) => void;
  handleDeleteTx: (entry: any) => void;
  handleSendWhatsAppForEntry: (entry: any) => void;
  openTxForm: (type?: any) => void;
  startEditingParty: (party: any, returnTo?: any) => void;
  setShowConnectModal: (v: boolean) => void;
  setConnectCodeInput: (v: string) => void;
  setSearchResult: (v: any) => void;
  showStatus: (text: string, type?: any) => void;
  setParties: any;
  setSelectedParty: any;
  setEditingTx: any;
  setTxForm: any;
  setView: any;
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
              <div className="flex items-start gap-4 min-w-0">
                {/* Avatar with subtle styling */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-base shadow-xs shrink-0 select-none bg-gradient-to-br from-primary/90 to-primary/60 border border-primary/20"
                >
                  {getInitials(selectedParty.name)}
                </div>

                <div className="min-w-0 space-y-1.5">
                  {/* Row 1: Name, Type Tag, Connection Status */}
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-base font-bold text-foreground tracking-tight truncate">{selectedParty.name}</h2>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-muted/80 text-muted-foreground border border-border">
                      {selectedParty.custom_category || (selectedParty.party_type === 'CUSTOMER' ? 'Customer' : 'Supplier')}
                    </span>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => startEditingParty(selectedParty, 'ledger')}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 bg-primary/10 border border-primary/20 hover:bg-primary/15 px-2.5 py-0.5 rounded-md transition-all active:scale-95 cursor-pointer shadow-xs"
                        title="Edit Party Details"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Edit Party</span>
                      </button>
                    )}
                    {selectedParty.connection_status === 'CONNECTED' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Connected Ledger
                      </span>
                    ) : selectedParty.connection_status === 'PENDING' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        Connection Pending
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setConnectCodeInput(selectedParty.connect_code || '');
                          setSearchResult(null);
                          setShowConnectModal(true);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 bg-primary/10 border border-primary/20 hover:bg-primary/15 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                      >
                        <Link className="w-3 h-3" /> Connect Ledger
                      </button>
                    )}
                  </div>

                  {/* Row 2: Phone, GSTIN, Address */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {selectedParty.phone && (
                      <span className="inline-flex items-center gap-1.5 font-medium text-foreground/80">
                        <Phone className="w-3 h-3 text-muted-foreground" />
                        <span>{selectedParty.phone}</span>
                      </span>
                    )}
                    {selectedParty.gstin && (
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded border border-border">
                        <FileText className="w-3 h-3" />
                        <span>{selectedParty.gstin}</span>
                      </span>
                    )}
                    {selectedParty.address && (
                      <span className="hidden md:inline-flex items-center gap-1 text-muted-foreground truncate max-w-[240px]" title={selectedParty.address}>
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span>{selectedParty.address}</span>
                      </span>
                    )}
                  </div>

                  {/* Row 3: WA Alert Toggle & Meta stats */}
                  <div className="flex items-center gap-3 text-xs flex-wrap pt-0.5">
                    {selectedParty.phone && (
                      <button
                        type="button"
                        onClick={async () => {
                          const currentVal = selectedParty.whatsapp_alerts_enabled !== 0 && selectedParty.whatsapp_alerts_enabled !== false;
                          const nextVal = !currentVal;
                          try {
                            if (window.electronAPI?.dbUpdateParty) {
                              await window.electronAPI.dbUpdateParty({
                                party_id: selectedParty.party_id,
                                name: selectedParty.name,
                                phone: selectedParty.phone || null,
                                address: selectedParty.address || null,
                                gstin: selectedParty.gstin || null,
                                party_type: selectedParty.party_type,
                                custom_category: selectedParty.custom_category || null,
                                notes: selectedParty.notes || null,
                                pricing_tier_id: selectedParty.pricing_tier_id || null,
                                credit_limit: selectedParty.credit_limit || 0,
                                credit_period_enabled: selectedParty.credit_period_enabled,
                                credit_period_days: selectedParty.credit_period_days || 30,
                                credit_period_basis: selectedParty.credit_period_basis,
                                restrict_on_credit_expiry: selectedParty.restrict_on_credit_expiry,
                                whatsapp_alerts_enabled: nextVal,
                              });
                              setSelectedParty(prev => prev ? { ...prev, whatsapp_alerts_enabled: nextVal } : prev);
                              setParties(prev => prev.map(p => p.party_id === selectedParty.party_id ? { ...p, whatsapp_alerts_enabled: nextVal } : p));
                              showStatus(`WhatsApp alerts ${nextVal ? 'enabled' : 'disabled'} for ${selectedParty.name}`, 'success');
                            }
                          } catch (err) {
                            showStatus('Failed to update party WhatsApp alert setting', 'error');
                          }
                        }}
                        className={clsx(
                          "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md border transition-all cursor-pointer select-none",
                          selectedParty.whatsapp_alerts_enabled !== 0 && selectedParty.whatsapp_alerts_enabled !== false
                            ? "bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                            : "bg-muted/40 hover:bg-muted text-muted-foreground border-border hover:text-foreground"
                        )}
                        title="Click to toggle WhatsApp alerts for this party"
                      >
                        <WhatsAppIcon className="w-3 h-3 fill-current" />
                        <span>WA Alerts: {selectedParty.whatsapp_alerts_enabled !== 0 && selectedParty.whatsapp_alerts_enabled !== false ? 'ON' : 'OFF'}</span>
                      </button>
                    )}

                    <span className="text-[11px] text-muted-foreground">
                      {ledger.length} {ledger.length === 1 ? 'entry' : 'entries'}
                      {selectedParty.last_transaction_date ? ` · Last: ${formatDate(selectedParty.last_transaction_date)}` : ''}
                    </span>

                    {selectedParty.credit_limit != null && selectedParty.credit_limit > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        Limit: <span className="font-mono font-medium">₹{selectedParty.credit_limit.toLocaleString()}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Financial Balance Cards */}
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
                          title="Click to filter transactions by GST Balance"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                              <FileText className="w-3 h-3 text-sky-500" /> GST
                            </span>
                            <span className={clsx(
                              "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded font-mono",
                              activeGstBal > 0 ? "bg-rose-500/10 text-rose-500" : activeGstBal < 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
                            )}>
                              {activeGstBal > 0 ? tLabels.receivable : activeGstBal < 0 ? tLabels.payable : 'Settled'}
                            </span>
                          </div>
                          <p className="text-sm font-black font-mono tracking-tight text-foreground">
                            ₹{Math.abs(activeGstBal).toFixed(2)}
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
                            ₹{Math.abs(activeEstimateBal).toFixed(2)}
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
                            ₹{Math.abs(activeBal).toFixed(2)}
                          </p>
                        </button>
                      </div>
                    );
                  }

                  // If ONLY ONE is on ("if one then view one")
                  const singleBal = showOnlyEstimate ? activeEstimateBal : (showOnlyGst ? activeGstBal : activeBal);
                  const singleLabel = showOnlyEstimate ? 'Estimate' : (showOnlyGst ? 'GST' : 'Net Total');
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
                          ₹{Math.abs(singleBal).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* ── Ledger Toolbar (Date Range Filter & PDF Download) ── */}
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
                    GST ({gstEntriesCount})
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

          {/* Overdue Warning Banner */}
          {selectedParty.has_overdue && (
            <div className="shrink-0 px-5 py-3 bg-rose-500/10 border-b border-rose-500/20 text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 animate-pulse shrink-0" />
                <div>
                  <span className="font-bold">Overdue Payment Warning: </span>
                  <span>
                    This customer has {selectedParty.overdue_bills_count || 'pending'} overdue credit bill(s) totaling ₹{Number(selectedParty.overdue_amount || 0).toLocaleString('en-IN')}.
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
                        {tLabels.paid || 'Gave Cash'} (Gave / Sale ₹)
                      </th>
                      <th className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400 font-extrabold bg-emerald-500/5 border-r border-border/40">
                        {tLabels.received || 'Got Cash'} (Got / Payment ₹)
                      </th>
                      <th className="py-3 px-4 text-right font-extrabold">Running Bal (₹)</th>
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
                            ₹{Math.abs(statementData.openingBalance).toFixed(2)}
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
                                    GST
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
                            {entry.credit_amount > 0 ? `₹${entry.credit_amount.toFixed(2)}` : <span className="text-muted-foreground/30 font-normal">—</span>}
                          </td>

                          {/* Got / Payment Amount (Green) */}
                          <td className="py-3 px-4 text-right font-mono font-black text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 border-r border-border/40">
                            {entry.debit_amount > 0 ? `₹${entry.debit_amount.toFixed(2)}` : <span className="text-muted-foreground/30 font-normal">—</span>}
                          </td>

                          {/* Running Balance */}
                          <td className="py-3 px-4 text-right">
                            {(() => {
                              const runBal = (entry as any).contextRunningBalance !== undefined ? (entry as any).contextRunningBalance : entry.running_balance;
                              return (
                                <>
                                  <span className={clsx(
                                    "font-mono font-black text-sm block",
                                    runBal > 0 ? "text-rose-600 dark:text-rose-400" :
                                    runBal < 0 ? "text-emerald-600 dark:text-emerald-400" :
                                    "text-muted-foreground"
                                  )}>
                                    ₹{Math.abs(runBal).toFixed(2)}
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
                                      payment_method: (entry.payment_method as any) || 'CASH',
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
                            ₹{totalCreditSum.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-r border-border/40">
                            ₹{totalDebitSum.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <span className={clsx(
                              "font-mono font-black text-sm block",
                              closingBal > 0 ? "text-rose-600 dark:text-rose-400" :
                              closingBal < 0 ? "text-emerald-600 dark:text-emerald-400" :
                              "text-foreground"
                            )}>
                              ₹{Math.abs(closingBal).toFixed(2)}
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
                                GST
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
                          {isCreditSale ? '+' : '−'}₹{amount.toFixed(2)}
                        </p>
                        <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                          Bal: ₹{Math.abs((entry as any).contextRunningBalance !== undefined ? (entry as any).contextRunningBalance : entry.running_balance).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
