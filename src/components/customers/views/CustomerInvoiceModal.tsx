import { localizeTaxText } from '../../../utils/localization/storeProfile';
import React from 'react';
import { Modal } from '../../ui/Modal';
import { renderPaymentMethodBadge, renderBillTypeBadge, formatDateTime } from '../customerFormat';
import { formatCurrency } from '../../../utils/pricing/money';
import clsx from 'clsx';
import { Loader2, Edit3 } from 'lucide-react';
import { hasPermission } from '../../../utils/security/permissions';
import { useAuthStore } from '../../../store/authStore';
import type { InvoiceRecord } from '../customerTypes';
import type { InvoiceItemRow } from '../customerTypes';

export interface CustomerInvoiceModalProps {
  handleDownloadInvoiceCsv: (inv: InvoiceRecord) => Promise<void>;
  handleEditBillFromCustomerModal: () => Promise<void>;
  invoiceBusyId: string | null;
  invoiceItems: InvoiceItemRow[];
  itemsLoading: boolean;
  loyaltyEnabled: boolean;
  setViewingInvoice: React.Dispatch<React.SetStateAction<InvoiceRecord | null>>;
  /** Rendered only while an invoice is open. */
  viewingInvoice: InvoiceRecord;
}

/** Invoice detail dialog opened from a customer's purchases: items, totals and edit / print / download actions. */
export function CustomerInvoiceModal({
  handleDownloadInvoiceCsv, handleEditBillFromCustomerModal, invoiceBusyId, invoiceItems, itemsLoading,
  loyaltyEnabled, setViewingInvoice, viewingInvoice,
}: CustomerInvoiceModalProps) {
  const isCreditBill = viewingInvoice.is_credit_bill ?? viewingInvoice.payment_method === 'CREDIT';
  const outstanding = viewingInvoice.outstanding_amount ?? viewingInvoice.balance_amount ?? 0;
  return (
    <Modal isOpen={!!viewingInvoice} className="max-w-6xl w-full" onClose={() => setViewingInvoice(null)} title={`Invoice Detail #${viewingInvoice.invoice_number}`}>
      <div className="space-y-4 select-none w-full">
        <div className="flex items-center justify-between bg-muted/40 p-3.5 rounded-xl border border-border">
          <div>
            <p className="text-[10px] uppercase font-bold text-muted-foreground">Invoice Number</p>
            <p className="text-base font-black text-foreground font-mono">#{viewingInvoice.invoice_number}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {viewingInvoice.payment_method && renderPaymentMethodBadge(viewingInvoice.payment_method)}
              {viewingInvoice.invoice_type && renderBillTypeBadge(viewingInvoice)}
              {viewingInvoice.due_date && (
                <span className="text-[10px] font-mono font-bold text-muted-foreground bg-background px-2 py-0.5 rounded-md border border-border">
                  Due: {viewingInvoice.due_date}
                </span>
              )}
              {viewingInvoice.credit_status === 'OVERDUE' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500 text-white shadow-xs">
                  ⚠️ OVERDUE ({viewingInvoice.overdue_days != null ? `${viewingInvoice.overdue_days}d` : ''})
                </span>
              )}
              {viewingInvoice.credit_status === 'DUE_SOON' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                  ⏰ Due in {viewingInvoice.remaining_days}d
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase font-bold text-muted-foreground">Date & Time</p>
            <p className="text-xs font-bold text-foreground">{formatDateTime(viewingInvoice.created_at)}</p>
          </div>
        </div>

        {/* Purchased Items Table */}
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="bg-muted/60 px-4 py-2 border-b border-border text-xs font-bold text-muted-foreground flex justify-between">
            <span>Items Purchased</span>
            <span>{invoiceItems.length} item{invoiceItems.length !== 1 ? 's' : ''}</span>
          </div>
          {itemsLoading ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Loading invoice line items...</div>
          ) : invoiceItems.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">No itemized details recorded for this invoice.</div>
          ) : (
            <div className="divide-y divide-border">
              {invoiceItems.map((item, idx) => (
                <div key={item.item_id || idx} className="p-3 text-xs flex items-center justify-between">
                  <div>
                    <p className="font-bold text-foreground">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {item.quantity} {item.uom || 'Pcs'} × {formatCurrency(item.unit_price)}
                      {Number(item.tax_amount) > 0 && <span className="ml-2 text-emerald-600 font-semibold">(Tax: +{formatCurrency(item.tax_amount)})</span>}
                    </p>
                  </div>
                  <div className="text-right font-bold text-foreground font-mono">
                    {formatCurrency(item.total)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Financial Summary Box */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-2 text-xs">
          {/* Subtotal */}
          <div className="flex justify-between text-muted-foreground font-semibold">
            <span>Subtotal:</span>
            <span className="font-mono text-foreground font-bold">
              {formatCurrency(viewingInvoice.subtotal ?? invoiceItems.reduce((s, i) => s + (Number(i.total) || 0), 0))}
            </span>
          </div>

          {/* Total Tax */}
          <div className="flex justify-between text-emerald-600 font-bold">
            <span>Tax Total ({localizeTaxText("GST")}):</span>
            <span className="font-mono">
              +{formatCurrency(viewingInvoice.tax_total ?? invoiceItems.reduce((s, i) => s + (Number(i.tax_amount) || 0), 0))}
            </span>
          </div>

          {/* Bill Discount */}
          {Number(viewingInvoice.discount_total || viewingInvoice.discount_value) > 0 && (
            <div className="flex justify-between text-amber-600 font-bold">
              <span>Trade Discount:</span>
              <span className="font-mono">-{formatCurrency(viewingInvoice.discount_total || viewingInvoice.discount_value || 0)}</span>
            </div>
          )}

          {/* Scrap Deduction */}
          {Number(viewingInvoice.scrap_deduction) > 0 && (
            <div className="flex justify-between text-purple-600 font-bold">
              <span>Scrap Deduction {viewingInvoice.scrap_invoice_number ? `(#${viewingInvoice.scrap_invoice_number})` : ''}:</span>
              <span className="font-mono">-{formatCurrency(viewingInvoice.scrap_deduction || 0)}</span>
            </div>
          )}

          {/* Return Deduction */}
          {Number(viewingInvoice.return_deduction) > 0 && (
            <div className="flex justify-between text-rose-600 font-bold">
              <span>Return Deduction {viewingInvoice.return_invoice_number ? `(#${viewingInvoice.return_invoice_number})` : ''}:</span>
              <span className="font-mono">-{formatCurrency(viewingInvoice.return_deduction || 0)}</span>
            </div>
          )}

          {/* Loyalty Points Earned / Redeemed */}
          {loyaltyEnabled && (viewingInvoice.points_earned ?? 0) > 0 && (
            <div className="flex justify-between text-emerald-600 font-bold">
              <span>Loyalty Points Earned:</span>
              <span>+{(Number(viewingInvoice.points_earned) || 0).toFixed(0)} pts</span>
            </div>
          )}
          {loyaltyEnabled && (viewingInvoice.points_redeemed ?? 0) > 0 && (
            <div className="flex justify-between text-amber-600 font-bold">
              <span>Loyalty Points Discount:</span>
              <span className="font-mono">-{formatCurrency(viewingInvoice.points_redeemed_discount)}</span>
            </div>
          )}

          {/* Grand Total */}
          <div className="flex justify-between font-extrabold text-base pt-2.5 border-t border-border">
            <span>Grand Total:</span>
            <span className="text-primary font-mono">{formatCurrency(viewingInvoice.grand_total)}</span>
          </div>

          {/* Received & Balance Breakdown */}
          {(Number(viewingInvoice.received_amount) > 0 || isCreditBill) && (
            <div className="pt-2 border-t border-border/60 grid grid-cols-2 gap-2 text-[11px]">
              {Number(viewingInvoice.received_amount) > 0 && (
                <div className="bg-muted/40 p-2 rounded-lg border border-border/40">
                  <span className="text-muted-foreground font-semibold block">Received Amount:</span>
                  <span className="font-bold text-foreground font-mono">{formatCurrency(viewingInvoice.received_amount || 0)}</span>
                </div>
              )}
              {isCreditBill ? (
                <div className="bg-muted/40 p-2 rounded-lg border border-border/40">
                  <span className="text-muted-foreground font-semibold block">
                    {Number(outstanding) < 0 ? 'Advance Credit:' : 'Outstanding Balance:'}
                  </span>
                  <span className={clsx("font-bold font-mono", Number(outstanding) > 0 ? "text-amber-600" : "text-emerald-600")}>
                    {formatCurrency(Math.abs(outstanding))}
                  </span>
                </div>
              ) : (Number(viewingInvoice.received_amount) > Number(viewingInvoice.grand_total)) ? (
                <div className="bg-muted/40 p-2 rounded-lg border border-border/40">
                  <span className="text-muted-foreground font-semibold block">Change Returned:</span>
                  <span className="font-bold font-mono text-emerald-600">
                    {formatCurrency(Number(viewingInvoice.received_amount) - Number(viewingInvoice.grand_total))}
                  </span>
                </div>
              ) : null}
            </div>
          )}

          {/* Bill Actions: Download CSV / Edit */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => handleDownloadInvoiceCsv(viewingInvoice)}
              disabled={invoiceBusyId === viewingInvoice.invoice_id}
              className="px-4 py-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {invoiceBusyId === viewingInvoice.invoice_id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              )} Download CSV
            </button>
            {hasPermission(useAuthStore.getState(), 'sales.edit') && (
              <button
                type="button"
                onClick={handleEditBillFromCustomerModal}
                className="px-4 py-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5" /> Edit Bill
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
