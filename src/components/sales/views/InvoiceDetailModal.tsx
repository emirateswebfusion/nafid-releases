import { useLoyaltyEnabled } from '../../../hooks/useLoyaltyEnabled';
import type { DisplayInvoice } from '../invoiceDisplayTypes';
import React from 'react';
import { Modal } from '../../ui/Modal';
import clsx from 'clsx';
import { InvoiceTypeBadge, PaymentBadge } from './InvoiceRow';
import { isAdminRole, hasPermission } from '../../../utils/security/permissions';
import { useAuthStore } from '../../../store/authStore';
import { ArrowDownRight, Edit3, Trash2, Package, CreditCard, Printer, Building, Receipt, Calendar, Clock, CheckCircle2, BookOpen, Smartphone, FileText } from 'lucide-react';
import { useCartStore } from '../../../store/cartStore';
import { WhatsAppIcon } from '../../ui/WhatsAppIcon';
import { formatDate, getUpiDetailsFromInvoice, parseSplitDetails } from '../salesHistoryFormat';
import { formatCurrency } from '../../../utils/pricing/money';
import { splitTaxAmount } from '../../../utils/pricing/checkoutLines';
import type { SalesInvoiceItemRow, SalesInvoiceRow, UpiSourceOption } from '../salesTypes';
import { InvoiceItemsTable } from './InvoiceItemsTable';

export interface InvoiceDetailModalProps {
  /** Closes Sales History itself. */
  onClose: () => void;
  canReturn: boolean;
  closeDrawer: () => void;
  convertibleMap: Record<string, boolean>;
  drawerOpen: boolean;
  enableConvertToGst: boolean;
  handleEditBill: () => Promise<void>;
  handleReprint: () => Promise<void>;
  handleSendWhatsAppInvoice: () => Promise<void>;
  handleViewLinkedInvoice: (targetInvoiceId?: string | null, targetInvoiceNumber?: string | null) => Promise<void>;
  isSendingWhatsApp: boolean;
  items: SalesInvoiceItemRow[];
  itemsLoading: boolean;
  openCollectPayment: () => void;
  selectedInvoice: SalesInvoiceRow | null;
  setConversionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setDeleteConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedInvoiceIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  upiSources: UpiSourceOption[];
}

