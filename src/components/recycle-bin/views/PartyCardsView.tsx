import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import { Trash2, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import { formatAmount } from '../../../utils/pricing/money';
import { timeAgo, type DeletedParty } from '../recycleBinTypes';

export interface PartyCardsViewProps {
  askHardDeleteParty: (party: DeletedParty) => void;
  filteredParties: DeletedParty[];
  isAdmin: boolean;
  restoreParty: (party_id: string, name: string) => Promise<void>;
}

/** Card grid of deleted suppliers / ledger parties with restore and permanent-delete actions. */
export function PartyCardsView({
  askHardDeleteParty, filteredParties, isAdmin, restoreParty,
}: PartyCardsViewProps) {
  return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredParties.map((p) => (
                <div
                  key={p.party_id}
                  className="bg-card border border-border/80 hover:border-emerald-500/30 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-sm text-foreground truncate">{p.name}</p>
                      <span className="text-[10px] text-muted-foreground font-semibold shrink-0">{timeAgo(p.updated_at)}</span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border/60 space-y-1 text-xs text-muted-foreground">
                      <p>Type: <span className="font-semibold text-foreground">{p.party_type || 'SUPPLIER'}</span></p>
                      <p>Phone: <span className="font-mono text-foreground font-medium">{p.phone || 'N/A'}</span></p>
                      {p.balance !== undefined && (
                        <p>
                          Balance:{' '}
                          <span className={clsx('font-bold font-mono', p.balance > 0 ? 'text-rose-500' : 'text-emerald-500')}>
                            {getCurrencyPrefix()}{formatAmount(Math.abs(p.balance))} {p.balance_type || ''}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center gap-2">
                    <button
                      onClick={() => restoreParty(p.party_id, p.name)}
                      className="flex-1 py-1.5 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500 text-emerald-600 hover:text-white border border-emerald-500/25 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => askHardDeleteParty(p)}
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
