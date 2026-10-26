import { Edit3, Trash2 } from 'lucide-react';
import type { ComboOffer } from '../comboTypes';

export interface ComboTableProps {
  filteredCombos: ComboOffer[];
  handleDeleteCombo: (combo: ComboOffer) => void;
  handleOpenEdit: (combo: ComboOffer) => void;
  handleToggleActive: (combo: ComboOffer) => Promise<void>;
}

/** Table layout of combo offers with status, products, price, savings and actions. */
export function ComboTable({
  filteredCombos, handleDeleteCombo, handleOpenEdit, handleToggleActive,
}: ComboTableProps) {
  return (
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Combo Name</th>
                  <th className="px-4 py-3">Barcode</th>
                  <th className="px-4 py-3">Bundled Products</th>
                  <th className="px-4 py-3 text-right">Combo Price</th>
                  <th className="px-4 py-3 text-right">Savings</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCombos.map((combo) => {
                  const totalRegular = combo.items.reduce((s, i) => s + ((Number(i.product_price) || 0) * (Number(i.quantity) || 1)), 0);
                  const savings = Math.max(0, totalRegular - combo.combo_price);
                  const discountPct = totalRegular > 0 ? Math.round((savings / totalRegular) * 100) : 0;

                  return (
                    <tr key={combo.combo_id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <button onClick={() => handleToggleActive(combo)} className="cursor-pointer">
                          {combo.is_active ? (
                            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold rounded-md text-[10px] border border-emerald-500/20">Active</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-muted text-muted-foreground font-extrabold rounded-md text-[10px] border border-border">Inactive</span>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-bold text-foreground">
                        {combo.name}
                        {combo.description && <p className="text-[10px] text-muted-foreground font-normal italic truncate">{combo.description}</p>}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        {combo.sku_barcode || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {combo.items?.map((item, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded text-[10px] font-semibold border border-purple-500/20">
                              {item.product_name} (x{item.quantity})
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-black text-foreground">
                        ₹{combo.combo_price.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {discountPct > 0 ? `₹${savings.toFixed(2)} (${discountPct}%)` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => handleOpenEdit(combo)} className="p-1.5 hover:bg-primary/10 text-primary rounded-lg transition-colors cursor-pointer" title="Edit">
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteCombo(combo)} className="p-1.5 hover:bg-destructive/10 text-destructive rounded-lg transition-colors cursor-pointer" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
  );
}
