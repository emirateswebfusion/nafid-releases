import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import React from 'react';
import clsx from 'clsx';
import { Plus, Minus, AlertTriangle, TrendingUp, TrendingDown, X, Search } from 'lucide-react';
import { cashierApi } from '../../../data/cashier';
import { Select } from '../../ui/Select';
import type { CashCategoryRow, CashPartyRow } from '../cashierTypes';

export interface CashTransactionModalProps {
  addingCat: boolean;
  customCategories: CashCategoryRow[];
  handleAddTransaction: () => Promise<void>;
  handleFormKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  newCatName: string;
  parties: CashPartyRow[];
  partySearch: string;
  setAddingCat: React.Dispatch<React.SetStateAction<boolean>>;
  setCustomCategories: React.Dispatch<React.SetStateAction<CashCategoryRow[]>>;
  setNewCatName: React.Dispatch<React.SetStateAction<string>>;
  setPartySearch: React.Dispatch<React.SetStateAction<string>>;
  setShowAddCatForm: React.Dispatch<React.SetStateAction<boolean>>;
  setShowTxnModal: React.Dispatch<React.SetStateAction<boolean>>;
  setTxnAmt: React.Dispatch<React.SetStateAction<number>>;
  setTxnCat: React.Dispatch<React.SetStateAction<string>>;
  setTxnError: React.Dispatch<React.SetStateAction<string>>;
  setTxnNote: React.Dispatch<React.SetStateAction<string>>;
  setTxnPartyId: React.Dispatch<React.SetStateAction<string>>;
  setTxnPartyName: React.Dispatch<React.SetStateAction<string>>;
  setTxnType: React.Dispatch<React.SetStateAction<"CASH_IN" | "CASH_OUT">>;
  showAddCatForm: boolean;
  tenantId: string | null;
  txnAmt: number;
  txnCat: string;
  txnError: string;
  txnNote: string;
  txnPartyId: string;
  txnPartyName: string;
  txnSubmitting: boolean;
  txnType: "CASH_IN" | "CASH_OUT";
}

