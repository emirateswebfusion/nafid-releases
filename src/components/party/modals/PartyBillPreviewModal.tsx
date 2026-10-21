import React from 'react';
import { Receipt, Loader2, Printer, Edit3, Building2, Phone } from 'lucide-react';
import clsx from 'clsx';
import { Modal } from '../../ui/Modal';
import { formatDateTime } from '../partyHelpers';
import { useAuthStore } from '../../../store/authStore';
import { hasPermission } from '../../../utils/permissions';

export interface PartyBillPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  viewingInvoice: any;
  viewingInvoiceItems: any[];
  viewingLedgerVoucher: any;
  viewingBillLoading: boolean;
  selectedParty: any;
  handlePrintBillInModal: () => void;
  handleEditBillFromModal?: () => void;
}

export const PartyBillPreviewModal: React.FC<PartyBillPreviewModalProps> = ({
  isOpen,
  onClose,
  viewingInvoice,
  viewingInvoiceItems,
  viewingLedgerVoucher,
  viewingBillLoading,
  selectedParty,
  handlePrintBillInModal,
  handleEditBillFromModal,
}) => {
  return (
        <Modal
          isOpen={isOpen}
          className="max-w-6xl w-full"
          onClose={onClose}
          title={
            <div className="flex items-center gap-2 font-bold text-foreground">
              <Receipt className="w-5 h-5 text-primary" />
              <span>
                {viewingInvoice
                  ? `Bill Details #${viewingInvoice.invoice_number}`
                  : viewingLedgerVoucher
                  ? `Payment Voucher #${viewingLedgerVoucher.reference_number || viewingLedgerVoucher.ledger_id.slice(0, 8).toUpperCase()}`
                  : 'Bill Details'}
              </span>
            </div>
          }
        >
          <div className="space-y-4 select-none w-full text-foreground">
            {viewingBillLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm font-bold">Fetching bill details...</p>
              </div>
            ) : viewingInvoice ? (
              /* Render Full Itemized Sales / Scrap Bill */
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between bg-muted/40 p-3.5 rounded-xl border border-border">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Bill / Invoice Number</p>
                      <p className="text-lg font-black text-foreground font-mono">#{viewingInvoice.invoice_number}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                          {String(viewingInvoice.invoice_type || 'GST').replace(/_/g, ' ')}
                        </span>
                        {viewingInvoice.payment_method && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            {viewingInvoice.payment_method}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Date & Time</p>
                      <p className="text-xs font-bold text-foreground">{formatDateTime(viewingInvoice.created_at)}</p>
                    </div>
                  </div>

                  {/* Customer / Party details */}
                  <div className="p-3 bg-card border border-border rounded-xl text-xs space-y-1 flex flex-col justify-center">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">Billed To Customer</p>
                    <p className="font-extrabold text-sm text-foreground">{viewingInvoice.customer_name || selectedParty?.name || 'Walk-in Customer'}</p>
                    {(viewingInvoice.customer_phone || selectedParty?.phone) && (
                      <p className="text-muted-foreground flex items-center gap-1 font-mono">
                        <Phone className="w-3 h-3" /> {viewingInvoice.customer_phone || selectedParty?.phone}
                      </p>
                    )}
                    {(viewingInvoice.customer_gstin || selectedParty?.gstin) && (
                      <p className="text-muted-foreground flex items-center gap-1 font-mono">
                        <Building2 className="w-3 h-3" /> GSTIN: {viewingInvoice.customer_gstin || selectedParty?.gstin}
                      </p>
                    )}
                  </div>
                </div>

                {/* Purchased Line Items */}
                <div className="border border-border rounded-xl overflow-hidden bg-card">
                  <div className="bg-muted/60 px-4 py-2.5 border-b border-border text-xs font-bold text-muted-foreground flex justify-between items-center">
                    <span>Items Purchased</span>
                    <span>{viewingInvoiceItems.length} item{viewingInvoiceItems.length !== 1 ? 's' : ''}</span>
                  </div>
                  {viewingInvoiceItems.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted-foreground">No line items recorded for this bill.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                          <tr>
                            <th className="py-2.5 px-4 font-bold w-12 text-center">#</th>
                            <th className="py-2.5 px-4 font-bold">Item Description</th>
                            <th className="py-2.5 px-4 font-bold text-center">Qty</th>
                            <th className="py-2.5 px-4 font-bold text-right">Unit Price</th>
                            <th className="py-2.5 px-4 font-bold text-right">Tax</th>
                            <th className="py-2.5 px-4 font-bold text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {viewingInvoiceItems.map((item, idx) => (
                            <tr key={item.item_id || idx} className="hover:bg-muted/20 transition-colors">
                              <td className="py-3 px-4 font-mono text-center text-muted-foreground">{idx + 1}</td>
                              <td className="py-3 px-4 font-bold text-foreground">{item.name}</td>
                              <td className="py-3 px-4 font-mono text-center">{item.quantity} {item.uom || 'Pcs'}</td>
                              <td className="py-3 px-4 font-mono text-right">₹{(Number(item.unit_price) || 0).toFixed(2)}</td>
                              <td className="py-3 px-4 font-mono text-right text-emerald-600 font-semibold">
                                {Number(item.tax_amount) > 0 ? `+₹${Number(item.tax_amount).toFixed(2)}` : '—'}
                              </td>
                              <td className="py-3 px-4 font-mono text-right font-bold text-foreground">
                                ₹{(Number(item.total) || (Number(item.quantity) * Number(item.unit_price)) || 0).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Financial Breakdown & Actions */}
                <div className="flex flex-col md:flex-row items-stretch md:items-end justify-between gap-4 pt-2">
                  <div className="flex-1" />
                  <div className="bg-card border border-border rounded-xl p-4 space-y-2 text-xs w-full md:w-80">
                    <div className="flex justify-between text-muted-foreground font-semibold">
                      <span>Subtotal:</span>
                      <span className="font-mono text-foreground font-bold">
                        ₹{Number(viewingInvoice.subtotal || viewingInvoice.grand_total || 0).toFixed(2)}
                      </span>
                    </div>
                    {Number(viewingInvoice.tax_total) > 0 && (
                      <div className="flex justify-between text-emerald-600 font-bold">
                        <span>Tax Total (GST):</span>
                        <span className="font-mono">+₹{Number(viewingInvoice.tax_total).toFixed(2)}</span>
                      </div>
                    )}
                    {Number(viewingInvoice.discount_total || viewingInvoice.discount_value) > 0 && (
                      <div className="flex justify-between text-amber-600 font-bold">
                        <span>Trade Discount:</span>
                        <span className="font-mono">-₹{Number(viewingInvoice.discount_total || viewingInvoice.discount_value).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-extrabold text-base pt-2.5 border-t border-border">
                      <span>Grand Total:</span>
                      <span className="text-primary font-mono">₹{Number(viewingInvoice.grand_total || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Print & Edit buttons */}
                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  {hasPermission(useAuthStore.getState(), 'sales.edit') && (
                    <button
                      type="button"
                      onClick={handleEditBillFromModal}
                      className="px-4 py-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit Bill
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handlePrintBillInModal}
                    className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print Thermal Receipt
                  </button>
                </div>
              </div>
            ) : viewingLedgerVoucher ? (
              /* Render Standalone Payment Bill / Receipt Voucher */
              <div className="space-y-4">
                <div className="p-4 rounded-2xl border bg-card space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={clsx(
                        "px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider text-white",
                        viewingLedgerVoucher.credit_amount > 0 ? "bg-rose-500" : "bg-emerald-600"
                      )}>
                        {viewingLedgerVoucher.credit_amount > 0 ? "CREDIT SALE / GAVE TO PARTY" : "PAYMENT RECEIVED FROM PARTY"}
                      </span>
                      <span className="px-2 py-1 rounded-lg text-xs font-bold bg-muted text-muted-foreground border border-border font-mono">
                        {viewingLedgerVoucher.balance_type || 'GST'}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-muted-foreground">{formatDateTime(viewingLedgerVoucher.transaction_date)}</p>
                  </div>

                  {/* Voucher Amount */}
                  <div className="p-4 rounded-xl bg-muted/40 border border-border flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Transaction Amount</p>
                      <p className={clsx(
                        "text-2xl font-black font-mono",
                        viewingLedgerVoucher.credit_amount > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                      )}>
                        ₹{(viewingLedgerVoucher.credit_amount > 0 ? viewingLedgerVoucher.credit_amount : viewingLedgerVoucher.debit_amount).toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Running Balance</p>
                      <p className="text-sm font-black font-mono text-foreground">
                        ₹{Math.abs(viewingLedgerVoucher.running_balance || 0).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Details Table */}
                  <div className="space-y-2 text-xs pt-1">
                    <div className="flex justify-between py-1 border-b border-border/60">
                      <span className="text-muted-foreground font-semibold">Party Name:</span>
                      <span className="font-extrabold text-foreground">{selectedParty?.name || '—'}</span>
                    </div>
                    {selectedParty?.phone && (
                      <div className="flex justify-between py-1 border-b border-border/60">
                        <span className="text-muted-foreground font-semibold">Phone:</span>
                        <span className="font-bold text-foreground font-mono">{selectedParty.phone}</span>
                      </div>
                    )}
                    {viewingLedgerVoucher.reference_number && (
                      <div className="flex justify-between py-1 border-b border-border/60">
                        <span className="text-muted-foreground font-semibold">Reference / Invoice #:</span>
                        <span className="font-bold text-primary font-mono">{viewingLedgerVoucher.reference_number}</span>
                      </div>
                    )}
                    {viewingLedgerVoucher.payment_method && (
                      <div className="flex justify-between py-1 border-b border-border/60">
                        <span className="text-muted-foreground font-semibold">Payment Mode:</span>
                        <span className="font-bold text-foreground uppercase">{viewingLedgerVoucher.payment_method}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-1 border-b border-border/60">
                      <span className="text-muted-foreground font-semibold">Description / Note:</span>
                      <span className="font-bold text-foreground text-right">{viewingLedgerVoucher.description || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-muted-foreground font-semibold">Recorded By:</span>
                      <span className="font-bold text-foreground">{viewingLedgerVoucher.created_by_name || 'System'}</span>
                    </div>
                  </div>
                </div>

                {/* Print button */}
                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={handlePrintBillInModal}
                    className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print Payment Voucher
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </Modal>

  );

};
