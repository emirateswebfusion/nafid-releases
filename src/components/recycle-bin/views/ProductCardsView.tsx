import { Trash2, RotateCcw } from 'lucide-react';
import { formatAmount } from '../../../utils/pricing/money';
import { timeAgo, type DeletedProduct } from '../recycleBinTypes';

export interface ProductCardsViewProps {
  askHardDeleteProduct: (prod: DeletedProduct) => void;
  filteredProducts: DeletedProduct[];
  isAdmin: boolean;
  restoreProduct: (product_id: string, name: string) => Promise<void>;
}

/** Card grid of deleted products with restore and permanent-delete actions. */
export function ProductCardsView({
  askHardDeleteProduct, filteredProducts, isAdmin, restoreProduct,
}: ProductCardsViewProps) {
  return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProducts.map((p) => (
                <div
                  key={p.product_id}
                  className="bg-card border border-border/80 hover:border-blue-500/30 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-sm text-foreground truncate">{p.name}</p>
                      <span className="text-[10px] text-muted-foreground font-semibold shrink-0">{timeAgo(p.updated_at)}</span>
                    </div>
                    {p.category && (
                      <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                        {p.category}
                      </span>
                    )}
                    <div className="mt-3 pt-3 border-t border-border/60 space-y-1 text-xs">
                      {p.barcode && (
                        <p className="font-mono text-[11px] text-muted-foreground">Barcode: {p.barcode}</p>
                      )}
                      <p className="text-muted-foreground">
                        Stock: <span className="font-bold text-foreground">{p.current_stock ?? 0}</span>
                      </p>
                      <p className="text-muted-foreground">
                        Selling Price: <span className="font-bold text-foreground font-mono">₹{formatAmount(p.base_price)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center gap-2">
                    <button
                      onClick={() => restoreProduct(p.product_id, p.name)}
                      className="flex-1 py-1.5 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500 text-emerald-600 hover:text-white border border-emerald-500/25 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => askHardDeleteProduct(p)}
                        className="p-1.5 rounded-xl border border-rose-500/25 text-rose-500 hover:bg-rose-500 hover:text-white transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
  );
}
