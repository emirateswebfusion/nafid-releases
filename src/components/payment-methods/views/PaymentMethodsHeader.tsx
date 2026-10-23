import { Wallet, Plus } from 'lucide-react';
import { RedCrossButton } from '../../ui/RedCrossButton';
import type { PaymentMethodsState } from '../hooks/usePaymentMethodsState';

export interface PaymentMethodsHeaderProps {
  isOwner: boolean;
  onClose: () => void;
  openAdd: () => void;
  pmState: PaymentMethodsState;
}

/** Screen header: title and subtitle for the current view, add / back actions, close. */
export function PaymentMethodsHeader({
  isOwner, onClose, openAdd, pmState,
}: PaymentMethodsHeaderProps) {
  const { editing, selectedSource, setView, view } = pmState;
  return (
    <header className="shrink-0 z-20 border-b border-border/80 bg-card/80 backdrop-blur-md shadow-sm">
      <div className="flex items-center justify-between gap-4 px-5 py-3 select-none">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary via-indigo-600 to-violet-700 flex items-center justify-center shadow-lg shadow-primary/25 ring-2 ring-primary/20 shrink-0">
            <Wallet className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-foreground tracking-tight">
              {view === 'list' && 'Payment Methods'}
              {view === 'form' && (editing ? `Edit "${editing.name}"` : 'Link Payment Method')}
              {view === 'transactions' && (selectedSource ? selectedSource.name : 'Transaction Ledger')}
            </h1>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              {view === 'list' && 'Configure and audit bank accounts, UPI IDs, credit cards & POS payment sources'}
              {view === 'form' && (editing ? 'Update channel identifiers, holder info, and sorting preferences.' : 'Configure a bank account, UPI ID, or card portal for customer payments.')}
              {view === 'transactions' && (selectedSource ? `Viewing full ledger & transaction logs for ${selectedSource.name}` : 'Detailed transaction logs')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isOwner && view === 'list' && (
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25 font-bold hover:bg-primary/95 transition-all duration-200 active:scale-95 py-2.5 px-4 text-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Link Payment Method</span>
            </button>
          )}
          <RedCrossButton
            onClick={() => {
              if (view !== 'list') {
                setView('list');
              } else {
                onClose();
              }
            }}
            title={view !== 'list' ? 'Back to Payment Methods' : 'Close'}
          />
        </div>
      </div>
    </header>
  );
}
