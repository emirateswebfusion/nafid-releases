import React from 'react';
import {
  Activity, AlertCircle, AlertTriangle, Banknote, CheckCircle2,
  FileText, Hash, Loader2, MinusCircle, PlusCircle, Save, TrendingUp
} from 'lucide-react';
import clsx from 'clsx';
import { PaymentMethodIcon } from '../partyHelpers';
import { WhatsAppIcon } from '../../ui/WhatsAppIcon';
import { formatWhatsAppLedgerTxMessage } from '../../../utils/whatsappBillHelper';

const fieldCls = "w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm";

export interface PartyTransactionFormProps {
  selectedParty: NonNullable<import('../hooks/usePartyManagerState').PartyManagerState['selectedParty']>;
  editingTx: import('../hooks/usePartyManagerState').PartyManagerState['editingTx'];
  txForm: import('../hooks/usePartyManagerState').PartyManagerState['txForm'];
  setTxForm: import('../hooks/usePartyManagerState').PartyManagerState['setTxForm'];
  isSavingTx: boolean;
  enablePartyEstimate: boolean;
  enablePartyGst: boolean;
  ledgerWhatsappEnabled: boolean;
  ledgerWhatsappIncludeShop: boolean;
  shopDetails: import('../hooks/usePartyManagerState').PartyManagerState['shopDetails'];
  shopName?: string;
  statusMessage?: import('../hooks/usePartyManagerState').PartyManagerState['statusMessage'];
  getPartyBalance: (p: import('../partyTypes').Party) => number;
  handleSaveTx: (e: React.FormEvent) => void;
  handleFormKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
  onCancel: () => void;
}

