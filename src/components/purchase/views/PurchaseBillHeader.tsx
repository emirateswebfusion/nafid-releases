import { Receipt } from 'lucide-react';
import { RedCrossButton } from '../../ui/RedCrossButton';
import type { PurchaseBill } from '../purchaseTypes';

export interface PurchaseBillHeaderProps {
  showAddForm: boolean;
  editingBill: PurchaseBill | null;
  billsCount: number;
  onClose: () => void;
  onCloseForm: () => void;
}

export function PurchaseBillHeader({
  showAddForm,
  editingBill,
  billsCount,
  onClose,
  onCloseForm,
}: PurchaseBillHeaderProps) {
  return (
    <header className="shrink-0 z-10 border-b border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-4 px-5 py-3 select-none">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
            <Receipt className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">
                {showAddForm ? (editingBill ? `Edit Purchase Bill - ${editingBill.bill_number}` : 'New Purchase Bill') : 'Purchase Bills'}
              </h1>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            </div>
            <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
              {showAddForm ? 'Record a purchase entry' : `${billsCount} purchase bills`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <RedCrossButton
            onClick={showAddForm ? onCloseForm : onClose}
            title="Close"
          />
        </div>
      </div>
    </header>
  );
}
