import { Handshake, ArrowLeft, Upload, Link, UserPlus, PlusCircle, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { RedCrossButton } from '../../ui/RedCrossButton';
import type { PartyManagerState } from '../hooks/usePartyManagerState';

export interface PartyManagerHeaderProps {
  isOwner: boolean;
  loadParties: () => Promise<unknown>;
  onBackToCustomers: (() => void) | undefined;
  onClose: () => void;
  openTxForm: (transactionType?: "CREDIT" | "DEBIT") => void;
  resetPartyForm: () => void;
  pm: PartyManagerState;
  onResyncParties?: () => Promise<void>;
  isResyncingParties?: boolean;
}

/** Ledger screen header: title and counts, back / close, and the upload / connect / add party actions. */
export function PartyManagerHeader({
  isOwner, loadParties, onBackToCustomers, onClose, openTxForm, resetPartyForm, pm, onResyncParties, isResyncingParties,
}: PartyManagerHeaderProps) {
  const { editingParty, editingTx, editReturnView, parties, selectedParty, setShowConnectModal, setShowUploadModal, setView, view } = pm;
  return (
    <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 px-5 py-3">

          {view === 'list' && (
            <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
              <Handshake className="w-4 h-4" />
            </div>
          )}

        {/* Title / Breadcrumb */}
        <div className="flex-1 min-w-0">
          {view === 'ledger' && selectedParty ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => { setView('list'); loadParties(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted/80 hover:bg-muted text-xs font-bold text-muted-foreground hover:text-foreground transition-all active:scale-95 cursor-pointer shrink-0 border border-border"
                title="Back to Party Directory"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Parties</span>
              </button>
              <span className="text-muted-foreground/30 font-bold shrink-0">/</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-black text-foreground truncate">{selectedParty.name}</h1>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                </div>
                <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5 truncate">
                  Ledger Statement &amp; Balance Sheet
                </p>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-foreground truncate">
                  {view === 'list'
                    ? 'Ledger'
                    : view === 'party_form'
                    ? (editingParty ? 'Edit Party' : 'New Party')
                    : editingTx
                    ? 'Edit Transaction'
                    : 'New Transaction'}
                </h1>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              </div>
              <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
                {view === 'list'
                  ? `${parties.length} ${parties.length === 1 ? 'party' : 'parties'} · Track balances & payments`
                  : view === 'party_form'
                  ? 'Fill in party details below'
                  : `Recording transaction for ${selectedParty?.name || 'Party'}`}
              </p>
            </div>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 shrink-0">
          {view === 'list' && isOwner && (
            <>
              {onResyncParties && (
                <button
                  type="button"
                  onClick={onResyncParties}
                  disabled={isResyncingParties}
                  className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-50"
                  title="Re-sync parties & ledgers from cloud"
                >
                  <RefreshCw className={clsx("w-4 h-4", isResyncingParties && "animate-spin text-primary")} />
                </button>
              )}
              <button
                onClick={() => setShowUploadModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" /> Upload (CSV/Excel)
              </button>
              <button
                onClick={() => setShowConnectModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <Link className="w-3.5 h-3.5" /> Connect Party
              </button>
              <button
                onClick={() => { resetPartyForm(); setView('party_form'); }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" /> Add Party
              </button>
            </>
          )}

          {view === 'ledger' && isOwner && (
            <button
              onClick={() => openTxForm('CREDIT')}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" /> Add Tx
            </button>
          )}

          <RedCrossButton
            onClick={onBackToCustomers ? onBackToCustomers : (view === 'list' ? onClose : view === 'ledger' ? () => { setView('list'); loadParties(); } : () => { setView(view === 'party_form' ? (editReturnView === 'ledger' && selectedParty ? 'ledger' : 'list') : 'ledger'); resetPartyForm(); })}
            title="Close"
          />
        </div>
      </div>
    </header>
  );
}
