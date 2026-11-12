import { getCurrencyPrefix, getCurrencyDecimals } from '../../../utils/localization/storeProfile';
import { Check, Copy, Edit3, Package, Percent, Tag, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import type { ComboOffer } from '../comboTypes';
import type { ComboManagerState } from '../hooks/useComboManagerState';

export interface ComboGridProps {
  copyBarcodeToClipboard: (barcode: string) => void;
  filteredCombos: ComboOffer[];
  handleDeleteCombo: (combo: ComboOffer) => void;
  handleOpenEdit: (combo: ComboOffer) => void;
  handleToggleActive: (combo: ComboOffer) => Promise<void>;
  cm: ComboManagerState;
}

/** Grid of combo offer cards with active toggle, barcode copy, items, pricing and actions. */
export function ComboGrid({
  copyBarcodeToClipboard, filteredCombos, handleDeleteCombo, handleOpenEdit, handleToggleActive, cm,
}: ComboGridProps) {
  const { copiedBarcode } = cm;
  return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredCombos.map((combo) => {
              const totalRegular = combo.items.reduce((s, i) => s + ((Number(i.product_price) || 0) * (Number(i.quantity) || 1)), 0);
              const savings = Math.max(0, totalRegular - combo.combo_price);
              const discountPct = totalRegular > 0 ? Math.round((savings / totalRegular) * 100) : 0;

              return (
                <div
                  key={combo.combo_id}
                  className={clsx(
                    "group relative bg-card border rounded-3xl p-5 shadow-xs transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 flex flex-col justify-between overflow-hidden",
                    combo.is_active
                      ? "border-purple-500/30 hover:border-purple-500/60"
                      : "border-border/60 opacity-60 hover:opacity-100"
                  )}
                >
                  {/* Subtle Card Background Accent */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-purple-500/10 transition-all" />

                  <div>
                    {/* Top Row: Badge & Active Toggle */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-[9px] uppercase font-black tracking-wider px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                            <Tag className="w-3 h-3" /> COMBO OFFER
                          </span>
                          {!combo.is_active && (
                            <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                              INACTIVE
                            </span>
                          )}
                        </div>
                        <h4 className="text-base font-extrabold text-foreground leading-snug mt-1 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                          {combo.name}
                        </h4>
                      </div>

                      <button
                        onClick={() => handleToggleActive(combo)}
                        title={combo.is_active ? 'Active - Click to Deactivate' : 'Inactive - Click to Activate'}
                        className={clsx(
                          "p-1.5 rounded-xl transition-colors cursor-pointer shrink-0",
                          combo.is_active
                            ? "text-emerald-500 hover:bg-emerald-500/10"
                            : "text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {combo.is_active ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                      </button>
                    </div>

                    {/* Barcode & Description */}
                    {combo.sku_barcode && (
                      <div className="flex items-center gap-1.5 mb-3">
                        <span className="font-mono bg-muted/60 px-2 py-0.5 rounded-md text-[10px] text-muted-foreground border border-border/40">
                          {combo.sku_barcode}
                        </span>
                        <button
                          onClick={() => copyBarcodeToClipboard(combo.sku_barcode!)}
                          className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer"
                          title="Copy Barcode"
                        >
                          {copiedBarcode === combo.sku_barcode ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    )}

                    {combo.description && (
                      <p className="text-xs text-muted-foreground italic mb-4 line-clamp-2">
                        "{combo.description}"
                      </p>
                    )}

                    {/* Bundled Products Sub-box */}
                    <div className="bg-muted/40 rounded-2xl p-3.5 mb-4 border border-border/60 space-y-2">
                      <div className="text-[10px] font-black text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                        <span>Included Items ({combo.items?.length || 0})</span>
                        <span>Quantity</span>
                      </div>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {combo.items?.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs text-foreground">
                            <span className="truncate pr-2 font-semibold flex items-center gap-1.5">
                              <Package className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                              {item.product_name || 'Product'}
                            </span>
                            <span className="font-extrabold text-purple-600 dark:text-purple-400 shrink-0 bg-purple-500/10 px-2 py-0.5 rounded-lg text-[11px] border border-purple-500/20">
                              x{item.quantity} {item.uom || 'Pcs'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Price Summary Footer */}
                  <div className="pt-3 border-t border-border/60">
                    <div className="flex items-baseline justify-between mb-3">
                      <div>
                        {totalRegular > combo.combo_price && (
                          <div className="text-[10px] text-muted-foreground/60 line-through font-bold">
                            MRP: {getCurrencyPrefix()}{totalRegular.toFixed(getCurrencyDecimals())}
                          </div>
                        )}
                        <div className="text-xl font-black text-foreground">
                          {getCurrencyPrefix()}{combo.combo_price.toFixed(getCurrencyDecimals())}
                        </div>
                      </div>

                      {discountPct > 0 && (
                        <div className="text-right">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs rounded-xl border border-emerald-500/20">
                            <Percent className="w-3 h-3" /> SAVE {discountPct}% ({getCurrencyPrefix()}{savings.toFixed(getCurrencyDecimals())})
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEdit(combo)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-xl transition-all cursor-pointer active:scale-95"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit Combo</span>
                      </button>
                      <button
                        onClick={() => handleDeleteCombo(combo)}
                        className="p-2 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-xl transition-all cursor-pointer active:scale-95"
                        title="Delete Combo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
  );
}
