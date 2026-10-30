import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import { Loader2, RotateCcw, X } from 'lucide-react';
import { formatAmount } from '../../../utils/pricing/money';
import { formatDate, type DeletedInvoice } from '../recycleBinTypes';
import type { RecycleBinState } from '../hooks/useRecycleBinState';

export interface InvoiceInspectionModalProps {
  inspectingInvoice: DeletedInvoice;
  restoreInvoice: (invoice_id: string, invoice_number: string | null) => void;
  rb: RecycleBinState;
}

/** Deleted bill inspection modal: bill metadata, cached line items and restore to sales history. */
export function InvoiceInspectionModal({ inspectingInvoice, restoreInvoice, rb }: InvoiceInspectionModalProps) {
  const { inspectingItems, loadingItems, setInspectingInvoice } = rb;
  return (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full flex flex-col max-h-[85vh] overflow-hidden text-foreground">
            {/* Header */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-foreground font-mono">
                    {inspectingInvoice.invoice_number}
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-500 font-bold uppercase">
                    Deleted
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {inspectingInvoice.customer_name || 'Walk-in customer'}
                  {inspectingInvoice.customer_phone ? ' · ' + inspectingInvoice.customer_phone : ''}
                </p>
              </div>
              <button
                onClick={() => setInspectingInvoice(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs bg-muted/30 p-3 rounded-xl border border-border/60">
                <div>
                  <span className="text-muted-foreground text-[11px]">Original Date:</span>
                  <p className="font-semibold text-foreground font-mono">{formatDate(inspectingInvoice.created_at)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-[11px]">Deleted At:</span>
                  <p className="font-semibold text-rose-400 font-mono">{formatDate(inspectingInvoice.deleted_at || inspectingInvoice.updated_at)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-[11px]">Payment Mode:</span>
                  <p className="font-semibold text-foreground uppercase">{inspectingInvoice.payment_method}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-[11px]">Grand Total:</span>
                  <p className="font-bold text-foreground text-sm font-mono">{getCurrencyPrefix()}{formatAmount(inspectingInvoice.grand_total)}</p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Itemized Products</h4>
                {loadingItems ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground gap-2">
                    <Loader2 size={16} className="animate-spin text-primary" />
                    <span className="text-xs font-semibold">Loading bill items...</span>
                  </div>
                ) : inspectingItems.length === 0 ? (
                  <div className="text-center py-6 text-xs text-muted-foreground bg-muted/20 rounded-xl">
                    No individual item details cached. Grand total amount will be restored.
                  </div>
                ) : (
                  <div className="border border-border/60 rounded-xl overflow-hidden divide-y divide-border/40">
                    {inspectingItems.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between px-3 py-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground truncate">{item.name || item.product_id}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            Qty: {item.quantity} × {getCurrencyPrefix()}{formatAmount(item.unit_price || item.rate || 0)}
                          </p>
                        </div>
                        <span className="font-bold text-foreground font-mono ml-3">
                          {getCurrencyPrefix()}{formatAmount(item.total || (item.quantity * (item.unit_price || 0)))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-muted/20">
              <button
                onClick={() => setInspectingInvoice(null)}
                className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const inv = inspectingInvoice;
                  setInspectingInvoice(null);
                  restoreInvoice(inv.invoice_id, inv.invoice_number);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-[0.98]"
              >
                <RotateCcw size={13} />
                <span>Restore Bill to Sales History</span>
              </button>
            </div>
          </div>
        </div>
  );
}
