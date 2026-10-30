import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import { Trash2, RotateCcw, Eye } from 'lucide-react';
import { formatAmount } from '../../../utils/pricing/money';
import { timeAgo, type DeletedInvoice } from '../recycleBinTypes';

export interface InvoiceCardsViewProps {
  askHardDeleteInvoice: (inv: DeletedInvoice) => void;
  filteredInvoices: DeletedInvoice[];
  handleInspectInvoice: (inv: DeletedInvoice) => Promise<void>;
  isAdmin: boolean;
  restoreInvoice: (invoice_id: string, invoice_number: string | null) => Promise<void>;
}

/** Card grid of deleted sales bills with inspect, restore and permanent-delete actions. */
export function InvoiceCardsView({
  askHardDeleteInvoice, filteredInvoices, handleInspectInvoice, isAdmin, restoreInvoice,
}: InvoiceCardsViewProps) {
  return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredInvoices.map((inv) => (
                <div
                  key={inv.invoice_id}
                  className="bg-card border border-border/80 hover:border-rose-500/30 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all duration-200 flex flex-col justify-between group"
                >
                  {/* Top: Invoice No + Type + Deleted Time */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-sm text-foreground tracking-tight">
                            {inv.invoice_number}
                          </span>
                        </div>
                        <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/50">
                          {inv.invoice_type?.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <span className="text-[10px] font-medium text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20 shrink-0">
                        {timeAgo(inv.updated_at)}
                      </span>
                    </div>

                    {/* Customer Info */}
                    <div className="mt-3 pt-3 border-t border-border/60">
                      <p className="text-xs font-bold text-foreground truncate">
                        {inv.customer_name || 'Walk-in Customer'}
                      </p>
                      {inv.customer_phone ? (
                        <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                          {inv.customer_phone}
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground/60 italic mt-0.5">No phone provided</p>
                      )}
                    </div>

                    {/* Date & Payment Method */}
                    <div className="mt-2 text-[11px] text-muted-foreground flex items-center justify-between">
                      <span>Billed: {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : 'N/A'}</span>
                      <span className="font-semibold text-foreground/80 uppercase text-[10px] bg-muted px-1.5 py-0.2 rounded">
                        {inv.payment_method || 'CASH'}
                      </span>
                    </div>

                    {/* Grand Total */}
                    <div className="mt-3 pt-3 border-t border-border/60 flex items-baseline justify-between">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Value</span>
                      <span className="text-base font-black font-mono text-foreground">
                        {getCurrencyPrefix()}{formatAmount(inv.grand_total)}
                      </span>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center gap-2">
                    <button
                      onClick={() => handleInspectInvoice(inv)}
                      className="flex-1 py-1.5 px-2.5 rounded-xl border border-border bg-background hover:bg-muted text-xs font-bold text-muted-foreground hover:text-foreground transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect</span>
                    </button>
                    <button
                      onClick={() => restoreInvoice(inv.invoice_id, inv.invoice_number)}
                      className="flex-1 py-1.5 px-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500 text-emerald-600 hover:text-white border border-emerald-500/25 text-xs font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => askHardDeleteInvoice(inv)}
                        title="Delete Permanently"
                        className="p-1.5 rounded-xl border border-rose-500/25 bg-rose-500/5 text-rose-500 hover:bg-rose-500 hover:text-white transition-all active:scale-[0.98] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
  );
}
