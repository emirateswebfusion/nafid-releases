import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Undo2, Search, X, Package, User, AlertCircle, CheckCircle2, LogOut, Phone, Trash, IndianRupee, Clock, Printer } from 'lucide-react';
import clsx from 'clsx';
import { Skeleton } from '../ui/Skeleton';
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape';
import { Modal } from '../ui/Modal';
import { RedCrossButton } from '../ui/RedCrossButton';
import { FloatToast } from '../ui/FloatToast';
import { generateReceiptText, DEFAULT_BILL_SETTINGS, formatBillDateTime, type ReceiptData, parseUTCDate } from '../../utils/print/receiptGenerator';
import { generateInvoiceHtml } from '../../utils/print/invoiceHtmlGenerator';
import { parsePrintFormat, formatPrinterError } from '../../utils/print/printFormatHelper';
import { getStoreTimezone } from '../../utils/time/timezoneHelper';
import { isDesktopRuntime } from '../../data/client';
import { printingApi } from '../../data/printing';
import { returnsApi } from '../../data/returns';
import { settingsApi } from '../../data/settings';
import { formatCurrency } from '../../utils/pricing/money';
import type * as Rows from '../../data/dbRows';

interface ReturnInvoice extends Rows.ReturnsRow {
  customer_state?: string | null;
  biller_name?: string | null;
}

interface ReturnItem extends Rows.ReturnItemsRow {
  billing_type?: string | null; pieces_sold?: number | null; pieces_override?: number | null; unit?: string | null; uom?: string | null;
  sku_barcode?: string;
  item_code?: string;
}


function formatDate(dateStr: string | null) {
  const tz = getStoreTimezone();
  const d = parseUTCDate(dateStr);
  return d.toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' });
}

