import type * as B from '../billingTypes';
import { Recycle } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { formatCurrency } from '../BillingConstants';
import { parseUTCDate } from '../../../utils/print/receiptGenerator';
import { getStoreTimezone } from '../../../utils/time/timezoneHelper';

interface ScrapInvoiceViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  data: B.ScrapViewData | null;
}

export function ScrapInvoiceViewModal({
  isOpen,
  onClose,
  loading,
  data,
}: ScrapInvoiceViewModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5 font-bold text-foreground">
          <Recycle className="w-5 h-5 text-orange-500" />
          <span>Scrap Invoice {data?.invoiceNumber || ''}</span>
        </div>
      }
    >
      <div className="space-y-4 min-w-[520px] text-foreground">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
          </div>
        ) : data ? (
          <>
            <div className="flex items-center justify-between p-4 bg-orange-500/5 border border-orange-500/20 rounded-2xl">
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Total Deduction</p>
                <p className="text-2xl font-black text-orange-500 mt-1">{formatCurrency(data.totalAmount)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Invoice</p>
                <p className="text-sm font-bold text-foreground mt-1">{data.invoiceNumber}</p>
              </div>
            </div>

            <div className="border border-border rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-2.5 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border bg-muted/40">
                <div className="col-span-4">Category</div>
                <div className="col-span-2 text-right">Qty</div>
                <div className="col-span-2 text-right">Rate</div>
                <div className="col-span-2 text-right">Total</div>
                <div className="col-span-2 text-center">Date</div>
              </div>
              <div className="divide-y divide-border max-h-[320px] overflow-y-auto">
                {data.transactions.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-sm">No transactions found</div>
                ) : data.transactions.map((tx) => (
                  <div key={tx.transaction_id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm bg-card hover:bg-muted/20 transition-colors">
                    <div className="col-span-4 font-bold text-foreground/90 truncate">{tx.scrap_category_name || 'Unknown'}</div>
                    <div className="col-span-2 text-right font-semibold">{Number(tx.quantity).toFixed(3)}</div>
                    <div className="col-span-2 text-right font-semibold">{formatCurrency(tx.rate)}</div>
                    <div className="col-span-2 text-right font-bold text-orange-600">{formatCurrency(tx.total_amount)}</div>
                    <div className="col-span-2 text-center text-xs text-muted-foreground">{parseUTCDate(tx.created_at).toLocaleDateString('en-IN', { timeZone: getStoreTimezone() })}</div>
                  </div>
                ))}
              </div>
            </div>

            {data.transactions.length > 0 && (
              <div className="flex justify-end pt-1">
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground font-semibold">Total Items:</span>
                  <span className="font-bold">{data.transactions.length}</span>
                  <span className="text-muted-foreground/40">|</span>
                  <span className="text-muted-foreground font-semibold">Grand Total:</span>
                  <span className="font-black text-lg text-orange-600">{formatCurrency(data.totalAmount)}</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="py-8 text-center text-muted-foreground text-sm">No data found for this scrap invoice</div>
        )}

        <div className="flex justify-end pt-2 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground border border-border rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
