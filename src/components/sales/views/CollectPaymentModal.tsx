import { Modal } from '../../ui/Modal';
import { RedCrossButton } from '../../ui/RedCrossButton';
import { Banknote, BookOpen, CheckCheck, CreditCard, AlertCircle, FileText, RefreshCw, Smartphone, Wallet } from 'lucide-react';
import { formatCurrency } from '../../../utils/money';
import clsx from 'clsx';
import { Select } from '../../ui/Select';
import type { UpiPageConfig } from '../../../utils/upiConfig';
import type { SalesInvoiceRow, UpiSourceOption } from '../salesTypes';

const COLLECT_PAYMENT_OPTIONS = [
  { value: 'CASH' as const, label: 'Cash', icon: Banknote, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500', iconBg: 'bg-emerald-500/15' },
  { value: 'CARD' as const, label: 'Card', icon: Wallet, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500', iconBg: 'bg-blue-500/15' },
  { value: 'UPI' as const, label: 'UPI', icon: Smartphone, color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500', iconBg: 'bg-violet-500/15' },
  { value: 'CHEQUE' as const, label: 'Cheque', icon: FileText, color: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500', iconBg: 'bg-indigo-500/15' },
  { value: 'CREDIT' as const, label: 'Credit', icon: BookOpen, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500', iconBg: 'bg-amber-500/15' },
];

export interface CollectPaymentModalProps {
  collectPaymentMethod: "CASH" | "CARD" | "UPI" | "CHEQUE" | "CREDIT";
  collectPaymentOpen: boolean;
  collectPaymentSaving: boolean;
  collectPaymentSuccess: boolean;
  collectReceivedAmount: number;
  collectUpiSourceId: string;
  handleCollectPayment: () => Promise<void>;
  selectedInvoice: SalesInvoiceRow | null;
  setCollectPaymentMethod: React.Dispatch<React.SetStateAction<"CASH" | "CARD" | "UPI" | "CHEQUE" | "CREDIT">>;
  setCollectPaymentOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setCollectReceivedAmount: React.Dispatch<React.SetStateAction<number>>;
  setCollectUpiSourceId: React.Dispatch<React.SetStateAction<string>>;
  upiPageConfig: UpiPageConfig;
  upiSources: UpiSourceOption[];
}

/** Collect payment for a pending invoice: method, amount received, then settle. */
export function CollectPaymentModal({
  collectPaymentMethod, collectPaymentOpen, collectPaymentSaving, collectPaymentSuccess,
  collectReceivedAmount, collectUpiSourceId, handleCollectPayment, selectedInvoice, setCollectPaymentMethod,
  setCollectPaymentOpen, setCollectReceivedAmount, setCollectUpiSourceId, upiPageConfig, upiSources,
}: CollectPaymentModalProps) {
  return (
    <Modal
      isOpen={collectPaymentOpen}
      onClose={() => setCollectPaymentOpen(false)}
      closeButton={<RedCrossButton onClick={() => setCollectPaymentOpen(false)} />}
      title={
        <div className="flex items-center gap-2.5 font-bold text-foreground">
          <CreditCard className="w-5 h-5 text-emerald-500" />
          <span>Collect Payment</span>
        </div>
      }
    >
      <div className="space-y-4 min-w-[420px] text-foreground">
        {selectedInvoice && (
          <>
            <div className="flex items-center justify-between p-4 bg-primary/5 border border-primary/20 rounded-2xl">
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Invoice</p>
                <p className="text-sm font-bold text-foreground mt-0.5">{selectedInvoice.invoice_number}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Grand Total</p>
                <p className="text-xl font-black text-primary mt-0.5">{formatCurrency(Number(selectedInvoice.grand_total) || 0)}</p>
              </div>
            </div>

            {/* Payment method selection */}
            <div>
              <p className="text-xs font-black text-muted-foreground uppercase tracking-wider mb-2">Payment Method</p>
              <div className="grid grid-cols-2 gap-2">
                {COLLECT_PAYMENT_OPTIONS.map(opt => {
                  const isActive = collectPaymentMethod === opt.value;
                  return (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => {
                        setCollectPaymentMethod(opt.value);
                        if (opt.value === 'CARD' || opt.value === 'UPI' || opt.value === 'CHEQUE') {
                          setCollectReceivedAmount(Number(selectedInvoice.grand_total) || 0);
                        }
                      }}
                      className={clsx(
                        'flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl border-2 transition-all duration-150 active:scale-[0.98] cursor-pointer',
                        isActive
                          ? `${opt.bg} ${opt.border} ${opt.color} shadow-xs ring-1 ring-primary/20`
                          : 'border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground hover:border-border/80'
                      )}
                    >
                      <div className={clsx(
                        'p-2 rounded-xl transition-colors',
                        isActive ? opt.iconBg : 'bg-muted'
                      )}>
                        <opt.icon className="w-4.5 h-4.5" />
                      </div>
                      <span className="text-xs font-bold">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Received amount — shown for CASH and CREDIT */}
            {(collectPaymentMethod === 'CASH' || collectPaymentMethod === 'CREDIT') && (
              <div>
                <p className="text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">
                  {collectPaymentMethod === 'CREDIT' ? 'Amount Paid' : 'Amount Received'}
                </p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground/60">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={collectReceivedAmount || ''}
                    onChange={e => setCollectReceivedAmount(e.target.value === '' ? 0 : Number(e.target.value))}
                    className="w-full pl-8 pr-4 py-2.5 bg-background border border-border rounded-xl text-sm font-black text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="Enter amount received"
                  />
                </div>
                {collectReceivedAmount > 0 && (
                  <div className={clsx(
                    'mt-1.5 text-xs font-bold text-right',
                    collectReceivedAmount >= (Number(selectedInvoice.grand_total) || 0)
                      ? 'text-emerald-500'
                      : 'text-amber-500'
                  )}>
                    {collectPaymentMethod === 'CREDIT' ? 'Balance Due' : 'Change'}: {formatCurrency(Math.abs(collectReceivedAmount - (Number(selectedInvoice.grand_total) || 0)))}
                  </div>
                )}
              </div>
            )}

            {/* Exact payment notice for CARD/UPI */}
            {(collectPaymentMethod === 'CARD' || collectPaymentMethod === 'UPI' || collectPaymentMethod === 'CHEQUE') && (
              <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl text-xs text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Payment will be recorded as exact amount of {formatCurrency(Number(selectedInvoice.grand_total) || 0)}
              </div>
            )}

            {/* UPI Account Selector (Page-wise Config: Sales History) */}
            {collectPaymentMethod === 'UPI' && upiPageConfig.sales_history && upiSources.length > 0 && (
              <div className="p-3 bg-violet-500/10 border border-violet-500/30 rounded-xl space-y-1.5">
                <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-violet-500" />
                  Select Receiving UPI Account
                </label>
                <Select
                  value={collectUpiSourceId || upiSources[0]?.source_id || ''}
                  onChange={(val) => setCollectUpiSourceId(val)}
                  options={upiSources.map((s: any) => ({
                    value: s.source_id,
                    label: `${s.name} (${s.upi_id || 'No UPI ID'})`
                  }))}
                  className="w-full text-xs"
                />
              </div>
            )}

            {/* CREDIT requires customer info */}
            {collectPaymentMethod === 'CREDIT' && !selectedInvoice.customer_name && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Customer info was not collected during billing. Credit may not be fully tracked.
              </div>
            )}

            {collectPaymentSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-xl text-center text-xs font-bold animate-in fade-in">
                <CheckCheck className="w-4 h-4 inline mr-1.5" />
                Payment recorded successfully!
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setCollectPaymentOpen(false)}
                disabled={collectPaymentSaving}
                className="h-10 px-4 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-150 active:scale-95 cursor-pointer border border-border/80"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCollectPayment}
                disabled={collectPaymentSaving || collectPaymentSuccess}
                className="h-10 px-6 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm shadow-emerald-600/20 cursor-pointer flex items-center gap-2"
              >
                {collectPaymentSaving ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </span>
                ) : (
                  <span>Confirm Payment</span>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
