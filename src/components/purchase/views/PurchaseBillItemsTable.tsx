import { localizeTaxText } from '../../../utils/localization/storeProfile';
import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import React from 'react';
import clsx from 'clsx';
import { Pencil, Trash, Send } from 'lucide-react';
import type { PurchaseFormItem } from '../purchaseTypes';
import type { PurchaseAddItem } from '../purchaseTypes';

export interface PurchaseBillItemsTableProps {
  billItems: PurchaseFormItem[];
  enableRealPaperStock: boolean;
  getOtherSectionItems: (() => PurchaseFormItem[]) | undefined;
  hsnInputRefs: React.RefObject<(HTMLInputElement | null)[]>;
  isEstimate: boolean;
  openProductEditor: (item: PurchaseFormItem) => Promise<void>;
  otherSectionAddItem: ((item: PurchaseAddItem) => void) | undefined;
  removeBillItem: (productId: string) => void;
  setBillItems: React.Dispatch<React.SetStateAction<PurchaseFormItem[]>>;
  toggleBillItemDummy: (item: PurchaseFormItem) => void;
  type: 'GST' | 'ESTIMATE';
  updateBillItem: (productId: string, field: "quantity" | "purchase_price" | "selling_price" | "offer_price" | "hsn_sac_code", value: string) => void;
}

