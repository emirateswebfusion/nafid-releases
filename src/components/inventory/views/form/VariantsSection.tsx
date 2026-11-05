import React, { useState } from 'react';
import { Layers, Plus, Trash2, Sparkles, ChevronDown, ChevronUp, Barcode } from 'lucide-react';
import { getCurrencyPrefix } from '../../../../utils/localization/storeProfile';
import { localizeTaxText } from '../../../../utils/localization/storeProfile';

export interface ProductVariantItem {
  id?: string;
  product_id?: string;
  variant_name: string;
  sku_barcode: string;
  purchase_price: number | string;
  base_price: number | string;
  offer_price: number | string;
  current_stock: number | string;
  reorder_level?: number | string;
  paper_purchase_price?: number | string;
  paper_mrp?: number | string;
  paper_stock?: number | string;
}

export interface VariantsSectionProps {
  variants: ProductVariantItem[];
  setVariants: React.Dispatch<React.SetStateAction<ProductVariantItem[]>>;
  enableRealPaperStock: boolean;
  defaultBasePrice?: number | string;
  defaultPurchasePrice?: number | string;
  defaultPaperMrp?: number | string;
  defaultPaperPurchasePrice?: number | string;
}

const CLOTHING_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const PACK_SIZES = ['250g', '500g', '1 Kg', '2 Kg', '5 Kg'];

let skuCounter = 100000;
function generateNextSku(seedPrefix: string = 'SKU'): string {
  skuCounter += 1;
  return `${seedPrefix}-${skuCounter}`;
}

