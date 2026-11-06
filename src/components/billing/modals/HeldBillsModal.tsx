import { storeDateTime } from '../../../utils/time/dateDisplay';
import { getStoreLocale } from '../../../utils/localization/storeProfile';
import type * as B from '../billingTypes';
import { PauseCircle, Play, Trash } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { formatCurrency } from '../BillingConstants';
import { parseUTCDate } from '../../../utils/print/receiptGenerator';
import { getStoreTimezone } from '../../../utils/time/timezoneHelper';

interface HeldBillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  heldBills: B.HeldBill[];
  heldBillsLoading: boolean;
  handleRecallHeldBill: (bill: B.HeldBill) => void;
  handleReleaseHeldBill: (billId: string) => void;
}

export function HeldBillsModal({
  isOpen,
  onClose,
  heldBills,
  heldBillsLoading,
  handleRecallHeldBill,
  handleReleaseHeldBill,
}: HeldBillsModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5 font-bold text-foreground">
          <PauseCircle className="w-5 h-5 text-amber-500" />
          <span>Held Bills / Drafts ({heldBills.length})</span>
        </div>
      }
    >
      <div className="space-y-3 min-w-[540px] max-w-2xl text-foreground">
        {heldBillsLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : heldBills.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground space-y-2">
            <PauseCircle className="w-10 h-10 mx-auto text-muted-foreground/40" />
            <p className="font-bold text-sm text-foreground/80">No Held Bills</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              When you click <strong className="text-foreground">Hold (F3)</strong> on active items in cart, they will be saved here so you can resume them anytime within 24 hours.
            </p>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto space-y-2.5 pr-1">
            {heldBills.map((bill) => {
              const billId = bill.invoice_id || bill.id;
              const invNum = bill.invoice_number || bill.id?.substring(0, 8) || 'HLD';
              const createdTime = bill.created_at
                ? storeDateTime(parseUTCDate(bill.created_at), getStoreLocale(), { timeZone: getStoreTimezone() })
                : (bill.heldAt ? storeDateTime(parseUTCDate(bill.heldAt), getStoreLocale(), { timeZone: getStoreTimezone() }) : '');
              const totalAmt = Number(bill.grand_total) || 0;
              const itemCount = Array.isArray(bill.items) ? bill.items.length : 0;
              const customer = bill.customer_name || bill.customerName || (bill.customer_phone || bill.customerPhone ? (bill.customer_phone || bill.customerPhone) : 'Walk-in Customer');

              return (
                <div key={billId} className="flex items-center justify-between p-3.5 bg-card border border-border/80 hover:border-amber-500/50 rounded-2xl transition-all duration-200 shadow-2xs group gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-foreground">{invNum}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">HELD</span>
                      <span className="text-xs text-muted-foreground">{createdTime}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span>👤 <strong className="text-foreground/80">{customer}</strong></span>
                      {itemCount > 0 && <span>• {itemCount} Item{itemCount > 1 ? 's' : ''}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-base font-black text-foreground">{formatCurrency(totalAmt)}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleRecallHeldBill(bill)}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                        title="Resume / Recall Bill"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Take / Resume</span>
                      </button>
                      <button
                        onClick={() => handleReleaseHeldBill(billId as string)}
                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all active:scale-95 cursor-pointer"
                        title="Discard / Delete Held Bill"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