export const PartyTransactionForm: React.FC<PartyTransactionFormProps> = ({
  selectedParty,
  editingTx,
  txForm,
  setTxForm,
  isSavingTx,
  enablePartyEstimate,
  enablePartyGst,
  ledgerWhatsappEnabled,
  ledgerWhatsappIncludeShop,
  shopDetails,
  shopName,
  statusMessage,
  getPartyBalance,
  handleSaveTx,
  handleFormKeyDown,
  onCancel,
}) => {
  return (
        <form onSubmit={handleSaveTx} onKeyDown={handleFormKeyDown as unknown as React.KeyboardEventHandler<HTMLFormElement>} className="flex flex-col flex-1 min-h-0 bg-background">
          <div className="flex-1 overflow-y-auto p-5 space-y-4" data-enter-nav>

            <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
              <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <Activity className="w-4 h-4" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-primary">Transaction Details</span>
                <span className="ml-auto text-xs text-muted-foreground font-medium">
                  Party: <span className="font-bold text-foreground">{selectedParty.name}</span>
                </span>
              </div>

              {/* Type selector */}
              <div className="mb-5">
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Transaction Type</label>
                <div className="grid grid-cols-2 gap-3 max-w-sm">
                  <button
                    type="button"
                    onClick={() => setTxForm(f => ({ ...f, transaction_type: 'CREDIT' }))}
                    className={clsx(
                      'py-3.5 px-4 rounded-xl border-2 text-sm font-black transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center gap-2',
                      txForm.transaction_type === 'CREDIT'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 shadow-sm'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <PlusCircle className="w-4 h-4" /> Paid
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxForm(f => ({ ...f, transaction_type: 'DEBIT' }))}
                    className={clsx(
                      'py-3.5 px-4 rounded-xl border-2 text-sm font-black transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center gap-2',
                      txForm.transaction_type === 'DEBIT'
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 shadow-sm'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <MinusCircle className="w-4 h-4" /> Received
                  </button>
                </div>
              </div>

              {/* Balance type selector: if on 2 then view 2, if one then view one */}
              {(enablePartyGst && enablePartyEstimate) ? (
                <div className="mb-5">
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Adjust Against</label>
                  <div className="grid grid-cols-2 gap-3 max-w-sm">
                    <button
                      type="button"
                      onClick={() => setTxForm(f => ({ ...f, balance_type: 'GST' }))}
                      className={clsx(
                        'py-3 px-4 rounded-xl border-2 text-sm font-black transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center gap-2',
                        txForm.balance_type === 'GST'
                          ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400 shadow-sm'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted'
                      )}
                    >
                      <FileText className="w-4 h-4" /> GST Balance
                    </button>
                    <button
                      type="button"
                      onClick={() => setTxForm(f => ({ ...f, balance_type: 'ESTIMATE' }))}
                      className={clsx(
                        'py-3 px-4 rounded-xl border-2 text-sm font-black transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center gap-2',
                        txForm.balance_type === 'ESTIMATE'
                          ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 shadow-sm'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted'
                      )}
                    >
                      <TrendingUp className="w-4 h-4" /> Estimate Balance
                    </button>
                  </div>
                </div>
              ) : (!enablePartyGst && enablePartyEstimate) ? (
                <div className="mb-5">
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Adjust Against</label>
                  <div className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/30 text-violet-700 dark:text-violet-400 text-xs font-bold">
                    <TrendingUp className="w-4 h-4" />
                    <span>Adjusting Against: <strong>Estimate Balance</strong></span>
                  </div>
                </div>
              ) : (enablePartyGst && !enablePartyEstimate) ? (
                <div className="mb-5">
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Adjust Against</label>
                  <div className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-700 dark:text-sky-400 text-xs font-bold">
                    <FileText className="w-4 h-4" />
                    <span>Adjusting Against: <strong>GST Balance</strong></span>
                  </div>
                </div>
              ) : null}

              {/* Amount + Date */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Amount (₹) *</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm pointer-events-none">₹</span>
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={txForm.amount}
                      onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))}
                      onWheel={e => (e.target as HTMLInputElement).blur()}
                      className={clsx(fieldCls, 'pl-8 no-spinners text-lg font-black')}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Date & Time</label>
                  <input
                    type="datetime-local"
                    value={txForm.transaction_date}
                    onChange={e => setTxForm(f => ({ ...f, transaction_date: e.target.value }))}
                    className={fieldCls}
                  />
                </div>
              </div>

              {/* Description */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Description / Remarks</label>
                <textarea
                  placeholder="e.g. Payment received for Invoice #123"
                  rows={2}
                  value={txForm.description}
                  onChange={e => setTxForm(f => ({ ...f, description: e.target.value }))}
                  className={clsx(fieldCls, 'resize-none')}
                />
              </div>

              {/* Reference */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Reference / Invoice No.</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Optional reference number"
                    value={txForm.reference_number}
                    onChange={e => setTxForm(f => ({ ...f, reference_number: e.target.value }))}
                    className={clsx(fieldCls, 'pl-9')}
                  />
                </div>
              </div>

              {/* Payment method */}
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Payment Method</label>
                <div className="grid grid-cols-6 gap-2">
                  {(['CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'OTHER'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTxForm(f => ({ ...f, payment_method: m }))}
                      className={clsx(
                        'py-2.5 px-2 rounded-xl border-2 text-[11px] font-bold transition-all duration-200 active:scale-95 cursor-pointer flex flex-col items-center gap-1 leading-tight',
                        txForm.payment_method === m
                          ? m === 'CASH'
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 shadow-sm'
                            : 'border-primary bg-primary/10 text-primary shadow-sm'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted'
                      )}
                    >
                      <PaymentMethodIcon method={m} />
                      {m === 'CASH' ? 'Cash' : m === 'BANK_TRANSFER' ? 'Bank' : m === 'UPI' ? 'UPI' : m === 'CARD' ? 'Card' : m === 'CHEQUE' ? 'Cheque' : 'Other'}
                    </button>
                  ))}
                </div>
                {txForm.payment_method === 'CASH' && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-2 flex items-center gap-1.5">
                    <Banknote className="w-3.5 h-3.5" />
                    {txForm.transaction_type === 'CREDIT'
                      ? 'This will deduct cash from the drawer'
                      : 'This will add cash to the drawer'}
                  </p>
                )}
              </div>

              {/* WhatsApp Notification Card */}
              {ledgerWhatsappEnabled && (
                <div className="mt-5 p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <WhatsAppIcon className="w-4 h-4 text-emerald-500 fill-current" />
                      </div>
                      <div>
                        <span className="text-xs font-black text-foreground block">
                          Send WhatsApp Alert to Party
                        </span>
                        <span className="text-[11px] text-muted-foreground block">
                          Instant delivery upon saving this transaction
                        </span>
                      </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer shrink-0 select-none">
                      <input
                        type="checkbox"
                        checked={txForm.send_whatsapp}
                        onChange={e => setTxForm(f => ({ ...f, send_whatsapp: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-muted/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 shadow-inner"></div>
                    </label>
                  </div>

                  {selectedParty?.phone ? (
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-emerald-500/15">
                      <span>Recipient: <strong className="text-foreground font-mono">+{selectedParty.phone}</strong></span>
                      {selectedParty.whatsapp_alerts_enabled === 0 || selectedParty.whatsapp_alerts_enabled === false ? (
                        <span className="text-amber-500 font-semibold text-[10px]">⚠️ Party profile has WhatsApp alerts turned off</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">Ready to send</span>
                      )}
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-400 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>Party has no phone number. WhatsApp message cannot be sent.</span>
                    </div>
                  )}

                  {txForm.send_whatsapp && (
                    <div className="p-3 rounded-xl bg-card border border-border font-mono text-xs text-foreground leading-relaxed shadow-inner space-y-1">
                      <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-muted-foreground mb-1 block">
                        Message Preview:
                      </span>
                      <div className="whitespace-pre text-emerald-700 dark:text-emerald-400 font-bold bg-muted/40 p-2.5 rounded-lg text-xs leading-relaxed overflow-x-auto">
                        {(() => {
                          const ob = getPartyBalance(selectedParty);
                          const amt = parseFloat(txForm.amount) || 0;
                          const credit = txForm.transaction_type === 'CREDIT' ? amt : 0;
                          const debit = txForm.transaction_type === 'DEBIT' ? amt : 0;
                          const nb = ob + credit - debit;
                          const effectiveShopName = shopDetails.shopName || shopName || '';
                          return formatWhatsAppLedgerTxMessage({
                            openingBalance: ob,
                            amount: amt,
                            newBalance: nb,
                            paymentMethod: txForm.payment_method,
                            transactionType: txForm.transaction_type,
                            partyName: selectedParty.name,
                            shopName: effectiveShopName,
                            includeShopName: ledgerWhatsappIncludeShop,
                          });
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border bg-card px-5 py-3">
            {statusMessage && (
              <div className={clsx(
                'flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-bold mb-3 animate-in fade-in duration-200',
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40 text-red-600'
              )}>
                {statusMessage.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                {statusMessage.text}
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground font-medium">
                {txForm.amount && parseFloat(txForm.amount) > 0 && (
                  <span className={clsx('font-bold', txForm.transaction_type === 'CREDIT' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
                    {txForm.transaction_type === 'CREDIT' ? '+' : '-'}₹{parseFloat(txForm.amount).toFixed(2)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  data-enter-submit
                  disabled={isSavingTx}
                  className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
                >
                  {isSavingTx ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isSavingTx ? 'Saving…' : editingTx ? 'Update' : 'Add Transaction'}
                </button>
              </div>
            </div>
          </div>
        </form>

  );
};