export function VariantsSection({
  variants,
  setVariants,
  enableRealPaperStock,
  defaultBasePrice = '',
  defaultPurchasePrice = '',
  defaultPaperMrp = '',
  defaultPaperPurchasePrice = '',
}: VariantsSectionProps) {
  const [isOpen, setIsOpen] = useState(variants.length > 0);

  const handleAddRow = (initialName: string = '') => {
    const newVariant: ProductVariantItem = {
      id: `tmp-${Date.now()}-${skuCounter}`,
      variant_name: initialName,
      sku_barcode: generateNextSku('SKU'),
      purchase_price: defaultPurchasePrice,
      base_price: defaultBasePrice,
      offer_price: '',
      current_stock: '0',
      reorder_level: '0',
      paper_purchase_price: defaultPaperPurchasePrice,
      paper_mrp: defaultPaperMrp,
      paper_stock: '0',
    };
    setVariants(prev => [...prev, newVariant]);
    setIsOpen(true);
  };

  const handleApplyPreset = (names: string[]) => {
    const newVariants: ProductVariantItem[] = names.map((name, i) => ({
      id: `tmp-${Date.now()}-${i}-${skuCounter}`,
      variant_name: name,
      sku_barcode: generateNextSku('SKU'),
      purchase_price: defaultPurchasePrice,
      base_price: defaultBasePrice,
      offer_price: '',
      current_stock: '0',
      reorder_level: '0',
      paper_purchase_price: defaultPaperPurchasePrice,
      paper_mrp: defaultPaperMrp,
      paper_stock: '0',
    }));
    setVariants(prev => [...prev, ...newVariants]);
    setIsOpen(true);
  };

  const handleUpdateField = (index: number, field: keyof ProductVariantItem, value: string | number) => {
    setVariants(prev => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  };

  const handleRemoveRow = (index: number) => {
    setVariants(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-border flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-500">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-black text-sky-500 uppercase tracking-wider block">
              3. Sizes &amp; Pack Variants (Optional)
            </span>
            <span className="text-[11px] text-muted-foreground font-medium">
              Create sizes (S, M, L, XL) or pack sizes (500g, 1 Kg) with separate stocks and prices.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {variants.length > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20">
              {variants.length} {variants.length === 1 ? 'Variant' : 'Variants'}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              if (!isOpen && variants.length === 0) {
                handleAddRow();
              } else {
                setIsOpen(!isOpen);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/20 transition-all cursor-pointer active:scale-95"
          >
            {variants.length === 0 ? (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Variants</span>
              </>
            ) : isOpen ? (
              <>
                <span>Collapse</span>
                <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                <span>Show Variants</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="space-y-4 pt-1 animate-in fade-in duration-200">
          {/* Quick Presets (when 0 or few variants) */}
          <div className="flex items-center gap-2 flex-wrap text-xs bg-muted/40 p-2.5 rounded-xl border border-border/60">
            <span className="font-bold text-muted-foreground flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Quick Presets:
            </span>
            <button
              type="button"
              onClick={() => handleApplyPreset(CLOTHING_SIZES)}
              className="px-2.5 py-1 rounded-lg bg-background hover:bg-muted font-semibold text-foreground border border-border transition-all cursor-pointer text-[11px]"
            >
              + Sizes (S, M, L, XL, XXL)
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset(PACK_SIZES)}
              className="px-2.5 py-1 rounded-lg bg-background hover:bg-muted font-semibold text-foreground border border-border transition-all cursor-pointer text-[11px]"
            >
              + Pack (250g, 500g, 1 Kg, 2 Kg, 5 Kg)
            </button>
            <button
              type="button"
              onClick={() => handleAddRow()}
              className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold transition-all cursor-pointer text-[11px] ml-auto"
            >
              + Add Custom Row
            </button>
          </div>

          {/* Table / Grid */}
          {variants.length > 0 ? (
            <div className="overflow-x-auto border border-border rounded-2xl shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/70 text-muted-foreground uppercase text-[10px] font-black tracking-wider border-b border-border">
                    <th className="py-2.5 px-3 min-w-[90px]">Size / Name *</th>
                    <th className="py-2.5 px-3 min-w-[130px]">Barcode / SKU</th>
                    <th className="py-2.5 px-3 min-w-[90px]">Purchase ({getCurrencyPrefix()})</th>
                    <th className="py-2.5 px-3 min-w-[90px]">MRP ({getCurrencyPrefix()}) *</th>
                    <th className="py-2.5 px-3 min-w-[90px]">Offer / Sell ({getCurrencyPrefix()})</th>
                    <th className="py-2.5 px-3 min-w-[80px]">Real Stock</th>
                    {enableRealPaperStock && (
                      <>
                        <th className="py-2.5 px-3 min-w-[90px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border-l border-purple-500/20">
                          Paper Pur ({getCurrencyPrefix()})
                        </th>
                        <th className="py-2.5 px-3 min-w-[90px] bg-purple-500/10 text-purple-600 dark:text-purple-400">
                          Paper MRP ({getCurrencyPrefix()})
                        </th>
                        <th className="py-2.5 px-3 min-w-[80px] bg-purple-500/10 text-purple-600 dark:text-purple-400">
                          Paper {localizeTaxText("GST")} Stock
                        </th>
                      </>
                    )}
                    <th className="py-2.5 px-3 text-center w-10">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {variants.map((v, idx) => (
                    <tr key={v.id || v.product_id || idx} className="hover:bg-muted/30 transition-colors">
                      {/* Variant Name */}
                      <td className="p-2">
                        <input
                          type="text"
                          value={v.variant_name}
                          onChange={e => handleUpdateField(idx, 'variant_name', e.target.value)}
                          placeholder="e.g. S, XL"
                          className="w-full bg-background border border-border rounded-lg p-2 text-xs font-bold text-foreground focus:outline-none focus:border-sky-500"
                        />
                      </td>

                      {/* Barcode */}
                      <td className="p-2">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={v.sku_barcode}
                            onChange={e => handleUpdateField(idx, 'sku_barcode', e.target.value)}
                            placeholder="Barcode"
                            className="w-full bg-background border border-border rounded-lg p-2 text-xs font-mono text-foreground focus:outline-none focus:border-sky-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateField(idx, 'sku_barcode', generateNextSku('SKU'))}
                            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted cursor-pointer shrink-0"
                            title="Auto-generate Barcode"
                          >
                            <Barcode className="w-4 h-4" />
                          </button>
                        </div>
                      </td>

                      {/* Purchase Price */}
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          value={v.purchase_price}
                          onChange={e => handleUpdateField(idx, 'purchase_price', e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground focus:outline-none focus:border-sky-500 no-spinners"
                        />
                      </td>

                      {/* MRP */}
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          value={v.base_price}
                          onChange={e => handleUpdateField(idx, 'base_price', e.target.value)}
                          placeholder="MRP"
                          className="w-full bg-background border border-border rounded-lg p-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none focus:border-sky-500 no-spinners"
                        />
                      </td>

                      {/* Offer Price */}
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          value={v.offer_price}
                          onChange={e => handleUpdateField(idx, 'offer_price', e.target.value)}
                          placeholder="Optional"
                          className="w-full bg-background border border-border rounded-lg p-2 text-xs font-semibold text-sky-600 dark:text-sky-400 focus:outline-none focus:border-sky-500 no-spinners"
                        />
                      </td>

                      {/* Real Stock */}
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          value={v.current_stock}
                          onChange={e => handleUpdateField(idx, 'current_stock', e.target.value)}
                          placeholder="0"
                          className="w-full bg-background border border-border rounded-lg p-2 text-xs font-bold text-foreground focus:outline-none focus:border-sky-500 no-spinners"
                        />
                      </td>

                      {/* Paper Stock Columns */}
                      {enableRealPaperStock && (
                        <>
                          <td className="p-2 bg-purple-500/5 border-l border-purple-500/20">
                            <input
                              type="number"
                              step="0.01"
                              onWheel={e => (e.target as HTMLInputElement).blur()}
                              value={v.paper_purchase_price ?? ''}
                              onChange={e => handleUpdateField(idx, 'paper_purchase_price', e.target.value)}
                              placeholder="0.00"
                              className="w-full bg-background border border-border rounded-lg p-2 text-xs text-purple-600 dark:text-purple-400 focus:outline-none focus:border-purple-500 no-spinners"
                            />
                          </td>
                          <td className="p-2 bg-purple-500/5">
                            <input
                              type="number"
                              step="0.01"
                              onWheel={e => (e.target as HTMLInputElement).blur()}
                              value={v.paper_mrp ?? ''}
                              onChange={e => handleUpdateField(idx, 'paper_mrp', e.target.value)}
                              placeholder="Paper MRP"
                              className="w-full bg-background border border-border rounded-lg p-2 text-xs font-bold text-purple-600 dark:text-purple-400 focus:outline-none focus:border-purple-500 no-spinners"
                            />
                          </td>
                          <td className="p-2 bg-purple-500/5">
                            <input
                              type="number"
                              step="0.01"
                              onWheel={e => (e.target as HTMLInputElement).blur()}
                              value={v.paper_stock ?? ''}
                              onChange={e => handleUpdateField(idx, 'paper_stock', e.target.value)}
                              placeholder="0"
                              className="w-full bg-background border border-border rounded-lg p-2 text-xs font-bold text-purple-600 dark:text-purple-400 focus:outline-none focus:border-purple-500 no-spinners"
                            />
                          </td>
                        </>
                      )}

                      {/* Delete */}
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(idx)}
                          className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition-colors cursor-pointer"
                          title="Remove Variant"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
              No variant rows added yet. Click &quot;+ Add Custom Row&quot; or choose a quick preset above.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
