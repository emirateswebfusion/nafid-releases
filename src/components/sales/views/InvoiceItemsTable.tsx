import { RefreshCw, Boxes, Package } from 'lucide-react';
import clsx from 'clsx';
import { formatCurrency } from '../../../utils/money';
import type { SalesInvoiceItemRow, SalesInvoiceRow } from '../salesTypes';

export interface InvoiceItemsTableProps {
  items: SalesInvoiceItemRow[];
  itemsLoading: boolean;
  selectedInvoice: SalesInvoiceRow;
}

/** Items table in the invoice detail dialog: each line with HSN, quantity / pieces, rate, discount and GST columns for GST bills. */
export function InvoiceItemsTable({
  items, itemsLoading, selectedInvoice,
}: InvoiceItemsTableProps) {
  return (
    <>
    {(() => {
      const isGstBill = selectedInvoice.invoice_type === 'GST';

      return (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Order Items
            </span>
            <span className="text-[10px] text-muted-foreground font-semibold">{items.length} item{items.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="border border-border rounded-xl overflow-x-auto bg-card">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                {isGstBill ? (
                  <tr className="bg-muted/40 border-b border-border text-[10px] font-black uppercase tracking-wider text-muted-foreground select-none">
                    <th className="px-3 py-2.5 min-w-[160px]">Item & HSN</th>
                    <th className="px-2 py-2.5 text-center whitespace-nowrap">Qty</th>
                    <th className="px-2.5 py-2.5 text-right whitespace-nowrap">Unit Rate (Excl.)</th>
                    <th className="px-2.5 py-2.5 text-right whitespace-nowrap">CGST / SGST</th>
                    <th className="px-2.5 py-2.5 text-right whitespace-nowrap">Taxable Value</th>
                    <th className="px-2.5 py-2.5 text-right whitespace-nowrap">Unit Rate (Incl.)</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">Total</th>
                  </tr>
                ) : (
                  <tr className="bg-muted/40 border-b border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground select-none">
                    <th className="px-4 py-2.5 min-w-[180px]">Item</th>
                    <th className="px-2 py-2.5 text-center whitespace-nowrap">Qty</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">Rate</th>
                    <th className="px-4 py-2.5 text-right whitespace-nowrap">Total</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-border/30">
                {itemsLoading ? (
                  <tr>
                    <td colSpan={isGstBill ? 7 : 4} className="py-8 text-center text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                        <span className="text-xs font-medium">Loading items…</span>
                      </div>
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={isGstBill ? 7 : 4} className="py-8 text-center text-muted-foreground">
                      <p className="text-xs">No items found for this bill</p>
                    </td>
                  </tr>
                ) : items.map((item, i) => {
                  let comboItemsParsed: any[] | undefined = item.combo_items;
                  if (!comboItemsParsed && item.combo_details) {
                    try {
                      const parsed = typeof item.combo_details === 'string' ? JSON.parse(item.combo_details) : item.combo_details;
                      if (Array.isArray(parsed) && parsed.length > 0) comboItemsParsed = parsed;
                    } catch { /* ignore */ }
                  }
                  const isComboItem = Boolean(item.isCombo || item.combo_id || (Array.isArray(comboItemsParsed) && comboItemsParsed.length > 0));

                  const itemTax = Number(item.tax_amount) || 0;
                  const itemTotal = Number(item.total) || 0;
                  const qty = Number(item.quantity) || 1;
                  const unitPriceExcl = Number(item.unit_price) || 0;
                  const itemCgstRate = Number(item.cgst_rate) || 0;
                  const itemSgstRate = Number(item.sgst_rate) || 0;
                  const itemIgstRate = Number(item.igst_rate) || 0;
                  const directRate = Number(item.tax_rate) || (itemCgstRate + itemSgstRate + itemIgstRate);

                  // Taxable base (Base Amount = Total - Tax or Qty * Unit Price)
                  const taxableBase = itemTotal > itemTax 
                    ? Math.round((itemTotal - itemTax) * 100) / 100 
                    : Math.round((qty * unitPriceExcl) * 100) / 100;

                  // Unit price including tax
                  const unitPriceIncl = qty > 0 
                    ? Math.round((itemTotal / qty) * 100) / 100 
                    : (unitPriceExcl + itemTax);

                  let calculatedRate = directRate;
                  if (!calculatedRate || calculatedRate <= 0) {
                    if (taxableBase > 0 && itemTax > 0) {
                      calculatedRate = Math.round((itemTax / taxableBase) * 100 * 10) / 10;
                    }
                  }
                  const itemTaxRate = calculatedRate > 0 ? calculatedRate : 0;
                  const itemHsn = item.hsn_sac_code || item.hsn_code || (item as any).hsn;
                  const isInterItem = selectedInvoice.supply_type === 'INTER' || itemIgstRate > 0;
                  const effCgstR = itemCgstRate || (!isInterItem && itemTaxRate > 0 ? Math.round((itemTaxRate / 2) * 10) / 10 : 0);
                  const effSgstR = itemSgstRate || (!isInterItem && itemTaxRate > 0 ? Math.round((itemTaxRate / 2) * 10) / 10 : 0);
                  const effIgstR = itemIgstRate || (isInterItem && itemTaxRate > 0 ? itemTaxRate : 0);
                  const effCgstAmt = Number(item.cgst_amount) || (!isInterItem && itemTax > 0 ? Math.round((itemTax / 2) * 100) / 100 : 0);
                  const effSgstAmt = Number(item.sgst_amount) || (!isInterItem && itemTax > 0 ? Math.round((itemTax / 2) * 100) / 100 : 0);
                  const effIgstAmt = Number(item.igst_amount) || (isInterItem && itemTax > 0 ? itemTax : 0);

                  const weightUoms = ['kgs', 'grams', 'mtrs', 'ltrs', 'kg', 'gram', 'mtr', 'ltr'];
                  const itemUnitStr = String(item.unit || item.uom || '').toLowerCase();
                  const isWeight = item.billing_type === 'WEIGHT' || 
                                   weightUoms.includes(itemUnitStr) ||
                                   (item.pieces_sold != null && item.pieces_sold > 0 && Number(item.quantity) !== Number(item.pieces_sold));
                  const pcs = item.pieces_sold ?? item.pieces_override;

                  return (
                    <tr 
                      key={item.item_id || i}
                      className={clsx(
                        'transition-colors hover:bg-muted/15',
                        i % 2 !== 0 && 'bg-muted/[0.02]'
                      )}
                    >
                      {/* 1. Item NAME & HSN CODE */}
                      <td className="px-3 py-2.5 align-middle min-w-[160px]">
                        <div className="flex items-center gap-2 min-w-0">
                          {isComboItem ? (
                            <div className="p-1 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 shrink-0">
                              <Boxes className="w-3.5 h-3.5" />
                            </div>
                          ) : (
                            <div className="p-1 rounded-md bg-muted/60 text-muted-foreground shrink-0">
                              <Package className="w-3 h-3" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-foreground truncate">{item.name || 'Unknown'}</span>
                              {isComboItem && (
                                <span className="text-[9px] font-extrabold text-purple-600 dark:text-purple-400 bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 rounded uppercase leading-none">
                                  COMBO
                                </span>
                              )}
                              {itemHsn && (
                                <span className="text-[9px] font-mono font-bold text-muted-foreground bg-muted/80 border border-border px-1.5 py-0.5 rounded leading-none" title={`HSN/SAC: ${itemHsn}`}>
                                  HSN: {itemHsn}
                                </span>
                              )}
                            </div>
                            {comboItemsParsed && comboItemsParsed.length > 0 && (
                              <div className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 mt-0.5">
                                Includes: {comboItemsParsed.filter(Boolean).map((ci) => typeof ci === 'string' ? ci : `${ci.product_name || ci.name || 'Product'} (x${ci.quantity ?? 1})`).join(', ')}
                              </div>
                            )}
                            {item.originalRate != null && Number(item.originalRate) !== Number(item.unit_price) && (
                              <span className="text-[9px] text-muted-foreground font-semibold block mt-0.5 truncate">
                                MRP {formatCurrency(Number(item.originalRate))} → {formatCurrency(Number(item.unit_price))}{item.discountLabel ? ` (${item.discountLabel})` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. Qty */}
                      <td className="px-2 py-2.5 text-center font-bold text-foreground/80 align-middle whitespace-nowrap">
                        {isWeight ? (
                          pcs ? (
                            <div className="flex flex-col items-center leading-tight">
                              <span className="text-xs text-foreground font-black">{pcs} Pcs</span>
                              <span className="text-[10px] text-muted-foreground font-semibold">{item.quantity} {item.unit || 'Kg'}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-foreground font-bold">{item.quantity} {item.unit || 'Kg'}</span>
                          )
                        ) : (
                          <span className="text-xs text-foreground font-bold">{item.quantity} Pcs</span>
                        )}
                      </td>

                      {/* 3. Unit Rate excl. tax */}
                      <td className="px-2.5 py-2.5 text-right align-middle whitespace-nowrap">
                        <div className="text-foreground/85 font-mono font-semibold">{formatCurrency(unitPriceExcl)}</div>
                        {isGstBill && itemTaxRate > 0 && (
                          <div className="text-[9.5px] font-medium text-muted-foreground">excl. tax</div>
                        )}
                      </td>

                      {/* 4. CGST AMOUNT % , SGST AMOUNT % (DOWN LIKE UNIT RATE) */}
                      {isGstBill && (
                        <td className="px-2.5 py-2.5 text-right align-middle whitespace-nowrap">
                          {isInterItem ? (
                            <div className="font-mono text-right leading-tight">
                              <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                                IGST: {formatCurrency(effIgstAmt)}
                              </div>
                              <div className="text-[9.5px] text-muted-foreground font-medium">({effIgstR}%)</div>
                            </div>
                          ) : (effCgstAmt > 0 || effSgstAmt > 0) ? (
                            <div className="font-mono text-right leading-tight space-y-0.5">
                              <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                                CGST: {formatCurrency(effCgstAmt)} <span className="text-[9.5px] font-medium text-muted-foreground">({effCgstR}%)</span>
                              </div>
                              <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                                SGST: {formatCurrency(effSgstAmt)} <span className="text-[9.5px] font-medium text-muted-foreground">({effSgstR}%)</span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground font-mono text-[11px]">-</span>
                          )}
                        </td>
                      )}

                      {/* 5. TAXABLE VALUE */}
                      {isGstBill && (
                        <td className="px-2.5 py-2.5 text-right align-middle whitespace-nowrap">
                          <div className="font-mono font-bold text-foreground">{formatCurrency(taxableBase)}</div>
                          {itemTax > 0 ? (
                            <div className="text-[10px] text-amber-700 dark:text-amber-400 font-mono font-semibold">
                              Tax: {formatCurrency(itemTax)}
                            </div>
                          ) : (
                            <div className="text-[9.5px] text-muted-foreground font-medium">Tax: ₹0.00</div>
                          )}
                        </td>
                      )}

                      {/* 6. UNIT RATE INCL TAX */}
                      {isGstBill && (
                        <td className="px-2.5 py-2.5 text-right align-middle whitespace-nowrap">
                          <div className="font-mono font-semibold text-foreground">{formatCurrency(unitPriceIncl)}</div>
                          <div className="text-[9.5px] font-medium text-muted-foreground">incl. tax</div>
                        </td>
                      )}

                      {/* 7. TOTAL */}
                      <td className="px-3 py-2.5 text-right align-middle whitespace-nowrap">
                        <div className="font-mono font-black text-foreground text-sm">{formatCurrency(itemTotal)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
    })()}
    </>
  );
}
