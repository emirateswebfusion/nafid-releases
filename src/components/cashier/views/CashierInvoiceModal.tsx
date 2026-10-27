import { useLoyaltyEnabled } from '../../../hooks/useLoyaltyEnabled';
import type { DisplayInvoiceItem, DisplayComboItem } from '../../sales/invoiceDisplayTypes';
import React from 'react';
import { Modal } from '../../ui/Modal';
import clsx from 'clsx';
import { InvoiceTypeBadge } from '../../sales/views/InvoiceRow';
import { hasPermission, isAdminRole } from '../../../utils/security/permissions';
import { useAuthStore } from '../../../store/authStore';
import { isDesktopRuntime, hasBridge } from '../../../data/client';
import { invoicesApi } from '../../../data/invoices';
import { useCartStore } from '../../../store/cartStore';
import { Edit3, Printer, Calendar, Clock, CheckCircle2, BookOpen, RefreshCw, Boxes, Package } from 'lucide-react';
import { settingsApi } from '../../../data/settings';
import { parsePrintFormat } from '../../../utils/print/printFormatHelper';
import { DEFAULT_BILL_SETTINGS, type ReceiptData, formatBillDateTime, generateReceiptText } from '../../../utils/print/receiptGenerator';
import { generateInvoiceHtml } from '../../../utils/print/invoiceHtmlGenerator';
import { printingApi } from '../../../data/printing';
import { formatDate } from '../cashierFormat';
import { PaymentBadge } from './PaymentBadge';
import { formatCurrency } from '../../../utils/pricing/money';
import { splitTaxAmount } from '../../../utils/pricing/checkoutLines';
import type { CashierInvoiceItemRow, CashierInvoiceRow } from '../cashierTypes';

export interface CashierInvoiceModalProps {
  invoiceItems: CashierInvoiceItemRow[];
  loadingItems: boolean;
  selectedInvoice: CashierInvoiceRow | null;
  setInvoiceItems: React.Dispatch<React.SetStateAction<CashierInvoiceItemRow[]>>;
  setReprintSuccess: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedInvoice: React.Dispatch<React.SetStateAction<CashierInvoiceRow | null>>;
  setShowInvoiceModal: React.Dispatch<React.SetStateAction<boolean>>;
  showInvoiceModal: boolean;
}

