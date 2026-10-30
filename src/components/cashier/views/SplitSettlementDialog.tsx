import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import React from 'react';
import { Modal } from '../../ui/Modal';
import { SplitSquareHorizontal, Banknote, CreditCard, Smartphone, Wallet, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../../../utils/pricing/money';
import { Select } from '../../ui/Select';
import clsx from 'clsx';
import { cashierApi } from '../../../data/cashier';
import { useTabStore } from '../../../store/tabStore';
import type { UpiPageConfig } from '../../../utils/print/upiConfig';
import type { CashierInvoiceRow, CashierUpiSourceRow } from '../cashierTypes';

export interface SplitSettlementDialogProps {
  getRawNet: (inv: CashierInvoiceRow) => number;
  load: () => Promise<void>;
  rowDiscs: Record<string, number>;
  selectedUpiSourceId: string;
  setSelectedUpiSourceId: React.Dispatch<React.SetStateAction<string>>;
  setSplitBank: React.Dispatch<React.SetStateAction<number | "">>;
  setSplitCard: React.Dispatch<React.SetStateAction<number | "">>;
  setSplitCash: React.Dispatch<React.SetStateAction<number | "">>;
  setSplitModalInvoice: React.Dispatch<React.SetStateAction<CashierInvoiceRow | null>>;
  setSplitSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  setSplitUpi: React.Dispatch<React.SetStateAction<number | "">>;
  splitBank: number | "";
  splitCard: number | "";
  splitCash: number | "";
  splitModalInvoice: CashierInvoiceRow | null;
  splitModalNet: number;
  splitSubmitting: boolean;
  splitUpi: number | "";
  tenantId: string | null;
  upiPageConfig: UpiPageConfig;
  upiSources: CashierUpiSourceRow[];
  userId: string | null;
  userName: string | null;
}

/** Settle a pending invoice with a split payment (amount per method). */
export function SplitSettlementDialog({
  getRawNet, load, rowDiscs, selectedUpiSourceId, setSelectedUpiSourceId, setSplitBank, setSplitCard, setSplitCash,
  setSplitModalInvoice, setSplitSubmitting, setSplitUpi, splitBank, splitCard, splitCash, splitModalInvoice,
  splitModalNet, splitSubmitting, splitUpi, tenantId, upiPageConfig, upiSources, userId, userName,
}: SplitSettlementDialogProps) {
  return (
    <Modal
      isOpen={!!splitModalInvoice}
      onClose={() => setSplitModalInvoice(null)}
      title={
        <div className="flex items-center gap-2">
          <SplitSquareHorizontal className="w-4 h-4 text-primary" />
          <span>Split Payment Settlement</span>
        </div>
      }
    >
      {splitModalInvoice && (() => {
        const net = splitModalNet;
        const c = parseFloat(splitCash.toString()) || 0;
        const cd = parseFloat(splitCard.toString()) || 0;
        const u = parseFloat(splitUpi.toString()) || 0;
        const b = parseFloat(splitBank.toString()) || 0;
        const totalEntered = Math.round((c + cd + u + b) * 100) / 100;
        const diff = Math.round((net - totalEntered) * 100) / 100;
        const isMatched = Math.abs(diff) < 0.01;
        const isShort = diff > 0.01;

        return (
          <div className="space-y-5">
            {/* Invoice & Net Summary Card */}
            <div className="p-4 rounded-2xl bg-muted/20 border border-border flex items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">Invoice</span>
                <span className="text-sm font-extrabold text-foreground">{splitModalInvoice.invoice_number}</span>
                {splitModalInvoice.customer_name && (
                  <span className="text-xs text-muted-foreground block mt-0.5">{splitModalInvoice.customer_name}</span>
                )}
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">Net Payable</span>
                <span className="text-xl font-black text-primary tabular-nums">{formatCurrency(net)}</span>
              </div>
            </div>

            {/* Input Breakdown Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Cash */}
              <div className="p-3 rounded-xl border border-border bg-card space-y-1.5 focus-within:border-emerald-500/60 focus-within:ring-2 focus-within:ring-emerald-500/10 transition-all">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Banknote className="w-3.5 h-3.5 text-emerald-500" /> Cash
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const rem = Math.max(0, Math.round((net - (cd + u + b)) * 100) / 100);
                      setSplitCash(rem > 0 ? rem : '');
                    }}
                    className="text-[9px] font-bold text-primary hover:underline cursor-pointer"
                  >
                    Fill Rem.
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">{getCurrencyPrefix()}</span>
                  <input
                    type="number"
                    value={splitCash}
                    onChange={(e) => setSplitCash(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="0.00"
                    step="0.01" min="0"
                    className="w-full pl-7 pr-3 py-1.5 text-sm font-extrabold bg-muted/20 border border-border rounded-lg outline-none text-foreground tabular-nums"
                  />
                </div>
              </div>

              {/* Card */}
              <div className="p-3 rounded-xl border border-border bg-card space-y-1.5 focus-within:border-blue-500/60 focus-within:ring-2 focus-within:ring-blue-500/10 transition-all">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-blue-500" /> Card
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const rem = Math.max(0, Math.round((net - (c + u + b)) * 100) / 100);
                      setSplitCard(rem > 0 ? rem : '');
                    }}
                    className="text-[9px] font-bold text-primary hover:underline cursor-pointer"
                  >
                    Fill Rem.
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">{getCurrencyPrefix()}</span>
                  <input
                    type="number"
                    value={splitCard}
                    onChange={(e) => setSplitCard(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="0.00"
                    step="0.01" min="0"
                    className="w-full pl-7 pr-3 py-1.5 text-sm font-extrabold bg-muted/20 border border-border rounded-lg outline-none text-foreground tabular-nums"
                  />
                </div>
              </div>

              {/* UPI */}
              <div className="p-3 rounded-xl border border-border bg-card space-y-1.5 focus-within:border-violet-500/60 focus-within:ring-2 focus-within:ring-violet-500/10 transition-all">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-violet-500" /> UPI
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const rem = Math.max(0, Math.round((net - (c + cd + b)) * 100) / 100);
                      setSplitUpi(rem > 0 ? rem : '');
                    }}
                    className="text-[9px] font-bold text-primary hover:underline cursor-pointer"
                  >
                    Fill Rem.
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">{getCurrencyPrefix()}</span>
                  <input
                    type="number"
                    value={splitUpi}
                    onChange={(e) => setSplitUpi(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="0.00"
                    step="0.01" min="0"
                    className="w-full pl-7 pr-3 py-1.5 text-sm font-extrabold bg-muted/20 border border-border rounded-lg outline-none text-foreground tabular-nums"
                  />
                </div>

                {/* Page-wise Config: Show UPI Account List if Settlement Page is Enabled */}
                {upiPageConfig.settlement && (splitUpi !== '' && Number(splitUpi) > 0) && upiSources.length > 0 && (
                  <div className="pt-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground block mb-1">Target UPI Account:</label>
                    <Select
                      value={selectedUpiSourceId || upiSources[0]?.source_id || ''}
                      onChange={(val) => setSelectedUpiSourceId(val)}
                      options={upiSources.map((s) => ({
                        value: s.source_id,
                        label: `${s.name} (${s.upi_id || 'No UPI ID'})`
                      }))}
                      className="w-full text-xs py-1"
                    />
                  </div>
                )}
              </div>

              {/* Bank */}
              <div className="p-3 rounded-xl border border-border bg-card space-y-1.5 focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/10 transition-all">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-amber-500" /> Bank Transfer
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const rem = Math.max(0, Math.round((net - (c + cd + u)) * 100) / 100);
                      setSplitBank(rem > 0 ? rem : '');
                    }}
                    className="text-[9px] font-bold text-primary hover:underline cursor-pointer"
                  >
                    Fill Rem.
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">{getCurrencyPrefix()}</span>
                  <input
                    type="number"
                    value={splitBank}
                    onChange={(e) => setSplitBank(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="0.00"
                    step="0.01" min="0"
                    className="w-full pl-7 pr-3 py-1.5 text-sm font-extrabold bg-muted/20 border border-border rounded-lg outline-none text-foreground tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* Balance Status Banner */}
            <div className={clsx(
              'p-3.5 rounded-xl border flex items-center justify-between transition-all',
              isMatched ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' :
              isShort   ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400' :
                          'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
            )}>
              <div className="flex items-center gap-2">
                {isMatched ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                <div>
                  <p className="text-xs font-extrabold leading-tight">
                    {isMatched ? 'Split Balanced & Ready' : isShort ? 'Remaining Balance' : 'Amount Exceeds Net'}
                  </p>
                  <p className="text-[10px] opacity-80 font-medium mt-0.5">
                    {isMatched ? 'Total matches net payable' : isShort ? `Add ${formatCurrency(diff)} to match net` : `Over by ${formatCurrency(Math.abs(diff))}`}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black uppercase tracking-wider block opacity-70">Total Entered</span>
                <span className="text-base font-black tabular-nums">{formatCurrency(totalEntered)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                disabled={!isMatched || totalEntered <= 0 || splitSubmitting}
                onClick={async () => {
                  setSplitSubmitting(true);
                  const splitDetails = { cash: c, card: cd, upi: u, bank_transfer: b, upi_source_id: u > 0 && upiPageConfig.settlement ? (selectedUpiSourceId || upiSources[0]?.source_id || undefined) : undefined };
                  const r = await cashierApi.settlePayment({
                    tenant_id: tenantId!,
                    invoice_id: splitModalInvoice.invoice_id,
                    received_amount: net,
                    discount_amount: getRawNet(splitModalInvoice) < 0 ? 0 : (Number(rowDiscs[splitModalInvoice.invoice_id]) || 0),
                    payment_method: 'SPLIT',
                    split_details: splitDetails,
                    user_id: userId!,
                    user_name: userName || undefined,
                  });
                  setSplitSubmitting(false);
                  if (r.success) {
                    setSplitModalInvoice(null);
                    const invId = splitModalInvoice.invoice_id;
                    const invNum = splitModalInvoice.invoice_number;
                    useTabStore.getState().tabs.forEach(t => {
                      if (t.snapshot?.editingInvoiceId === invId || t.title === invNum || t.reservedInvoiceNumber === invNum) {
                        useTabStore.getState().updateTabById(t.id, {
                          paymentMethod: 'SPLIT',
                          splitDetails: splitDetails,
                          receivedAmount: net,
                        });
                      }
                    });
                    await load();
                  }
                }}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 transition-all cursor-pointer shadow-sm"
              >
                {splitSubmitting ? (
                  <span className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Confirm Split Settlement
              </button>
            </div>
          </div>
        );
      })()}
    </Modal>
  );
}
