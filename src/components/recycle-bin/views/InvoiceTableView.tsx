import { Trash2, RotateCcw, Eye } from 'lucide-react';
import { formatAmount } from '../../../utils/pricing/money';
import { timeAgo, type DeletedInvoice } from '../recycleBinTypes';

export interface InvoiceTableViewProps {
  askHardDeleteInvoice: (inv: DeletedInvoice) => void;
  filteredInvoices: DeletedInvoice[];
  handleInspectInvoice: (inv: DeletedInvoice) => Promise<void>;
  isAdmin: boolean;
  restoreInvoice: (invoice_id: string, invoice_number: string | null) => Promise<void>;
}

/** Table view of deleted sales bills with inspect, restore and permanent-delete actions. */
export function InvoiceTableView({
  askHardDeleteInvoice, filteredInvoices, handleInspectInvoice, isAdmin, restoreInvoice,
}: InvoiceTableViewProps) {
  return (
            <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider font-bold">
                  <tr>
                    <th className="px-4 py-3">Invoice Number</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3 text-right">Grand Total</th>
                    <th className="px-4 py-3">Deleted</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-medium">
                  {filteredInvoices.map((inv) => (
                    <tr key={inv.invoice_id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-foreground">{inv.invoice_number}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground">{inv.customer_name || 'Walk-in Customer'}</p>
                        {inv.customer_phone && <p className="text-[11px] font-mono text-muted-foreground">{inv.customer_phone}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          {inv.invoice_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 uppercase text-[11px] text-muted-foreground">{inv.payment_method}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                        ₹{formatAmount(inv.grand_total)}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-rose-500 font-semibold">{timeAgo(inv.updated_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleInspectInvoice(inv)}
                            className="p-1.5 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                            title="Inspect"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => restoreInvoice(inv.invoice_id, inv.invoice_number)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white border border-emerald-500/20 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restore</span>
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => askHardDeleteInvoice(inv)}
                              className="p-1.5 rounded-lg border border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white cursor-pointer"
                              title="Delete Permanently"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
  );
}