/** Invoice detail dialog of the cashier screen: customer, payment, items and totals, with settle / print actions. */
export function CashierInvoiceModal({
  invoiceItems, loadingItems, selectedInvoice, setInvoiceItems, setReprintSuccess, setSelectedInvoice,
  setShowInvoiceModal, showInvoiceModal,
}: CashierInvoiceModalProps) {
  const loyaltyEnabled = useLoyaltyEnabled(selectedInvoice?.tenant_id || null);
  return (
    <Modal
      isOpen={showInvoiceModal}
      onClose={() => { setShowInvoiceModal(false); setSelectedInvoice(null); setInvoiceItems([]); }}
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
              {hasPermission(useAuthStore.getState(), 'sales.edit') && (
                <button
                  onClick={async () => {
                    const { role, permissions } = useAuthStore.getState();
                    if (!hasPermission({ role, permissions }, 'sales.edit')) {
                      return;
                    }
                    if (!isDesktopRuntime() || !selectedInvoice) return;
                    let currentItems = invoiceItems;
                    if (!currentItems.length) {
                      const data = await invoicesApi.getInvoiceItems(selectedInvoice.invoice_id);
                      currentItems = Array.isArray(data) ? data : [];
                    }
                    let freshInvoice = selectedInvoice;
                    if (hasBridge('dbGetInvoices')) {
                      try {
                        const fetched = await invoicesApi.getInvoices({ search: selectedInvoice.invoice_number || selectedInvoice.invoice_id, tenant_id: selectedInvoice.tenant_id });
                        if (Array.isArray(fetched) && fetched.length > 0) {
                          const exact = fetched.find((i) => i.invoice_id === selectedInvoice.invoice_id);
                          if (exact) freshInvoice = exact;
                        }
                      } catch { /* ignore */ }
                    }
                    localStorage.setItem('editBillData', JSON.stringify({ invoice: freshInvoice, items: currentItems, originalRole: useAuthStore.getState().role }));
                    setShowInvoiceModal(false);
                    setSelectedInvoice(null);
                    setInvoiceItems([]);
                    if (isAdminRole(useAuthStore.getState().role)) useCartStore.getState().setRole('BILLER');
                    setTimeout(() => window.dispatchEvent(new CustomEvent('open-edit-bill')), 50);
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 h-8 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 rounded-xl transition-all text-xs font-bold border border-amber-500/20 cursor-pointer active:scale-95 whitespace-nowrap"
                >
                  <Edit3 className="w-3.5 h-3.5 shrink-0" />
                  <span>Edit Bill</span>
                </button>
              )}
              <button onClick={async () => {
                if (!selectedInvoice || !isDesktopRuntime()) return;
                try {
                  const { tenantId } = useAuthStore.getState();
                  const [shopNameVal, shopAddr, shopPh, upi, showQr, shopGstin, shopStateVal] = await Promise.all([
                    settingsApi.get({ tenant_id: tenantId || 'global', key: 'shop_name' }),
                    settingsApi.get({ tenant_id: tenantId || 'global', key: 'shop_address' }),
                    settingsApi.get({ tenant_id: tenantId || 'global', key: 'shop_phone' }),
                    settingsApi.get({ tenant_id: tenantId || 'global', key: 'upi_id' }),
                    settingsApi.get({ tenant_id: tenantId || 'global', key: 'show_upi_qr' }),
                    settingsApi.get({ tenant_id: tenantId || 'global', key: 'shop_gstin' }),
                    settingsApi.get({ tenant_id: tenantId || 'global', key: 'shop_state' }),
                  ]);
                  const receiptConfig = await settingsApi.get({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
                  const receiptWidthCm = receiptConfig?.receiptWidthCm ? Number(receiptConfig.receiptWidthCm) : 5.8;
                  const printFmtRaw = await settingsApi.get({ tenant_id: tenantId || 'global', key: 'print_format' });
                  const printFmt = parsePrintFormat(printFmtRaw);
                  const invoiceType = selectedInvoice.invoice_type as string | undefined;
                  const isB2B = Boolean(selectedInvoice.customer_gstin?.trim());
                  const isGstOrB2B = invoiceType === 'GST' || isB2B;
                  const isHalfA4 = printFmt.format === 'half-a4';
                  const isA4 = printFmt.format === 'a4';
                  const useA4 = isGstOrB2B || isA4 || isHalfA4;
                  const billSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt.billSettings || {}) };
                  const receiptData: ReceiptData = {
                    shopName: (isGstOrB2B || billSettings.showShopName !== false) ? (shopNameVal || useAuthStore.getState().shopName || 'My Shop') : '',
                    shopGstin: (isGstOrB2B || billSettings.showShopGstin !== false) ? (shopGstin || undefined) : undefined,
                    shopState: (isGstOrB2B || billSettings.showShopState !== false) ? (shopStateVal || undefined) : undefined,
                    shopAddress: (isGstOrB2B || billSettings.showShopAddress !== false) ? (shopAddr || undefined) : undefined,
                    shopPhone: (isGstOrB2B || billSettings.showPhone !== false) ? (shopPh || undefined) : undefined,
                    upiId: upi || undefined,
                    showUpiQr: showQr !== null && showQr !== undefined ? Boolean(showQr) : true,
                    showProductOffers: printFmt.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
                    invoiceNumber: selectedInvoice.invoice_number as string,
                    date: formatBillDateTime(selectedInvoice.created_at as string),
                    billerName: (isGstOrB2B || billSettings.showBillerName !== false) ? (selectedInvoice.biller_name || undefined) : undefined,
                    items: invoiceItems.map(item => ({
                      name: item.name as string,
                      quantity: Number(item.quantity) || 0,
                      unit_price: item.unit_price,
                      total: item.total,
                      originalRate: item.originalRate,
                      discountLabel: item.discountLabel,
                      brand: item.brand_manufacturer || undefined,
                      billing_type: item.billing_type as string | undefined,
                      pieces_sold: item.pieces_sold != null ? Number(item.pieces_sold) : undefined,
                      pieces_override: item.pieces_override != null ? Number(item.pieces_override) : undefined,
                      unit: item.unit || item.uom,
                      isCombo: item.isCombo,
                      combo_items: item.combo_items,
                    })),
                    subtotal: selectedInvoice.subtotal,
                    tax: selectedInvoice.tax_total,
                    discount: selectedInvoice.discount_total as number,
                    discountType: selectedInvoice.discount_type as 'FIXED' | 'PERCENTAGE' | undefined,
                    discountValue: selectedInvoice.discount_value as number | undefined,
                    grandTotal: selectedInvoice.grand_total,
                    isReprint: true,
                    invoiceType,
                    customerName: (isGstOrB2B || billSettings.showCustomerName !== false) ? (selectedInvoice.customer_name || undefined) : undefined,
                    customerPhone: (isGstOrB2B || billSettings.showCustomerPhone !== false) ? (selectedInvoice.customer_phone || undefined) : undefined,
                    customerAddress: (isGstOrB2B || billSettings.showCustomerAddress !== false) ? (selectedInvoice.customer_address || undefined) : undefined,
                    customerGstin: selectedInvoice.customer_gstin?.trim() || undefined,
                    customerState: (isGstOrB2B || billSettings.showCustomerState !== false) ? (selectedInvoice.customer_state || undefined) : undefined,
                    billSettings,
                    isB2B,
                    a5Orientation: printFmt.a5Orientation || 'horizontal',
                  };
                  if (useA4) {
                    const invoiceStyle = (!isGstOrB2B && isHalfA4) ? 'half-a4' : (printFmt.a4Style || (printFmt.format === 'a4' ? printFmt.style : undefined) || 'boxed');
                    const invoiceHtml = generateInvoiceHtml(receiptData, invoiceStyle as Parameters<typeof generateInvoiceHtml>[1]);
                    const printResult = await printingApi.printA4Html(tenantId || 'global', invoiceHtml);
                    if (!printResult.success && (printResult as { useDefaultDialog?: boolean }).useDefaultDialog) {
                      const pw = window.open('', '_blank');
                      if (pw) { pw.document.write(invoiceHtml); pw.document.close(); setTimeout(() => pw.print(), 500); }
                    }
                  } else {
                    const thermalWidth = printFmt.width ? Number(printFmt.width) / 10 : receiptWidthCm;
                    const thermalStyle = printFmt.thermalStyle || (printFmt.format === 'thermal' ? printFmt.style : undefined) || 'standard';
                    const receiptText = generateReceiptText(receiptData, thermalWidth, undefined, thermalStyle);
                    await printingApi.printReceipt(tenantId || 'global', receiptText);
                  }
                  setReprintSuccess(true);
                  setTimeout(() => setReprintSuccess(false), 2500);
                } catch (err) {
                  console.error('Failed to reprint', err);
                }
              }}
                className="flex items-center justify-center gap-1.5 px-4 h-8 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl transition-all text-xs font-bold border border-primary/20 cursor-pointer active:scale-95"
              >
                <Printer className="w-3.5 h-3.5" />Print Bill
              </button>
            </div>
          </div>

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
                if (selectedInvoice.payment_method !== 'SPLIT') return null;
                let sd: Record<string, unknown> | null = null;
                if (selectedInvoice.split_details) {
                  try { sd = typeof selectedInvoice.split_details === 'string' ? JSON.parse(selectedInvoice.split_details) : selectedInvoice.split_details; } catch { /* ignore */ }
                }
                if (!sd) return null;
                const splitItems = [
                  { label: 'Cash', value: Number(sd.cash) || 0, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
                  { label: 'Card', value: Number(sd.card) || 0, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
                  { label: 'UPI', value: Number(sd.upi) || 0, color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20' },
                  { label: 'Credit', value: Number(sd.credit) || 0, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
                  { label: 'Bank', value: Number(sd.bank_transfer || sd.bank) || 0, color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' },
                ].filter(i => i.value > 0);

                if (splitItems.length === 0) return null;

                return (
                  <div className="pt-1.5 space-y-1">
                    <div className="text-[9.5px] font-black uppercase tracking-wider text-muted-foreground">Split Breakdown</div>
                    <div className="flex flex-wrap gap-1">
                      {splitItems.map(item => (
                        <span key={item.label} className={clsx('px-1.5 py-0.5 rounded border text-[10px] font-extrabold', item.color)}>
                          {item.label}: {formatCurrency(item.value)}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {(() => {
                const received = Number(selectedInvoice.received_amount) || 0;
                const balance = Number(selectedInvoice.balance_amount) || 0;
                const isCredit = selectedInvoice.payment_method === 'CREDIT';
                const isPending = selectedInvoice.payment_method === 'PENDING';
                if (isPending) {
                  return <div className="text-[10px] text-gray-500 font-semibold">Awaiting payment at counter</div>;
                }
                if (!isCredit && received <= 0) return null;
                return (
                  <div className="text-[10px] text-muted-foreground space-y-0.5">
                    <div>Received: <span className="font-bold text-foreground">{formatCurrency(received)}</span></div>
                    {isCredit && balance < 0 && <div className="text-amber-500 font-semibold">Due: {formatCurrency(Math.abs(balance))}</div>}
                    {!isCredit && balance > 0 && <div className="text-emerald-500 font-semibold">Change: {formatCurrency(balance)}</div>}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Items */}
          {(() => {
            const isGstBill = selectedInvoice.invoice_type === 'GST' || 
                              Number(selectedInvoice.tax_total) > 0 || 
                              invoiceItems.some((it) => Number(it.tax_amount) > 0 || Number(it.cgst_rate) > 0 || Number(it.tax_rate) > 0);

            return (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Order Items
                  </span>
                  <span className="text-[10px] text-muted-foreground font-semibold">{invoiceItems.length} item{invoiceItems.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="border border-border rounded-xl overflow-x-auto bg-card">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      {isGstBill ? (
                        <tr className="bg-muted/40 border-b border-border text-[10px] font-black uppercase tracking-wider text-muted-foreground select-none">
                          <th className="px-3 py-2.5 min-w-[160px]">Item & HSN</th>
                          <th className="px-2 py-2.5 text-center whitespace-nowrap">Qty</th>
                          <th className="px-2.5 py-2.5 text-right whitespace-nowrap">Unit Rate (Excl.)</th>
                          <th className="px-2.5 py-2.5 text-right whitespace-nowrap">CGST / SGST</th>
                          <th className="px-2.5 py-2.5 text-right whitespace-nowrap">Taxable Value</th>
                          <th className="px-2.5 py-2.5 text-right whitespace-nowrap">Unit Rate (Incl.)</th>
                          <th className="px-3 py-2.5 text-right whitespace-nowrap">Total</th>
                        </tr>
                      ) : (
                        <tr className="bg-muted/40 border-b border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground select-none">
                          <th className="px-4 py-2.5 min-w-[180px]">Item</th>
                          <th className="px-2 py-2.5 text-center whitespace-nowrap">Qty</th>
                          <th className="px-3 py-2.5 text-right whitespace-nowrap">Rate</th>
                          <th className="px-4 py-2.5 text-right whitespace-nowrap">Total</th>
                        </tr>
                      )}
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {invoiceItems.length === 0 ? (
                        <tr>
                          <td colSpan={isGstBill ? 7 : 4} className="py-6 text-center text-muted-foreground">
                            {loadingItems ? (
                              <div className="flex items-center justify-center gap-2">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span className="text-xs font-medium">Loading items…</span>
                              </div>
                            ) : (
                              <span className="text-xs font-semibold">No items found</span>
                            )}
                          </td>
                        </tr>
                      ) : invoiceItems.map((item, i) => {
                        let comboItemsParsed: DisplayComboItem[] | undefined = item.combo_items;
                        if (!comboItemsParsed && item.combo_details) {
                          try {
                            const parsed = typeof item.combo_details === 'string' ? JSON.parse(item.combo_details) : item.combo_details;
                            if (Array.isArray(parsed) && parsed.length > 0) comboItemsParsed = parsed;
                          } catch { /* ignore */ }
                        }
                        const isComboItem = Boolean(item.isCombo || item.combo_id || (Array.isArray(comboItemsParsed) && comboItemsParsed.length > 0));

                        const itemTax = Number(item.tax_amount) || 0;
                        const itemTotal = Number(item.total) || 0;
                        const qty = Number(item.quantity) || 1;
                        const unitPriceExcl = Number(item.unit_price) || 0;
                        const itemCgstRate = Number(item.cgst_rate) || 0;
                        const itemSgstRate = Number(item.sgst_rate) || 0;
                        const itemIgstRate = Number(item.igst_rate) || 0;
                        const directRate = Number(item.tax_rate) || (itemCgstRate + itemSgstRate + itemIgstRate);

                        // Taxable base (Base Amount = Total - Tax or Qty * Unit Price)
                        const taxableBase = itemTotal > itemTax 
                          ? Math.round((itemTotal - itemTax) * 100) / 100 
                          : Math.round((qty * unitPriceExcl) * 100) / 100;

                        // Unit price including tax
                        const unitPriceIncl = qty > 0 
                          ? Math.round((itemTotal / qty) * 100) / 100 
                          : (unitPriceExcl + itemTax);

                        let calculatedRate = directRate;
                        if (!calculatedRate || calculatedRate <= 0) {
                          if (taxableBase > 0 && itemTax > 0) {
                            calculatedRate = Math.round((itemTax / taxableBase) * 100 * 10) / 10;
                          }
                        }
                        const itemTaxRate = calculatedRate > 0 ? calculatedRate : 0;
                        const itemHsn = item.hsn_sac_code || item.hsn_code || (item as DisplayInvoiceItem).hsn;
                        const isInterItem = selectedInvoice.supply_type === 'INTER' || itemIgstRate > 0;
                        const effCgstR = itemCgstRate || (!isInterItem && itemTaxRate > 0 ? Math.round((itemTaxRate / 2) * 10) / 10 : 0);
                        const effSgstR = itemSgstRate || (!isInterItem && itemTaxRate > 0 ? Math.round((itemTaxRate / 2) * 10) / 10 : 0);
                        const effIgstR = itemIgstRate || (isInterItem && itemTaxRate > 0 ? itemTaxRate : 0);
                        const itemTaxSplit = splitTaxAmount(itemTax);
                        const effCgstAmt = Number(item.cgst_amount) || (!isInterItem && itemTax > 0 ? itemTaxSplit.cgst : 0);
                        const effSgstAmt = Number(item.sgst_amount) || (!isInterItem && itemTax > 0 ? itemTaxSplit.sgst : 0);
                        const effIgstAmt = Number(item.igst_amount) || (isInterItem && itemTax > 0 ? itemTax : 0);

                        const weightUoms = ['kgs', 'grams', 'mtrs', 'ltrs', 'kg', 'gram', 'mtr', 'ltr'];
                        const isWeight = item.billing_type === 'WEIGHT' || 
                                         weightUoms.includes((item.unit || '').toLowerCase()) ||
                                         (item.pieces_sold != null && item.pieces_sold > 0 && Number(item.quantity) !== Number(item.pieces_sold));
                        const pcs = item.pieces_sold ?? item.pieces_override;

                        return (
                          <tr 
                            key={item.item_id || i}
                            className={clsx(
                              'transition-colors hover:bg-muted/15',
                              i % 2 !== 0 && 'bg-muted/[0.02]'
                            )}
                          >
                            {/* 1. Item NAME & HSN CODE */}
                            <td className="px-3 py-2.5 align-middle min-w-[160px]">
                              <div className="flex items-center gap-2 min-w-0">
                                {isComboItem ? (
                                  <div className="p-1 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 shrink-0">
                                    <Boxes className="w-3.5 h-3.5" />
                                  </div>
                                ) : (
                                  <div className="p-1 rounded-md bg-muted/60 text-muted-foreground shrink-0">
                                    <Package className="w-3 h-3" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-foreground truncate">{item.name || 'Unknown'}</span>
                                    {isComboItem && (
                                      <span className="text-[9px] font-extrabold text-purple-600 dark:text-purple-400 bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 rounded uppercase leading-none">
                                        COMBO
                                      </span>
                                    )}
                                    {itemHsn && (
                                      <span className="text-[9px] font-mono font-bold text-muted-foreground bg-muted/80 border border-border px-1.5 py-0.5 rounded leading-none" title={`HSN/SAC: ${itemHsn}`}>
                                        HSN: {itemHsn}
                                      </span>
                                    )}
                                  </div>
                                  {comboItemsParsed && comboItemsParsed.length > 0 && (
                                    <div className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 mt-0.5">
                                      Includes: {comboItemsParsed.map((ci) => `${ci.product_name || 'Product'} (x${ci.quantity})`).join(', ')}
                                    </div>
                                  )}
                                  {item.originalRate != null && Number(item.originalRate) !== Number(item.unit_price) && (
                                    <span className="text-[9px] text-muted-foreground font-semibold block mt-0.5 truncate">
                                      MRP {formatCurrency(Number(item.originalRate))} → {formatCurrency(Number(item.unit_price))}{item.discountLabel ? ` (${item.discountLabel})` : ''}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 2. Qty */}
                            <td className="px-2 py-2.5 text-center font-bold text-foreground/80 align-middle whitespace-nowrap">
                              {isWeight ? (
                                pcs ? (
                                  <div className="flex flex-col items-center leading-tight">
                                    <span className="text-xs text-foreground font-black">{pcs} Pcs</span>
                                    <span className="text-[10px] text-muted-foreground font-semibold">{item.quantity} {item.unit || 'Kg'}</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-foreground font-bold">{item.quantity} {item.unit || 'Kg'}</span>
                                )
                              ) : (
                                <span className="text-xs text-foreground font-bold">{item.quantity} Pcs</span>
                              )}
                            </td>

                            {/* 3. Unit Rate excl. tax */}
                            <td className="px-2.5 py-2.5 text-right align-middle whitespace-nowrap">
                              <div className="text-foreground/85 font-mono font-semibold">{formatCurrency(unitPriceExcl)}</div>
                              {isGstBill && itemTaxRate > 0 && (
                                <div className="text-[9.5px] font-medium text-muted-foreground">excl. tax</div>
                              )}
                            </td>

                            {/* 4. CGST AMOUNT % , SGST AMOUNT % (DOWN LIKE UNIT RATE) */}
                            {isGstBill && (
                              <td className="px-2.5 py-2.5 text-right align-middle whitespace-nowrap">
                                {isInterItem ? (
                                  <div className="font-mono text-right leading-tight">
                                    <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                                      IGST: {formatCurrency(effIgstAmt)}
                                    </div>
                                    <div className="text-[9.5px] text-muted-foreground font-medium">({effIgstR}%)</div>
                                  </div>
                                ) : (effCgstAmt > 0 || effSgstAmt > 0) ? (
                                  <div className="font-mono text-right leading-tight space-y-0.5">
                                    <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                                      CGST: {formatCurrency(effCgstAmt)} <span className="text-[9.5px] font-medium text-muted-foreground">({effCgstR}%)</span>
                                    </div>
                                    <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                                      SGST: {formatCurrency(effSgstAmt)} <span className="text-[9.5px] font-medium text-muted-foreground">({effSgstR}%)</span>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground font-mono text-[11px]">-</span>
                                )}
                              </td>
                            )}

                            {/* 5. TAXABLE VALUE */}
                            {isGstBill && (
                              <td className="px-2.5 py-2.5 text-right align-middle whitespace-nowrap">
                                <div className="font-mono font-bold text-foreground">{formatCurrency(taxableBase)}</div>
                                {itemTax > 0 ? (
                                  <div className="text-[10px] text-amber-700 dark:text-amber-400 font-mono font-semibold">
                                    Tax: {formatCurrency(itemTax)}
                                  </div>
                                ) : (
                                  <div className="text-[9.5px] text-muted-foreground font-medium">Tax: ₹0.00</div>
                                )}
                              </td>
                            )}

                            {/* 6. UNIT RATE INCL TAX */}
                            {isGstBill && (
                              <td className="px-2.5 py-2.5 text-right align-middle whitespace-nowrap">
                                <div className="font-mono font-semibold text-foreground">{formatCurrency(unitPriceIncl)}</div>
                                <div className="text-[9.5px] font-medium text-muted-foreground">incl. tax</div>
                              </td>
                            )}

                            {/* 7. TOTAL */}
                            <td className="px-3 py-2.5 text-right align-middle whitespace-nowrap">
                              <div className="font-mono font-black text-foreground text-sm">{formatCurrency(itemTotal)}</div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

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
            const actualRefundPaid = Number(selectedInvoice.actual_refund_paid) || 0;
            const netPayable = Math.max(0, preDeductionTotal - totalDeductions);

            return (
              <div className="rounded-xl border border-primary/20 overflow-hidden bg-primary/[0.02]">
                <div className="px-4 py-3 space-y-2 bg-card">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground font-semibold">Subtotal</span>
                    <span className="font-bold text-foreground">{formatCurrency(sub)}</span>
                  </div>
                  {tax > 0 && (() => {
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
                      <span className="text-orange-500 font-semibold">
                        Scrap Credit {selectedInvoice.scrap_invoice_number ? `(${selectedInvoice.scrap_invoice_number})` : ''}
                      </span>
                      <span className="text-orange-500 font-bold">-{formatCurrency(scrapD)}</span>
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
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Pre-Deduction Total</span>
                      <span className="text-sm font-bold text-foreground">{formatCurrency(preDeductionTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3 bg-emerald-500/10 border-t border-emerald-500/20">
                      <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Refund Amount</span>
                      <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(refundAmount)}</span>
                    </div>
                    {actualRefundPaid > 0 && (
                      <>
                        <div className="flex items-center justify-between px-4 py-2 bg-orange-500/10 border-t border-orange-400/20">
                          <span className="text-xs font-black text-orange-600 dark:text-orange-400 uppercase tracking-widest">Actual Refund Paid</span>
                          <span className="text-base font-black text-orange-600 dark:text-orange-400">{formatCurrency(actualRefundPaid)}</span>
                        </div>
                        {Math.abs(actualRefundPaid - refundAmount) > 0.005 && (
                          <div className="flex items-center justify-between px-4 py-1.5 bg-orange-500/5 border-t border-orange-400/10">
                            <span className="text-[10px] font-black text-orange-600 dark:text-orange-400 uppercase tracking-widest">
                              {actualRefundPaid > refundAmount ? 'Over-refunded' : 'Under-refunded'}
                            </span>
                            <span className="text-xs font-black text-orange-600 dark:text-orange-400">
                              {formatCurrency(Math.abs(actualRefundPaid - refundAmount))}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </>
                ) : totalDeductions > 0 ? (
                  <>
                    <div className="flex items-center justify-between px-4 py-2 bg-primary/5 border-t border-primary/10">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Pre-Deduction Total</span>
                      <span className="text-sm font-bold text-foreground">{formatCurrency(preDeductionTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-t border-primary/20">
                      <span className="text-xs font-black text-primary uppercase tracking-widest">Grand Total</span>
                      <span className="text-lg font-black text-foreground">{formatCurrency(netPayable)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-t border-primary/20">
                    <span className="text-[10px] font-black text-primary uppercase tracking-widest">Grand Total</span>
                    <span className="text-lg font-black text-foreground">{formatCurrency(Number(selectedInvoice.grand_total))}</span>
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
