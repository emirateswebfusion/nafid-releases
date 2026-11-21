import { useState, useEffect, useMemo } from 'react';
import { Printer, Barcode } from 'lucide-react';
import clsx from 'clsx';
import { Modal } from '../../ui/Modal';
import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import type { BulkPrintItem } from '../../../data/printing';
import type { PurchaseBill, PurchaseBillItem } from '../purchaseTypes';

export interface BulkBarcodePrintModalProps {
  isOpen: boolean;
  bill: PurchaseBill | null;
  items: PurchaseBillItem[];
  onClose: () => void;
  onPrint: (printItems: BulkPrintItem[], showPrice: boolean) => Promise<void>;
  isPrinting?: boolean;
}

export function BulkBarcodePrintModal({
  isOpen,
  bill,
  items,
  onClose,
  onPrint,
  isPrinting = false,
}: BulkBarcodePrintModalProps) {
  // Show price toggle — defaults to true
  const [showPrice, setShowPrice] = useState(true);

  // Per-item quantity overrides (keyed by item_id or idx)
  const [quantityOverrides, setQuantityOverrides] = useState<Record<string, number>>({});

  // Handle Escape key with capture so it doesn't bubble to parent listeners
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, onClose]);

  const printableItems = useMemo(() => {
    return items.filter(i => !!i.sku_barcode);
  }, [items]);

  const totalLabels = useMemo(() => {
    return printableItems.reduce((acc, item, idx) => {
      const key = item.item_id || item.product_id || String(idx);
      const qty = quantityOverrides[key] ?? Math.max(1, Math.floor(Number(item.quantity) || 1));
      return acc + (Number(qty) > 0 ? Number(qty) : 0);
    }, 0);
  }, [printableItems, quantityOverrides]);

  if (!isOpen || !bill) return null;

  const handleConfirmPrint = async () => {
    const printItems: BulkPrintItem[] = printableItems
      .reduce<BulkPrintItem[]>((acc, item, idx) => {
        const key = item.item_id || item.product_id || String(idx);
        const qty = quantityOverrides[key] ?? Math.max(1, Math.floor(Number(item.quantity) || 1));
        if (qty <= 0) return acc;

        const effectivePrice = Number(item.product_base_price) || Number(item.selling_price) || Number(item.purchase_price) || 0;
        const cleanName = (item.product_name || item.name || '').replace(/\s*\((GST|EST|Estimate)\)$/i, '').trim();
        const offer = item.product_offer_price ? Number(item.product_offer_price) : (item.offer_price ? Number(item.offer_price) : undefined);

        acc.push({
          barcode: item.sku_barcode!,
          name: cleanName,
          price: showPrice ? effectivePrice : undefined,
          quantity: qty,
          sp: showPrice && offer && offer > 0 && offer !== effectivePrice ? offer : undefined,
          spType: showPrice && offer && offer > 0 && offer !== effectivePrice ? ('OFF' as const) : undefined,
        });
        return acc;
      }, []);

    if (printItems.length === 0) return;
    await onPrint(printItems, showPrice);
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Barcode className="w-4 h-4 text-primary" />
          <span>Print Barcode Labels</span>
          <span className="text-xs font-normal text-muted-foreground ml-1 font-mono">({bill.bill_number})</span>
        </div>
      }
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {/* ── Price Toggle Card ── */}
        <label className="flex items-center gap-3.5 bg-muted/30 hover:bg-muted/50 border border-border/80 rounded-2xl p-4 cursor-pointer transition-colors select-none">
          <input
            type="checkbox"
            checked={showPrice}
            onChange={e => setShowPrice(e.target.checked)}
            className="w-4 h-4 accent-primary rounded cursor-pointer shrink-0"
          />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-bold text-foreground block">Show Price on Labels</span>
            <span className="text-xs text-muted-foreground block mt-0.5">
              {showPrice
                ? 'MRP and offer prices will be printed on each label'
                : 'Labels will be printed with price hidden'}
            </span>
          </div>
          <span className={clsx(
            "text-xs font-bold px-3 py-1 rounded-full border transition-all shrink-0",
            showPrice
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              : "bg-muted text-muted-foreground border-border"
          )}>
            {showPrice ? 'Price Visible' : 'Price Hidden'}
          </span>
        </label>

        {/* ── Items List ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Products to Print ({printableItems.length})
            </label>
            <span className="text-xs font-bold text-foreground">
              Total Labels: <span className="text-primary font-black">{totalLabels}</span>
            </span>
          </div>

          <div className="border border-border/70 rounded-2xl overflow-hidden max-h-[320px] overflow-y-auto divide-y divide-border/40 bg-card">
            {printableItems.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-xs font-semibold">
                None of the products in this bill have a barcode.
              </div>
            ) : (
              printableItems.map((item, idx) => {
                const key = item.item_id || item.product_id || String(idx);
                const currentQty = quantityOverrides[key] ?? Math.max(1, Math.floor(Number(item.quantity) || 1));
                const price = Number(item.product_base_price) || Number(item.selling_price) || Number(item.purchase_price) || 0;

                return (
                  <div key={key} className="p-3.5 flex items-center justify-between gap-3 text-xs hover:bg-muted/20 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="text-muted-foreground/50 font-mono text-[10px] w-5 text-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-foreground truncate">
                          {(item.product_name || item.name || '').replace(/\s*\((GST|EST|Estimate)\)$/i, '').trim()}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.2 rounded border border-border/30">
                            {item.sku_barcode}
                          </span>
                          {showPrice ? (
                            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              {getCurrencyPrefix()}{price.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground line-through">
                              {getCurrencyPrefix()}{price.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground font-semibold">Labels:</span>
                      <input
                        type="number"
                        min="0"
                        value={currentQty}
                        onChange={e => {
                          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                          setQuantityOverrides(prev => ({ ...prev, [key]: val }));
                        }}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        className="w-16 bg-background border border-border rounded-xl px-2.5 py-1 text-center font-bold text-xs text-foreground focus:border-primary focus:outline-none"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Modal Footer ── */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={isPrinting}
            className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-xl text-sm font-semibold transition-all cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirmPrint}
            disabled={totalLabels <= 0 || isPrinting}
            className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" />
            {isPrinting ? 'Printing...' : `Print ${totalLabels} Label${totalLabels !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
