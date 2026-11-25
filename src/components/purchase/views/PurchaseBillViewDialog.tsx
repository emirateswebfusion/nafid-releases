import { isVatStore, localizeTaxText, getCurrencyDecimals } from '../../../utils/localization/storeProfile';
import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import React from 'react';
import { PurchaseWhatsAppButton } from './PurchaseWhatsAppButton';
import clsx from 'clsx';
import { Receipt, Printer, Pencil, Trash, X, User, Calendar, Package, Barcode } from 'lucide-react';
import { formatDate, purchaseBillTypeLabel } from '../purchaseFormat';
import type { PurchaseBill, PurchaseBillItem } from '../purchaseTypes';

export interface PurchaseBillViewDialogProps {
  handleDelete: (bill: PurchaseBill) => void;
  handleEditBill: (bill: PurchaseBill) => Promise<void>;
  handlePrintBill: (billToPrint: PurchaseBill, itemsToPrint?: PurchaseBillItem[]) => Promise<void>;
  loadingViewingItems: boolean;
  setViewingBill: React.Dispatch<React.SetStateAction<PurchaseBill | null>>;
  /** Rendered only while a bill is open. */
  viewingBill: PurchaseBill;
  viewingBillItems: PurchaseBillItem[];
  onPrintItemBarcode?: (item: PurchaseBillItem) => void;
  onPrintAllBarcodes?: (bill: PurchaseBill, items: PurchaseBillItem[]) => void;
}

