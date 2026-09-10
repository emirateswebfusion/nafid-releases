import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { ArrowLeft, X, Package, AlertCircle, Minus, Plus, FileText, Undo2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { Skeleton } from './ui/Skeleton';
import { generateReceiptText, DEFAULT_BILL_SETTINGS, formatBillDateTime, type ReceiptData } from '../utils/receiptGenerator';
import { generateInvoiceHtml } from '../utils/invoiceHtmlGenerator';
import { parsePrintFormat } from '../utils/printFormatHelper';

function formatCurrency(amount: number): string {
  return `\u20B9${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface InvoiceItem {
  item_id: string;
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  total: number;
}

interface ReturnItemSelection {
  invoice_item_id: string;
  product_id: string;
  name: string;
  max_quantity: number;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  total: number;
}

export function CreateReturn({
  invoice,
  onClose,
  onSuccess,
}: {
  invoice: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  useCloseOnEscape(onClose);
  const { tenantId, userId, role } = useAuthStore();
  const [, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selections, setSelections] = useState<ReturnItemSelection[]>([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInvoiceItems();
  }, []);

  const loadInvoiceItems = async () => {
    setLoading(true);
    try {
      if (window.electronAPI) {
        let items = await window.electronAPI.dbGetInvoiceItems(invoice.invoice_id);
        if (!Array.isArray(items)) items = [];

        // Converted GST copy → refund at the original BoS prices the customer paid.
        // (source_item_id marks lines that were copied from a Bill of Supply.)
        let isConvertedBos = false;
        if (invoice.converted_to_invoice_id) {
          // Superseded BoS → only lines that were NOT copied can be returned here.
          isConvertedBos = true;
          const copyItems = await window.electronAPI.dbGetInvoiceItems(invoice.converted_to_invoice_id);
          const copiedProducts = new Set(Array.isArray(copyItems) ? copyItems.map((c: any) => c.product_id) : []);
          items = items.filter((it: any) => !copiedProducts.has(it.product_id));
        }

        const normalized = items.map((item: InvoiceItem & { source_item_id?: string; bos_unit_price?: number; bos_tax_amount?: number; bos_total?: number }) =>
          item.source_item_id
            ? { ...item, unit_price: Number(item.bos_unit_price) || 0, tax_amount: Number(item.bos_tax_amount) || 0, total: Number(item.bos_total) || 0 }
            : item
        );

        setInvoiceItems(normalized);
        setSelections(
          normalized.map((item: InvoiceItem) => ({
            invoice_item_id: item.item_id,
            product_id: item.product_id,
            name: item.name,
            max_quantity: item.quantity,
            quantity: item.quantity,
            unit_price: item.unit_price,
            tax_amount: item.tax_amount,
            total: item.total,
          }))
        );
        if (isConvertedBos && normalized.length === 0) {
          setError('All items from this Bill of Supply were converted to GST. Return them from the GST copy instead.');
        }
      }
    } catch (err) {
      console.error('[CreateReturn] Failed to load invoice items:', err);
    }
    setLoading(false);
  };

  const updateQuantity = (index: number, delta: number) => {
    setSelections((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const newQty = Math.max(0, Math.min(s.max_quantity, s.quantity + delta));
        const ratio = s.max_quantity === 0 ? 0 : newQty / s.max_quantity;
        return {
          ...s,
          quantity: newQty,
          total: Number((s.unit_price * newQty).toFixed(2)),
          tax_amount: Number((s.tax_amount * ratio).toFixed(2)),
        };
      })
    );
  };

  const handleReturnAll = () => {
    setSelections((prev) =>
      prev.map((s) => ({
        ...s,
        quantity: s.max_quantity,
        total: s.unit_price * s.max_quantity,
        tax_amount: s.tax_amount,
      }))
    );
  };

  const subtotal = selections.reduce((sum, s) => sum + Number((s.unit_price * s.quantity).toFixed(2)), 0);
  const taxTotal = selections.reduce((sum, s) => {
    if (s.max_quantity === 0) return sum;
    return sum + Number((s.tax_amount * (s.quantity / s.max_quantity)).toFixed(2));
  }, 0);
  const grandTotal = Number((subtotal + taxTotal).toFixed(2));
  const hasSelections = selections.some((s) => s.quantity > 0);

  const handleSubmit = async () => {
    if (!hasSelections) {
      setError('Select at least one item to return');
      return;
    }
    if (role !== 'OWNER') {
      setError('Only owners can process returns');
      return;
    }
    setSaving(true);
    setError(null);

    try {
      if (window.electronAPI) {
        const selectedItems = selections.filter((s) => s.quantity > 0);
        const returnId = uuidv4();
        const numberRes = await window.electronAPI.dbGetNextReturnNumber({ tenant_id: tenantId });
        const returnNumber = numberRes?.returnNumber || `RTN-${Date.now()}`;

        const payload = {
          return_id: returnId,
          invoice_id: invoice.invoice_id,
          tenant_id: tenantId,
          user_id: userId,
          return_number: returnNumber,
          customer_name: invoice.customer_name,
          customer_phone: invoice.customer_phone,
          subtotal,
          tax_total: taxTotal,
          grand_total: grandTotal,
          reason: reason || null,
          refund_method: 'ADJUST_BILL',
          items: selectedItems.map((s) => ({
            return_item_id: uuidv4(),
            invoice_item_id: s.invoice_item_id,
            product_id: s.product_id,
            name: s.name,
            quantity: s.quantity,
            unit_price: s.unit_price,
            tax_amount: s.tax_amount,
            total: s.total,
          })),
        };

        const res = await window.electronAPI.dbCreateReturn(payload);
        if (res.success) {
          try {
            const [shopNameVal, shopAddr, shopPh, upi, showQr, shopGstin] = await Promise.all([
              window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_name' }),
              window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_address' }),
              window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_phone' }),
              window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'upi_id' }),
              window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_upi_qr' }),
              window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_gstin' }),
            ]);
            const receiptConfig = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
            const receiptWidthCm = receiptConfig?.receiptWidthCm ? Number(receiptConfig.receiptWidthCm) : 5.8;
            const printFmtRaw = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'print_format' });
            const printFmt = parsePrintFormat(printFmtRaw);
            const isHalfA4 = printFmt.format === 'half-a4';
            const isA4 = printFmt.format === 'a4';
            const useA4 = isA4 || isHalfA4;
            const billSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt.billSettings || {}) };

            const receiptData: ReceiptData = {
              shopName: billSettings.showShopName ? (shopNameVal || useAuthStore.getState().shopName || 'My Shop') : '',
              shopGstin: billSettings.showShopGstin ? (shopGstin || undefined) : undefined,
              shopAddress: billSettings.showShopAddress ? (shopAddr || undefined) : undefined,
              shopPhone: billSettings.showPhone ? (shopPh || undefined) : undefined,
              upiId: upi || undefined,
              showUpiQr: showQr !== null && showQr !== undefined ? Boolean(showQr) : true,
              showProductOffers: printFmt.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
              invoiceNumber: returnNumber,
              invoiceType: 'RETURN',
              date: formatBillDateTime(new Date()),
              items: selectedItems.map(s => ({
                name: s.name,
                quantity: s.quantity,
                unit_price: s.unit_price,
                total: s.total,
                billing_type: (s as any).billing_type,
                pieces_sold: (s as any).pieces_sold != null ? Number((s as any).pieces_sold) : undefined,
                pieces_override: (s as any).pieces_override != null ? Number((s as any).pieces_override) : undefined,
                unit: (s as any).unit || (s as any).uom,
              })),
              subtotal,
              tax: taxTotal,
              discount: 0,
              grandTotal,
              customerName: billSettings.showCustomerName ? (invoice.customer_name || undefined) : undefined,
              customerPhone: billSettings.showPhone ? (invoice.customer_phone || undefined) : undefined,
              billSettings,
              a5Orientation: printFmt.a5Orientation || 'horizontal',
            };

            if (useA4) {
              const invoiceStyle = isHalfA4 ? 'half-a4' : (printFmt.style || 'standard');
              const invoiceHtml = generateInvoiceHtml(receiptData, invoiceStyle as any);
              await window.electronAPI.printA4Html(tenantId || 'global', invoiceHtml);
            } else {
              const thermalWidth = printFmt.width ? Number(printFmt.width) / 10 : receiptWidthCm;
              const thermalStyle = printFmt.style || 'standard';
              const receiptText = generateReceiptText(receiptData, thermalWidth, undefined, thermalStyle);
              await window.electronAPI.printReceipt(tenantId || 'global', receiptText);
            }
          } catch (err) {
            console.error('Failed to print return bill', err);
          }
          onSuccess();
          onClose();
        } else {
          setError(res.error || 'Failed to create return');
        }
      }
    } catch (err) {
      setError('Failed to create return');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 px-5 py-3">
          <button onClick={onClose} className="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-border flex items-center justify-center" title="Back">
            <ArrowLeft className="w-4 h-4" />
          </button>
          
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 shadow-inner shrink-0">
            <Package className="w-4 h-4 text-rose-500" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">Create Return</h1>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
            </div>
            <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
              Select items and quantities from the original invoice to initiate a return
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onClose} className="h-10 px-4 flex items-center gap-1.5 text-xs font-bold text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer">
              <X className="w-4 h-4 text-destructive" /> Close
            </button>
          </div>
        </div>
      </header>

      {/* Invoice summary card */}
      <div className="shrink-0 px-5 py-4 border-b border-border bg-muted/[0.03]">
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-inner">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Original Invoice</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-black text-foreground font-mono">{invoice.invoice_number}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-xs font-bold text-muted-foreground">{invoice.customer_name || 'Walk-in Customer'}</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleReturnAll}
            className="flex items-center justify-center gap-1.5 px-4 h-9 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer border border-primary/10"
          >
            <Undo2 className="w-3.5 h-3.5" /> Return All Items
          </button>
        </div>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-muted/[0.02]">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-5 rounded-2xl border border-border bg-card shadow-sm">
              <Skeleton className="h-4 w-48 mb-3.5" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))
        ) : (
          selections.map((s, index) => (
            <div key={s.invoice_item_id} className="p-4 rounded-2xl border border-border bg-card shadow-sm hover:border-rose-500/10 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0 shadow-inner">
                  <Package className="w-4 h-4 text-rose-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-foreground truncate">{s.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {formatCurrency(s.unit_price)} each · Max quantity: <span className="font-bold text-foreground">{s.max_quantity}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between md:justify-end gap-6 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-muted p-1 rounded-xl">
                    <button
                      onClick={() => updateQuantity(index, -1)}
                      disabled={s.quantity <= 0}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-card hover:bg-accent text-foreground transition-all active:scale-90 cursor-pointer disabled:opacity-30 shadow-sm"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-12 text-center text-xs font-black tabular-nums text-foreground">{s.quantity}</span>
                    <button
                      onClick={() => updateQuantity(index, 1)}
                      disabled={s.quantity >= s.max_quantity}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-card hover:bg-accent text-foreground transition-all active:scale-90 cursor-pointer disabled:opacity-30 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="w-24 text-right">
                    {s.quantity > 0 && s.quantity < s.max_quantity && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-bold">Partial Return</span>
                    )}
                    {s.quantity === s.max_quantity && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold">Full Return</span>
                    )}
                    {s.quantity === 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[9px] font-bold">No Return</span>
                    )}
                  </div>
                </div>

                <div className="text-right min-w-[80px]">
                  <span className="text-[10px] text-muted-foreground block leading-none mb-0.5">Refund</span>
                  <span className="text-xs font-black text-rose-500">-{formatCurrency(s.unit_price * s.quantity)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Reason & Submit */}
      <div className="shrink-0 border-t border-border bg-card p-5 space-y-4 shadow-[0_-4px_12px_rgba(0,0,0,0.03)] z-10">
        {error && (
          <div className="flex items-center gap-2 text-xs font-semibold text-red-500 bg-red-500/10 border border-red-500/10 px-4 py-3 rounded-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="relative">
          <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="Reason for return (optional)..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full pl-10 pr-4 h-10 text-xs font-medium bg-muted border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block leading-none mb-1">Total Refund Amount</span>
            <div className="text-lg font-black text-rose-500">-{formatCurrency(grandTotal)}</div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={saving || !hasSelections}
            className="px-6 h-10 text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 disabled:bg-muted disabled:text-muted-foreground rounded-xl transition-all active:scale-95 shadow-md shadow-rose-500/10 cursor-pointer disabled:cursor-not-allowed"
          >
            {saving ? 'Processing...' : 'Process Return'}
          </button>
        </div>
      </div>
    </div>
  );
}
