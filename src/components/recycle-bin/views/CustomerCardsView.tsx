import { Trash2, RotateCcw } from 'lucide-react';
import { timeAgo, type DeletedCustomer } from '../recycleBinTypes';

export interface CustomerCardsViewProps {
  askHardDeleteCustomer: (cust: DeletedCustomer) => void;
  filteredCustomers: DeletedCustomer[];
  isAdmin: boolean;
  restoreCustomer: (customer_id: string, name: string) => Promise<void>;
}

/** Card grid of deleted customers with restore and permanent-delete actions. */
export function CustomerCardsView({
  askHardDeleteCustomer, filteredCustomers, isAdmin, restoreCustomer,
}: CustomerCardsViewProps) {
  return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredCustomers.map((c) => (
                <div
                  key={c.customer_id}
                  className="bg-card border border-border/80 hover:border-purple-500/30 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-sm text-foreground truncate">{c.name}</p>
                      <span className="text-[10px] text-muted-foreground font-semibold shrink-0">{timeAgo(c.updated_at)}</span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border/60 space-y-1 text-xs text-muted-foreground">
                      <p>Phone: <span className="font-mono text-foreground font-medium">{c.phone || 'N/A'}</span></p>
                      {c.email && <p className="truncate">Email: {c.email}</p>}
                      <p>Points: <span className="font-bold text-purple-600 dark:text-purple-400">{c.current_points_balance || 0}</span></p>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center gap-2">
                    <button
                      onClick={() => restoreCustomer(c.customer_id, c.name)}
                      className="flex-1 py-1.5 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500 text-emerald-600 hover:text-white border border-emerald-500/25 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => askHardDeleteCustomer(c)}
                        title="Delete Permanently"
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