/** Saved purchase bill detail dialog: supplier, bill info, items, totals and its actions. */
export function PurchaseBillViewDialog({
  handleDelete, handleEditBill, handlePrintBill, loadingViewingItems, setViewingBill, viewingBill, viewingBillItems,
  onPrintItemBarcode, onPrintAllBarcodes,
}: PurchaseBillViewDialogProps) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setViewingBill(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setViewingBill]);

  const isInterstate = !isVatStore() && !!viewingBill.is_interstate;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      onClick={() => setViewingBill(null)}
    >
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-5xl bg-background flex flex-col shadow-2xl border border-border rounded-2xl max-h-[92vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Drawer header ── */}
        <div className={clsx(
          "shrink-0 px-7 py-6 flex items-start justify-between gap-4",
          viewingBill.bill_type === 'ESTIMATE'
            ? "bg-gradient-to-r from-amber-500/10 to-transparent border-b border-amber-500/20"
            : "bg-gradient-to-r from-emerald-500/10 to-transparent border-b border-emerald-500/20"
        )}>
          <div className="flex items-start gap-4">
            <div className={clsx(
              "p-3 rounded-2xl shrink-0",
              viewingBill.bill_type === 'ESTIMATE'
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            )}>
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-black text-foreground tracking-tight">{viewingBill.bill_number}</h2>
                <span className={clsx(
                  "text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest border",
                  viewingBill.bill_type === 'ESTIMATE'
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25"
                    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                )}>
                  {purchaseBillTypeLabel(viewingBill)}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground font-semibold mt-1">
                Recorded on {formatDate(viewingBill.created_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
          <PurchaseWhatsAppButton key={viewingBill.purchase_bill_id} bill={viewingBill} />
          <button
            onClick={() => handlePrintBill(viewingBill, viewingBillItems)}
            className="w-9 h-9 flex items-center justify-center text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-all duration-150 cursor-pointer shrink-0 border border-emerald-500/20"
            title="Print Purchase Bill"
          >
            <Printer className="w-4 h-4" />
          </button>
          {onPrintAllBarcodes && (
            <button
              onClick={() => onPrintAllBarcodes(viewingBill, viewingBillItems)}
              className="w-9 h-9 flex items-center justify-center text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all duration-150 cursor-pointer shrink-0 border border-blue-500/20"
              title="Print Barcode Labels for All Items in Bill"
            >
              <Barcode className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => {
              const bill = viewingBill;
              setViewingBill(null);
              handleEditBill(bill);
            }}
            className="w-9 h-9 flex items-center justify-center text-amber-500/60 hover:text-amber-500 hover:bg-amber-500/10 rounded-xl transition-all duration-150 cursor-pointer shrink-0 border border-amber-500/20"
            title="Edit Bill"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={async () => {
              await handleDelete(viewingBill);
              setViewingBill(null);
            }}
            className="w-9 h-9 flex items-center justify-center text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-150 cursor-pointer shrink-0 border border-destructive/20"
            title="Delete Bill"
          >
            <Trash className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewingBill(null)}
            className="w-9 h-9 flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-muted rounded-xl transition-all duration-150 cursor-pointer shrink-0 border border-destructive/30"
            title="Close"
          >
            <X className="w-4 h-4 text-destructive" />
          </button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Supplier + Meta Strip */}
          <div className="px-8 py-5 border-b border-border/60 grid grid-cols-4 gap-8">
            <div className="col-span-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Supplier</p>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-4.5 h-4.5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground leading-tight">{viewingBill.supplier_name}</p>
                  {viewingBill.supplier_phone && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{viewingBill.supplier_phone}</p>
                  )}
                </div>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Bill Date</p>
              <div className="flex items-center gap-1.5 text-sm font-bold text-foreground mt-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary/70" />
                {formatDate(viewingBill.bill_date)}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Supplier Invoice No.</p>
              {viewingBill.invoice_number ? (
                <span className="inline-block mt-1.5 text-xs font-mono font-bold bg-muted/60 px-2.5 py-1 rounded-lg border border-border/60 text-foreground">
                  {viewingBill.invoice_number}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/50 italic mt-1.5 block">—</span>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div className="px-8 pt-6 pb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Line Items</p>
              {!loadingViewingItems && viewingBillItems.length > 0 && (
                <span className="text-[10px] font-bold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full border border-border/40">
                  {viewingBillItems.length} item{viewingBillItems.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="rounded-xl border border-border/60 overflow-hidden bg-card">
              {/* Table head */}
              <div className={clsx(
                "grid gap-3 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border/50 bg-muted/30",
                viewingBill.bill_type === 'GST'
                  ? "grid-cols-[30px_minmax(0,3fr)_80px_120px_70px_70px_110px_36px]"
                  : "grid-cols-[30px_minmax(0,3fr)_80px_120px_110px_36px]"
              )}>
                <div className="text-center">#</div>
                <div>Product</div>
                <div className="text-right">Qty</div>
                <div className="text-right">Rate</div>
                {viewingBill.bill_type === 'GST' && <div className={isInterstate ? "col-span-2 text-right" : "text-right"}>{isInterstate ? 'IGST' : 'CGST'}</div>}
                {viewingBill.bill_type === 'GST' && !isInterstate && <div className="text-right">SGST</div>}
                <div className="text-right">Total</div>
                <div></div>
              </div>

              {/* Table body */}
              {loadingViewingItems ? (
                <div className="flex items-center justify-center gap-2.5 py-10 text-muted-foreground">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-semibold">Loading items…</span>
                </div>
              ) : viewingBillItems.length === 0 ? (
                <div className="py-10 text-center">
                  <Package className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground font-semibold">No items found in this bill</p>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {viewingBillItems.map((item, idx) => {
                    const taxRate = item.tax_rate_percent || 0;
                    const hasGst = item.is_gst_applicable === 1 && taxRate > 0;
                    const gstAmt = hasGst ? Number(item.total_amount) * (taxRate / 100) : 0;
                    return (
                      <div
                        key={item.item_id || idx}
                      className={clsx(
                          "grid gap-3 px-5 py-3.5 items-center text-xs transition-colors hover:bg-muted/20",
                          viewingBill.bill_type === 'GST'
                            ? "grid-cols-[30px_minmax(0,3fr)_80px_120px_70px_70px_110px_36px]"
                            : "grid-cols-[30px_minmax(0,3fr)_80px_120px_110px_36px]"
                        )}
                      >
                        <div className="text-xs font-semibold text-muted-foreground/60 text-center select-none">
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-bold text-foreground truncate">{item.product_name || item.name}</p>
                            {item.skip_stock_update === 1 ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0">
                                📄 Paper
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                                📦 Real
                              </span>
                            )}
                          </div>
                          {(item.sku_barcode || item.hsn_sac_code) && (
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {item.sku_barcode && (
                                <span className="font-mono text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border/30">
                                  {item.sku_barcode}
                                </span>
                              )}
                              {item.hsn_sac_code && (
                                <span className="text-[10px] text-muted-foreground">HSN {item.hsn_sac_code}</span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="text-right font-bold text-foreground">
                          {Number(item.quantity).toFixed(2)}
                        </div>

                        <div className="text-right text-muted-foreground font-semibold">
                          {getCurrencyPrefix()}{Number(item.purchase_price).toFixed(getCurrencyDecimals())}
                        </div>

                        {viewingBill.bill_type === 'GST' && (
                          <div className={isInterstate ? "col-span-2 text-right" : "text-right"}>
                            {hasGst ? (
                              <div className="leading-tight">
                                <p className="font-bold text-foreground">{getCurrencyPrefix()}{(isInterstate ? gstAmt : gstAmt / 2).toFixed(getCurrencyDecimals())}</p>
                                <p className="text-[9px] text-muted-foreground font-semibold">{(isInterstate ? taxRate : taxRate / 2).toFixed(1)}%</p>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/50 font-semibold">{getCurrencyPrefix()}0.00</span>
                            )}
                          </div>
                        )}
                        {viewingBill.bill_type === 'GST' && !isInterstate && (
                          <div className="text-right">
                            {hasGst ? (
                              <div className="leading-tight">
                                <p className="font-bold text-foreground">{getCurrencyPrefix()}{(gstAmt / 2).toFixed(getCurrencyDecimals())}</p>
                                <p className="text-[9px] text-muted-foreground font-semibold">{(taxRate / 2).toFixed(1)}%</p>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/50 font-semibold">{getCurrencyPrefix()}0.00</span>
                            )}
                          </div>
                        )}

                        <div className="text-right font-black text-foreground">
                          {getCurrencyPrefix()}{(Number(item.total_amount) + gstAmt).toFixed(getCurrencyDecimals())}
                        </div>

                        <div className="flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => onPrintItemBarcode?.(item)}
                            className="w-7 h-7 flex items-center justify-center text-muted-foreground/40 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all duration-150 cursor-pointer shrink-0"
                            title="Print Barcode Label"
                          >
                            <Barcode className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Notes + Totals — side by side */}
          <div className="px-8 py-6 flex gap-8 items-start">

            {/* Notes */}
            <div className="flex-1 min-w-0">
              {viewingBill.notes ? (
                <div className="px-4 py-3 bg-muted/20 border border-border/40 rounded-xl h-full">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">Notes</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{viewingBill.notes}</p>
                </div>
              ) : (
                <div className="px-4 py-3 bg-muted/10 border border-border/30 rounded-xl h-full flex items-center">
                  <p className="text-xs text-muted-foreground/40 italic">No notes on this bill</p>
                </div>
              )}
            </div>

            {/* Totals block */}
            <div className="w-72 shrink-0 rounded-xl border border-primary/20 overflow-hidden bg-card">
              <div className="px-5 py-4 space-y-2.5 border-b border-primary/10">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-semibold">Items</span>
                  <span className="font-bold text-foreground">{viewingBillItems.length}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-semibold">Total Qty</span>
                  <span className="font-bold text-foreground">
                    {viewingBillItems.reduce((a, i) => a + Number(i.quantity), 0).toFixed(2)}
                  </span>
                </div>
                {viewingBill.bill_type === 'GST' && (() => {
                  const totalGst = viewingBillItems.reduce((acc, item) => {
                    const rate = item.tax_rate_percent || 0;
                    if (item.is_gst_applicable === 1 && rate > 0) {
                      return acc + Number(item.total_amount) * (rate / 100);
                    }
                    return acc;
                  }, 0);
                  const halfGst = totalGst / 2;
                  const taxableValue = Number(viewingBill.total_amount) - totalGst;
                  return totalGst > 0 ? (
                    <>
                      <div className="flex justify-between text-xs border-t border-border/30 pt-2">
                        <span className="text-muted-foreground font-semibold">Taxable Value</span>
                        <span className="font-bold text-foreground">{getCurrencyPrefix()}{taxableValue.toFixed(getCurrencyDecimals())}</span>
                      </div>
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2.5 space-y-1.5 mt-0.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1.5">{localizeTaxText("GST")} Breakdown</p>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground font-semibold">{isVatStore() ? 'VAT' : isInterstate ? 'IGST' : 'CGST'}</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">{getCurrencyPrefix()}{(isVatStore() || isInterstate ? totalGst : halfGst).toFixed(getCurrencyDecimals())}</span>
                        </div>
                        {!isVatStore() && !isInterstate && <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground font-semibold">SGST</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">{getCurrencyPrefix()}{(isVatStore() ? totalGst : halfGst).toFixed(getCurrencyDecimals())}</span>
                        </div>}
                        <div className="flex justify-between text-xs border-t border-emerald-500/20 pt-1.5">
                          <span className="text-muted-foreground font-bold">Total {localizeTaxText("GST")}</span>
                          <span className="font-black text-emerald-600 dark:text-emerald-400">{getCurrencyPrefix()}{totalGst.toFixed(getCurrencyDecimals())}</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-[10px] text-muted-foreground/50 italic text-center py-1">No {localizeTaxText("GST")} applicable on items</div>
                  );
                })()}
                {viewingBill.bill_type === 'ESTIMATE' && (
                  <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold text-center py-1.5 bg-amber-500/5 border border-amber-500/20 rounded-lg px-2">
                    Estimate — No {localizeTaxText("GST")} Applicable
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between px-5 py-4 bg-primary/[0.06]">
                <span className="text-xs font-black uppercase tracking-widest text-primary">Grand Total</span>
                <span className="text-2xl font-black text-foreground">{getCurrencyPrefix()}{Number(viewingBill.total_amount).toFixed(getCurrencyDecimals())}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer / Action Bar */}
        <div className="shrink-0 px-8 py-4 border-t border-border/60 bg-muted/20 flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">Bill Number: <strong className="text-foreground">{viewingBill.bill_number}</strong></span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handlePrintBill(viewingBill, viewingBillItems)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-sm hover:bg-primary/95 transition-all duration-200 active:scale-95 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Purchase Bill</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