/** Add a cash-in / cash-out transaction with a category (and add a new category). */
export function CashTransactionModal({
  addingCat, customCategories, handleAddTransaction, handleFormKeyDown, newCatName, parties, partySearch,
  setAddingCat, setCustomCategories, setNewCatName, setPartySearch, setShowAddCatForm, setShowTxnModal, setTxnAmt,
  setTxnCat, setTxnError, setTxnNote, setTxnPartyId, setTxnPartyName, setTxnType, showAddCatForm, tenantId, txnAmt,
  txnCat, txnError, txnNote, txnPartyId, txnPartyName, txnSubmitting, txnType,
}: CashTransactionModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={() => {
        if (!txnSubmitting) {
          setShowTxnModal(false); setTxnAmt(0); setTxnCat(''); setTxnNote('');
          setTxnPartyId(''); setTxnPartyName(''); setPartySearch('');
          setShowAddCatForm(false); setNewCatName(''); setTxnError('');
        }
      }}
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-[420px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div
          className="relative px-6 py-4 border-b border-border"
          style={{
            background: txnType === 'CASH_IN'
              ? 'linear-gradient(135deg, hsl(142,72%,29%,0.1) 0%, transparent 100%)'
              : 'linear-gradient(135deg, hsl(0,72%,51%,0.1) 0%, transparent 100%)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <div className={clsx('p-2 rounded-xl', txnType === 'CASH_IN' ? 'bg-emerald-500/15' : 'bg-rose-500/15')}>
              {txnType === 'CASH_IN'
                ? <Plus className="w-4 h-4 text-emerald-500" />
                : <Minus className="w-4 h-4 text-rose-500" />
              }
            </div>
            <h2 className="text-base font-extrabold text-foreground">
              {txnType === 'CASH_IN' ? 'Record Cash In' : 'Record Expense'}
            </h2>
          </div>
        </div>

        <div className="p-6 space-y-4" onKeyDown={handleFormKeyDown} data-enter-nav>
          {txnError && (
            <div className="p-3 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{txnError}</span>
            </div>
          )}
          {/* Toggle */}
          <div className="flex rounded-xl bg-muted/40 border border-border p-1 gap-1">
            <button
              onClick={() => setTxnType('CASH_IN')}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-black transition-all duration-200 cursor-pointer',
                txnType === 'CASH_IN' ? 'bg-emerald-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <TrendingUp className="w-3.5 h-3.5" /> Cash In
            </button>
            <button
              onClick={() => setTxnType('CASH_OUT')}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-black transition-all duration-200 cursor-pointer',
                txnType === 'CASH_OUT' ? 'bg-rose-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <TrendingDown className="w-3.5 h-3.5" /> Expense
            </button>
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">{getCurrencyPrefix()}</span>
              <input
                type="number"
                value={txnAmt || ''}
                onChange={(e) => setTxnAmt(e.target.value === '' ? 0 : Number(e.target.value))}
                className={clsx(
                  'w-full pl-10 pr-4 py-3 text-lg font-black bg-card border-2 rounded-2xl outline-none text-foreground tabular-nums shadow-sm transition-all',
                  txnType === 'CASH_IN'
                    ? 'border-emerald-500/25 focus:border-emerald-500'
                    : 'border-rose-500/25 focus:border-rose-500'
                )}
                step="any" min="0" placeholder="Enter amount" autoFocus
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">Category</label>
            {showAddCatForm ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  placeholder={`New ${txnType === 'CASH_IN' ? 'income' : 'expense'} category...`}
                  className="flex-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-medium text-foreground outline-none focus:border-primary transition-all"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newCatName.trim()) {
                      (e.target as HTMLInputElement).blur();
                      const btn = (e.target as HTMLInputElement).closest('div')?.querySelector('button');
                      btn?.click();
                    }
                  }}
                />
                <button
                  onClick={async () => {
                    if (!newCatName.trim() || !tenantId) return;
                    setAddingCat(true);
                    const r = await cashierApi.addCategory({ tenant_id: tenantId, name: newCatName.trim(), type: txnType });
                    if (r.success) {
                      const cats = await cashierApi.getCategories({ tenant_id: tenantId });
                      if (Array.isArray(cats)) setCustomCategories(cats);
                      setTxnCat(newCatName.trim());
                      setShowAddCatForm(false);
                      setNewCatName('');
                    }
                    setAddingCat(false);
                  }}
                  disabled={addingCat || !newCatName.trim()}
                  className="px-3.5 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:bg-primary/90 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {addingCat ? '...' : 'Add'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Select
                    value={txnCat}
                    onChange={v => {
                      if (v === '__ADD_NEW__') { setShowAddCatForm(true); setNewCatName(''); }
                      else setTxnCat(v);
                    }}
                    placeholder="Select category"
                    options={(() => {
                      const defaults = txnType === 'CASH_IN'
                        ? [
                            { value: 'Cash Deposit',      label: 'Cash Deposit'      },
                            { value: 'Petty Cash Return', label: 'Petty Cash Return' },
                            { value: 'Loan Repayment',    label: 'Loan Repayment'    },
                            { value: 'Customer Payment',  label: 'Customer Payment'  },
                            { value: 'Other Income',      label: 'Other Income'      },
                          ]
                        : [
                            { value: 'Petty Cash',   label: 'Petty Cash'   },
                            { value: 'Electricity',  label: 'Electricity'  },
                            { value: 'Rent',         label: 'Rent'         },
                            { value: 'Salary',       label: 'Salary'       },
                            { value: 'Transport',    label: 'Transport'    },
                            { value: 'Stationery',   label: 'Stationery'   },
                            { value: 'Maintenance',  label: 'Maintenance'  },
                            { value: 'Other',        label: 'Other'        },
                          ];
                      const defaultValues = new Set(defaults.map(d => d.value));
                      const custom = customCategories
                        .filter(c => c.type === txnType && !defaultValues.has(c.name))
                        .map(c => ({ value: c.name, label: c.name }));
                      return [...defaults, ...custom, { value: '__ADD_NEW__', label: '+ Add New Category' }];
                    })()}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Link to Party */}
          <div>
            <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">
              Link to Party <span className="font-normal normal-case text-muted-foreground/50">(optional)</span>
            </label>
            {txnPartyId ? (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-2xl shadow-sm">
                <span className="text-sm font-bold text-foreground flex-1 truncate">{txnPartyName}</span>
                <button
                  onClick={() => { setTxnPartyId(''); setTxnPartyName(''); setPartySearch(''); }}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={partySearch}
                  onChange={(e) => setPartySearch(e.target.value)}
                  placeholder="Search party…"
                  className="w-full pl-9 pr-3 py-2.5 text-sm bg-card border border-border rounded-2xl outline-none focus:border-primary/30 text-foreground placeholder:text-muted-foreground/50 shadow-sm transition-all"
                />
                {partySearch && (
                  <div className="absolute top-full mt-1 left-0 right-0 bg-card border border-border rounded-2xl shadow-xl z-10 max-h-40 overflow-y-auto">
                    {parties
                      .filter((p) => p.name.toLowerCase().includes(partySearch.toLowerCase()))
                      .slice(0, 20)
                      .map((p) => (
                        <button
                          key={p.party_id}
                          onClick={() => { setTxnPartyId(p.party_id); setTxnPartyName(p.name); setPartySearch(''); }}
                          className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer border-b border-border last:border-0"
                        >
                          <span className="font-bold">{p.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">{p.phone || ''}</span>
                        </button>
                      ))
                    }
                    {parties.filter((p) => p.name.toLowerCase().includes(partySearch.toLowerCase())).length === 0 && (
                      <p className="px-4 py-3 text-xs text-muted-foreground text-center">No parties found</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">
              Notes <span className="font-normal normal-case text-muted-foreground/50">(optional)</span>
            </label>
            <textarea
              value={txnNote}
              onChange={(e) => setTxnNote(e.target.value)}
              placeholder="Add a note…"
              className="w-full px-4 py-2.5 text-sm bg-card border border-border rounded-2xl outline-none focus:border-primary/30 text-foreground placeholder:text-muted-foreground/50 resize-none h-20 shadow-sm transition-all"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end pt-1">
            <button
              onClick={handleAddTransaction}
              disabled={txnSubmitting || txnAmt <= 0}
              className={clsx(
                'px-6 py-3 text-sm font-black text-white rounded-xl shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:opacity-40',
                txnType === 'CASH_IN' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'
              )}
            >
              {txnSubmitting ? 'Recording…' : txnType === 'CASH_IN' ? 'Record Cash In' : 'Record Expense'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