export function ReturnManager({ onClose, isRestricted }: { onClose: () => void; isRestricted?: boolean }) {
  useCloseOnEscape(onClose);
  const { tenantId, userName: _userName, userId: _userId } = useAuthStore();
  const [returns, setReturns] = useState<ReturnInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedReturn, setSelectedReturn] = useState<ReturnInvoice | null>(null);
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadReturns = useCallback(async () => {
    setLoading(true);
    try {
      if (isDesktopRuntime()) {
        const data = await returnsApi.getReturns({ tenant_id: tenantId as string, search: search || undefined });
        if (Array.isArray(data)) setReturns(data);
      }
    } catch (err) {
      console.error('[ReturnManager] Failed to load returns:', err);
    }
    setLoading(false);
  }, [tenantId, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadReturns starts the current tenant/search request after the screen commits.
    loadReturns();
  }, [loadReturns]);

  const handleViewReturn = async (r: ReturnInvoice) => {
    setSelectedReturn(r);
    setItemsLoading(true);
    try {
      if (isDesktopRuntime()) {
        const items = await returnsApi.getReturnItems(r.return_id);
        if (Array.isArray(items)) setReturnItems(items);
      }
    } catch (err) {
      console.error('[ReturnManager] Failed to load return items:', err);
    }
    setItemsLoading(false);
  };

  const handleDeleteReturn = async () => {
    if (!selectedReturn) return;
    setDeleteSaving(true);
    try {
      if (isDesktopRuntime()) {
        const res = await returnsApi.deleteReturn(selectedReturn.return_id);
        if (res.success) {
          setStatusMessage({ text: 'Return deleted & stock restored', type: 'success' });
          setSelectedReturn(null);
          setDeleteConfirmOpen(false);
          loadReturns();
        } else {
          setStatusMessage({ text: res.error || 'Failed to delete return', type: 'error' });
        }
      }
    } catch {
      setStatusMessage({ text: 'Failed to delete return', type: 'error' });
    }
    setDeleteSaving(false);
  };

  const handlePrintReturn = async (r: ReturnInvoice, items: ReturnItem[]) => {
    if (!isDesktopRuntime()) return;
    try {
      const [shopNameVal, shopAddr, shopPh, upi, showQr, shopGstin] = await Promise.all([
        settingsApi.get({ tenant_id: tenantId || 'global', key: 'shop_name' }),
        settingsApi.get({ tenant_id: tenantId || 'global', key: 'shop_address' }),
        settingsApi.get({ tenant_id: tenantId || 'global', key: 'shop_phone' }),
        settingsApi.get({ tenant_id: tenantId || 'global', key: 'upi_id' }),
        settingsApi.get({ tenant_id: tenantId || 'global', key: 'show_upi_qr' }),
        settingsApi.get({ tenant_id: tenantId || 'global', key: 'shop_gstin' }),
      ]);
      const receiptConfig = await settingsApi.get({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
      const receiptWidthCm = receiptConfig?.receiptWidthCm ? Number(receiptConfig.receiptWidthCm) : 5.8;
      const printFmtRaw = await settingsApi.get({ tenant_id: tenantId || 'global', key: 'print_format' });
      const printFmt = parsePrintFormat(printFmtRaw);
      const isHalfA4 = printFmt.format === 'half-a4';
      const isA4 = printFmt.format === 'a4';
      const useA4 = isA4 || isHalfA4;
      const billSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt.billSettings || {}) };

      const receiptData: ReceiptData = {
        shopName: billSettings.showShopName !== false ? (shopNameVal || useAuthStore.getState().shopName || 'My Shop') : '',
        shopGstin: billSettings.showShopGstin !== false ? (shopGstin || undefined) : undefined,
        shopAddress: billSettings.showShopAddress !== false ? (shopAddr || undefined) : undefined,
        shopPhone: billSettings.showPhone !== false ? (shopPh || undefined) : undefined,
        upiId: upi || undefined,
        showUpiQr: showQr !== null && showQr !== undefined ? Boolean(showQr) : true,
        showProductOffers: printFmt.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
        invoiceNumber: r.return_number,
        invoiceType: 'RETURN',
        date: formatBillDateTime(r.return_date || r.created_at || Date.now()),
        billerName: billSettings.showBillerName !== false ? (r.biller_name || useAuthStore.getState().userName || undefined) : undefined,
        items: items.map(item => {
          const itemAny = item;
          return {
            name: item.name as string,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: item.total,
            billing_type: itemAny.billing_type,
            pieces_sold: itemAny.pieces_sold != null ? Number(itemAny.pieces_sold) : undefined,
            pieces_override: itemAny.pieces_override != null ? Number(itemAny.pieces_override) : undefined,
            unit: itemAny.unit || itemAny.uom,
          };
        }),
        subtotal: r.subtotal,
        tax: r.tax_total,
        discount: 0,
        grandTotal: r.grand_total,
        customerName: billSettings.showCustomerName !== false ? (r.customer_name || undefined) : undefined,
        customerPhone: billSettings.showCustomerPhone !== false ? (r.customer_phone || undefined) : undefined,
        customerAddress: billSettings.showCustomerAddress !== false ? (r.customer_address || undefined) : undefined,
        customerState: billSettings.showCustomerState !== false ? (r.customer_state || undefined) : undefined,
        billSettings,
        a5Orientation: printFmt.a5Orientation || 'horizontal',
      };

      if (useA4) {
        const invoiceStyle = isHalfA4 ? 'half-a4' : (printFmt.a4Style || (printFmt.format === 'a4' ? printFmt.style : undefined) || 'boxed');
        const invoiceHtml = generateInvoiceHtml(receiptData, invoiceStyle as Parameters<typeof generateInvoiceHtml>[1]);
        const printResult = await printingApi.printA4Html(tenantId || 'global', invoiceHtml);
        if (printResult && !printResult.success) {
          setStatusMessage({ text: formatPrinterError(printResult.error), type: 'error' });
        } else {
          setStatusMessage({ text: 'Return bill printed successfully', type: 'success' });
        }
      } else {
        const thermalWidth = printFmt.width ? Number(printFmt.width) / 10 : receiptWidthCm;
        const thermalStyle = printFmt.thermalStyle || (printFmt.format === 'thermal' ? printFmt.style : undefined) || 'standard';
        const receiptText = generateReceiptText(receiptData, thermalWidth, undefined, thermalStyle);
        const printResult = await printingApi.printReceipt(tenantId || 'global', receiptText);
        if (printResult?.skipped) {
          setStatusMessage({ text: formatPrinterError('No printer configured'), type: 'error' });
        } else if (printResult && !printResult.success) {
          setStatusMessage({ text: formatPrinterError(printResult.error), type: 'error' });
        } else {
          setStatusMessage({ text: 'Return bill printed successfully', type: 'success' });
        }
      }
    } catch (err) {
      console.error('Failed to print return bill', err);
      setStatusMessage({ text: 'Failed to print: ' + ((err as Error)?.message || 'Unknown error'), type: 'error' });
    }
  };

  // Calculations for Stats
  const totalRefunded = returns.reduce((sum, r) => sum + r.grand_total, 0);

  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const todayReturns = returns.filter(r => {
    try {
      const datePart = (r.return_date as string).split('T')[0];
      return datePart === todayStr;
    } catch {
      return false;
    }
  });
  const todayRefundedAmount = todayReturns.reduce((sum, r) => sum + r.grand_total, 0);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 px-5 py-3">
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 shadow-inner shrink-0">
            <Undo2 className="w-4 h-4" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">Returns</h1>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
            </div>
            <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
              {returns.length} return record{returns.length !== 1 ? 's' : ''} · Track customer returns & stock restoration
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isRestricted ? (
              <button onClick={() => useAuthStore.getState().logout()} className="h-10 px-4 flex items-center gap-1.5 text-xs font-bold text-red-500 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-all duration-200 active:scale-95 border border-red-500/20 cursor-pointer">
                <LogOut className="w-4 h-4" /> Logout
              </button>
            ) : (
              <RedCrossButton onClick={onClose} title="Close" />
            )}
          </div>
        </div>
      </header>

      {/* Status Message for small screens */}
      {statusMessage && (
        <div className={clsx('sm:hidden shrink-0 flex items-center gap-2 px-4 py-2 text-xs font-bold border-b', statusMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/10' : 'bg-red-500/10 text-red-600 border-red-500/10')}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          {statusMessage.text}
          <button onClick={() => setStatusMessage(null)} className="ml-auto cursor-pointer"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Statistics Panel */}
      <div className="flex-1 flex flex-col min-h-0 bg-background select-none w-full px-4 sm:px-6 py-6 space-y-6">
        {/* Themed Stats Cards */}
        <div className="grid grid-cols-3 gap-5 select-none shrink-0">
          <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
            <div className="p-3 bg-gradient-to-br from-rose-500/10 to-rose-500/5 text-rose-600 dark:text-rose-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
              <Undo2 className="w-5 h-5" />
            </div>
            <div className="leading-tight text-left min-w-0 flex-1">
              <p className="text-2xl font-black text-foreground font-mono truncate">{returns.length}</p>
              <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Total Returns</p>
            </div>
          </div>

          <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
            <div className="p-3 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
              <IndianRupee className="w-5 h-5" />
            </div>
            <div className="leading-tight text-left min-w-0 flex-1">
              <p className="text-2xl font-black text-foreground font-mono truncate">{formatCurrency(totalRefunded)}</p>
              <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Total Refunded</p>
            </div>
          </div>

          <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
            <div className="p-3 bg-gradient-to-br from-amber-500/10 to-amber-500/5 text-amber-600 dark:text-amber-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
              <Clock className="w-5 h-5" />
            </div>
            <div className="leading-tight text-left min-w-0 flex-1">
              <p className="text-2xl font-black text-foreground font-mono truncate">{formatCurrency(todayRefundedAmount)}</p>
              <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Today's Refunds</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card border border-border p-4 rounded-[28px] shadow-sm px-6 py-3.5 shrink-0 select-none">
          <div className="relative w-full sm:max-w-xs flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/45 pointer-events-none" />
            <input
              type="text"
              placeholder="Search return #, customer name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-semibold text-foreground"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-1 hover:bg-muted rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* List Grid */}
        <div className="flex-1 overflow-y-auto bg-muted/[0.02]">
          <div className="bg-card border border-border rounded-[28px] overflow-hidden shadow-sm p-6 flex-1 flex flex-col min-h-0">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="px-4.5 py-4 rounded-3xl border border-border bg-card shadow-sm flex items-center gap-4">
                    <Skeleton className="w-10 h-10 rounded-2xl shrink-0" />
                    <div className="flex-1">
                      <Skeleton className="h-3.5 w-28 mb-1.5" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                    <Skeleton className="h-3.5 w-16 shrink-0" />
                  </div>
                ))}
              </div>
            ) : returns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                  <Undo2 className="w-6 h-6 opacity-40" />
                </div>
                <p className="text-xs font-bold">No returns found</p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {returns.map((r) => (
                  <button
                    key={r.return_id}
                    onClick={() => handleViewReturn(r)}
                    className="w-full text-left p-4.5 rounded-3xl border border-border bg-card hover:border-primary/20 hover:shadow-md transition-all duration-300 shadow-sm cursor-pointer flex items-center justify-between group select-none animate-in fade-in duration-200"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                        <Undo2 className="w-5 h-5 text-rose-500" />
                      </div>
                      <div className="min-w-0 flex-1 leading-tight text-left">
                        <span className="text-sm font-extrabold text-foreground tracking-wide font-mono block">{r.return_number}</span>
                        <span className="text-[11px] text-muted-foreground/75 font-semibold mt-1 truncate block">
                          {r.customer_name || 'Walk-in Customer'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 shrink-0 ml-4">
                      <span className="text-[10px] font-bold text-muted-foreground hidden sm:block">{formatDate(r.return_date)}</span>
                      <span className="text-sm font-black text-rose-500">
                        -{formatCurrency(r.grand_total)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Return Detail Modal */}
      <Modal
        isOpen={!!selectedReturn}
        onClose={() => setSelectedReturn(null)}
        className="max-w-2xl"
        title={
          selectedReturn && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-black text-foreground font-mono">{selectedReturn.return_number}</span>
              <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-bold font-mono">
                RETURN RECORD
              </span>
            </div>
          )
        }
      >
        {selectedReturn && (
          <div className="space-y-4 text-foreground">
            {/* Refund detail metadata */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground">{formatDate(selectedReturn.return_date)}</p>
              </div>
              <div className="text-right">
                <span className="text-[9px] uppercase font-black tracking-wider text-muted-foreground block leading-none mb-1">Refund Amount</span>
                <span className="text-lg font-black text-rose-500">-{formatCurrency(selectedReturn.grand_total)}</span>
              </div>
            </div>

            {/* Customer Info Card */}
            <div className="bg-card border border-border rounded-xl p-3.5 grid grid-cols-2 gap-3 shadow-sm">
              <div>
                <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Customer</span>
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground mt-0.5">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  {selectedReturn.customer_name || 'Walk-in Customer'}
                </div>
              </div>
              {selectedReturn.customer_phone && (
                <div>
                  <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Phone</span>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground mt-0.5">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                    {selectedReturn.customer_phone}
                  </div>
                </div>
              )}
            </div>

            {selectedReturn.reason && (
              <div className="bg-amber-500/[0.04] border-l-4 border-amber-500 p-3.5 rounded-r-xl">
                <span className="text-[9px] uppercase tracking-wider font-bold text-amber-600 dark:text-amber-400">
                  Reason for Return
                </span>
                <p className="text-xs text-foreground italic mt-0.5">
                  "{selectedReturn.reason}"
                </p>
              </div>
            )}

            {/* Items */}
            <div className="space-y-4 pt-2">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Returned Items</h3>
              {itemsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-4 mb-2 rounded-xl border border-border bg-card shadow-sm">
                    <Skeleton className="w-10 h-10 rounded-xl" />
                    <div className="flex-1">
                      <Skeleton className="h-3 w-32 mb-1.5" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))
              ) : (
                <div className="space-y-2">
                  {returnItems.map((item) => (
                    <div key={item.return_item_id} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card shadow-sm hover:border-rose-500/15 transition-all">
                      <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0 shadow-inner">
                        <Package className="w-5 h-5 text-rose-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-foreground truncate">{item.name}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          {item.sku_barcode && (
                            <>
                              <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{item.sku_barcode}</span>
                              <span>·</span>
                            </>
                          )}
                          <span>{item.quantity} × {formatCurrency(item.unit_price)}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-black text-rose-500">-{formatCurrency(item.total)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Totals */}
              {!itemsLoading && returnItems.length > 0 && (
                <div className="p-4 rounded-xl border border-border bg-muted/30 shadow-inner space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-bold text-foreground">{formatCurrency(selectedReturn.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="font-bold text-foreground">{formatCurrency(selectedReturn.tax_total)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-black text-rose-500 pt-2.5 border-t border-border">
                    <span>Total Refund</span>
                    <span>-{formatCurrency(selectedReturn.grand_total)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-border">
              <button
                onClick={() => selectedReturn && handlePrintReturn(selectedReturn, returnItems)}
                className="flex items-center justify-center gap-1.5 px-4 h-10 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" /> Print Return Bill
              </button>
              <button
                onClick={() => { setDeleteConfirmOpen(true); }}
                className="flex items-center justify-center gap-1.5 px-4 h-10 text-xs font-bold text-red-500 bg-red-500/10 hover:bg-red-500/20 border border-red-500/15 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
              >
                <Trash className="w-3.5 h-3.5" /> Delete Return
              </button>
              <button
                onClick={() => setSelectedReturn(null)}
                className="ml-auto flex items-center justify-center gap-1.5 px-5 h-10 text-xs font-bold text-muted-foreground bg-muted hover:bg-muted/80 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} closeButton={<RedCrossButton onClick={() => setDeleteConfirmOpen(false)} />}>
        <div className="p-6 max-w-sm mx-auto text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center shadow-inner">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="text-base font-black mb-1 text-foreground">Delete Return?</h3>
          <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
            This will remove the return record and deduct the returned quantity from stock.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={handleDeleteReturn} disabled={deleteSaving}
              className="w-full h-10 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl shadow-md shadow-red-500/10 transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-50"
            >{deleteSaving ? 'Deleting...' : 'Delete'}</button>
          </div>
        </div>
      </Modal>

      {statusMessage && (
        <FloatToast
          message={statusMessage.text}
          type={statusMessage.type}
          onClose={() => setStatusMessage(null)}
        />
      )}
    </div>
  );
}
