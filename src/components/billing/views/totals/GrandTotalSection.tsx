import clsx from 'clsx';
import { Skeleton } from '../../../ui/Skeleton';
import { formatCurrency } from '../../BillingConstants';
import type { Tab } from '../../../../store/tabStore';
import type { BillingTotalsPanelProps } from '../BillingTotalsPanel';

export interface GrandTotalSectionProps {
  activeTab: BillingTotalsPanelProps['activeTab'];
  actualRefundPaid: number;
  commitTotalOverride: BillingTotalsPanelProps['commitTotalOverride'];
  customerName: BillingTotalsPanelProps['customerName'];
  customerPhone: BillingTotalsPanelProps['customerPhone'];
  discount: number;
  displayGrandTotal: number;
  editingActive: string | null;
  editingQuotationId: string | null;
  findMatchingParty: BillingTotalsPanelProps['findMatchingParty'];
  focusDescriptionOrDiscount: BillingTotalsPanelProps['focusDescriptionOrDiscount'];
  grandTotal: number;
  handleResetGrandTotalOverride: BillingTotalsPanelProps['handleResetGrandTotalOverride'];
  isEditingTotal: boolean;
  isGrandTotalOverridden: boolean;
  isLoadingEditBill: boolean;
  isQuotationMode: boolean;
  isReturnMode: boolean;
  isScrapMode: boolean;
  overrideTotalInput: BillingTotalsPanelProps['overrideTotalInput'];
  paymentMethod: BillingTotalsPanelProps['paymentMethod'];
  paymentOptionRefs: BillingTotalsPanelProps['paymentOptionRefs'];
  rawDisplayGrandTotal: number;
  receivedAmount: number;
  receivedInputRef: BillingTotalsPanelProps['receivedInputRef'];
  refundAmount: number;
  setIsEditingTotal: BillingTotalsPanelProps['setIsEditingTotal'];
  setOverrideTotalInput: BillingTotalsPanelProps['setOverrideTotalInput'];
  splitDetails: BillingTotalsPanelProps['splitDetails'];
  splitTotal: number;
  startEditingTotal: BillingTotalsPanelProps['startEditingTotal'];
  storeReturnDeduction: number;
  storeScrapDeduction: number;
  totalOverrideInputRef: BillingTotalsPanelProps['totalOverrideInputRef'];
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
}

