import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { ArrowLeft, X, Package, IndianRupee, AlertCircle, CheckCircle2, Minus, Plus, LogOut } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { Skeleton } from './ui/Skeleton';

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
  const { tenantId, userId, role } = useAuthStore();
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
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
        const items = await window.electronAPI.dbGetInvoiceItems(invoice.invoice_id);
        if (Array.isArray(items)) {
          setInvoiceItems(items);
          setSelections(
            items.map((item: InvoiceItem) => ({
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
        const ratio = newQty / s.max_quantity;
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
      <header className="shrink-0 flex items-center justify-between px-4 h-12 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="p-1.5 hover:bg-accent rounded-lg transition-colors cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center">
            <Package className="w-4 h-4 text-red-500" />
          </div>
          <h1 className="font-black text-sm">Create Return</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="flex items-center gap-1.5 px-3 h-8 text-xs font-bold hover:bg-accent rounded-xl transition-all cursor-pointer">
            <X className="w-3.5 h-3.5" /> Close
          </button>
        </div>
      </header>

      {/* Invoice info */}
      <div className="shrink-0 px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-bold">{invoice.invoice_number}</span>
            <span className="text-[10px] text-muted-foreground ml-2">{invoice.customer_name || 'Walk-in'}</span>
          </div>
          <button
            onClick={handleReturnAll}
            className="text-[10px] font-bold text-primary hover:bg-primary/10 px-2.5 h-7 rounded-lg transition-all cursor-pointer"
          >
            Return All
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 rounded-xl border border-border">
              <Skeleton className="h-4 w-40 mb-3" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))
        ) : (
          selections.map((s, index) => (
            <div key={s.invoice_item_id} className="p-4 rounded-xl border border-border">
              <div className="flex items-center justify-between mb-3">
                <div className="min-w-0 flex-1 mr-3">
                  <div className="text-xs font-bold truncate">{s.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatCurrency(s.unit_price)} each · Max {s.max_quantity}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-black">-{formatCurrency(s.unit_price * s.quantity)}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => updateQuantity(index, -1)}
                    disabled={s.quantity <= 0}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-muted hover:bg-accent text-foreground transition-all cursor-pointer disabled:opacity-30"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-12 text-center text-sm font-black tabular-nums">{s.quantity}</span>
                  <button
                    onClick={() => updateQuantity(index, 1)}
                    disabled={s.quantity >= s.max_quantity}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-muted hover:bg-accent text-foreground transition-all cursor-pointer disabled:opacity-30"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                {s.quantity > 0 && s.quantity < s.max_quantity && (
                  <span className="text-[10px] text-muted-foreground">Partial return</span>
                )}
                {s.quantity === s.max_quantity && (
                  <span className="text-[10px] font-bold text-emerald-500">Full return</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Reason & Submit */}
      <div className="shrink-0 border-t border-border bg-card p-4 space-y-3">
        {error && (
          <div className="flex items-center gap-2 text-xs font-bold text-red-500 bg-red-500/10 px-3 py-2 rounded-xl">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}

        <input
          type="text"
          placeholder="Reason for return (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-3 h-9 text-xs font-medium bg-muted border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/30 transition-all"
        />

        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] text-muted-foreground">Refund Amount</div>
            <div className="text-sm font-black text-red-500">-{formatCurrency(grandTotal)}</div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={saving || !hasSelections}
            className="px-6 h-10 text-xs font-bold text-white bg-red-500 hover:bg-red-600 disabled:bg-muted disabled:text-muted-foreground rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            {saving ? 'Processing...' : 'Process Return'}
          </button>
        </div>
      </div>
    </div>
  );
}