/** Items of the bill being entered: per-line quantity, rate, tax, discount and totals (estimate and GST layouts), with edit / dummy / remove actions. */
export function PurchaseBillItemsTable({
  billItems, enableRealPaperStock, getOtherSectionItems, hsnInputRefs, isEstimate, openProductEditor,
  otherSectionAddItem, removeBillItem, setBillItems, toggleBillItemDummy, type, updateBillItem,
}: PurchaseBillItemsTableProps) {
  return (
    <div className="overflow-x-auto pb-2 scrollbar-thin">
      <div className={clsx("space-y-1.5", isEstimate ? "min-w-[768px]" : "min-w-[1100px]")}>
        {isEstimate ? (
        <>
          <div className="grid grid-cols-[30px_1fr_80px_100px_100px_100px_70px_36px_36px] gap-3 px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 border-b border-border/40 mb-1.5">
            <span className="text-center">#</span>
            <span>Product</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Purchase</span>
            <span className="text-right">MRP</span>
            <span className="text-right">Offer</span>
            <span className="text-right">Total</span>
            <span></span>
            <span></span>
          </div>
          {billItems.map((item, index) => {
            return (                    <div key={item.product_id} className="grid grid-cols-[30px_1fr_80px_100px_100px_100px_70px_36px_36px] gap-3 px-3 py-2 bg-card border border-border/80 hover:border-amber-500/40 rounded-xl transition-all duration-200 hover:shadow-sm group items-center">
                <span className="text-xs font-semibold text-muted-foreground/60 text-center select-none">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-foreground truncate flex items-center gap-1.5">
                    <span>{item.name.replace(/\s*\((GST|EST|Estimate)\)$/i, '')}</span>
                    {/\s*\((GST|EST|Estimate)\)$/i.test(item.name) && (
                      <span className="text-[8px] px-1.2 py-0.2 rounded font-black tracking-wide border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400 uppercase select-none leading-none">
                        {item.name.match(/\s*\((GST|EST|Estimate)\)$/i)?.[1]}
                      </span>
                    )}
                  </span>
                  {item.stock !== undefined && item.stock !== '' && (
                    <span className="block text-[10px] text-muted-foreground font-semibold mt-0.5">Stock: {Number(item.stock).toFixed(0)}</span>
                  )}
                </span>
                <input
                  type="number" step="0.01" min="0"
                  value={item.quantity}
                  onChange={e => updateBillItem(item.product_id, 'quantity', e.target.value)}
                  className="w-full bg-background border border-border/80 rounded-lg px-2 py-1.5 text-right text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners h-8"
                />
                <input
                  type="number" step="0.01" min="0"
                  value={item.purchase_price}
                  onChange={e => updateBillItem(item.product_id, 'purchase_price', e.target.value)}
                  className="w-full bg-background border border-border/80 rounded-lg px-2 py-1.5 text-right text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners h-8"
                />
                <input
                  type="number" step="0.01" min="0"
                  value={item.selling_price}
                  onChange={e => updateBillItem(item.product_id, 'selling_price', e.target.value)}
                  className="w-full bg-background border border-border/80 rounded-lg px-2 py-1.5 text-right text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners h-8"
                />
                <input
                  type="number" step="0.01" min="0"
                  value={item.offer_price || ''}
                  onChange={e => updateBillItem(item.product_id, 'offer_price', e.target.value)}
                  className="w-full bg-background border border-border/80 rounded-lg px-2 py-1.5 text-right text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners h-8"
                  placeholder="—"
                />
                <div className="text-right font-bold text-foreground text-xs">
                  {getCurrencyPrefix()}{((Number(item.quantity) || 0) * (Number(item.purchase_price) || 0)).toFixed(2)}
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => openProductEditor(item)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/30 hover:text-amber-500 hover:bg-amber-500/10 transition-all cursor-pointer opacity-0 group-hover:opacity-100 shrink-0"
                    title="Edit Product"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => removeBillItem(item.product_id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Remove Item">
                    <Trash className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button
                  onClick={() => otherSectionAddItem?.({
                    product_id: item.product_id,
                    name: item.name,
                    quantity: item.quantity,
                    purchase_price: item.purchase_price,
                    selling_price: item.selling_price,
                    offer_price: item.offer_price,
                    is_gst_applicable: item.is_gst_applicable,
                    tax_rate_percent: item.tax_rate_percent,
                    hsn_sac_code: item.hsn_sac_code,
                  })}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-amber-500/50 hover:text-amber-500 hover:bg-amber-500/10 transition-all cursor-pointer shrink-0 opacity-0 group-hover:opacity-100 mx-auto"
                  title={localizeTaxText("Send to GST Bill")}
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </>
      ) : (
        <>
          <div className="grid grid-cols-[30px_1fr_70px_60px_70px_70px_70px_55px_55px_55px_70px_50px_34px] gap-3 px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 border-b border-border/40 mb-1.5">
            <span className="text-center">#</span>
            <span>Product</span>
            <span className="text-center">HSN</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Purchase</span>
            <span className="text-right">MRP</span>
            <span className="text-right">Offer</span>
            <span className="text-right">Tax%</span>
            <span className="text-right">CGST</span>
            <span className="text-right">SGST</span>
            <span className="text-right">Total</span>
            <span></span>
            <span></span>
          </div>
          {billItems.map((item, index) => {
            const taxableAmt = (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0);
            const taxRate = item.tax_rate_percent || 0;
            const hasGst = type === 'GST' && (item.is_gst_applicable ?? 1) === 1 && taxRate > 0;
            const gstAmt = hasGst ? taxableAmt * (taxRate / 100) : 0;
            const itemTotal = taxableAmt + gstAmt;
            // Dummy = paper stock / tax record only (no stock add); Real = stock-in.
            const isOtherSectionPresent = (getOtherSectionItems?.() ?? []).some(i => i.product_id === item.product_id);
            const isDummy = enableRealPaperStock && (isOtherSectionPresent || item.skip_stock_update === 1);
            return (
              <div key={item.product_id} className="grid grid-cols-[30px_1fr_70px_60px_70px_70px_70px_55px_55px_55px_70px_50px_34px] gap-3 px-3 py-2 bg-card border border-border/80 hover:border-emerald-500/40 rounded-xl transition-all duration-200 hover:shadow-sm group items-center">
                <span className="text-xs font-semibold text-muted-foreground/60 text-center select-none">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-foreground truncate leading-tight flex items-center gap-1.5">
                    <span>{item.name.replace(/\s*\((GST|EST|Estimate)\)$/i, '')}</span>
                    {/\s*\((GST|EST|Estimate)\)$/i.test(item.name) && (
                      <span className="text-[8px] px-1.2 py-0.2 rounded font-black tracking-wide border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 uppercase select-none leading-none">
                        {item.name.match(/\s*\((GST|EST|Estimate)\)$/i)?.[1]}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {enableRealPaperStock && (
                      <button
                        type="button"
                        onClick={() => toggleBillItemDummy(item)}
                        title={isDummy ? 'Paper GST (no shop stock added, updates paper stock & tax ledger) — click for Real Stock' : 'Real Stock (adds shop stock) — click for Paper GST'}
                        className={clsx(
                          'text-[9px] px-2 py-0.5 rounded-full font-black border transition-all cursor-pointer select-none uppercase tracking-wider shrink-0',
                          isDummy
                            ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 hover:bg-purple-500/25'
                            : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                        )}
                      >
                        {isDummy ? '📄 Paper' : '📦 Real'}
                      </button>
                    )}
                    {item.stock !== undefined && item.stock !== '' && (
                      <span className="text-[10px] text-muted-foreground font-semibold">Stock: {Number(item.stock).toFixed(0)}</span>
                    )}
                  </span>
                </span>
                <input
                  type="text"
                  value={item.hsn_sac_code || ''}
                  onChange={e => updateBillItem(item.product_id, 'hsn_sac_code', e.target.value)}
                  ref={el => { hsnInputRefs.current[index] = el; }}
                  className="w-full bg-background border border-border/80 rounded-lg px-1.5 py-1 text-center text-[10px] font-mono font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none h-7"
                  placeholder="HSN"
                />
                <input
                  type="number" step="0.01" min="0"
                  value={item.quantity}
                  onChange={e => updateBillItem(item.product_id, 'quantity', e.target.value)}
                  className="w-full bg-background border border-border/80 rounded-lg px-2 py-1.5 text-right text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners h-8"
                />
                <input
                  type="number" step="0.01" min="0"
                  value={item.purchase_price}
                  onChange={e => updateBillItem(item.product_id, 'purchase_price', e.target.value)}
                  className="w-full bg-background border border-border/80 rounded-lg px-2 py-1.5 text-right text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners h-8"
                />
                <input
                  type="number" step="0.01" min="0"
                  value={item.selling_price}
                  onChange={e => updateBillItem(item.product_id, 'selling_price', e.target.value)}
                  className="w-full bg-background border border-border/80 rounded-lg px-2 py-1.5 text-right text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners h-8"
                />
                <input
                  type="number" step="0.01" min="0"
                  value={item.offer_price || ''}
                  onChange={e => updateBillItem(item.product_id, 'offer_price', e.target.value)}
                  className="w-full bg-background border border-border/80 rounded-lg px-2 py-1.5 text-right text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners h-8"
                  placeholder="—"
                />
                <select
                  value={item.tax_rate_percent ?? 0}
                  onChange={e => {
                    const val = Number(e.target.value);
                    setBillItems(prev => prev.map(i =>
                      i.product_id === item.product_id
                        ? { ...i, tax_rate_percent: val, is_gst_applicable: val > 0 ? 1 : 0 }
                        : i
                    ));
                  }}
                  className="w-full bg-background border border-border/80 rounded-lg px-1 py-1.5 text-right text-[10px] font-bold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none cursor-pointer h-8"
                >
                  <option value={0}>0%</option>
                  <option value={3}>3%</option>
                  <option value={5}>5%</option>
                  <option value={12}>12%</option>
                  <option value={18}>18%</option>
                  <option value={28}>28%</option>
                </select>
                <div className="text-right text-xs">
                  {hasGst ? (
                    <span className="font-bold text-foreground">{getCurrencyPrefix()}{(gstAmt / 2).toFixed(2)}</span>
                  ) : (
                    <span className="text-muted-foreground/50 font-semibold">{getCurrencyPrefix()}0.00</span>
                  )}
                </div>
                <div className="text-right text-xs">
                  {hasGst ? (
                    <span className="font-bold text-foreground">{getCurrencyPrefix()}{(gstAmt / 2).toFixed(2)}</span>
                  ) : (
                    <span className="text-muted-foreground/50 font-semibold">{getCurrencyPrefix()}0.00</span>
                  )}
                </div>
                <div className="text-right font-bold text-foreground text-xs">
                  {getCurrencyPrefix()}{itemTotal.toFixed(2)}
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => openProductEditor(item)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/30 hover:text-amber-500 hover:bg-amber-500/10 transition-all cursor-pointer opacity-0 group-hover:opacity-100 shrink-0"
                    title="Edit Product"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => removeBillItem(item.product_id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Remove Item">
                    <Trash className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button
                  onClick={() => otherSectionAddItem?.({
                    product_id: item.product_id,
                    name: item.name,
                    quantity: item.quantity,
                    purchase_price: item.purchase_price,
                    selling_price: item.selling_price,
                    offer_price: item.offer_price,
                    is_gst_applicable: item.is_gst_applicable,
                    tax_rate_percent: item.tax_rate_percent,
                    hsn_sac_code: item.hsn_sac_code,
                  })}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-emerald-500/50 hover:text-emerald-500 hover:bg-emerald-500/10 transition-all cursor-pointer shrink-0 opacity-0 group-hover:opacity-100 mx-auto"
                  title="Send to Estimate Bill"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </>
      )}
      </div>
    </div>
  );
}