/** Grand total, amount received and change / new total due. */
export function GrandTotalSection({
  activeTab, actualRefundPaid, commitTotalOverride, customerName, customerPhone, discount, displayGrandTotal,
  editingActive, editingQuotationId, findMatchingParty, focusDescriptionOrDiscount, grandTotal,
  handleResetGrandTotalOverride, isEditingTotal, isGrandTotalOverridden, isLoadingEditBill, isQuotationMode,
  isReturnMode, isScrapMode, overrideTotalInput, paymentMethod, paymentOptionRefs, rawDisplayGrandTotal,
  receivedAmount, receivedInputRef, refundAmount, setIsEditingTotal, setOverrideTotalInput, splitDetails, splitTotal,
  startEditingTotal, storeReturnDeduction, storeScrapDeduction, totalOverrideInputRef, updateActiveTab,
}: GrandTotalSectionProps) {
  return (
    <div className="mx-3 my-1.5 flex items-center gap-1.5 px-3 py-3 bg-primary/10 border-2 border-primary/25 rounded-2xl">
      {/* Total amount */}
      <div className={clsx(
        'flex min-w-0 items-start justify-between gap-2',
        refundAmount > 0 && !isLoadingEditBill && paymentMethod !== 'CASH' && paymentMethod !== 'CREDIT' ? 'flex-[1.5]' : 'flex-1'
      )}>
        <div className="min-w-0 shrink-0">
          <p className="text-[9px] font-black text-primary uppercase tracking-wider">
            {isReturnMode ? 'Return Total' : isScrapMode ? 'Scrap Total' : (storeScrapDeduction > 0 || storeReturnDeduction > 0) ? 'After Adj.' : 'Total'}
          </p>
          {isLoadingEditBill ? (
            <Skeleton className="h-6 w-28 my-1 rounded-md" />
          ) : isEditingTotal ? (
            <div className="relative mt-1">
              <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-sm font-black text-primary select-none">₹</span>
              <input
                ref={totalOverrideInputRef}
                type="number"
                step="any"
                min="0"
                value={overrideTotalInput}
                onChange={(e) => setOverrideTotalInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitTotalOverride();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setIsEditingTotal(false);
                  }
                }}
                onBlur={() => commitTotalOverride()}
                placeholder={String(rawDisplayGrandTotal)}
                className="w-32 pl-5 pr-2 py-0.5 bg-background border-2 border-primary rounded-xl text-xl font-black text-foreground outline-none no-spinners shadow-xs"
                autoFocus
              />
            </div>
          ) : (
            <p
              onClick={startEditingTotal}
              title="Click to edit total"
              className="text-xl font-black text-foreground leading-none cursor-pointer mt-0.5 hover:text-primary transition-colors select-none"
            >
              {formatCurrency(displayGrandTotal)}
            </p>
          )}
          {isGrandTotalOverridden && !isLoadingEditBill && (
            <div className="mt-1 flex items-center gap-1">
              <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md border border-amber-500/20">
                Overridden (Base: {formatCurrency(rawDisplayGrandTotal + (discount || 0))})
              </span>
              <button
                type="button"
                onClick={handleResetGrandTotalOverride}
                title="Reset to calculated total"
                className="text-[9px] font-extrabold text-destructive hover:underline cursor-pointer"
              >
                Reset
              </button>
            </div>
          )}
          {refundAmount > 0 && !isLoadingEditBill && (
            <p className="mt-1.5 text-[10px] font-black text-orange-600">
              Refund: {formatCurrency(refundAmount)}
            </p>
          )}
        </div>
        {refundAmount > 0 && !isLoadingEditBill && paymentMethod !== 'CASH' && paymentMethod !== 'CREDIT' && (
          <div className="mt-1 ml-auto flex shrink-0 flex-col items-end gap-1">
            <div className="inline-flex w-[190px] max-w-full items-center justify-between gap-2 rounded-xl border border-orange-400/40 bg-orange-500/10 px-2.5 py-1.5 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wide text-orange-700 dark:text-orange-300">Paid</span>
              <div className="relative w-28 shrink-0">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-orange-600/70">₹</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={actualRefundPaid || ''}
                  placeholder={String(refundAmount)}
                  onChange={e => updateActiveTab({ actualRefundPaid: e.target.value === '' ? 0 : Number(e.target.value) })}
                  onFocus={e => e.target.select()}
                  aria-label="Amount paid as refund"
                  className="no-spinners h-8 w-full rounded-lg border border-orange-300/50 bg-background/90 pl-6 pr-2 text-right text-sm font-black tabular-nums text-orange-700 shadow-inner transition-colors placeholder:text-orange-400/60 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-400/30 dark:text-orange-300"
                />
              </div>
            </div>
            {actualRefundPaid > refundAmount && (
              <p className="text-[9px] font-bold text-rose-500">
                Over by {formatCurrency(actualRefundPaid - refundAmount)}
              </p>
            )}
          </div>
        )}
      </div>
      {/* Divider — hidden in scrap/return/quotation/PENDING/CARD/UPI mode */}
      <div className={clsx('w-px h-8 bg-primary/20 transition-all duration-300', isScrapMode || isReturnMode || isQuotationMode || editingQuotationId || paymentMethod === 'PENDING' || paymentMethod === 'CARD' || paymentMethod === 'UPI' ? 'opacity-0' : 'opacity-100')} />
      {/* Received input — hidden in scrap/return/quotation/PENDING/CARD/UPI mode */}
      <div className={clsx('flex-1 min-w-0 transition-all duration-300', isScrapMode || isReturnMode || isQuotationMode || editingQuotationId || paymentMethod === 'PENDING' || paymentMethod === 'CARD' || paymentMethod === 'UPI' ? 'opacity-0 pointer-events-none' : 'opacity-100')}>
        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-wider mb-0.5">
          {paymentMethod === 'CREDIT' ? 'Paid' : 'Received'}
        </p>
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-muted-foreground/60">₹</span>
          <input
            ref={receivedInputRef}
            type="number"
            min="0"
            step="any"
            value={receivedAmount || ''}
            onChange={e => updateActiveTab({ receivedAmount: e.target.value === '' ? 0 : Number(e.target.value) })}
            onFocus={e => e.target.select()}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                focusDescriptionOrDiscount();
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                focusDescriptionOrDiscount();
              } else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) {
                e.preventDefault();
                paymentOptionRefs.current[paymentMethod]?.focus();
              }
            }}
            placeholder={(Number(grandTotal) || 0).toFixed(2)}
            inputMode="decimal"
            className="w-full pl-5 pr-2 py-1.5 bg-background/80 border border-border focus:border-primary focus:ring-1 focus:ring-primary/15 rounded-lg text-sm font-black text-right text-foreground placeholder:text-muted-foreground/35 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
      </div>
      {/* Change / New Total Due input — hidden in scrap/return/quotation/PENDING/CARD/UPI mode */}
      {(() => {
        const effectivePaid = paymentMethod === 'CREDIT'
          ? (receivedAmount || 0)
          : paymentMethod === 'SPLIT'
          ? (splitTotal > 0 ? splitTotal : Math.max(0, displayGrandTotal - (Number(splitDetails?.credit) || 0)))
          : paymentMethod === 'PENDING'
          ? 0
          : ((receivedAmount && receivedAmount > 0) ? receivedAmount : displayGrandTotal);

        const selectedPartyObj = findMatchingParty(customerName, customerPhone);
        const uiPartyKey = `${(customerName || '').trim().toLowerCase()}|${(customerPhone || '').trim()}`;
        const uiIsStaffParty = String(selectedPartyObj?.party_type || '').toUpperCase() === 'STAFF';
        const uiEditingContribution = editingActive && !uiIsStaffParty && activeTab?.editingInvoicePartyKey === uiPartyKey
          ? (Number(activeTab?.editingInvoiceContribution) || 0)
          : 0;
        const partyOldBalance = selectedPartyObj ? (Number(selectedPartyObj.balance) || 0) - uiEditingContribution : 0;
        const isCreditCustomer = partyOldBalance !== 0 || paymentMethod === 'CREDIT' || (paymentMethod === 'SPLIT' && Number(splitDetails?.credit) > 0);

        if (isCreditCustomer) {
          const netNewDue = partyOldBalance + displayGrandTotal - effectivePaid;
          const isDue = netNewDue > 0;
          return (
            <div className={clsx('flex-1 min-w-0 max-w-[150px] transition-all duration-300', isScrapMode || isReturnMode || isQuotationMode || editingQuotationId ? 'opacity-0 pointer-events-none' : 'opacity-100')}>
              <p className="text-[9px] font-black uppercase tracking-wider mb-0.5 text-amber-600 dark:text-amber-400">
                {isDue ? 'New Total Due' : 'Advance Balance'}
              </p>
              <div className="relative">
                <span className={clsx(
                  'absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black',
                  isDue ? 'text-amber-500' : 'text-emerald-500'
                )}>₹</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={Math.abs(netNewDue).toFixed(2)}
                  readOnly
                  inputMode="decimal"
                  className={clsx(
                    'w-full pl-5 pr-2 py-1.5 border rounded-lg text-sm font-black text-right transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                    isDue
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  )}
                />
              </div>
            </div>
          );
        }

        // Regular Cash / Non-Credit Customer:
        const isOverpaid = effectivePaid >= displayGrandTotal;
        const changeVal = Math.abs(effectivePaid - displayGrandTotal);

        return (
          <div className={clsx('flex-1 min-w-0 max-w-[140px] transition-all duration-300', isScrapMode || isReturnMode || isQuotationMode || editingQuotationId || paymentMethod === 'PENDING' || paymentMethod === 'CARD' || paymentMethod === 'UPI' ? 'opacity-0 pointer-events-none' : 'opacity-100')}>
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-wider mb-0.5">
              Change
            </p>
            <div className="relative">
              <span className={clsx(
                'absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black',
                isOverpaid ? 'text-emerald-500' : 'text-amber-500'
              )}>₹</span>
              <input
                type="number"
                min="0"
                step="any"
                value={changeVal.toFixed(2)}
                readOnly
                inputMode="decimal"
                className={clsx(
                  'w-full pl-5 pr-2 py-1.5 border rounded-lg text-sm font-black text-right transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                  isOverpaid
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                )}
              />
            </div>
          </div>
        );
      })()}
    </div>
  );
}