/** The selected invoice's detail dialog: status, linked GST copy, customer, payment, items, totals and the actions (edit, delete, return, collect, reprint, WhatsApp). */
export function InvoiceDetailModal({
  onClose, canReturn, closeDrawer, convertibleMap, drawerOpen, enableConvertToGst, handleEditBill, handleReprint,
  handleSendWhatsAppInvoice, handleViewLinkedInvoice, isSendingWhatsApp, items, itemsLoading, openCollectPayment,
  selectedInvoice, setConversionOpen, setDeleteConfirmOpen, setDrawerOpen, setSelectedInvoiceIds, upiSources,
}: InvoiceDetailModalProps) {
  const loyaltyEnabled = useLoyaltyEnabled(selectedInvoice?.tenant_id || null);
  return (
    <Modal
      isOpen={drawerOpen}
      onClose={closeDrawer}
      className="max-w-4xl"
      title={
        selectedInvoice && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-black text-foreground">{selectedInvoice.invoice_number}</span>
            <span className={clsx(
              'px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border shrink-0',
              selectedInvoice.sync_status === 'SYNCED'
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
            )}>
              {selectedInvoice.sync_status}
            </span>
            <InvoiceTypeBadge inv={selectedInvoice} />
          </div>
        )
      }
    >
      {selectedInvoice && (
        <div className="space-y-4 text-foreground">
          {/* Action Buttons */}
          <div className="flex items-center justify-end p-2.5 sm:p-3 bg-muted/30 border border-border rounded-2xl">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {(() => {
                const isBos = selectedInvoice.invoice_type === 'BILL_OF_SUPPLY';
                const isNotConverted = !selectedInvoice.converted_to_invoice_id;
                const isKnownExcluded = convertibleMap[selectedInvoice.invoice_id] === false;
                const isEligible = isBos && isNotConverted && !isKnownExcluded && (
                  convertibleMap[selectedInvoice.invoice_id] === true ||
                  (items.length > 0 && items.some((it) => 
                    Number(it?.tax_amount) > 0 || 
                    Number(it?.cgst_rate) > 0 || 
                    Boolean(it?.hsn_sac_code) || 
                    Number(it?.product_tax_rate_percent) > 0
                  )) ||
                  (itemsLoading && convertibleMap[selectedInvoice.invoice_id] !== false)
                );

                if (!enableConvertToGst || !isEligible || !isAdminRole(useAuthStore.getState().role)) return null;

                return (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedInvoiceIds(new Set([selectedInvoice.invoice_id]));
                      setDrawerOpen(false);
                      setConversionOpen(true);
                    }}
                    className="flex items-center justify-center gap-1.5 px-3.5 h-8.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-all text-xs font-bold border border-amber-500/40 cursor-pointer active:scale-95 whitespace-nowrap shadow-xs shadow-amber-500/20"
                    title="Convert this eligible Bill of Supply to a GST Invoice"
                  >
                    <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                    <span>Convert to GST</span>
                  </button>
                );
              })()}
              {hasPermission(useAuthStore.getState(), 'sales.edit') && (
                <button
                  type="button"
                  onClick={handleEditBill}
                  className="flex items-center justify-center gap-1.5 px-3 h-8.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 rounded-xl transition-all text-xs font-bold border border-amber-500/25 cursor-pointer active:scale-95 whitespace-nowrap shadow-2xs"
                >
                  <Edit3 className="w-3.5 h-3.5 shrink-0" />
                  <span>Edit Bill</span>
                </button>
              )}
              {hasPermission(useAuthStore.getState(), 'sales.delete') && (
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="flex items-center justify-center gap-1.5 px-3 h-8.5 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 rounded-xl transition-all text-xs font-bold border border-red-500/25 cursor-pointer active:scale-95 whitespace-nowrap shadow-2xs"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Delete</span>
                </button>
              )}
              {(isAdminRole(useAuthStore.getState().role) || hasPermission(useAuthStore.getState(), 'sales.refund')) && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!canReturn) return;
                    // Store invoice ref and close — BillingPage will open in return mode
                    localStorage.setItem('returnBillData', JSON.stringify({ invoice: selectedInvoice }));
                    // Switch OWNER to BILLER so BillingPage renders (not OwnerDashboard)
                    if (isAdminRole(useAuthStore.getState().role)) {
                      useCartStore.getState().setRole('BILLER');
                    }
                    closeDrawer();
                    onClose();
                    setTimeout(() => window.dispatchEvent(new CustomEvent('open-return-mode')), 100);
                  }}
                  disabled={!canReturn}
                  title={canReturn ? undefined : 'All items in this bill have already been returned'}
                  className={clsx(
                    'flex items-center justify-center gap-1.5 px-3 h-8.5 rounded-xl transition-all text-xs font-bold border cursor-pointer active:scale-95 whitespace-nowrap shadow-2xs',
                    canReturn
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 border-red-500/25'
                      : 'bg-muted/40 text-muted-foreground/50 border-border/60 cursor-not-allowed'
                  )}
                >
                  <Package className="w-3.5 h-3.5 shrink-0" />
                  <span>{canReturn ? 'Return' : 'Returned'}</span>
                </button>
              )}
              {selectedInvoice.payment_method === 'PENDING' && (
                <button
                  type="button"
                  onClick={openCollectPayment}
                  className="flex items-center justify-center gap-1.5 px-3.5 h-8.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all text-xs font-bold border border-emerald-500/40 cursor-pointer active:scale-95 whitespace-nowrap shadow-xs shadow-emerald-600/20"
                >
                  <CreditCard className="w-3.5 h-3.5 shrink-0" />
                  <span>Collect Payment</span>
                </button>
              )}
              {selectedInvoice.payment_method !== 'PENDING' && isAdminRole(useAuthStore.getState().role) && (
                <button
                  type="button"
                  onClick={openCollectPayment}
                  className="flex items-center justify-center gap-1.5 px-3 h-8.5 bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20 rounded-xl transition-all text-xs font-bold border border-violet-500/25 cursor-pointer active:scale-95 whitespace-nowrap shadow-2xs"
                  title="Change Payment Method (Admin Only)"
                >
                  <CreditCard className="w-3.5 h-3.5 shrink-0" />
                  <span>Change Payment</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleReprint}
                className="flex items-center justify-center gap-1.5 px-3 h-8.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl transition-all text-xs font-bold border border-primary/25 cursor-pointer active:scale-95 whitespace-nowrap shadow-2xs"
              >
                <Printer className="w-3.5 h-3.5 shrink-0" />
                <span>Reprint</span>
              </button>
              <button
                type="button"
                onClick={handleSendWhatsAppInvoice}
                disabled={isSendingWhatsApp}
                className="flex items-center justify-center gap-1.5 px-3 h-8.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 rounded-xl transition-all text-xs font-bold border border-emerald-500/25 cursor-pointer active:scale-95 whitespace-nowrap disabled:opacity-50 shadow-2xs"
                title="Send Invoice PDF via WhatsApp"
              >
                {isSendingWhatsApp ? (
                  <div className="w-3.5 h-3.5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin shrink-0" />
                ) : (
                  <WhatsAppIcon className="w-3.5 h-3.5 fill-emerald-600 text-emerald-600 shrink-0" />
                )}
                <span>WhatsApp</span>
              </button>
            </div>
          </div>

          {/* Linked Conversion Banner */}
          {selectedInvoice.converted_to_invoice_id && (
            <div className="p-3 bg-violet-500/10 border border-violet-500/30 rounded-2xl flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-violet-500/20 text-violet-600 dark:text-violet-400 shrink-0">
                  <Building className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-violet-700 dark:text-violet-300">GST Invoice Linked for Tax Filing</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Statutory GST Invoice: <span className="font-mono font-bold text-foreground">{selectedInvoice.converted_to_invoice_number || selectedInvoice.converted_to_invoice_id}</span> • Original counter sale remains your true business record.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleViewLinkedInvoice(selectedInvoice.converted_to_invoice_id, selectedInvoice.converted_to_invoice_number)}
                className="px-3.5 h-8 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 shrink-0 cursor-pointer flex items-center gap-1.5"
              >
                <Building className="w-3.5 h-3.5" />
                <span>View GST Copy</span>
              </button>
            </div>
          )}
          {selectedInvoice.converted_from_invoice_id && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-emerald-700 dark:text-emerald-300">Statutory GST Filing Invoice</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Generated from Original Counter Sale: <span className="font-mono font-bold text-foreground">{selectedInvoice.converted_from_invoice_number || selectedInvoice.converted_from_invoice_id}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleViewLinkedInvoice(selectedInvoice.converted_from_invoice_id, selectedInvoice.converted_from_invoice_number)}
                className="px-3.5 h-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 shrink-0 cursor-pointer flex items-center gap-1.5"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>View Original Sale</span>
              </button>
            </div>
          )}

          {/* Customer + Payment Split */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl border border-border bg-card space-y-1.5">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Customer</div>
              <div className="font-bold text-sm text-foreground truncate">
                {selectedInvoice.customer_name || 'Walk-in Customer'}
              </div>
              {selectedInvoice.customer_phone && (
                <div className="text-[10px] text-muted-foreground">{selectedInvoice.customer_phone}</div>
              )}
              {selectedInvoice.customer_address && (
                <div className="text-[10px] text-muted-foreground">{selectedInvoice.customer_address}</div>
              )}
              {selectedInvoice.customer_gstin && (
                <div className="text-[10px] text-muted-foreground font-mono">GSTIN: {selectedInvoice.customer_gstin}</div>
              )}
              <div className="pt-1 border-t border-border/50 text-[10px] text-muted-foreground space-y-0.5">
                {(selectedInvoice.biller_staff_name || selectedInvoice.biller_name) && (
                  <div>Biller: <span className="font-bold text-foreground">{selectedInvoice.biller_staff_name || selectedInvoice.biller_name}</span></div>
                )}
                {selectedInvoice.created_at && (
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span>
                      <span className="font-bold text-foreground">{formatDate(selectedInvoice.created_at).date}</span>
                      <span className="opacity-60 mx-1">at</span>
                      <span className="font-bold text-foreground">{formatDate(selectedInvoice.created_at).time}</span>
                    </span>
                  </div>
                )}
                {selectedInvoice.sales_staff_name && (
                  <div>Sales Handler: <span className="font-bold text-foreground">{selectedInvoice.sales_staff_name}</span></div>
                )}
              </div>
            </div>
            <div className="p-3.5 rounded-xl border border-border bg-card space-y-1.5">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Payment</div>
              <div className="flex items-center gap-2">
                <PaymentBadge method={selectedInvoice.payment_method || 'PENDING'} />
                {selectedInvoice.payment_method === 'PENDING' ? (
                  <Clock className="w-3.5 h-3.5 text-gray-500" />
                ) : selectedInvoice.payment_method !== 'CREDIT' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <BookOpen className="w-3.5 h-3.5 text-amber-500" />
                )}
              </div>
              {(() => {
                const upiDetail = getUpiDetailsFromInvoice(selectedInvoice, upiSources);
                if ((selectedInvoice.payment_method === 'UPI' || (selectedInvoice.payment_method === 'SPLIT' && (Number(parseSplitDetails(selectedInvoice.split_details)?.upi) || 0) > 0)) && upiDetail) {
                  return (
                    <div className="text-xs font-bold text-violet-600 dark:text-violet-400 flex items-center gap-1.5 pt-0.5">
                      <Smartphone className="w-3.5 h-3.5 shrink-0" />
                      <span>Account: <strong className="font-black text-foreground">{upiDetail.label}</strong></span>
                    </div>
                  );
                }
                return null;
              })()}
              {(() => {
                const sd = parseSplitDetails(selectedInvoice.split_details);
                const splitItems = sd ? [
                  { label: 'Cash', value: Number(sd.cash) || 0, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
                  { label: 'Card', value: Number(sd.card) || 0, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
                  { label: 'UPI', value: Number(sd.upi) || 0, color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20' },
                  { label: 'Credit', value: Number(sd.credit) || 0, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
                  { label: 'Bank', value: Number(sd.bank_transfer || sd.bank) || 0, color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' },
                ].filter(i => i.value > 0) : [];

                const rawOldDue = sd?.old_due ?? sd?.old_balance ?? sd?.oldBalance ?? (selectedInvoice as DisplayInvoice).old_balance ?? (selectedInvoice as DisplayInvoice).old_due;
                const rawNewDue = sd?.new_due ?? sd?.new_balance ?? sd?.customerBalance ?? (selectedInvoice as DisplayInvoice).customer_balance ?? (selectedInvoice as DisplayInvoice).new_due;
                const received = Number(selectedInvoice.received_amount) || 0;
                const balance = Number(selectedInvoice.balance_amount) || 0;
                const changeReturned = Math.max(0, received - (Number(selectedInvoice.grand_total) || 0));
                const isCredit = selectedInvoice.payment_method === 'CREDIT';
                const isPending = selectedInvoice.payment_method === 'PENDING';
                const customerName = String(selectedInvoice.customer_name || '').trim();
                const hasNamedCustomer = customerName !== '' && !/^walk[- ]in customer$/i.test(customerName);
                const isWalkInCustomer = !(
                  hasNamedCustomer ||
                  String(selectedInvoice.customer_phone || '').trim() ||
                  String(selectedInvoice.customer_address || '').trim() ||
                  String(selectedInvoice.customer_gstin || '').trim() ||
                  selectedInvoice.customer_id ||
                  selectedInvoice.party_id
                );

                let oldDueNum = rawOldDue != null ? Number(rawOldDue) : null;
                const newDueNum = rawNewDue != null ? Number(rawNewDue) : (isCredit ? Math.abs(balance) : null);

                if ((oldDueNum == null || oldDueNum === 0) && newDueNum != null && selectedInvoice) {
                  const gTotal = Number(selectedInvoice.grand_total) || 0;
                  const totalPaid = (splitItems.length > 0
                    ? splitItems.filter(i => i.label !== 'Credit').reduce((sum, i) => sum + i.value, 0)
                    : Number(selectedInvoice.received_amount) || 0);
                  const netChange = gTotal - totalPaid;
                  const calcOld = newDueNum - netChange;
                  if (calcOld !== 0 && !isNaN(calcOld)) {
                    oldDueNum = calcOld;
                  }
                }

                if (isPending) {
                  return <div className="text-[10px] text-gray-500 font-semibold pt-1">Awaiting payment at counter</div>;
                }

                return (
                  <div className="pt-2 space-y-1.5 border-t border-border/50 mt-1.5">
                    {/* Old Due */}
                    {!isWalkInCustomer && oldDueNum != null && oldDueNum !== 0 && (
                      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/20 px-2.5 py-1.5 rounded-lg">
                        <span className="text-amber-700 dark:text-amber-300 font-extrabold uppercase tracking-wider text-[10px]">OLD DUE:</span>
                        <span className="font-mono font-black text-amber-700 dark:text-amber-300 text-sm">{formatCurrency(oldDueNum)}</span>
                      </div>
                    )}

                    {/* Split Breakdown */}
                    {splitItems.length > 0 && (
                      <div className="space-y-1 pt-0.5">
                        <div className="text-[9.5px] font-black uppercase tracking-wider text-muted-foreground">Payment Breakdown</div>
                        <div className="flex flex-wrap gap-1">
                          {splitItems.map(item => (
                            <span key={item.label} className={clsx('px-1.5 py-0.5 rounded border text-[10px] font-extrabold', item.color)}>
                              {item.label}: {formatCurrency(item.value)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Received & Change */}
                    <div className="text-[11px] text-muted-foreground space-y-0.5 font-medium">
                      {received > 0 && (
                        <div className="flex justify-between items-center">
                          <span>Received Amount:</span>
                          <span className="font-bold text-foreground">{formatCurrency(received)}</span>
                        </div>
                      )}
                      {!isCredit && changeReturned > 0 && (
                        <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 font-bold">
                          <span>Change Returned:</span>
                          <span>{formatCurrency(changeReturned)}</span>
                        </div>
                      )}
                    </div>

                    {/* New Due */}
                    {!isWalkInCustomer && newDueNum != null && (isCredit || selectedInvoice.payment_method === 'SPLIT' || (oldDueNum != null && oldDueNum !== 0)) && (
                      <div className="flex items-center justify-between text-xs font-extrabold text-foreground pt-1.5 border-t border-border/50 bg-amber-500/10 dark:bg-amber-500/20 px-2 py-1 rounded-lg">
                        <span className="text-amber-600 dark:text-amber-400 uppercase tracking-wider text-[10px]">New Due:</span>
                        <span className="font-mono font-black text-amber-600 dark:text-amber-400 text-sm">{formatCurrency(newDueNum)}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Bill Description / Remarks */}
          {(selectedInvoice.description || selectedInvoice.notes) && (
            <div className="p-3.5 rounded-xl border border-primary/25 bg-primary/5 space-y-1 shadow-xs">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary">
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>Bill Description / Remarks</span>
              </div>
              <div className="text-xs font-semibold text-foreground whitespace-pre-wrap leading-relaxed">
                {selectedInvoice.description || selectedInvoice.notes}
              </div>
            </div>
          )}

          {/* Items */}
          <InvoiceItemsTable
            items={items} itemsLoading={itemsLoading} selectedInvoice={selectedInvoice}
          />

          {/* Totals */}
          {(() => {
            const scrapD = Number(selectedInvoice.scrap_deduction) || 0;
            const returnD = Number(selectedInvoice.return_deduction) || 0;
            const totalDeductions = scrapD + returnD;
            const sub = Number(selectedInvoice.subtotal) || 0;
            const tax = Number(selectedInvoice.tax_total) || 0;
            const disc = Number(selectedInvoice.discount_total) || 0;
            const ptsDisc = Number(selectedInvoice.points_redeemed_discount) || 0;
            const preDeductionTotal = Math.max(0, sub + tax - disc - ptsDisc);

            const refundAmount = totalDeductions > preDeductionTotal ? totalDeductions - preDeductionTotal : 0;
            const netPayable = Math.max(0, preDeductionTotal - totalDeductions);

            return (
              <div className="rounded-xl border border-primary/20 overflow-hidden bg-primary/[0.02]">
                <div className="px-4 py-3 space-y-2 bg-card">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground font-semibold">Subtotal</span>
                    <span className="font-bold text-foreground">
                      {formatCurrency(selectedInvoice.invoice_type === 'BILL_OF_SUPPLY' ? (sub + tax) : sub)}
                    </span>
                  </div>
                  {selectedInvoice.invoice_type === 'GST' && tax > 0 && (() => {
                    const effTaxRate = sub > 0 ? Math.round((tax / sub) * 100 * 10) / 10 : 0;
                    const isInter = selectedInvoice.supply_type === 'INTER';
                    let cgst = Number(selectedInvoice.cgst_total) || 0;
                    let sgst = Number(selectedInvoice.sgst_total) || 0;
                    let igst = Number(selectedInvoice.igst_total) || 0;
                    if (!isInter && cgst === 0 && sgst === 0 && igst === 0) {
                      const taxSplit = splitTaxAmount(tax);
                      cgst = taxSplit.cgst;
                      sgst = taxSplit.sgst;
                    } else if (isInter && igst === 0) {
                      igst = tax;
                    }
                    const cgstRate = effTaxRate > 0 ? Math.round((effTaxRate / 2) * 10) / 10 : 0;
                    const sgstRate = effTaxRate > 0 ? Math.round((effTaxRate / 2) * 10) / 10 : 0;
                    const igstRate = effTaxRate;
                    return (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground font-semibold flex items-center gap-1.5">
                            <span>Tax (GST{effTaxRate > 0 ? ` ${effTaxRate}%` : ''})</span>
                          </span>
                          <span className="font-bold text-foreground font-mono">{formatCurrency(tax)}</span>
                        </div>
                        {(cgst > 0 || sgst > 0 || igst > 0) && (
                          <div className="p-2.5 rounded-xl bg-amber-500/[0.05] dark:bg-amber-500/[0.10] border border-amber-500/20 my-1 space-y-1 text-xs">
                            <div className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center justify-between pb-1 border-b border-amber-500/15">
                              <span>GST Tax Summary</span>
                              <span className="font-mono font-bold">{formatCurrency(tax)}</span>
                            </div>
                            {cgst > 0 && (
                              <div className="flex justify-between text-muted-foreground text-[11px]">
                                <span>Central Tax (CGST {cgstRate > 0 ? `${cgstRate}%` : ''})</span>
                                <span className="font-mono font-bold text-foreground">{formatCurrency(cgst)}</span>
                              </div>
                            )}
                            {sgst > 0 && (
                              <div className="flex justify-between text-muted-foreground text-[11px]">
                                <span>State Tax (SGST {sgstRate > 0 ? `${sgstRate}%` : ''})</span>
                                <span className="font-mono font-bold text-foreground">{formatCurrency(sgst)}</span>
                              </div>
                            )}
                            {igst > 0 && (
                              <div className="flex justify-between text-muted-foreground text-[11px]">
                                <span>Integrated Tax (IGST {igstRate > 0 ? `${igstRate}%` : ''})</span>
                                <span className="font-mono font-bold text-foreground">{formatCurrency(igst)}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {disc > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-rose-500 font-semibold">
                        Discount{selectedInvoice.discount_type === 'PERCENTAGE' && selectedInvoice.discount_value ? ` (${selectedInvoice.discount_value}%)` : ''}
                      </span>
                      <span className="text-rose-500 font-bold">-{formatCurrency(disc)}</span>
                    </div>
                  )}
                  {ptsDisc > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-rose-500 font-semibold">{loyaltyEnabled ? 'Points Discount' : 'Discount'}</span>
                      <span className="text-rose-500 font-bold">-{formatCurrency(ptsDisc)}</span>
                    </div>
                  )}
                  {scrapD > 0 && (
                    <div className="flex justify-between text-xs items-center">
                      <span className="text-orange-500 font-semibold flex items-center gap-1">
                        Scrap Credit
                        {selectedInvoice.scrap_invoice_number && (
                          <span className="font-bold">
                            ({selectedInvoice.scrap_invoice_number})
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-orange-500 font-bold">-{formatCurrency(scrapD)}</span>
                        {selectedInvoice.scrap_invoice_number && (
                          <button
                            type="button"
                            onClick={() => {
                              useCartStore.getState().setPendingScrapInvoiceToEdit(selectedInvoice.scrap_invoice_number);
                              useCartStore.getState().setRole('BILLER');
                              window.dispatchEvent(new CustomEvent('edit-scrap-invoice', { detail: { invoiceNumber: selectedInvoice.scrap_invoice_number } }));
                              setDrawerOpen(false);
                              onClose();
                            }}
                            className="px-2.5 py-1 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 font-bold text-xs border border-orange-500/25 transition-all cursor-pointer flex items-center gap-1 active:scale-95 shadow-2xs"
                            title="Edit Scrap Invoice in Billing Page"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit Scrap</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {returnD > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-rose-500 font-semibold">
                        Return Credit {selectedInvoice.return_invoice_number ? `(${selectedInvoice.return_invoice_number})` : ''}
                      </span>
                      <span className="text-rose-500 font-bold">-{formatCurrency(returnD)}</span>
                    </div>
                  )}
                </div>
                {refundAmount > 0 ? (
                  <>
                    <div className="flex items-center justify-between px-4 py-2 bg-primary/5 border-t border-primary/10">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Grand Total</span>
                      <span className="text-sm font-bold text-foreground">{formatCurrency(preDeductionTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3 bg-rose-500/10 border-t border-rose-500/20">
                      <span className="text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest">Refund Amount</span>
                      <span className="text-lg font-black text-rose-600 dark:text-rose-400">-{formatCurrency(refundAmount)}</span>
                    </div>
                    {(() => {
                      const actualPaid = Number(selectedInvoice.actual_refund_paid) || 0;
                      if (actualPaid <= 0) return null;
                      const diff = actualPaid - refundAmount;
                      return (
                        <>
                          <div className="flex items-center justify-between px-4 py-2 bg-orange-500/10 border-t border-orange-400/20">
                            <span className="text-xs font-black text-orange-600 dark:text-orange-400 uppercase tracking-widest">Actual Refund Paid</span>
                            <span className="text-base font-black text-orange-600 dark:text-orange-400">{formatCurrency(actualPaid)}</span>
                          </div>
                          {Math.abs(diff) > 0.005 && (
                            <div className={`flex items-center justify-between px-4 py-1.5 border-t ${diff > 0 ? 'bg-rose-500/10 border-rose-400/20' : 'bg-sky-500/10 border-sky-400/20'}`}>
                              <span className={`text-[10px] font-black uppercase tracking-widest ${diff > 0 ? 'text-rose-500' : 'text-sky-500'}`}>
                                {diff > 0 ? 'Over-refunded' : 'Under-refunded'}
                              </span>
                              <span className={`text-sm font-black ${diff > 0 ? 'text-rose-500' : 'text-sky-500'}`}>
                                {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                              </span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </>
                ) : totalDeductions > 0 ? (
                  <>
                    <div className="flex items-center justify-between px-4 py-2 bg-primary/5 border-t border-primary/10">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Grand Total</span>
                      <span className="text-sm font-bold text-foreground">{formatCurrency(preDeductionTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-t border-primary/20">
                      <span className="text-xs font-black text-primary uppercase tracking-widest">Net Total</span>
                      <span className="text-lg font-black text-foreground">{formatCurrency(netPayable)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-t border-primary/20">
                    <span className="text-xs font-black text-primary uppercase tracking-widest">Grand Total</span>
                    <span className="text-lg font-black text-foreground">{formatCurrency(preDeductionTotal)}</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </Modal>
  );
}
