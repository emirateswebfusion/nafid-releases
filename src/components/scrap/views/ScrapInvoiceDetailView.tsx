import React from 'react';
import { Recycle, Pencil, Plus, Printer, Trash } from 'lucide-react';
import clsx from 'clsx';
import { formatDateTime, formatCurrency } from '../scrapFormat';
import { parseUTCDate } from '../../../utils/receiptGenerator';
import { getStoreTimezone } from '../../../utils/timezoneHelper';
import type { ScrapInvoiceTxRow } from '../scrapTypes';

export interface ScrapInvoiceDetailViewProps {
  handleEditInvoiceInBilling: (invoiceNumber: string) => void;
  handleReprintScrap: () => Promise<void>;
  handleStartEditTx: (tx: ScrapInvoiceTxRow) => void;
  invoiceDetailTxs: ScrapInvoiceTxRow[];
  isOwner: true;
  selectedInvoiceNumber: string;
  setConfirmDeleteInvoiceNumber: React.Dispatch<React.SetStateAction<string | null>>;
  setConfirmDeleteTxId: React.Dispatch<React.SetStateAction<string | null>>;
  setIsAddingItem: React.Dispatch<React.SetStateAction<boolean>>;
}

/** One scrap invoice: header, items and totals, with edit / add item / reprint actions. */
export function ScrapInvoiceDetailView({
  handleEditInvoiceInBilling, handleReprintScrap, handleStartEditTx, invoiceDetailTxs, isOwner,
  selectedInvoiceNumber, setConfirmDeleteInvoiceNumber, setConfirmDeleteTxId, setIsAddingItem,
}: ScrapInvoiceDetailViewProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {invoiceDetailTxs.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-500">
                  <Recycle className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black text-foreground">{selectedInvoiceNumber}</h2>
                    <span className={clsx('text-xs font-bold px-2.5 py-0.5 rounded-lg border',
                      invoiceDetailTxs[0]?.payment_status === 'CREDIT'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                        : invoiceDetailTxs[0]?.payment_status === 'PENDING'
                          ? 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20'
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20')}>
                      {invoiceDetailTxs[0]?.payment_status === 'CREDIT' ? 'Credit' : (invoiceDetailTxs[0]?.payment_status || 'PAID')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Created on {formatDateTime(invoiceDetailTxs[0]?.created_at)}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Total Amount</p>
                <p className="text-2xl font-black text-orange-600 dark:text-orange-400 mt-0.5">
                  {formatCurrency(invoiceDetailTxs.reduce((sum: number, tx: ScrapInvoiceTxRow) => sum + Number(tx.total_amount || 0), 0))}
                </p>
              </div>
            </div>

            {/* Customer Info & Action Toolbar */}
            <div className="flex items-center justify-between bg-muted/30 p-4 rounded-xl border border-border flex-wrap gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer / Party Details</span>
                <p className="text-sm font-bold text-foreground mt-0.5">
                  {invoiceDetailTxs[0]?.party_name || 'Walk-in Customer'}
                </p>
                {(invoiceDetailTxs[0]?.customer_phone || invoiceDetailTxs[0]?.customer_address) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[invoiceDetailTxs[0].customer_phone, invoiceDetailTxs[0].customer_address].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {isOwner && (
                  <button
                    onClick={() => handleEditInvoiceInBilling(selectedInvoiceNumber)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 rounded-xl text-xs font-bold border border-amber-500/20 transition-all active:scale-95 cursor-pointer"
                    title="Edit Scrap Invoice in Billing Page"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit Invoice
                  </button>
                )}

                {isOwner && (
                  <button
                    onClick={() => setIsAddingItem(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-xs font-bold border border-primary/20 transition-all active:scale-95 cursor-pointer"
                    title="Add line item to this invoice"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                )}

                <button
                  onClick={handleReprintScrap}
                  disabled={invoiceDetailTxs.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 rounded-xl text-xs font-bold border border-blue-500/20 transition-all active:scale-95 cursor-pointer disabled:opacity-40"
                >
                  <Printer className="w-3.5 h-3.5" /> Reprint
                </button>

                {isOwner && (
                  <button
                    onClick={() => setConfirmDeleteInvoiceNumber(selectedInvoiceNumber)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-xl text-xs font-bold border border-destructive/20 transition-all active:scale-95 cursor-pointer"
                    title="Delete entire invoice"
                  >
                    <Trash className="w-3.5 h-3.5" /> Delete Invoice
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Items Table */}
        <div className="border border-border rounded-2xl overflow-hidden shadow-sm bg-card">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border bg-muted/40">
            <div className="col-span-3">Category</div>
            <div className="col-span-2 text-right">Quantity</div>
            <div className="col-span-2 text-right">Rate per Unit</div>
            <div className="col-span-2 text-right">Line Total</div>
            <div className="col-span-1 text-center">Date</div>
            {isOwner && <div className="col-span-2 text-center">Actions</div>}
          </div>
          <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
            {invoiceDetailTxs.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">No transactions found</div>
            ) : invoiceDetailTxs.map((tx: ScrapInvoiceTxRow) => (
              <div key={tx.transaction_id} className="grid grid-cols-12 gap-2 px-4 py-3.5 items-center text-sm bg-card hover:bg-muted/20 transition-colors group">
                <div className="col-span-3 font-bold text-foreground/90 truncate">{tx.scrap_category_name || 'Unknown'}</div>
                <div className="col-span-2 text-right font-semibold">
                  {Number(tx.quantity).toFixed(3)} <span className="text-muted-foreground text-xs">{tx.unit || 'Kgs'}</span>
                </div>
                <div className="col-span-2 text-right font-semibold">{formatCurrency(tx.rate)}</div>
                <div className="col-span-2 text-right font-bold text-orange-600 dark:text-orange-400">{formatCurrency(tx.total_amount)}</div>
                <div className="col-span-1 text-center text-xs text-muted-foreground">{parseUTCDate(tx.created_at).toLocaleDateString('en-IN', { timeZone: getStoreTimezone() })}</div>
                {isOwner && (
                  <div className="col-span-2 text-center flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleStartEditTx(tx)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl transition-all active:scale-95 cursor-pointer border border-blue-500/20"
                      title="Edit item"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => setConfirmDeleteTxId(tx.transaction_id)}
                      className="p-1.5 rounded-xl text-destructive hover:bg-destructive/10 transition-all active:scale-95 cursor-pointer border border-destructive/20"
                      title="Delete item"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
