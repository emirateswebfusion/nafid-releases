import { useState, useEffect, Fragment, forwardRef, useImperativeHandle, useRef, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import {
  Search, Package, X, Trash, FileText, Calendar, User,
  CheckCircle2, AlertCircle, Plus, Save,
  Receipt, Tag, RefreshCw, Eye, Download, Pencil, Send, LayoutGrid, List,
  UserPlus, Loader2, Phone, MapPin, UserCircle, Banknote, Check, Layers
} from 'lucide-react';
import { Select } from './ui/Select';
import clsx from 'clsx';
import { v4 as uuidv4 } from 'uuid';
import { Skeleton } from './ui/Skeleton';
import { Modal } from './ui/Modal';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { DateRangeFilter } from './ui/DateRangeFilter';

interface PurchaseBill {
  purchase_bill_id: string;
  tenant_id: string;
  bill_number: string;
  supplier_id: string;
  supplier_name: string;
  bill_date: string;
  invoice_number?: string;
  notes: string;
  total_amount: number;
  bill_type: string;
  created_at: string;
  supplier_phone?: string; payment_type?: string;
}

interface PurchaseBillItem {
  item_id: string;
  purchase_bill_id: string;
  product_id: string;
  name: string;
  product_name?: string;
  quantity: number;
  purchase_price: number;
  total_amount: number;
  is_gst_applicable: number;
  tax_rate_percent: number;
  hsn_sac_code: string;
  sku_barcode?: string;
  item_code?: string;
}

interface Product {
  product_id: string;
  name: string;
  sku_barcode: string;
  item_code: string;
  purchase_price: number;
  base_price: number;
  current_stock: number;
  gst_purchase_quantity: number;
  gst_purchase_price: number;
  grade_id?: string;
  pricing_mode?: string;
  grade_rate?: number;
  grade_purchase_price?: number;
  is_gst_applicable?: number;
  tax_rate_percent?: number;
  hsn_sac_code?: string;
  offer_price?: number | null;
  brand_manufacturer?: string;
  category?: string;
  uom?: string;
  reorder_level?: number;
}

const formatDate = (d: string) => {
  if (!d) return '—';
  const date = new Date(d.replace(' ', 'T'));
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export function PurchaseBillManager({ onClose, isRestricted: _isRestricted }: { onClose: () => void; isRestricted?: boolean }) {
  useCloseOnEscape(onClose);
  const { tenantId, userId, userName } = useAuthStore();

  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'GST' | 'ESTIMATE'>('ALL');
  const [filterInvoice, setFilterInvoice] = useState<'ALL' | 'WITH' | 'WITHOUT'>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewingBill, setViewingBill] = useState<PurchaseBill | null>(null);
  const [viewingBillItems, setViewingBillItems] = useState<PurchaseBillItem[]>([]);
  const [loadingViewingItems, setLoadingViewingItems] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [editingBill, setEditingBill] = useState<PurchaseBill | null>(null);
  const [editHasItems, setEditHasItems] = useState(false);

  // derived — apply type, invoice, and date filters on top of the server-side search results
  const filteredBills = useMemo(() => {
    let res = bills;
    if (filterType !== 'ALL') {
      res = res.filter(b => b.bill_type === filterType);
    }
    if (filterInvoice === 'WITH') {
      res = res.filter(b => !!b.invoice_number);
    } else if (filterInvoice === 'WITHOUT') {
      res = res.filter(b => !b.invoice_number);
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      res = res.filter(b => new Date(b.bill_date) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      res = res.filter(b => new Date(b.bill_date) <= to);
    }
    return res;
  }, [bills, filterType, filterInvoice, dateFrom, dateTo]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [billDate, setBillDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [billNotes, setBillNotes] = useState('');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const gstRef = useRef<PurchaseBillFormHandle>(null);
  const estRef = useRef<PurchaseBillFormHandle>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [billType, setBillType] = useState<'GST' | 'ESTIMATE'>('GST');
  const [gstHasItems, setGstHasItems] = useState(false);
  const [estHasItems, setEstHasItems] = useState(false);
  const [billSummaries, setBillSummaries] = useState<Record<string, {
    totalQty: number;
    cgst: number;
    sgst: number;
    taxableAmount: number;
    itemsCount: number;
  }>>({});

  // ── Party Create Dialog ──
  const [showPartyCreateForm, setShowPartyCreateForm] = useState(false);
  const [newPartyForm, setNewPartyForm] = useState({
    name: '', phone: '', address: '', gstin: '', opening_balance: '', balance_type: 'RECEIVABLE' as 'RECEIVABLE' | 'PAYABLE', notes: '',
  });
  const [isSavingParty, setIsSavingParty] = useState(false);

  // Stable memoized editingData objects to prevent infinite re-render cascades
  // (Inline object literals cause child useEffect([editingData]) to fire on every render)
  const gstEditingData = useMemo(() =>
    editingBill?.bill_type === 'GST'
      ? {
          purchase_bill_id: editingBill.purchase_bill_id,
          bill_number: editingBill.bill_number,
          invoice_number: editingBill?.invoice_number,
          payment_type: (editingBill as any)?.payment_type || 'CASH',
          total_amount: Number((editingBill as any)?.total_amount) || 0,
        }
      : undefined,
    [editingBill?.purchase_bill_id, editingBill?.bill_number, editingBill?.invoice_number, editingBill?.bill_type, (editingBill as any)?.payment_type]
  );
  const estEditingData = useMemo(() =>
    editingBill?.bill_type === 'ESTIMATE'
      ? {
          purchase_bill_id: editingBill.purchase_bill_id,
          bill_number: editingBill.bill_number,
          invoice_number: editingBill?.invoice_number,
          payment_type: (editingBill as any)?.payment_type || 'CASH',
          total_amount: Number((editingBill as any)?.total_amount) || 0,
        }
      : undefined,
    [editingBill?.purchase_bill_id, editingBill?.bill_number, editingBill?.invoice_number, editingBill?.bill_type, (editingBill as any)?.payment_type]
  );

  // Stable memoized cross-section addItem callbacks
  const gstOtherAddItem = useMemo(() => estRef.current?.addItem ?? undefined, [estRef.current?.addItem]);
  const estOtherAddItem = useMemo(() => gstRef.current?.addItem ?? undefined, [gstRef.current?.addItem]);

  // Bulk share: copy ALL items from source section to destination section (keeps both in sync)
  const handleBulkShare = async (source: 'GST' | 'ESTIMATE') => {
    const srcRef = source === 'GST' ? gstRef : estRef;
    const dstRef = source === 'GST' ? estRef : gstRef;
    const target = source === 'GST' ? 'Estimate' : 'GST';
    const items = srcRef.current?.getItems?.() ?? [];
    if (items.length === 0) {
      setStatusMessage({ text: `Share failed: no items in ${source} section to share`, type: 'error' });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }
    if (!dstRef.current?.addItem) {
      setStatusMessage({ text: 'Share failed: destination section unavailable', type: 'error' });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }
    for (const item of items) {
      await dstRef.current.addItem(item);
    }
    setStatusMessage({ text: `${source} items shared to ${target} (${items.length} item${items.length > 1 ? 's' : ''})`, type: 'success' });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const loadBillSummaries = async (bills: PurchaseBill[]) => {
    if (!window.electronAPI) return;
    const gstBills = bills.filter(b => b.bill_type === 'GST');
    if (gstBills.length === 0) {
      const summaries: Record<string, any> = {};
      const estBills = bills.filter(b => b.bill_type === 'ESTIMATE');
      if (estBills.length > 0) {
        const estResults = await Promise.allSettled(
          estBills.map(b => window.electronAPI!.dbGetPurchaseBillItems(b.purchase_bill_id))
        );
        estBills.forEach((bill, idx) => {
          const items: any[] = (estResults[idx] as any)?.value || [];
          if (Array.isArray(items)) {
            summaries[bill.purchase_bill_id] = {
              totalQty: items.reduce((a, i) => a + Number(i.quantity), 0),
              cgst: 0,
              sgst: 0,
              taxableAmount: bill.total_amount,
              itemsCount: items.length,
            };
          }
        });
      }
      setBillSummaries(summaries);
      return;
    }
    const results = await Promise.allSettled(
      gstBills.map(b => window.electronAPI!.dbGetPurchaseBillItems(b.purchase_bill_id))
    );
    const summaries: Record<string, any> = {};
    gstBills.forEach((bill, idx) => {
      const items: any[] = (results[idx] as any)?.value || [];
      if (Array.isArray(items)) {
        const totalGst = items.reduce((acc, item) => {
          const rate = item.tax_rate_percent || 0;
          if (item.is_gst_applicable === 1 && rate > 0) {
            return acc + Number(item.total_amount) * (rate / 100);
          }
          return acc;
        }, 0);
        summaries[bill.purchase_bill_id] = {
          totalQty: items.reduce((a, i) => a + Number(i.quantity), 0),
          cgst: totalGst / 2,
          sgst: totalGst / 2,
          taxableAmount: bill.total_amount - totalGst,
          itemsCount: items.length,
        };
      }
    });
    // Also compute for Estimate bills (no tax)
    const estBills = bills.filter(b => b.bill_type === 'ESTIMATE');
    if (estBills.length > 0) {
      const estResults = await Promise.allSettled(
        estBills.map(b => window.electronAPI!.dbGetPurchaseBillItems(b.purchase_bill_id))
      );
      estBills.forEach((bill, idx) => {
        const items: any[] = (estResults[idx] as any)?.value || [];
        if (Array.isArray(items)) {
          summaries[bill.purchase_bill_id] = {
            totalQty: items.reduce((a, i) => a + Number(i.quantity), 0),
            cgst: 0,
            sgst: 0,
            taxableAmount: bill.total_amount,
            itemsCount: items.length,
          };
        }
      });
    }
    setBillSummaries(summaries);
  };

  const loadBills = async () => {
    if (!window.electronAPI || !tenantId) return;
    setLoading(true);
    const result = await window.electronAPI.dbGetPurchaseBills({
      tenant_id: tenantId,
      search: searchQuery || undefined,
      limit: 100,
    });
    if (Array.isArray(result)) {
      setBills(result);
      loadBillSummaries(result);
    }
    setLoading(false);
  };

  useEffect(() => { loadBills(); }, [tenantId, searchQuery]);

  useEffect(() => {
    if (showAddForm && window.electronAPI && tenantId) {
      window.electronAPI.dbGetParties(tenantId)
        .then(res => { if (Array.isArray(res)) setSuppliers(res); })
        .catch(console.error);
    }
  }, [showAddForm, tenantId]);

  const handleViewBill = async (bill: PurchaseBill) => {
    setViewingBill(bill);
    setLoadingViewingItems(true);
    if (window.electronAPI) {
      const items = await window.electronAPI.dbGetPurchaseBillItems(bill.purchase_bill_id);
      if (Array.isArray(items)) {
        setViewingBillItems(items);
      } else {
        setViewingBillItems([]);
      }
    }
    setLoadingViewingItems(false);
  };

  const handleEditBill = async (bill: PurchaseBill) => {
    setEditingBill(bill);
    setEditHasItems(false);
    setGstHasItems(false);
    setEstHasItems(false);
    setSupplierName(bill.supplier_name);
    setSupplierSearch('');
    setSupplierId(bill.supplier_id);
    setBillDate(bill.bill_date || new Date().toLocaleDateString('en-CA'));
    setBillNotes(bill.notes || '');
    setBillType(bill.bill_type as 'GST' | 'ESTIMATE');
    setShowAddForm(true);
  };

  const handleDelete = async (bill: PurchaseBill) => {
    if (!confirm(`Delete purchase bill "${bill.bill_number}" from ${bill.supplier_name}?`)) return;
    if (window.electronAPI) {
      const res = await window.electronAPI.dbDeletePurchaseBill(bill.purchase_bill_id);
      if (res.success) {
        setBills(prev => prev.filter(b => b.purchase_bill_id !== bill.purchase_bill_id));
        setStatusMessage({ text: 'Purchase bill deleted', type: 'success' });
      } else {
        setStatusMessage({ text: 'Delete failed: ' + (res.error || ''), type: 'error' });
      }
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const handleExportCSV = async () => {
    if (filteredBills.length === 0) return;
    setIsExporting(true);
    try {
      const billGstMap: Record<string, { sgst: number; cgst: number }> = {};
      const gstBills = filteredBills.filter(b => b.bill_type === 'GST');
      if (gstBills.length > 0 && window.electronAPI) {
        const results = await Promise.all(
          gstBills.map(b => window.electronAPI!.dbGetPurchaseBillItems(b.purchase_bill_id))
        );
        gstBills.forEach((bill, idx) => {
          const items: PurchaseBillItem[] = Array.isArray(results[idx]) ? results[idx] as PurchaseBillItem[] : [];
          const totalGst = items.reduce((acc, item) => {
            const rate = item.tax_rate_percent || 0;
            if (item.is_gst_applicable === 1 && rate > 0) {
              return acc + Number(item.total_amount) * (rate / 100);
            }
            return acc;
          }, 0);
          billGstMap[bill.purchase_bill_id] = { sgst: totalGst / 2, cgst: totalGst / 2 };
        });
      }
      const headers = [
        'Bill No', 'Date', 'Supplier Name', 'GSTIN',
        'Bill Amount', 'Taxable Amount', 'CGST Amount', 'SGST Amount',
        'IGST Amount', 'CESS Amount', 'Other Amount'
      ];
      const escape = (val: any) => {
        const str = val == null ? '' : String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      };
      const rows = filteredBills.map(b => {
        const { sgst = 0, cgst = 0 } = billGstMap[b.purchase_bill_id] || {};
        const totalGst = cgst + sgst;
        const taxableAmount = b.total_amount - totalGst;
        return [
          escape(b.bill_number),
          escape(new Date(b.bill_date).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\//g, '-')),
          escape(b.supplier_name),
          escape((b as any).supplier_gstin || ''),
          escape(b.total_amount.toFixed(2)),
          escape(taxableAmount.toFixed(2)),
          escape(cgst.toFixed(2)),
          escape(sgst.toFixed(2)),
          '0.00', '0.00', '0.00',
        ];
      });

      const typeLabel = filterType === 'ALL' ? 'All' : filterType;
      const searchLabel = searchQuery ? `_search-${searchQuery}` : '';
      const dateStr = new Date().toLocaleDateString('en-CA');
      const filename = `purchase-bills_${typeLabel}${searchLabel}_${dateStr}.csv`;

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setStatusMessage({ text: `Exported ${filteredBills.length} bills to CSV`, type: 'success' });
      setTimeout(() => setStatusMessage(null), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const handleCreateParty = async () => {
    if (!newPartyForm.name.trim()) { setStatusMessage({ text: 'Party name is required', type: 'error' }); setTimeout(() => setStatusMessage(null), 3000); return; }
    if (!window.electronAPI || !tenantId || !userId) return;
    setIsSavingParty(true);
    try {
      const partyId = uuidv4();
      await window.electronAPI.dbAddParty({
        party_id: partyId,
        tenant_id: tenantId,
        name: newPartyForm.name.trim(),
        phone: newPartyForm.phone.trim() || null,
        address: newPartyForm.address.trim() || null,
        gstin: newPartyForm.gstin.trim() || null,
        balance: parseFloat(newPartyForm.opening_balance) || 0,
        balance_type: newPartyForm.balance_type,
        notes: newPartyForm.notes.trim() || null,
        created_by: userId,
        created_by_name: userName || undefined,
      });
      setStatusMessage({ text: 'Party created successfully', type: 'success' });
      setTimeout(() => setStatusMessage(null), 3000);
      // Refresh suppliers and auto-select
      const updated = await window.electronAPI.dbGetParties(tenantId);
      if (Array.isArray(updated)) setSuppliers(updated);
      setSupplierName(newPartyForm.name.trim());
      setSupplierId(partyId);
      setSupplierSearch('');
      setShowPartyCreateForm(false);
      setNewPartyForm({ name: '', phone: '', address: '', gstin: '', opening_balance: '', balance_type: 'RECEIVABLE', notes: '' });
    } catch {
      setStatusMessage({ text: 'Failed to create party', type: 'error' });
      setTimeout(() => setStatusMessage(null), 3000);
    } finally {
      setIsSavingParty(false);
    }
  };

  const handlePartyFormKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;
    e.preventDefault();
    const container = target.closest('[data-enter-nav]');
    if (!container) return;
    const focusable = container.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [data-enter-submit]');
    const idx = Array.from(focusable).indexOf(target as HTMLInputElement);
    if (idx >= 0 && idx < focusable.length - 1) {
      const nextEl = focusable[idx + 1];
      nextEl?.focus();
    } else if (idx >= 0) {
      (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-enter-submit]')?.click();
    }
  };

  const handleSaveAll = async () => {
    setIsSavingAll(true);
    let savedCount = 0;
    // When editing, save the matching bill type form
    if (editingBill) {
      const activeRef = editingBill.bill_type === 'GST' ? gstRef : estRef;
      const otherRef = editingBill.bill_type === 'GST' ? estRef : gstRef;

      // Save/update the active/original bill if it still has items
      if (activeRef.current && activeRef.current.hasItems) {
        const ok = await activeRef.current.save();
        if (ok) savedCount++;
      } else {
        // If activeRef has no items, but otherRef has items, delete the original bill
        if (otherRef.current?.hasItems && window.electronAPI) {
          await window.electronAPI.dbDeletePurchaseBill(editingBill.purchase_bill_id);
        }
      }

      // Also save the other ref if it has items (creates a new bill of the other type)
      if (otherRef.current?.hasItems) {
        const ok = await otherRef.current.save();
        if (ok) savedCount++;
      }
    } else {
      if (gstRef.current?.hasItems) {
        const ok = await gstRef.current.save();
        if (ok) savedCount++;
      }
      if (estRef.current?.hasItems) {
        const ok = await estRef.current.save();
        if (ok) savedCount++;
      }
    }
    setIsSavingAll(false);
    if (savedCount > 0) {
      setShowAddForm(false);
      setEditingBill(null);
      setEditHasItems(false);
      setGstHasItems(false);
      setEstHasItems(false);
      loadBills();
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* ═══════════════════════════════════════════════════
          HEADER
      ═══════════════════════════════════════════════════ */}
      <header className="shrink-0 z-10 border-b border-border bg-card shadow-sm">
        <div className="max-w-7xl mx-auto w-full px-6 flex items-center justify-between py-3 select-none">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-foreground truncate">
                  {showAddForm ? (editingBill ? `Edit Purchase Bill - ${editingBill.bill_number}` : 'New Purchase Bill') : 'Purchase Bills'}
                </h1>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              </div>
              <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
                {showAddForm ? 'Record a purchase entry' : `${bills.length} purchase bills`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={showAddForm ? () => { setShowAddForm(false); setEditingBill(null); setEditHasItems(false); setGstHasItems(false); setEstHasItems(false); } : onClose}
              className="p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4 text-destructive" />
            </button>
          </div>
        </div>
      </header>

      {/* ─── FLOATING TOASTS ─── */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 w-full max-w-md pointer-events-none">
        {statusMessage && (
          <div className={clsx(
            "px-5 py-3 rounded-xl flex items-center gap-2.5 text-sm font-bold shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-auto",
            statusMessage.type === 'success'
              ? "bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400"
              : "bg-destructive/10 border border-destructive/20 text-destructive"
          )}>
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span className="flex-1">{statusMessage.text}</span>
          </div>
        )}
      </div>

      {/* ── LIST VIEW ── */}
      {!showAddForm && (
        <>
          <div className="max-w-7xl mx-auto w-full px-6 pt-6 select-none shrink-0">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card border border-border p-4 rounded-[28px] shadow-sm px-6 py-3.5 select-none">
              {/* Search */}
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/45" />
              <input
                type="text"
                placeholder="Search bill or supplier..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-semibold text-foreground"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-1 hover:bg-muted rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Type Filter */}
              <div className="flex gap-1.5 p-1.5 bg-muted/50 dark:bg-muted/20 border border-border rounded-2xl overflow-x-auto scrollbar-none w-full max-w-fit shadow-inner select-none">
                {(['ALL', 'GST', 'ESTIMATE'] as const).map(type => {
                  const count = type === 'ALL' ? bills.length : bills.filter(b => b.bill_type === type).length;
                  const active = filterType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFilterType(active ? 'ALL' : type)}
                      className={clsx(
                        "flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0",
                        active
                          ? "bg-background shadow-md shadow-foreground/[0.03] text-primary border-border/40 font-extrabold"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      {type === 'ALL' ? 'All Type' : type === 'GST' ? 'GST Only' : 'Estimate Only'}
                      {!loading && (
                        <span className={clsx(
                          "text-[10px] px-1.5 py-0.5 rounded-md font-black min-w-[18px] text-center ml-1.5",
                          active
                            ? "bg-primary/25 text-primary"
                            : "bg-muted-foreground/15 text-muted-foreground"
                        )}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <DateRangeFilter startDate={dateFrom} endDate={dateTo} onChange={(s, e) => { setDateFrom(s); setDateTo(e); }} />

            </div>

            <div className="flex items-center gap-2">
              {/* Export Button */}
              {!showAddForm && filteredBills.length > 0 && (
                <button
                  onClick={handleExportCSV}
                  disabled={isExporting}
                  title={`Export ${filteredBills.length} filtered bill${filteredBills.length !== 1 ? 's' : ''} to CSV`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-input bg-background text-foreground shadow-sm font-bold hover:bg-secondary hover:text-secondary-foreground transition-all duration-200 active:scale-95 py-2.5 px-5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  <span>Export</span>
                </button>
              )}

              {/* New Bill Button */}
              <button
                onClick={() => { setShowAddForm(true); setEditingBill(null); setEditHasItems(false); setGstHasItems(false); setEstHasItems(false); }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground shadow-sm font-bold hover:bg-primary/95 transition-all duration-200 active:scale-95 py-2.5 px-5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" /> New Bill
              </button>
            </div>
          </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6 pt-3 bg-muted/[0.02] max-w-7xl mx-auto w-full select-none flex flex-col min-h-0 bg-background">
            <div className="bg-card border border-border rounded-[28px] overflow-hidden shadow-sm flex-1 flex flex-col min-h-0 bg-card border border-border rounded-[28px] overflow-hidden shadow-sm">
              <div className="flex-1 overflow-y-auto">
                <div className="min-w-0 overflow-x-auto">
                  {/* Table Header */}
                  <div className="hidden sm:grid grid-cols-9 gap-3 px-6 md:px-8 py-3.5 bg-muted/20 dark:bg-muted/10 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 border-b border-border select-none">
              <div className="col-span-2 text-left">Bill No</div>
              <div className="col-span-2 text-center">Supplier</div>
              <div className="col-span-1 text-center">Inv No</div>
              <div className="col-span-1 text-center">Bill Date</div>
              <div className="col-span-1 text-center">Items</div>
              <div className="col-span-1 text-right">Amount</div>
              <div className="col-span-1" />
            </div>

            {/* Rows */}
            <div className="flex-1 overflow-y-auto divide-y divide-border relative">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={`skel-${i}`} className="grid grid-cols-9 gap-3 px-8 py-5 items-center">
                    <div className="col-span-2 flex justify-start">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-xl" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-20" />
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2 flex justify-center"><Skeleton className="h-4 w-24" /></div>
                    <div className="col-span-1 flex justify-center"><Skeleton className="h-4 w-14" /></div>
                    <div className="col-span-1 flex justify-center"><Skeleton className="h-4 w-16" /></div>
                    <div className="col-span-1 flex justify-center"><Skeleton className="h-4 w-14" /></div>
                    <div className="col-span-1 flex justify-end"><Skeleton className="h-5 w-16" /></div>
                    <div className="col-span-1 flex justify-center gap-1">
                      <Skeleton className="h-8 w-8 rounded-xl" />
                      <Skeleton className="h-8 w-8 rounded-xl" />
                      <Skeleton className="h-8 w-8 rounded-xl" />
                    </div>
                  </div>
                ))
              ) : filteredBills.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-20">
                  <Receipt className="w-16 h-16 mb-4 opacity-40" />
                  <p className="font-semibold text-foreground text-lg">
                    {filterType === 'ALL' ? 'No purchase bills found' : `No ${filterType === 'GST' ? 'GST' : 'Estimate'} bills found`}
                  </p>
                  <p className="text-sm mt-1">
                    {filterType !== 'ALL' ? `Try switching to "All" to see all bills` : 'Click "New Purchase Bill" to record a purchase entry'}
                  </p>
                </div>
              ) : (
                filteredBills.map(bill => (
                  <Fragment key={bill.purchase_bill_id}>
                    <div
                      onClick={() => handleViewBill(bill)}
                      className={clsx(
                        "border-b border-border last:border-b-0 transition-all duration-200 hover:bg-muted/10 grid grid-cols-9 gap-3 px-8 py-4.5 items-center bg-card cursor-pointer group",
                        viewingBill?.purchase_bill_id === bill.purchase_bill_id && "bg-primary/[0.03] border-l-2 border-l-primary"
                      )}
                    >
                      <div className="col-span-2 flex items-center gap-2.5 text-left">
                        <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-foreground font-bold text-sm truncate">{bill.bill_number}</p>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {bill.bill_type && (
                              <span className={clsx(
                                "text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0",
                                bill.bill_type === 'ESTIMATE'
                                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              )}>
                                {bill.bill_type}
                              </span>
                            )}
                            {bill.payment_type && bill.payment_type !== 'CASH' && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                                {bill.payment_type}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="col-span-2 flex items-center justify-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-semibold text-foreground truncate">{bill.supplier_name}</span>
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        {bill.invoice_number ? (
                          <span className="text-[11px] font-semibold text-foreground font-mono bg-muted/40 px-1.5 py-0.5 rounded-lg border border-border/30">
                            {bill.invoice_number}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/30 font-bold text-xs">—</span>
                        )}
                      </div>
                      <div className="col-span-1 flex items-center justify-center gap-1 text-sm font-medium text-muted-foreground">
                        <Calendar className="w-3 h-3 text-primary/60 shrink-0" />
                        <span className="text-[11px]">{formatDate(bill.bill_date || bill.created_at)}</span>
                      </div>
                      <div className="col-span-1 flex flex-col items-center justify-center leading-tight">
                        {(() => {
                          const s = billSummaries[bill.purchase_bill_id];
                          if (!s) return <span className="text-muted-foreground/30 text-xs">—</span>;
                          return (
                            <>
                              <span className="text-xs font-bold text-foreground">{s.itemsCount} item{s.itemsCount !== 1 ? 's' : ''}</span>
                              <span className="text-[10px] text-muted-foreground font-semibold">Qty: {s.totalQty.toFixed(2)}</span>
                            </>
                          );
                        })()}
                      </div>

                      <div className="col-span-1 text-right">
                        <span className="text-sm font-black text-foreground">₹{Number(bill.total_amount).toFixed(2)}</span>
                      </div>
                      <div className="col-span-1 flex items-center justify-center gap-1.5">
                        <button
                          onClick={e => { e.stopPropagation(); handleEditBill(bill); }}
                          className="w-9 h-9 flex items-center justify-center text-muted-foreground/40 hover:text-amber-500 hover:bg-amber-500/10 rounded-xl transition-all duration-150 cursor-pointer opacity-0 group-hover:opacity-100 shrink-0"
                          title="Edit Bill"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(bill); }}
                          className="w-9 h-9 flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-150 cursor-pointer opacity-0 group-hover:opacity-100 shrink-0"
                          title="Delete Bill"
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleViewBill(bill); }}
                          className="w-9 h-9 flex items-center justify-center text-muted-foreground/40 hover:text-primary hover:bg-primary/10 rounded-xl transition-all duration-150 cursor-pointer opacity-0 group-hover:opacity-100 shrink-0"
                          title="View Bill Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </Fragment>
                ))
              )}
            </div>

            {!loading && bills.length > 0 && (
              <div className="shrink-0 border-t border-border/60 bg-muted/20 px-6 py-4 text-center text-sm font-bold text-muted-foreground">
                {bills.length} purchase bill{bills.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
          </div>
          </div>
          </div>
        </>
      )}

      {/* ── ADD FORM ── */}
      {showAddForm && (
        <div className="max-w-7xl mx-auto w-full px-6 pt-6 pb-6 select-none flex flex-col flex-1 min-h-0">
          {/* ── Shared Info Card ── */}
          <div className="bg-card border border-border rounded-[28px] shadow-sm px-6 py-4 shrink-0">
            <div className="flex items-center gap-4 flex-wrap">
            <input
              type="date" value={billDate}
              onChange={e => setBillDate(e.target.value)}
              className="bg-background/50 border border-border rounded-xl px-3 py-2.5 text-xs font-semibold text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background focus:outline-none transition-all shrink-0"
            />
            <div className="relative flex-1">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500 font-bold text-sm">*</span>
              <input
                type="text" placeholder="Supplier Name"
                value={supplierSearch || supplierName}
                onChange={e => {
                  setSupplierSearch(e.target.value);
                  setSupplierName(e.target.value);
                  setSupplierId('');
                  const match = suppliers.find(s => s.name.toLowerCase() === e.target.value.toLowerCase());
                  if (match) { setSupplierName(match.name); setSupplierId(match.party_id); }
                }}
                className="w-full pl-10 pr-8 py-2.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-semibold text-foreground"
              />
              {supplierSearch && filteredSuppliers.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-50 max-h-[200px] overflow-y-auto">
                  {filteredSuppliers.map(s => (
                    <button
                      key={s.party_id} type="button"
                      onMouseDown={() => { setSupplierName(s.name); setSupplierId(s.party_id); setSupplierSearch(''); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 border-b border-border/40 last:border-0 cursor-pointer"
                    >
                      <User className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-foreground truncate">{s.name}</div>
                        {s.phone && <div className="text-[10px] text-muted-foreground">{s.phone}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setNewPartyForm(prev => ({ ...prev, name: supplierSearch || '' })); setShowPartyCreateForm(true); }}
              className="p-2.5 rounded-xl text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-all active:scale-95 cursor-pointer shrink-0 shadow-inner"
              title="Create Party"
            >
              <UserPlus className="w-4 h-4" />
            </button>
            <div className="flex gap-1.5 p-1.5 bg-muted/50 dark:bg-muted/20 border border-border rounded-2xl overflow-x-auto scrollbar-none shadow-inner select-none shrink-0">
              {/* Tab: GST */}
              <button
                type="button"
                onClick={() => setBillType('GST')}
                className={clsx(
                  "flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0",
                  billType === 'GST'
                    ? "bg-background shadow-md shadow-foreground/[0.03] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-extrabold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <span className={clsx(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  billType === 'GST' ? "bg-emerald-500" : "bg-muted-foreground/40"
                )} />
                GST
                <span className={clsx(
                  "flex items-center justify-center w-4 h-4 rounded-md text-[10px] font-black transition-opacity",
                  billType === 'GST' ? "bg-emerald-500/15 text-emerald-600" : "bg-muted-foreground/15 text-muted-foreground",
                  gstHasItems ? "opacity-100" : "opacity-0"
                )}>✓</span>
              </button>
              {/* Tab: Estimate */}
              <button
                type="button"
                onClick={() => setBillType('ESTIMATE')}
                className={clsx(
                  "flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0",
                  billType === 'ESTIMATE'
                    ? "bg-background shadow-md shadow-foreground/[0.03] text-amber-600 dark:text-amber-400 border-amber-500/30 font-extrabold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <span className={clsx(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  billType === 'ESTIMATE' ? "bg-amber-500" : "bg-muted-foreground/40"
                )} />
                Estimate
                <span className={clsx(
                  "flex items-center justify-center w-4 h-4 rounded-md text-[10px] font-black transition-opacity",
                  billType === 'ESTIMATE' ? "bg-amber-500/15 text-amber-600" : "bg-muted-foreground/15 text-muted-foreground",
                  estHasItems ? "opacity-100" : "opacity-0"
                )}>✓</span>
              </button>
            </div>
            </div>

          {/* ── Notes Row ── */}
          <div className="mt-3.5 pt-3.5 border-t border-border/50 flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
              <Tag className="w-3.5 h-3.5" />
            </div>
            <input
              type="text"
              placeholder="Notes / Remarks (optional)"
              value={billNotes}
              onChange={e => setBillNotes(e.target.value)}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
            />
            {billNotes && (
              <button
                type="button"
                onClick={() => setBillNotes('')}
                className="text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            </div>
          </div>

          <div className={clsx("flex-1 py-5 space-y-4", (gstHasItems || estHasItems) ? "overflow-y-auto" : "overflow-y-hidden")}>
            <div className={billType === 'GST' ? 'block' : 'hidden'}>
              <PurchaseBillFormSection
                ref={gstRef}
                type="GST"
                tenantId={tenantId}
                billDate={billDate}
                supplierName={supplierName}
                supplierId={supplierId}
                notes={billNotes}
                onStatusMessage={setStatusMessage}
                onSaved={() => { setEditingBill(null); setEditHasItems(false); loadBills(); }}
                onItemsLoaded={() => setEditHasItems(true)}
                onItemsChange={setGstHasItems}
                onShareAll={() => handleBulkShare('GST')}
                otherSectionAddItem={gstOtherAddItem}
                editingData={gstEditingData}
                getOtherSectionItems={() => estRef.current?.getItems?.() || []}
              />
            </div>
            <div className={billType === 'ESTIMATE' ? 'block' : 'hidden'}>
              <PurchaseBillFormSection
                ref={estRef}
                type="ESTIMATE"
                tenantId={tenantId}
                billDate={billDate}
                supplierName={supplierName}
                supplierId={supplierId}
                notes={billNotes}
                onStatusMessage={setStatusMessage}
                onSaved={() => { setEditingBill(null); setEditHasItems(false); loadBills(); }}
                onItemsLoaded={() => setEditHasItems(true)}
                onItemsChange={setEstHasItems}
                onShareAll={() => handleBulkShare('ESTIMATE')}
                otherSectionAddItem={estOtherAddItem}
                editingData={estEditingData}
                getOtherSectionItems={() => gstRef.current?.getItems?.() || []}
              />
            </div>
          </div>

          {/* ── Save Button ── */}
          <div className="bg-card border border-border rounded-[28px] shadow-sm px-6 py-4 shrink-0 flex items-center justify-end gap-3">

            <button
              onClick={handleSaveAll}
              disabled={isSavingAll || !(gstHasItems || estHasItems) || (!!editingBill && !editHasItems)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground shadow-sm font-bold hover:bg-primary/95 transition-all duration-200 active:scale-95 py-2.5 px-6 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {isSavingAll ? 'Saving...' : editingBill ? 'Update Purchase Bill' : 'Save Purchase Bill'}
            </button>
          </div>
        </div>
      )}


      {/* ── Purchase Bill Detail — Centered Wide Dialog ── */}
      {viewingBill !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          onClick={() => setViewingBill(null)}
        >
          {/* backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Panel */}
          <div
            className="relative w-full max-w-5xl bg-background flex flex-col shadow-2xl border border-border rounded-2xl max-h-[92vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* ── Drawer header ── */}
            <div className={clsx(
              "shrink-0 px-7 py-6 flex items-start justify-between gap-4",
              viewingBill.bill_type === 'ESTIMATE'
                ? "bg-gradient-to-r from-amber-500/10 to-transparent border-b border-amber-500/20"
                : "bg-gradient-to-r from-emerald-500/10 to-transparent border-b border-emerald-500/20"
            )}>
              <div className="flex items-start gap-4">
                <div className={clsx(
                  "p-3 rounded-2xl shrink-0",
                  viewingBill.bill_type === 'ESTIMATE'
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                )}>
                  <Receipt className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-xl font-black text-foreground tracking-tight">{viewingBill.bill_number}</h2>
                    <span className={clsx(
                      "text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest border",
                      viewingBill.bill_type === 'ESTIMATE'
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25"
                        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                    )}>
                      {viewingBill.bill_type || 'GST'}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-semibold mt-1">
                    Recorded on {formatDate(viewingBill.created_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const bill = viewingBill;
                  setViewingBill(null);
                  handleEditBill(bill);
                }}
                className="w-9 h-9 flex items-center justify-center text-amber-500/60 hover:text-amber-500 hover:bg-amber-500/10 rounded-xl transition-all duration-150 cursor-pointer shrink-0 border border-amber-500/20"
                title="Edit Bill"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={async () => {
                  await handleDelete(viewingBill);
                  setViewingBill(null);
                }}
                className="w-9 h-9 flex items-center justify-center text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-150 cursor-pointer shrink-0 border border-destructive/20"
                title="Delete Bill"
              >
                <Trash className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewingBill(null)}
                className="w-9 h-9 flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-muted rounded-xl transition-all duration-150 cursor-pointer shrink-0 border border-destructive/30"
                title="Close"
              >
                <X className="w-4 h-4 text-destructive" />
              </button>
              </div>
            </div>

            {/* ── Scrollable body ── */}
            <div className="flex-1 overflow-y-auto">

              {/* Supplier + Meta Strip */}
              <div className="px-8 py-5 border-b border-border/60 grid grid-cols-4 gap-8">
                <div className="col-span-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Supplier</p>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground leading-tight">{viewingBill.supplier_name}</p>
                      {viewingBill.supplier_phone && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{viewingBill.supplier_phone}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Bill Date</p>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-foreground mt-1.5">
                    <Calendar className="w-3.5 h-3.5 text-primary/70" />
                    {formatDate(viewingBill.bill_date)}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Supplier Invoice No.</p>
                  {viewingBill.invoice_number ? (
                    <span className="inline-block mt-1.5 text-xs font-mono font-bold bg-muted/60 px-2.5 py-1 rounded-lg border border-border/60 text-foreground">
                      {viewingBill.invoice_number}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/50 italic mt-1.5 block">—</span>
                  )}
                </div>
              </div>

              {/* Items Table */}
              <div className="px-8 pt-6 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Line Items</p>
                  {!loadingViewingItems && viewingBillItems.length > 0 && (
                    <span className="text-[10px] font-bold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full border border-border/40">
                      {viewingBillItems.length} item{viewingBillItems.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <div className="rounded-xl border border-border/60 overflow-hidden bg-card">
                  {/* Table head */}
                  <div className={clsx(
                    "grid gap-3 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border/50 bg-muted/30",
                    viewingBill.bill_type === 'GST'
                      ? "grid-cols-[30px_minmax(0,3fr)_80px_120px_70px_70px_120px]"
                      : "grid-cols-[30px_minmax(0,3fr)_80px_120px_120px]"
                  )}>
                    <div className="text-center">#</div>
                    <div>Product</div>
                    <div className="text-right">Qty</div>
                    <div className="text-right">Rate</div>
                    {viewingBill.bill_type === 'GST' && <div className="text-right">CGST</div>}
                    {viewingBill.bill_type === 'GST' && <div className="text-right">SGST</div>}
                    <div className="text-right">Total</div>
                  </div>

                  {/* Table body */}
                  {loadingViewingItems ? (
                    <div className="flex items-center justify-center gap-2.5 py-10 text-muted-foreground">
                      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs font-semibold">Loading items…</span>
                    </div>
                  ) : viewingBillItems.length === 0 ? (
                    <div className="py-10 text-center">
                      <Package className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                      <p className="text-xs text-muted-foreground font-semibold">No items found in this bill</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/40">
                      {viewingBillItems.map((item, idx) => {
                        const taxRate = item.tax_rate_percent || 0;
                        const hasGst = item.is_gst_applicable === 1 && taxRate > 0;
                        const gstAmt = hasGst ? Number(item.total_amount) * (taxRate / 100) : 0;
                        return (
                          <div
                            key={item.item_id || idx}
                          className={clsx(
                              "grid gap-3 px-5 py-3.5 items-center text-xs transition-colors hover:bg-muted/20",
                              viewingBill.bill_type === 'GST'
                                ? "grid-cols-[30px_minmax(0,3fr)_80px_120px_70px_70px_120px]"
                                : "grid-cols-[30px_minmax(0,3fr)_80px_120px_120px]"
                            )}
                          >
                            <div className="text-xs font-semibold text-muted-foreground/60 text-center select-none">
                              {idx + 1}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-foreground truncate">{item.product_name || item.name}</p>
                              {(item.sku_barcode || item.hsn_sac_code) && (
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  {item.sku_barcode && (
                                    <span className="font-mono text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border/30">
                                      {item.sku_barcode}
                                    </span>
                                  )}
                                  {item.hsn_sac_code && (
                                    <span className="text-[10px] text-muted-foreground">HSN {item.hsn_sac_code}</span>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="text-right font-bold text-foreground">
                              {Number(item.quantity).toFixed(2)}
                            </div>

                            <div className="text-right text-muted-foreground font-semibold">
                              ₹{Number(item.purchase_price).toFixed(2)}
                            </div>

                            {viewingBill.bill_type === 'GST' && (
                              <div className="text-right">
                                {hasGst ? (
                                  <div className="leading-tight">
                                    <p className="font-bold text-foreground">₹{(gstAmt / 2).toFixed(2)}</p>
                                    <p className="text-[9px] text-muted-foreground font-semibold">{(taxRate / 2).toFixed(1)}%</p>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground/50 font-semibold">₹0.00</span>
                                )}
                              </div>
                            )}
                            {viewingBill.bill_type === 'GST' && (
                              <div className="text-right">
                                {hasGst ? (
                                  <div className="leading-tight">
                                    <p className="font-bold text-foreground">₹{(gstAmt / 2).toFixed(2)}</p>
                                    <p className="text-[9px] text-muted-foreground font-semibold">{(taxRate / 2).toFixed(1)}%</p>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground/50 font-semibold">₹0.00</span>
                                )}
                              </div>
                            )}

                            <div className="text-right font-black text-foreground">
                              ₹{(Number(item.total_amount) + gstAmt).toFixed(2)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Notes + Totals — side by side */}
              <div className="px-8 py-6 flex gap-8 items-start">

                {/* Notes */}
                <div className="flex-1 min-w-0">
                  {viewingBill.notes ? (
                    <div className="px-4 py-3 bg-muted/20 border border-border/40 rounded-xl h-full">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">Notes</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{viewingBill.notes}</p>
                    </div>
                  ) : (
                    <div className="px-4 py-3 bg-muted/10 border border-border/30 rounded-xl h-full flex items-center">
                      <p className="text-xs text-muted-foreground/40 italic">No notes on this bill</p>
                    </div>
                  )}
                </div>

                {/* Totals block */}
                <div className="w-72 shrink-0 rounded-xl border border-primary/20 overflow-hidden bg-card">
                  <div className="px-5 py-4 space-y-2.5 border-b border-primary/10">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground font-semibold">Items</span>
                      <span className="font-bold text-foreground">{viewingBillItems.length}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground font-semibold">Total Qty</span>
                      <span className="font-bold text-foreground">
                        {viewingBillItems.reduce((a, i) => a + Number(i.quantity), 0).toFixed(2)}
                      </span>
                    </div>
                    {viewingBill.bill_type === 'GST' && (() => {
                      const totalGst = viewingBillItems.reduce((acc, item) => {
                        const rate = item.tax_rate_percent || 0;
                        if (item.is_gst_applicable === 1 && rate > 0) {
                          return acc + Number(item.total_amount) * (rate / 100);
                        }
                        return acc;
                      }, 0);
                      const halfGst = totalGst / 2;
                      const taxableValue = Number(viewingBill.total_amount) - totalGst;
                      return totalGst > 0 ? (
                        <>
                          <div className="flex justify-between text-xs border-t border-border/30 pt-2">
                            <span className="text-muted-foreground font-semibold">Taxable Value</span>
                            <span className="font-bold text-foreground">₹{taxableValue.toFixed(2)}</span>
                          </div>
                          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2.5 space-y-1.5 mt-0.5">
                            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1.5">GST Breakdown</p>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground font-semibold">CGST</span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{halfGst.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground font-semibold">SGST</span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{halfGst.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-xs border-t border-emerald-500/20 pt-1.5">
                              <span className="text-muted-foreground font-bold">Total GST</span>
                              <span className="font-black text-emerald-600 dark:text-emerald-400">₹{totalGst.toFixed(2)}</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="text-[10px] text-muted-foreground/50 italic text-center py-1">No GST applicable on items</div>
                      );
                    })()}
                    {viewingBill.bill_type === 'ESTIMATE' && (
                      <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold text-center py-1.5 bg-amber-500/5 border border-amber-500/20 rounded-lg px-2">
                        Estimate — No GST Applicable
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between px-5 py-4 bg-primary/[0.06]">
                    <span className="text-xs font-black uppercase tracking-widest text-primary">Grand Total</span>
                    <span className="text-2xl font-black text-foreground">₹{Number(viewingBill.total_amount).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>


          </div>
        </div>
      )}

      {/* ── Create Party Dialog ── */}
      {showPartyCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowPartyCreateForm(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-3xl bg-background border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
            onKeyDown={handlePartyFormKeyDown}
          >
            {/* Header */}
            <div className="shrink-0 px-6 py-4 border-b border-border/60 flex items-center justify-between bg-card">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <UserCircle className="w-4 h-4" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-primary">Create Party</span>
              </div>
              <button
                type="button"
                onClick={() => setShowPartyCreateForm(false)}
                className="p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4 text-destructive" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 max-h-[70vh]" data-enter-nav>
              {/* Party Name */}
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Party Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Rajan Traders"
                  value={newPartyForm.name}
                  onChange={e => setNewPartyForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm"
                  autoFocus
                />
              </div>

              {/* Phone + GSTIN */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Phone</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Phone number"
                      value={newPartyForm.phone}
                      onChange={e => setNewPartyForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full bg-background border border-border rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">GSTIN</label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={newPartyForm.gstin}
                    onChange={e => setNewPartyForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))}
                    className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm font-mono tracking-wider"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Address</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <textarea
                    placeholder="Optional address"
                    rows={2}
                    value={newPartyForm.address}
                    onChange={e => setNewPartyForm(f => ({ ...f, address: e.target.value }))}
                    className="w-full bg-background border border-border rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm resize-none"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Notes</label>
                <textarea
                  placeholder="Internal notes about this party (optional)"
                  rows={2}
                  value={newPartyForm.notes}
                  onChange={e => setNewPartyForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm resize-none"
                />
              </div>

              {/* Opening Balance */}
              <div className="bg-card border border-border/60 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
                  <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Opening Balance (Optional)</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Type</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(['RECEIVABLE', 'PAYABLE'] as const).map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setNewPartyForm(f => ({ ...f, balance_type: t }))}
                          className={clsx(
                            'py-2 px-2 rounded-lg border-2 text-[10px] font-black transition-all duration-200 active:scale-95 cursor-pointer text-center',
                            newPartyForm.balance_type === t
                              ? t === 'RECEIVABLE'
                                ? 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                : 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                              : 'border-border bg-background text-muted-foreground hover:bg-muted'
                          )}
                        >
                          {t === 'RECEIVABLE' ? '↑ Receive' : '↓ Payable'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Amount (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-xs pointer-events-none">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={newPartyForm.opening_balance}
                        onChange={e => setNewPartyForm(f => ({ ...f, opening_balance: e.target.value }))}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        className="w-full bg-background border border-border rounded-xl pl-7 pr-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm no-spinners"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-border/60 bg-card px-6 py-4 flex items-center justify-end gap-2">
              <button
                type="button"
                data-enter-submit
                disabled={isSavingParty || !newPartyForm.name.trim()}
                onClick={handleCreateParty}
                className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
              >
                {isSavingParty ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                {isSavingParty ? 'Creating…' : 'Create Party'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface PurchaseBillFormHandle {
  save: () => Promise<boolean>;
  hasItems: boolean;
  addItem: (item: {
    product_id: string;
    name: string;
    quantity: string;
    purchase_price: string;
    selling_price: string;
    offer_price?: string;
    is_gst_applicable?: number;
    tax_rate_percent?: number;
    hsn_sac_code?: string;
    sku_barcode?: string;
    item_code?: string;
  }) => void;
  getItems: () => Array<{
    product_id: string;
    name: string;
    quantity: string;
    purchase_price: string;
    selling_price: string;
    offer_price?: string;
    stock?: string;
    is_gst_applicable?: number;
    tax_rate_percent?: number;
    hsn_sac_code?: string;
  }>;
  replaceItems: (items: Array<{
    product_id: string;
    name: string;
    quantity: string;
    purchase_price: string;
    selling_price: string;
    offer_price?: string;
    stock?: string;
    is_gst_applicable?: number;
    tax_rate_percent?: number;
    hsn_sac_code?: string;
  }>) => void;
}

const PurchaseBillFormSection = forwardRef<PurchaseBillFormHandle, {
  type: 'GST' | 'ESTIMATE';
  tenantId: string;
  billDate: string;
  supplierName: string;
  supplierId: string;
  notes: string;
  onStatusMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
  onSaved: () => void;
  onItemsLoaded?: () => void;
  onItemsChange?: (hasItems: boolean) => void;
  onShareAll?: () => void;
  otherSectionAddItem?: (item: {
    product_id: string;
    name: string;
    quantity: string;
    purchase_price: string;
    selling_price: string;
    offer_price?: string;
    is_gst_applicable?: number;
    tax_rate_percent?: number;
    hsn_sac_code?: string;
    sku_barcode?: string;
    item_code?: string;
  }) => void;
  editingData?: {
    purchase_bill_id: string;
    bill_number: string;
    invoice_number?: string;
    payment_type: string;
    total_amount?: number;
  };
  getOtherSectionItems?: () => any[];
}>(({ type, tenantId, billDate, supplierName, supplierId, notes, onStatusMessage, onSaved, onItemsLoaded, onItemsChange, onShareAll, otherSectionAddItem, editingData, getOtherSectionItems }, ref) => {
  const [billNumber, setBillNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [manualRoundOff, setManualRoundOff] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [billItems, setBillItems] = useState<Array<{
    product_id: string;
    name: string;
    quantity: string;
    purchase_price: string;
    selling_price: string;
    offer_price?: string;
    stock?: string;
    is_gst_applicable?: number;
    tax_rate_percent?: number;
    hsn_sac_code?: string;
    skip_stock_update?: number;
    is_new_product_clone?: boolean;
    clone_metadata?: {
      barcode: string;
      item_code: string;
      brand_manufacturer: string;
      category: string;
      uom: string;
      reorder_level: number;
      original_product_id?: string;
      original_product_name?: string;
      original_product_is_gst?: boolean;
    };
  }>>([]);
  const [_isSaving, setIsSaving] = useState(false);
  const [priceCoding, setPriceCoding] = useState<Record<string, string> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const productFormDialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [searchDropdownPos, setSearchDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [showProductCreateForm, setShowProductCreateForm] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductItemCode, setNewProductItemCode] = useState('');
  const [newProductBarcode, setNewProductBarcode] = useState('');
  const [newProductBrand, setNewProductBrand] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('');
  const [newProductUom, setNewProductUom] = useState('Pcs');
  const [newProductPurchasePrice, setNewProductPurchasePrice] = useState('');
  const [newProductBasePrice, setNewProductBasePrice] = useState('');
  const [newProductStock, setNewProductStock] = useState('');
  const [newProductReorderLevel, setNewProductReorderLevel] = useState('');
  const [newProductHsn, setNewProductHsn] = useState('');
  const [newProductTaxRate, setNewProductTaxRate] = useState(18);
  const [newProductDiscountPercent, setNewProductDiscountPercent] = useState('');
  const [newProductDiscountFlat, setNewProductDiscountFlat] = useState('');
  const [newProductOfferPrice, setNewProductOfferPrice] = useState('');
  const [newProductIsGstApplicable, setNewProductIsGstApplicable] = useState(true);
  const [newProductIsDummy, setNewProductIsDummy] = useState(false);
  const [newProductIsCustomCategory, setNewProductIsCustomCategory] = useState(false);
  const [newProductGrades, setNewProductGrades] = useState<any[]>([]);
  const [newProductGradeId, setNewProductGradeId] = useState('');
  const [newProductIsAddingGrade, setNewProductIsAddingGrade] = useState(false);
  const [newProductSavingGrade, setNewProductSavingGrade] = useState(false);
  const [newProductGradeForm, setNewProductGradeForm] = useState({ grade_name: '', purchase_price: '', rate: '', offer_price: '' });
  const [pricingTiers, setPricingTiers] = useState<any[]>([]);
  const [tierPrices, setTierPrices] = useState<Record<string, string>>({});
  const [productFormView, setProductFormView] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('productFormView') as 'grid' | 'list') || 'grid';
  });
  const [configuredCategories, setConfiguredCategories] = useState<string[]>([]);
  const [newProductPcs, setNewProductPcs] = useState('');
  const [paymentType, setPaymentType] = useState<'CASH' | 'CREDIT' | 'UPI' | 'BANK_TRANSFER'>('CASH');
  const [editingProductItemId, setEditingProductItemId] = useState<string | null>(null);
  const [sharedEstimateMode, setSharedEstimateMode] = useState(false);

  const openProductEditor = async (item: typeof billItems[0]) => {
    setEditingProductItemId(item.product_id);
    setNewProductName(item.name);
    setNewProductItemCode('');
    setNewProductBarcode('');
    setNewProductBrand('');
    setNewProductCategory('');
    setNewProductUom('Pcs');
    setNewProductPurchasePrice(item.purchase_price || '');
    setNewProductBasePrice(item.selling_price || '');
    setNewProductStock('');
    setNewProductReorderLevel('');
    setNewProductHsn(item.hsn_sac_code || '');
    setNewProductTaxRate(item.tax_rate_percent ?? 18);
    setNewProductDiscountPercent('');
    setNewProductDiscountFlat('');
    setNewProductOfferPrice(item.offer_price && Number(item.offer_price) > 0 ? String(item.offer_price) : '');
    setNewProductIsGstApplicable(item.is_gst_applicable !== 0);
    setNewProductIsDummy(item.skip_stock_update === 1);
    setNewProductPcs('');
    setShowProductCreateForm(true);
    // Populate full product details (MRP/Sale Price, Offer Price, Discounts, Stock, etc.)
    if (window.electronAPI && tenantId) {
      try {
        const product = await window.electronAPI.dbGetProductsByIds({ tenant_id: tenantId, product_ids: [item.product_id] });
        const p = Array.isArray(product) ? product[0] : null;
        if (p) {
          setNewProductName(p.name ?? item.name);
          setNewProductItemCode(p.item_code || '');
          setNewProductBarcode(p.sku_barcode || '');
          setNewProductBrand(p.brand_manufacturer || '');
          setNewProductCategory(p.category || '');
          setNewProductGradeId(p.grade_id || '');
          setNewProductUom(p.uom || 'Pcs');
          if (p.domain_attributes) {
            try {
              const da = typeof p.domain_attributes === 'string' ? JSON.parse(p.domain_attributes) : p.domain_attributes;
              setNewProductPcs(da.pcs ? String(da.pcs) : '');
            } catch {}
          }
          if (!item.purchase_price || Number(item.purchase_price) <= 0) setNewProductPurchasePrice(p.purchase_price != null ? String(p.purchase_price) : '');
          if (!item.selling_price || Number(item.selling_price) <= 0) setNewProductBasePrice(p.base_price != null ? String(p.base_price) : '');
          setNewProductStock(p.current_stock != null ? String(p.current_stock) : '');
          setNewProductReorderLevel(p.reorder_level != null ? String(p.reorder_level) : '');
          setNewProductHsn(p.hsn_sac_code || '');
          setNewProductTaxRate(p.tax_rate_percent ?? 18);
          setNewProductIsGstApplicable(p.is_gst_applicable !== 0);
          setNewProductDiscountPercent(p.discount_percent != null && p.discount_percent > 0 ? String(p.discount_percent) : '');
          setNewProductDiscountFlat(p.discount_flat != null && p.discount_flat > 0 ? String(p.discount_flat) : '');
          if (!item.offer_price || Number(item.offer_price) <= 0) setNewProductOfferPrice(p.offer_price != null && p.offer_price > 0 ? String(p.offer_price) : '');
        }
      } catch { /* non-fatal: keep bill-line values */ }
    }
    if (window.electronAPI && tenantId) {
      window.electronAPI.dbGetProductPricing(tenantId)
        .then((rows: any[]) => {
          if (Array.isArray(rows)) {
            const mine: Record<string, string> = {};
            for (const r of rows) {
              if (r.product_id === item.product_id && r.price != null && r.price !== '') {
                mine[r.pricing_tier_id] = String(r.price);
              }
            }
            setTierPrices(mine);
          }
        })
        .catch(console.error);
    }
    // Rule C: if the product is purchased via Estimate too (present in the other section
    // or already has saved Estimate bills), its barcode purchase code must stay on the raw
    // Estimate base — GST-section edits must never inflate it.
    try {
      const inOtherSection = (getOtherSectionItems ? getOtherSectionItems() : []).some(i => i.product_id === item.product_id);
      let hasEstimateBills = false;
      if (window.electronAPI && tenantId) {
        const res = await window.electronAPI.dbProductHasEstimateBills({ product_id: item.product_id, tenant_id: tenantId });
        hasEstimateBills = !!(res && res.success && res.hasEstimate);
      }
      setSharedEstimateMode(inOtherSection || hasEstimateBills);
    } catch { setSharedEstimateMode(false); }
  };

  useEffect(() => {
    if (editingData) {
      setBillNumber(editingData.bill_number);
      setInvoiceNumber(editingData.invoice_number || '');
      setPaymentType((editingData.payment_type || 'CASH') as any);
      setBillItems([]);
      if (window.electronAPI && tenantId) {
        window.electronAPI.dbGetPurchaseBillItems(editingData.purchase_bill_id)
          .then(items => {
            if (Array.isArray(items)) {
              const mapped = items.map((item: any) => ({
                product_id: item.product_id,
                name: item.product_name || item.name,
                quantity: String(item.quantity),
                purchase_price: String(item.purchase_price),
                selling_price: item.product_base_price != null && Number(item.product_base_price) > 0
                  ? String(item.product_base_price)
                  : (item.selling_price != null && Number(item.selling_price) > 0 ? String(item.selling_price) : ''),
                offer_price: item.product_offer_price != null && Number(item.product_offer_price) > 0
                  ? String(item.product_offer_price)
                  : (item.offer_price != null && Number(item.offer_price) > 0 ? String(item.offer_price) : ''),
                stock: item.product_stock != null ? String(item.product_stock) : '',
                is_gst_applicable: item.is_gst_applicable,
                tax_rate_percent: item.tax_rate_percent,
                hsn_sac_code: item.hsn_sac_code,
              }));
              setBillItems(mapped);
              if (mapped.length > 0) onItemsLoaded?.();

              // Calculate the round-off for editing
              const baseTotal = mapped.reduce((sum: number, i: any) => sum + (Number(i.quantity) || 0) * (Number(i.purchase_price) || 0), 0);
              let unroundedTotal = baseTotal;
              if (type === 'GST') {
                const gstTotal = mapped.reduce((acc: number, item: any) => {
                  const rate = item.tax_rate_percent || 0;
                  const itemTotal = (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0);
                  if ((item.is_gst_applicable ?? 1) === 1 && rate > 0) {
                    return acc + itemTotal * (rate / 100);
                  }
                  return acc;
                }, 0);
                unroundedTotal = baseTotal + gstTotal;
              }
              const diff = (editingData.total_amount ?? 0) - unroundedTotal;
              setManualRoundOff(Math.abs(diff) > 0.001 ? diff.toFixed(2) : '0.00');
            }
          })
          .catch(console.error);
      }
    } else {
      setBillItems([]);
      setManualRoundOff('');
      if (window.electronAPI && tenantId) {
        window.electronAPI.dbGetNextPurchaseBillNumber({ tenant_id: tenantId })
          .then(res => {
            if (res.success && res.billNumber) {
              setBillNumber(type === 'ESTIMATE' ? res.billNumber + '-EST' : res.billNumber);
            }
          })
          .catch(console.error);
      }
    }
    if (window.electronAPI && tenantId) {
      window.electronAPI.settingsGet({ tenant_id: tenantId, key: 'price_coding' })
        .then(res => { if (res) setPriceCoding(res); })
        .catch(console.error);
    }
  }, [tenantId, editingData]);

  useEffect(() => {
    if (window.electronAPI && tenantId && showProductCreateForm) {
      window.electronAPI.dbGetProducts({ tenant_id: tenantId, limit: 200 })
        .then((res: any[]) => {
          if (Array.isArray(res)) {
            const cats = [...new Set(res.map(p => p.category).filter(Boolean))] as string[];
            setConfiguredCategories(cats);
          }
        })
          .catch(console.error);
      window.electronAPI.dbGetGrades(tenantId)
        .then((res: any[]) => {
          if (Array.isArray(res)) setNewProductGrades(res);
        })
        .catch(console.error);
      window.electronAPI.dbGetPricingTiers(tenantId)
        .then((res: any[]) => {
          if (Array.isArray(res)) setPricingTiers(res);
        })
        .catch(console.error);
    }
  }, [showProductCreateForm, tenantId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === ' ' && !showProductCreateForm) {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        const isEditable = (document.activeElement as HTMLElement)?.isContentEditable;
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select' && !isEditable) {
          e.preventDefault();
          setShowProductCreateForm(true);
          setNewProductName('');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showProductCreateForm]);

  const searchProducts = async (q: string) => {
    setProductSearch(q);
    setShowProductCreateForm(false);
    if (!window.electronAPI || !tenantId || q.length < 2) {
      if (q.length < 2) setProducts([]);
      return;
    }
    const result = await window.electronAPI.dbGetPurchaseBillProducts({ tenant_id: tenantId, search: q });
    if (Array.isArray(result)) {
      setProducts(result);
    }
  };

  const addProductToBill = async (product: Product) => {
    const isGstBill = type === 'GST';
    const isProductGst = product.is_gst_applicable !== 0;

    if ((isGstBill && !isProductGst) || (!isGstBill && isProductGst)) {
      // Scenario B: Product type mismatch. Must save separately as a new product.
      let barcode = '';
      if (window.electronAPI && tenantId) {
        try {
          const gen = await window.electronAPI.dbGenerateBarcode({ 
            tenant_id: tenantId, 
            item_code: product.item_code || undefined 
          });
          if (gen?.success && gen?.barcode) {
            barcode = gen.barcode;
          }
        } catch (e) {
          console.error(e);
        }
      }
      if (!barcode) {
        barcode = '999' + Date.now().toString().slice(-9);
      }

      const cleanName = product.name.replace(/\s*\((GST|EST|Estimate)\)$/i, '');
      const newName = cleanName + (isGstBill ? ' (GST)' : ' (EST)');
      const newProductId = uuidv4();

      if (billItems.some(i => i.name === newName)) return;

      setBillItems(prev => [...prev, {
        product_id: newProductId,
        name: newName,
        quantity: '1',
        purchase_price: String(product.gst_purchase_price || product.purchase_price || 0),
        selling_price: String(product.base_price || 0),
        offer_price: product.offer_price != null && Number(product.offer_price) > 0 ? String(product.offer_price) : '',
        stock: '0',
        is_gst_applicable: isGstBill ? 1 : 0,
        tax_rate_percent: isGstBill ? (product.tax_rate_percent ?? 18) : 0,
        hsn_sac_code: isGstBill ? (product.hsn_sac_code || '') : '',
        is_new_product_clone: true,
        clone_metadata: {
          barcode: barcode,
          item_code: (product.item_code || '').toUpperCase(),
          brand_manufacturer: product.brand_manufacturer || '',
          category: product.category || '',
          uom: product.uom || 'Pcs',
          reorder_level: product.reorder_level || 0,
          original_product_id: product.product_id,
          original_product_name: product.name,
          original_product_is_gst: product.is_gst_applicable !== 0,
        }
      }]);

      setProductSearch('');
      setProducts([]);
      return;
    }

    if (billItems.some(i => i.product_id === product.product_id)) return;
    setBillItems(prev => [...prev, {
      product_id: product.product_id,
      name: product.name,
      quantity: '1',
      purchase_price: String(product.gst_purchase_price || product.purchase_price || 0),
      selling_price: String(
        product.pricing_mode === 'GRADE_RATE' && product.grade_rate !== undefined && product.grade_rate !== null
          ? Number(product.grade_rate)
          : (product.base_price || 0)
      ),
      offer_price: product.offer_price != null && Number(product.offer_price) > 0 ? String(product.offer_price) : '',
      stock: product.current_stock != null ? String(product.current_stock) : '',
      is_gst_applicable: product.is_gst_applicable,
      tax_rate_percent: product.tax_rate_percent,
      hsn_sac_code: product.hsn_sac_code,
    }]);
    setProductSearch('');
    setProducts([]);
  };

  const removeBillItem = (productId: string) => {
    setBillItems(prev => prev.filter(i => i.product_id !== productId));
  };

  const updateBillItem = (productId: string, field: 'quantity' | 'purchase_price' | 'selling_price' | 'offer_price' | 'hsn_sac_code', value: string) => {
    setBillItems(prev => prev.map(i => i.product_id === productId ? { ...i, [field]: value } : i));
  };

// Real / Dummy toggle per GST-bill line: Dummy = paper stock / tax record only
  // (no stock add), Real = stock-in.
  const toggleBillItemDummy = (item: any) => {
    const newVal = (item.skip_stock_update ?? 0) === 1 ? 0 : 1;
    setBillItems(prev => prev.map(i => i.product_id === item.product_id ? { ...i, skip_stock_update: newVal } : i));
  };

  const getBillTotal = () => {
    const baseTotal = billItems.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.purchase_price) || 0), 0);
    if (type !== 'GST') return baseTotal;
    const gstTotal = billItems.reduce((acc, item) => {
      const rate = item.tax_rate_percent || 0;
      const itemTotal = (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0);
      if ((item.is_gst_applicable ?? 1) === 1 && rate > 0) {
        return acc + itemTotal * (rate / 100);
      }
      return acc;
    }, 0);
    return baseTotal + gstTotal;
  };

  const getEffectivePurchaseRate = () => {
    const base = Number(newProductPurchasePrice) || 0;
    if (base <= 0) return 0;
    if (type === 'ESTIMATE' || sharedEstimateMode) return base;
    const rate = newProductIsGstApplicable ? (newProductTaxRate || 0) : 0;
    return rate > 0 ? Math.round(base * (1 + rate / 100) * 100) / 100 : base;
  };

  const encodePrice = (rate: number) => {
    if (!priceCoding || rate <= 0) return '';
    let code = '';
    for (const char of String(rate)) {
      if (char === '.') code += '.';
      else if (priceCoding[char]) code += priceCoding[char];
    }
    return code;
  };

  const applyBarcodePriceCode = (oldCode: string, newCode: string) => {
    let barcode = newProductBarcode;
    // Strip the new dotted format first, then the legacy dotless format
    for (const candidate of [oldCode, oldCode.replace(/\./g, '')]) {
      if (candidate && barcode.endsWith(candidate)) {
        barcode = barcode.substring(0, barcode.length - candidate.length);
        break;
      }
    }
    if (newCode) barcode += newCode;
    if (barcode !== newProductBarcode) setNewProductBarcode(barcode);
  };

  const getPriceCode = () => {
    if (!priceCoding || !newProductPurchasePrice) return '';
    return encodePrice(getEffectivePurchaseRate());
  };

  const handlePurchasePriceChange = (val: string) => {
    setNewProductPurchasePrice(val);
    if (!priceCoding) return;
    const rate = (type === 'ESTIMATE' || sharedEstimateMode) ? 0 : (newProductIsGstApplicable ? (newProductTaxRate || 0) : 0);
    const toEffective = (base: number) => base > 0 && rate > 0 ? Math.round(base * (1 + rate / 100) * 100) / 100 : base;
    const oldBase = Number(newProductPurchasePrice) || 0;
    const newBase = Number(val) || 0;
    applyBarcodePriceCode(
      encodePrice(toEffective(oldBase)),
      encodePrice(toEffective(newBase))
    );
  };

  const handleTaxRateChange = (val: string) => {
    const oldRate = newProductTaxRate;
    const newRate = parseFloat(val);
    setNewProductTaxRate(newRate);
    if (!priceCoding || type === 'ESTIMATE' || sharedEstimateMode) return;
    const base = Number(newProductPurchasePrice) || 0;
    if (base <= 0) return;
    const gst = newProductIsGstApplicable;
    const toEffective = (r: number) => gst && r > 0 ? Math.round(base * (1 + r / 100) * 100) / 100 : base;
    applyBarcodePriceCode(
      encodePrice(toEffective(oldRate)),
      encodePrice(toEffective(newRate))
    );
  };

  const handleGstApplicableChange = (val: boolean) => {
    const oldGst = newProductIsGstApplicable;
    setNewProductIsGstApplicable(val);
    if (!priceCoding || type === 'ESTIMATE' || sharedEstimateMode) return;
    const base = Number(newProductPurchasePrice) || 0;
    if (base <= 0) return;
    const rate = newProductTaxRate || 0;
    const toEffective = (g: boolean) => g && rate > 0 ? Math.round(base * (1 + rate / 100) * 100) / 100 : base;
    applyBarcodePriceCode(
      encodePrice(toEffective(oldGst)),
      encodePrice(toEffective(val))
    );
  };

  const handleDiscountPercentChange = (val: string) => {
    if (val === '') {
      setNewProductDiscountPercent('');
      setNewProductDiscountFlat('');
      return;
    }
    const mrp = Number(newProductBasePrice) || 0;
    const pct = parseFloat(val);
    const flat = mrp > 0 && !isNaN(pct) ? ((mrp * pct) / 100).toFixed(2) : '';
    setNewProductDiscountPercent(val);
    setNewProductDiscountFlat(flat);
    setNewProductOfferPrice('');
  };

  const handleDiscountFlatChange = (val: string) => {
    if (val === '') {
      setNewProductDiscountPercent('');
      setNewProductDiscountFlat('');
      return;
    }
    const mrp = Number(newProductBasePrice) || 0;
    const flat = parseFloat(val);
    const pct = mrp > 0 && !isNaN(flat) ? ((flat / mrp) * 100).toFixed(2) : '';
    setNewProductDiscountPercent(pct);
    setNewProductDiscountFlat(val);
    setNewProductOfferPrice('');
  };

  const handleOfferPriceChange = (val: string) => {
    if (val === '') {
      setNewProductOfferPrice('');
      return;
    }
    setNewProductOfferPrice(val);
    setNewProductDiscountPercent('');
    setNewProductDiscountFlat('');
  };

  const autoGenerateBarcode = async () => {
    if (!window.electronAPI || !tenantId) return;
    const priceCode = getPriceCode();
    const res = await window.electronAPI.dbGenerateBarcode({ tenant_id: tenantId, item_code: newProductItemCode || undefined, strip_suffix: priceCode || undefined });
    if (res.success && res.barcode) {
      setNewProductBarcode(res.barcode + priceCode);
    }
  };

  const resetProductForm = () => {
    setShowProductCreateForm(false);
    setEditingProductItemId(null);
    setSharedEstimateMode(false);
    setNewProductName('');
    setNewProductItemCode('');
    setNewProductBarcode('');
    setNewProductBrand('');
    setNewProductCategory('');
    setNewProductUom('Pcs');
    setNewProductPurchasePrice('');
    setNewProductBasePrice('');
    setNewProductStock('');
    setNewProductReorderLevel('');
    setNewProductHsn('');
    setNewProductTaxRate(18);
    setNewProductDiscountPercent('');
    setNewProductDiscountFlat('');
    setNewProductOfferPrice('');
    setNewProductIsGstApplicable(true);
    setNewProductIsDummy(false);
    setNewProductIsCustomCategory(false);
    setNewProductGradeId('');
    setNewProductIsAddingGrade(false);
    setNewProductGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' });
    setNewProductPcs('');
    setTierPrices({});
    setPaymentType('CASH');
  };

  const handleCreateNewGrade = async () => {
    if (!window.electronAPI || !tenantId || !newProductCategory.trim() || !newProductGradeForm.grade_name.trim()) return;
    setNewProductSavingGrade(true);
    const gradeId = uuidv4();
    const res = await window.electronAPI.dbAddGrade({
      grade_id: gradeId,
      tenant_id: tenantId,
      category: newProductCategory.trim(),
      grade_name: newProductGradeForm.grade_name.trim(),
      rate: Number(newProductGradeForm.rate) || 0,
      purchase_price: Number(newProductGradeForm.purchase_price) || 0,
      offer_price: Number(newProductGradeForm.offer_price) || 0,
    });
    if (res.success) {
      const fresh = await window.electronAPI.dbGetGrades(tenantId);
      if (Array.isArray(fresh)) setNewProductGrades(fresh);
      setNewProductGradeId(gradeId);
      if (!newProductBasePrice && newProductGradeForm.rate) setNewProductBasePrice(newProductGradeForm.rate);
      setNewProductIsAddingGrade(false);
      setNewProductGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' });
    } else {
      onStatusMessage({ text: 'Failed to create grade: ' + (res.error || ''), type: 'error' });
      setTimeout(() => onStatusMessage(null), 3000);
    }
    setNewProductSavingGrade(false);
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    const container = target.closest('[data-enter-nav]');
    if (!container) return;
    const focusable = container.querySelectorAll<HTMLElement>('[data-select-trigger]:not([disabled]), input:not([type="checkbox"]):not([type="radio"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [data-focusable-checkbox]');
    const idx = Array.from(focusable).indexOf(target as HTMLElement);
    if (idx === -1) return;
    e.preventDefault();
    if (idx < focusable.length - 1) {
      const nextEl = focusable[idx + 1];
      nextEl?.focus();
      if (nextEl?.hasAttribute('data-select-trigger')) setTimeout(() => nextEl.click(), 0);
    } else {
      (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-enter-submit]')?.click();
    }
  };

  const handleCreateAndAddProduct = async (retries = 3) => {
    if (!window.electronAPI || !tenantId || !newProductName.trim()) return;

    // EDIT MODE — update existing product
    if (editingProductItemId) {
      const purchasePrice = Number(newProductPurchasePrice) || 0;
      const basePrice = Number(newProductBasePrice) || purchasePrice;
      const selectedGrade = newProductGradeId ? newProductGrades.find(g => g.grade_id === newProductGradeId) : null;
      const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
      const isWeightBilling = weightUoms.includes((newProductUom || '').toLowerCase());
      const billingType: 'WEIGHT' | 'PIECE' = isWeightBilling ? 'WEIGHT' : 'PIECE';
      const rawPcs = Number(newProductPcs) || 0;
      const currentStockNum = Number(newProductStock) || 0;
      const domainAttrsObj: Record<string, any> = {};
      if (isWeightBilling && rawPcs > 0) {
        domainAttrsObj.pcs_per_kg = currentStockNum > 0 ? rawPcs / currentStockNum : rawPcs;
        domainAttrsObj.pcs_stock = rawPcs;
        domainAttrsObj.pcs = rawPcs;
      }
      const res = await window.electronAPI.dbUpdateProduct({
        product_id: editingProductItemId,
        tenant_id: tenantId,
        name: newProductName.trim(),
        sku_barcode: newProductBarcode,
        item_code: newProductItemCode.toUpperCase(),
        category: newProductCategory,
        brand_manufacturer: newProductBrand,
        uom: newProductUom,
        purchase_price: purchasePrice,
        base_price: basePrice,
        current_stock: currentStockNum,
        reorder_level: Number(newProductReorderLevel) || 0,
        is_gst_applicable: type === 'GST' ? 1 : 0,
        tax_rate_percent: type === 'GST' ? newProductTaxRate : 0,
        hsn_sac_code: type === 'GST' ? newProductHsn : null,
        discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
        discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
        offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
        billing_type: billingType,
        domain_attributes: isWeightBilling && rawPcs > 0 ? JSON.stringify(domainAttrsObj) : '{}',
        grade_id: selectedGrade?.grade_id || null,
        pricing_mode: selectedGrade ? 'GRADE_RATE' : 'FIXED_PRICE',
      });
      if (res.success) {
        const tierRows = Object.entries(tierPrices).map(([pricing_tier_id, price]) => ({
          pricing_tier_id,
          price: price === '' ? null : Number(price),
        }));
        if (tierRows.length > 0) {
          await window.electronAPI.dbSetProductPricing({
            tenant_id: tenantId,
            product_id: editingProductItemId,
            pricing: tierRows,
          });
        }
        setBillItems(prev => prev.map(i =>
          i.product_id === editingProductItemId
            ? {
                ...i,
                name: newProductName.trim(),
                purchase_price: String(purchasePrice),
                selling_price: String(basePrice),
                offer_price: newProductOfferPrice && Number(newProductOfferPrice) > 0 ? String(newProductOfferPrice) : '',
                is_gst_applicable: newProductIsGstApplicable ? 1 : 0,
                tax_rate_percent: newProductIsGstApplicable ? newProductTaxRate : 0,
                hsn_sac_code: newProductIsGstApplicable ? newProductHsn : '',
                skip_stock_update: type === 'GST' ? (newProductIsDummy ? 1 : 0) : 0,
              }
            : i
        ));
        resetProductForm();
        onStatusMessage({ text: 'Product updated successfully!', type: 'success' });
        setTimeout(() => onStatusMessage(null), 3000);
      } else {
        onStatusMessage({ text: 'Failed to update product: ' + (res.error || ''), type: 'error' });
        setTimeout(() => onStatusMessage(null), 3000);
      }
      return;
    }

    // CREATE MODE — add new product
    const productId = uuidv4();
    let finalBarcode = newProductBarcode;
    if (!finalBarcode) {
      const priceCode = getPriceCode();
      const gen = await window.electronAPI.dbGenerateBarcode({ tenant_id: tenantId, item_code: newProductItemCode || undefined, strip_suffix: priceCode || undefined });
      finalBarcode = ((gen?.success && gen?.barcode) || `${newProductItemCode || '0'}001`) + priceCode;
    }
    const purchasePrice = Number(newProductPurchasePrice) || 0;
    const basePrice = Number(newProductBasePrice) || purchasePrice;
    const selectedGrade = newProductGradeId ? newProductGrades.find(g => g.grade_id === newProductGradeId) : null;
    const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
    const isWeightBilling = weightUoms.includes((newProductUom || '').toLowerCase());
    const billingType: 'WEIGHT' | 'PIECE' = isWeightBilling ? 'WEIGHT' : 'PIECE';
    const rawPcs = Number(newProductPcs) || 0;
    const domainAttrsObj: Record<string, any> = {};
    if (isWeightBilling && rawPcs > 0) {
      domainAttrsObj.pcs_per_kg = rawPcs;
      domainAttrsObj.pcs_stock = rawPcs;
      domainAttrsObj.pcs = rawPcs;
    }
    const res = await window.electronAPI.dbAddProduct({
      product_id: productId,
      tenant_id: tenantId,
      name: newProductName.trim(),
      sku_barcode: finalBarcode,
      item_code: newProductItemCode.toUpperCase(),
      category: newProductCategory,
      brand_manufacturer: newProductBrand,
      uom: newProductUom,
      purchase_price: purchasePrice,
      base_price: basePrice,
      current_stock: 0,
      reorder_level: Number(newProductReorderLevel) || 0,
      is_gst_applicable: type === 'GST' ? 1 : 0,
      tax_rate_percent: type === 'GST' ? newProductTaxRate : 0,
      hsn_sac_code: type === 'GST' ? newProductHsn : null,
      discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
      discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
      offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
      billing_type: billingType,
      domain_attributes: isWeightBilling && rawPcs > 0 ? JSON.stringify(domainAttrsObj) : '{}',
      grade_id: selectedGrade?.grade_id || null,
      pricing_mode: selectedGrade ? 'GRADE_RATE' : 'FIXED_PRICE',
      is_deleted: 0,
      sync_status: 'PENDING',
    });
    if (res.success) {
      const tierRows = Object.entries(tierPrices).map(([pricing_tier_id, price]) => ({
        pricing_tier_id,
        price: price === '' ? null : Number(price),
      }));
      if (tierRows.length > 0) {
        await window.electronAPI.dbSetProductPricing({
          tenant_id: tenantId,
          product_id: productId,
          pricing: tierRows,
        });
      }
      const defaultQty = '1';
      setBillItems(prev => [...prev, {
        product_id: productId,
        name: newProductName.trim(),
        quantity: defaultQty,
        purchase_price: String(purchasePrice),
        selling_price: String(basePrice),
        offer_price: newProductOfferPrice && Number(newProductOfferPrice) > 0 ? String(newProductOfferPrice) : '',
        stock: newProductStock || '',
        is_gst_applicable: type === 'GST' ? 1 : 0,
        tax_rate_percent: type === 'GST' ? newProductTaxRate : 0,
        hsn_sac_code: type === 'GST' ? newProductHsn : '',
        skip_stock_update: type === 'GST' ? (newProductIsDummy ? 1 : 0) : 0,
      }]);
      setProductSearch('');
      setProducts([]);
      resetProductForm();
    } else if (res.error?.includes('sku_barcode') && retries > 0 && !newProductBarcode) {
      const priceCode = getPriceCode();
      // Strip priceCode from the end to get the base barcode for proper sequential increment
      const baseBarcode = priceCode && finalBarcode.endsWith(priceCode)
        ? finalBarcode.slice(0, -priceCode.length)
        : finalBarcode;
      const match = baseBarcode.match(/(\d+)$/);
      const numPart = match ? match[1] : '001';
      const nextNum = String(parseInt(numPart, 10) + 1).padStart(numPart.length, '0');
      const newBase = baseBarcode.replace(/(\d+)$/, nextNum);
      setNewProductBarcode(newBase + priceCode);
      setTimeout(() => handleCreateAndAddProduct(retries - 1), 100);
    } else {
      onStatusMessage({ text: 'Failed to create product: ' + (res.error || ''), type: 'error' });
      setTimeout(() => onStatusMessage(null), 3000);
    }
  };

  const handleSave = async (): Promise<boolean> => {
    if (billItems.length === 0) return true;
    if (!supplierName.trim()) {
      onStatusMessage({ text: 'Supplier name is required.', type: 'error' });
      setTimeout(() => onStatusMessage(null), 3000);
      return false;
    }

    setIsSaving(true);
    const total = getBillTotal();
    const autoRoundOff = Math.round(total) - total;
    const currentRoundOff = manualRoundOff !== '' ? (Number(manualRoundOff) || 0) : autoRoundOff;
    const totalAmount = Math.round(total + currentRoundOff);
    const billId = editingData?.purchase_bill_id || uuidv4();

    const otherItems = getOtherSectionItems ? getOtherSectionItems() : [];
    const otherProductIds = new Set(otherItems.map(i => i.product_id));

    if (window.electronAPI) {
      // First, save any cloned products to the database as new products
      for (const item of billItems) {
        if (item.is_new_product_clone && item.clone_metadata) {
          const meta = item.clone_metadata;
          const purchasePrice = Number(item.purchase_price) || 0;
          const basePrice = Number(item.selling_price) || purchasePrice;
          
          await window.electronAPI.dbAddProduct({
            product_id: item.product_id,
            tenant_id: tenantId,
            name: item.name.trim(),
            sku_barcode: meta.barcode,
            item_code: meta.item_code,
            category: meta.category,
            brand_manufacturer: meta.brand_manufacturer,
            uom: meta.uom,
            purchase_price: purchasePrice,
            base_price: basePrice,
            current_stock: 0,
            reorder_level: Number(meta.reorder_level) || 0,
            is_gst_applicable: item.is_gst_applicable ?? (type === 'GST' ? 1 : 0),
            tax_rate_percent: type === 'GST' ? (item.tax_rate_percent ?? 0) : 0,
            hsn_sac_code: type === 'GST' ? (item.hsn_sac_code || null) : null,
            discount_percent: null,
            discount_flat: null,
            offer_price: item.offer_price ? Number(item.offer_price) : null,
            billing_type: 'PIECE',
            grade_id: null,
            pricing_mode: 'FIXED_PRICE',
            is_deleted: 0,
            sync_status: 'PENDING',
          });

          // Rename original product in database to also have its matching type suffix (e.g. "tape" -> "tape (GST)")
          if (meta.original_product_id && meta.original_product_name) {
            const origId = meta.original_product_id;
            const origName = meta.original_product_name;
            const cleanOrigName = origName.replace(/\s*\((GST|EST|Estimate)\)$/i, '');
            const origNewName = cleanOrigName + (meta.original_product_is_gst ? ' (GST)' : ' (EST)');
            
            if (origName !== origNewName) {
              await window.electronAPI.dbUpdateProductName({
                tenant_id: tenantId,
                product_id: origId,
                name: origNewName,
              });
            }
          }
        }
      }

      const payload = {
        purchase_bill_id: billId,
        tenant_id: tenantId,
        bill_number: type === 'ESTIMATE'
          ? (billNumber ? (billNumber.endsWith('-EST') ? billNumber : billNumber + '-EST') : `AUTO-${Date.now()}-EST`)
          : (billNumber || `AUTO-${Date.now()}`),
        supplier_id: supplierId || null,
        supplier_name: supplierName.trim(),
        bill_date: billDate,
        invoice_number: invoiceNumber || null,
        notes: notes || null,
        total_amount: totalAmount,
        bill_type: type,
        payment_type: paymentType,
        items: billItems.map(item => ({
          item_id: uuidv4(),
          product_id: item.product_id,
          name: item.name,
          quantity: Number(item.quantity) || 0,
          purchase_price: Number(item.purchase_price) || 0,
          total_amount: (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0),
          selling_price: item.selling_price ? Number(item.selling_price) || null : null,
          offer_price: item.offer_price ? Number(item.offer_price) || null : null,
          is_gst_applicable: item.is_gst_applicable ?? (type === 'GST' ? 1 : 0),
          tax_rate_percent: type === 'GST' ? (item.tax_rate_percent ?? 0) : 0,
          hsn_sac_code: type === 'GST' ? (item.hsn_sac_code || null) : null,
          skip_stock_update: type === 'GST' ? (item.skip_stock_update ?? (otherProductIds.has(item.product_id) ? 1 : 0)) : 0,
        })),
      };

      const res = editingData
        ? await window.electronAPI.dbUpdatePurchaseBill(payload)
        : await window.electronAPI.dbAddPurchaseBill(payload);

      if (res.success) {
        onStatusMessage({ text: `${type} purchase bill ${editingData ? 'updated' : 'saved'} successfully!`, type: 'success' });
        onSaved();
        setIsSaving(false);
        setTimeout(() => onStatusMessage(null), 3000);
        return true;
      } else {
        onStatusMessage({ text: `Save failed: ${res.error || ''}`, type: 'error' });
        setIsSaving(false);
        setTimeout(() => onStatusMessage(null), 3000);
        return false;
      }
    }
    setIsSaving(false);
    return false;
  };

  const addItemToSection = async (item: {
    product_id: string;
    name: string;
    quantity: string;
    purchase_price: string;
    selling_price: string;
    offer_price?: string;
    is_gst_applicable?: number;
    tax_rate_percent?: number;
    hsn_sac_code?: string;
    is_new_product_clone?: boolean;
    clone_metadata?: any;
  }) => {
    const isGstBill = type === 'GST';
    const isItemGst = item.is_gst_applicable !== 0;

    if ((isGstBill && !isItemGst) || (!isGstBill && isItemGst)) {
      // Scenario B: Product type mismatch inside share action. Must save separately as a new product.
      let barcode = '';
      if (window.electronAPI && tenantId) {
        try {
          const gen = await window.electronAPI.dbGenerateBarcode({ 
            tenant_id: tenantId 
          });
          if (gen?.success && gen?.barcode) {
            barcode = gen.barcode;
          }
        } catch (e) {
          console.error(e);
        }
      }
      if (!barcode) {
        barcode = '999' + Date.now().toString().slice(-9);
      }

      const cleanName = item.name.replace(/\s*\((GST|EST|Estimate)\)$/i, '');
      const newName = cleanName + (isGstBill ? ' (GST)' : ' (EST)');
      const newProductId = uuidv4();

      setBillItems(prev => {
        if (prev.some(i => i.name === newName)) return prev;
        return [...prev, {
          product_id: newProductId,
          name: newName,
          quantity: item.quantity || '1',
          purchase_price: item.purchase_price || '0',
          selling_price: item.selling_price || '0',
          offer_price: item.offer_price || '',
          stock: '0',
          is_gst_applicable: isGstBill ? 1 : 0,
          tax_rate_percent: isGstBill ? (item.tax_rate_percent ?? 18) : 0,
          hsn_sac_code: isGstBill ? (item.hsn_sac_code || '') : '',
          is_new_product_clone: true,
          clone_metadata: {
            barcode: barcode,
            item_code: '',
            brand_manufacturer: '',
            category: '',
            uom: 'Pcs',
            reorder_level: 0,
            original_product_id: item.product_id,
            original_product_name: item.name,
            original_product_is_gst: isItemGst,
          }
        }];
      });
    } else {
      setBillItems(prev => {
        if (prev.some(i => i.product_id === item.product_id)) return prev;
        return [...prev, { ...item }];
      });
    }
  };

  useImperativeHandle(ref, () => ({
    save: handleSave,
    get hasItems() { return billItems.length > 0; },
    addItem: addItemToSection,
    getItems: () => billItems.map(i => ({ ...i })),
    replaceItems: (items) => { setBillItems(items.map(i => ({ ...i }))); },
  }));

  useEffect(() => {
    onItemsChange?.(billItems.length > 0);
  }, [billItems.length, onItemsChange]);

  useEffect(() => {
    if (searchRef.current && (products.length > 0 || (productSearch.length >= 2 && products.length === 0 && !showProductCreateForm))) {
      const rect = searchRef.current.getBoundingClientRect();
      setSearchDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    } else {
      setSearchDropdownPos(null);
    }
  }, [products, productSearch, showProductCreateForm]);

  useEffect(() => {
    if (showProductCreateForm) {
      setTimeout(() => firstInputRef.current?.focus(), 50);
      // Auto-generate barcode — match billing page behavior: increment last product's barcode number.
      // Only for NEW products; editing an existing product must keep its own barcode.
      if (!editingProductItemId && window.electronAPI && tenantId && !newProductBarcode) {
        window.electronAPI.dbGetProducts({ tenant_id: tenantId, limit: 1, sortBy: 'created_at' })
          .then((lastProduct: any[]) => {
            if (Array.isArray(lastProduct) && lastProduct.length > 0 && lastProduct[0].sku_barcode) {
              const lastBarcode = lastProduct[0].sku_barcode;
              const match = lastBarcode.match(/(\d+)[^\d]*$/);
              if (match) {
                const numStr = match[1];
                const nextNum = (BigInt(numStr) + 1n).toString();
                setNewProductBarcode(nextNum.padStart(numStr.length, '0'));
              }
            }
          })
          .catch(console.error);
      }
    }
  }, [showProductCreateForm, tenantId, editingProductItemId]);

  const isEstimate = type === 'ESTIMATE';

  return (
    <>
      {/* Bill Info Card */}
      <div className={clsx("bg-card border border-border rounded-[28px] shadow-sm", isEstimate ? "border-amber-500/25" : "border-emerald-500/25")}>
        <div className={clsx("flex items-center gap-4 px-6 py-3.5 border-b border-border/60 flex-wrap rounded-t-[28px]", isEstimate ? "bg-amber-500/[0.04]" : "bg-emerald-500/[0.04]")}>
        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 block mb-1">
            Bill No {isEstimate ? '(Estimate)' : '(GST)'}
          </label>
          <input
            type="text" value={billNumber}
            onChange={e => setBillNumber(e.target.value)}
            className="w-36 bg-background/50 border border-border rounded-xl px-2.5 py-2 text-xs font-mono tracking-wider text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background focus:outline-none transition-all"
          />
        </div>
        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 block mb-1">Invoice No</label>
          <input
            type="text" value={invoiceNumber}
            onChange={e => setInvoiceNumber(e.target.value)}
            placeholder="Supplier inv #"
            className="w-36 bg-background/50 border border-border rounded-xl px-2.5 py-2 text-xs font-mono tracking-wider text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background focus:outline-none transition-all"
          />
        </div>
        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 block mb-1">Payment</label>
          <Select
            value={paymentType}
            onChange={v => setPaymentType(v as any)}
            options={[
              { value: 'CASH', label: 'Cash' },
              { value: 'CREDIT', label: 'Credit' },
              { value: 'UPI', label: 'UPI' },
              { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
            ]}
            triggerClassName="w-28 bg-background/50 border border-border rounded-xl px-2.5 text-xs font-mono tracking-wider text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 focus:outline-none shadow-none"
            size="sm"
          />
        </div>
        {onShareAll && (
          <button
            type="button"
            onClick={onShareAll}
            className={clsx(
              "ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer active:scale-95 border transition-all shrink-0",
              isEstimate
                ? "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
            )}
            title={`Share all items to ${isEstimate ? 'GST Bill' : 'Estimate Bill'}`}
          >
            <Send className="w-3.5 h-3.5" />
            Share All
          </button>
        )}
        </div>
      </div>

      {/* Products Section */}
      <div className="p-5">
        <div ref={searchRef} className="relative mb-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search products..."
                value={productSearch}
                onChange={e => searchProducts(e.target.value)}
                onKeyDown={e => { if (e.key === ' ' && productSearch.trim() === '') { e.preventDefault(); setShowProductCreateForm(true); setNewProductName(''); } }}
                className="w-full bg-background/50 border border-border rounded-xl py-2.5 pl-9 pr-3 text-xs font-semibold text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all"
              />
            </div>
            <button
              type="button"
              onClick={() => { setShowProductCreateForm(true); setNewProductName(''); }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl transition-all text-xs font-bold shrink-0 cursor-pointer active:scale-95 border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 shadow-sm"
              title="Add new product"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>
          {searchDropdownPos && products.length > 0 && !showProductCreateForm && (
            <div style={{ position: 'fixed', top: searchDropdownPos.top, left: searchDropdownPos.left, width: searchDropdownPos.width, zIndex: 50 }} className="bg-card border border-border/80 rounded-xl shadow-xl max-h-48 overflow-y-auto">
              {products.map(p => (
                <button
                  key={p.product_id} type="button"
                  onMouseDown={() => addProductToBill(p)}
                  className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 border-b border-border/40 last:border-0 hover:bg-muted transition-colors cursor-pointer"
                >
                  <Package className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate flex items-center gap-1.5">
                      <span>{p.name.replace(/\s*\((GST|EST|Estimate)\)$/i, '')}</span>
                      {/\s*\((GST|EST|Estimate)\)$/i.test(p.name) && (
                        <span className={clsx(
                          "text-[8px] px-1.2 py-0.2 rounded font-black tracking-wide border uppercase select-none leading-none",
                          p.name.match(/\s*\((GST|EST|Estimate)\)$/i)?.[1].toUpperCase() === 'GST'
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                        )}>
                          {p.name.match(/\s*\((GST|EST|Estimate)\)$/i)?.[1]}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-mono">{p.sku_barcode}</p>
                  </div>
                  <div className="text-right text-[11px] shrink-0">
                    <div className="font-semibold text-foreground">Stock: {Number(p.current_stock).toFixed(0)}</div>
                    <div className="text-muted-foreground">₹{Number(p.base_price).toFixed(2)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {searchDropdownPos && productSearch.length >= 2 && products.length === 0 && !showProductCreateForm && (
            <div style={{ position: 'fixed', top: searchDropdownPos.top, left: searchDropdownPos.left, width: searchDropdownPos.width, zIndex: 50 }} className="bg-card border border-border/80 rounded-xl shadow-xl overflow-hidden">
              <button
                type="button"
                onMouseDown={() => { setShowProductCreateForm(true); setNewProductName(productSearch); }}
                className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-muted transition-colors cursor-pointer border-0"
              >
                <Plus className="w-3.5 h-3.5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-bold text-primary">Create "{productSearch}"</p>
                  <p className="text-[11px] text-muted-foreground">Add as a new product</p>
                </div>
              </button>
            </div>
          )}
          {showProductCreateForm && (
            <>
              {/* Backdrop */}
              <div className="fixed inset-0 bg-black/40 z-[100]" />
              {/* Dialog */}
              <div ref={productFormDialogRef} className="fixed inset-0 z-[101] flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) resetProductForm(); }}>
                <div className="w-full max-w-6xl bg-card border border-border/80 rounded-2xl shadow-2xl overflow-hidden" onKeyDown={handleFormKeyDown}>
                  <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                        <Package className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-black text-primary uppercase tracking-wider">{editingProductItemId ? 'Edit Product' : 'New Product'}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" onClick={() => {
                        const next = productFormView === 'grid' ? 'list' : 'grid';
                        setProductFormView(next);
                        localStorage.setItem('productFormView', next);
                      }}
                        className="p-2 rounded-xl border border-border/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
                        title={productFormView === 'grid' ? 'Switch to List View' : 'Switch to Grid View'}>
                        {productFormView === 'grid' ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
                      </button>
                      <button type="button" onClick={resetProductForm}
                        className="p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
                        title="Close">
                        <X className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </div>
                  <div className="p-5 max-h-[70vh] overflow-y-auto space-y-3" data-enter-nav>
                    {/* 1. Basic Details */}
                    <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                          <Package className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-black text-primary uppercase tracking-wider">1. Basic Details</span>
                      </div>
                      {productFormView === 'list' ? (
                        <div className="flex gap-3 items-start">
                          <div className="flex-1 min-w-[140px]">
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Name *</label>
                            <input ref={firstInputRef} type="text" value={newProductName} onChange={e => setNewProductName(e.target.value)}
                              className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 text-sm" />
                          </div>
                          <div className="flex-1 min-w-[90px]">
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Code</label>
                            <input type="text" maxLength={10} value={newProductItemCode} onChange={e => setNewProductItemCode(e.target.value.toUpperCase())}
                              className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 font-mono tracking-widest uppercase text-sm" />
                          </div>
                          <div className="flex-1 min-w-[110px]">
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Category</label>
                            {newProductIsCustomCategory ? (
                              <div className="relative">
                                <input type="text" value={newProductCategory} onChange={e => setNewProductCategory(e.target.value)} placeholder="Category"
                                  className="w-full bg-background border border-border/80 rounded-lg p-2.5 pr-9 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 text-sm" />
                                <button type="button" onClick={() => { setNewProductIsCustomCategory(false); setNewProductCategory(''); }} title="Cancel custom category"
                                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 cursor-pointer transition-all">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <Select
                                value={configuredCategories.includes(newProductCategory) ? newProductCategory : (newProductCategory ? 'CUSTOM' : '')}
                                onChange={v => {
                                  if (v === 'CUSTOM') { setNewProductIsCustomCategory(true); setNewProductCategory(''); }
                                  else { setNewProductCategory(v); }
                                }}
                                placeholder="Select"
                                options={[
                                  ...configuredCategories.map(c => ({ value: String(c), label: String(c) })),
                                  { value: 'CUSTOM', label: 'Custom...' }
                                ]}
                                triggerClassName="rounded-lg h-[40px] text-sm"
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-[90px]">
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Brand</label>
                            <input type="text" value={newProductBrand} onChange={e => setNewProductBrand(e.target.value)}
                              className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 text-sm" />
                          </div>
                          <div className="flex-1 min-w-[120px]">
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Barcode *</label>
                              <button type="button" onClick={autoGenerateBarcode}
                                className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full cursor-pointer">
                                <RefreshCw className="w-2.5 h-2.5 inline-block" /> Auto
                              </button>
                            </div>
                            <input type="text" value={newProductBarcode} onChange={e => setNewProductBarcode(e.target.value)}
                              className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 font-mono tracking-widest text-sm" />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Item Name *</label>
                              <input ref={firstInputRef} type="text" value={newProductName} onChange={e => setNewProductName(e.target.value)}
                                className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                            </div>
                            <div>
                              <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Item Code</label>
                              <input type="text" maxLength={10} value={newProductItemCode} onChange={e => setNewProductItemCode(e.target.value.toUpperCase())}
                                className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none font-mono tracking-widest shadow-sm uppercase text-sm" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Category</label>
                                {newProductIsCustomCategory ? (
                                  <div className="relative">
                                    <input type="text" value={newProductCategory} onChange={e => setNewProductCategory(e.target.value)} placeholder="Enter category"
                                      className="w-full bg-background border border-border/80 rounded-xl p-3 pr-10 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                                    <button type="button" onClick={() => { setNewProductIsCustomCategory(false); setNewProductCategory(''); }} title="Cancel custom category"
                                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 cursor-pointer transition-all">
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <Select
                                    value={configuredCategories.includes(newProductCategory) ? newProductCategory : (newProductCategory ? 'CUSTOM' : '')}
                                    onChange={v => {
                                      if (v === 'CUSTOM') {
                                        setNewProductIsCustomCategory(true);
                                        setNewProductCategory('');
                                      } else {
                                        setNewProductCategory(v);
                                      }
                                    }}
                                    placeholder="-- Select Category --"
                                    options={[
                                      ...configuredCategories.map(c => ({ value: String(c), label: String(c) })),
                                      { value: 'CUSTOM', label: 'Custom...' }
                                    ]}
                                    triggerClassName="rounded-xl h-[46px]"
                                  />
                                )}
                              </div>
                              <div>
                                <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Brand / Mfg</label>
                                <input type="text" value={newProductBrand} onChange={e => setNewProductBrand(e.target.value)}
                                  className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                              </div>
                            </div>
                          </div>
                          <div className="bg-muted/20 p-4 rounded-xl border border-border/80 flex flex-col justify-center shadow-sm">
                            <div>
                              <div className="flex justify-between items-center mb-1.5">
                                <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Barcode *</label>
                                <button type="button" onClick={autoGenerateBarcode}
                                  className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-full transition-all cursor-pointer">
                                  <RefreshCw className="w-3 h-3" /> Auto Generate
                                </button>
                              </div>
                              <input type="text" value={newProductBarcode} onChange={e => setNewProductBarcode(e.target.value)}
                                className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none font-mono tracking-widest shadow-sm text-sm" />
                            </div>
                          </div>
                        </div>
                      )}

                    {/* Grade selection / creation */}
                    {newProductCategory.trim() && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider">Grade</label>
                          {!newProductIsAddingGrade && (
                            <button
                              type="button"
                              onClick={() => setNewProductIsAddingGrade(true)}
                              className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 px-2 py-0.5 rounded-full transition-all cursor-pointer"
                            >
                              <Plus className="w-3 h-3" /> New Grade
                            </button>
                          )}
                        </div>
                        {newProductGrades.filter(g => g.category === newProductCategory).length > 0 && !newProductIsAddingGrade && (
                          <Select
                            value={newProductGradeId}
                            onChange={v => setNewProductGradeId(v)}
                            placeholder="No grade (manual pricing)"
                            searchable
                            options={newProductGrades.filter(g => g.category === newProductCategory).map(g => ({
                              value: g.grade_id,
                              label: (g.grade_name || '(General)') + ' (₹' + g.rate + ')'
                            }))}
                            triggerClassName="rounded-lg h-[40px] text-sm"
                          />
                        )}
                      </div>
                    )}
                    </section>

                    {/* 2. Inventory & Pricing */}
                    <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                        <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                          <Tag className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-black text-emerald-500 uppercase tracking-wider">2. Inventory & Pricing</span>
                      </div>
                      <div className="flex gap-4">
                        {[
                          { label: 'Purchase Price', field: 'purchasePrice', prefix: '₹' },
                          { label: 'MRP *', field: 'basePrice', prefix: '₹' },
                          { label: 'Current Stock', field: 'stock' },
                          { label: 'Low Stock Alert', field: 'reorderLevel' },
                        ].map(({ label, field, prefix }) => (
                          <div key={field} className="flex-1 min-w-0">
                            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{label}</label>
                            <div className="relative">
                              {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">{prefix}</span>}
                              <input
                                type="number" step="0.01"
                                onWheel={e => (e.target as HTMLInputElement).blur()}
                                value={field === 'purchasePrice' ? newProductPurchasePrice : field === 'basePrice' ? newProductBasePrice : field === 'stock' ? newProductStock : newProductReorderLevel}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (field === 'purchasePrice') handlePurchasePriceChange(val);
                                  else if (field === 'basePrice') setNewProductBasePrice(val);
                                  else if (field === 'stock') setNewProductStock(val);
                                  else setNewProductReorderLevel(val);
                                }}
                                className={clsx(
                                  'w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm',
                                  prefix && 'pl-8',
                                  field === 'basePrice' && 'text-emerald-600 dark:text-emerald-400 font-bold'
                                )}
                              />
                            </div>
                          </div>
                        ))}
                        <div className="flex-1 min-w-0">
                          <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">UOM</label>
                          <Select
                            value={newProductUom}
                            onChange={v => setNewProductUom(v)}
                            options={['Pcs', 'Kgs', 'Grams', 'Mtrs', 'Ltrs', 'Box', 'Dozen'].map(u => ({ value: u, label: u }))}
                            triggerClassName="rounded-xl h-[46px]"
                          />
                        </div>
                        <div className={clsx('flex-1 min-w-0 overflow-hidden transition-all duration-500 ease-in-out', (['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'].includes((newProductUom || '').toLowerCase())) ? 'max-w-[250px] opacity-100' : 'max-w-0 opacity-0')}>
                          <div className="flex items-center gap-1 mb-1.5">
                            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider">Pcs</label>
                            <span className="text-[10px] text-muted-foreground/60 font-normal normal-case">(optional)</span>
                          </div>
                          <input
                            type="number" min="1" step="1"
                            onWheel={e => (e.target as HTMLInputElement).blur()}
                            value={newProductPcs}
                            onChange={e => setNewProductPcs(e.target.value)}
                            className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                            placeholder="e.g. 20"
                          />
                        </div>
                      </div>
                      {pricingTiers.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-border/60">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-500">
                              <Layers className="w-4 h-4" />
                            </div>
                            <span className="text-xs font-black text-violet-500 uppercase tracking-wider">Tier Prices</span>
                            <span className="text-[10px] text-muted-foreground font-normal normal-case">(blank = use MRP)</span>
                          </div>
                          <div className="flex gap-4 flex-wrap">
                            {pricingTiers.map(tier => (
                              <div key={tier.pricing_tier_id} className="flex-1 min-w-[140px]">
                                <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5 truncate">
                                  {tier.name}
                                </label>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">₹</span>
                                  <input
                                    type="number" step="0.01"
                                    onWheel={e => (e.target as HTMLInputElement).blur()}
                                    value={tierPrices[tier.pricing_tier_id] ?? ''}
                                    onChange={e => setTierPrices(prev => ({ ...prev, [tier.pricing_tier_id]: e.target.value }))}
                                    placeholder={newProductBasePrice !== '' ? `= ${newProductBasePrice}` : 'MRP'}
                                    className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm pl-8"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>

                    {/* 3. Discount & Offers */}
                    <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                        <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                          <Tag className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-black text-blue-500 uppercase tracking-wider">3. Discount & Offers</span>
                      </div>
                      {productFormView === 'list' ? (
                        <div className="flex gap-3 items-start">
                          <div className="flex-1 min-w-[100px]">
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Disc %</label>
                            <input type="number" step="0.01"
                              onWheel={e => (e.target as HTMLInputElement).blur()}
                              value={newProductDiscountPercent}
                              onChange={e => handleDiscountPercentChange(e.target.value)}
                              disabled={!!newProductOfferPrice}
                              className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50 no-spinners text-sm" />
                          </div>
                          <div className="flex-1 min-w-[100px]">
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Disc ₹</label>
                            <input type="number" step="0.01"
                              onWheel={e => (e.target as HTMLInputElement).blur()}
                              value={newProductDiscountFlat}
                              onChange={e => handleDiscountFlatChange(e.target.value)}
                              disabled={!!newProductOfferPrice}
                              className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50 no-spinners text-sm" />
                          </div>
                          <div className="flex-1 min-w-[110px]">
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Offer Price ₹</label>
                            <input type="number" step="0.01"
                              onWheel={e => (e.target as HTMLInputElement).blur()}
                              value={newProductOfferPrice}
                              onChange={e => handleOfferPriceChange(e.target.value)}
                              disabled={!!newProductDiscountPercent || !!newProductDiscountFlat}
                              className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50 no-spinners text-sm" />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-3 bg-muted/10 p-4 rounded-xl border border-border/80">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-bold text-foreground">Discount</h4>
                              <span className="text-xs text-muted-foreground">Applies to MRP</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Percentage (%)</label>
                                <input type="number" step="0.01"
                                  onWheel={e => (e.target as HTMLInputElement).blur()}
                                  value={newProductDiscountPercent}
                                  onChange={e => handleDiscountPercentChange(e.target.value)}
                                  disabled={!!newProductOfferPrice}
                                  className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm" />
                              </div>
                              <div>
                                <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Flat Amount (₹)</label>
                                <input type="number" step="0.01"
                                  onWheel={e => (e.target as HTMLInputElement).blur()}
                                  value={newProductDiscountFlat}
                                  onChange={e => handleDiscountFlatChange(e.target.value)}
                                  disabled={!!newProductOfferPrice}
                                  className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm" />
                              </div>
                            </div>
                          </div>
                          <div className="space-y-3 bg-muted/10 p-4 rounded-xl border border-border/80">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-bold text-foreground">Offer</h4>
                              <span className="text-xs text-muted-foreground">Overrides MRP</span>
                            </div>
                            <div>
                              <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Final Offer Price (₹)</label>
                              <input type="number" step="0.01"
                                onWheel={e => (e.target as HTMLInputElement).blur()}
                                value={newProductOfferPrice}
                                onChange={e => handleOfferPriceChange(e.target.value)}
                                disabled={!!newProductDiscountPercent || !!newProductDiscountFlat}
                                className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm" />
                            </div>
                          </div>
                        </div>
                      )}
                    </section>

                    {/* 4. Taxes & Config */}
                    <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                        <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500">
                          <Package className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-black text-orange-500 uppercase tracking-wider">4. Taxes & Config</span>
                      </div>
                      {productFormView === 'list' ? (
                        <div className="flex gap-3 items-start">
                          {type === 'GST' ? (
                            <>
                              <div className="min-w-[140px]">
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Stock Type</label>
                                <div
                                  onClick={() => setNewProductIsDummy(!newProductIsDummy)}
                                  onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); setNewProductIsDummy(!newProductIsDummy); } }}
                                  data-focusable-checkbox
                                  tabIndex={-1}
                                  className={clsx(
                                    'flex items-center justify-center gap-1.5 border-2 rounded-lg py-2.5 px-2.5 transition-all duration-200 cursor-pointer active:scale-[0.98] h-[40px]',
                                    !newProductIsDummy
                                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                                      : 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400 shadow-sm'
                                  )}
                                >
                                  <input type="checkbox" checked={newProductIsDummy} onChange={e => setNewProductIsDummy(e.target.checked)}
                                    className="w-3 h-3 rounded pointer-events-none accent-primary" />
                                  <span className="font-bold text-xs select-none">
                                    {newProductIsDummy ? 'Paper' : 'Real'}
                                  </span>
                                </div>
                              </div>
                              <div className="flex-1 min-w-[120px]">
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">HSN / SAC Code</label>
                                <input type="text" value={newProductHsn} onChange={e => setNewProductHsn(e.target.value)}
                                  className="w-full bg-background border border-border/80 rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 font-mono tracking-widest text-sm" />
                              </div>
                              <div className="flex-1 min-w-[100px]">
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Tax Rate %</label>
                                <Select
                                  value={String(newProductTaxRate)}
                                  onChange={v => handleTaxRateChange(v)}
                                  options={[0, 5, 12, 18, 28].map(r => ({ value: String(r), label: r + '%' }))}
                                  triggerClassName="rounded-lg h-[40px] text-sm"
                                />
                              </div>
                            </>
                          ) : null}
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-4">
                          {type === 'GST' ? (
                            <>
                              <div>
                                <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Stock Type</label>
                                <div
                                  onClick={() => setNewProductIsDummy(!newProductIsDummy)}
                                  onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); setNewProductIsDummy(!newProductIsDummy); } }}
                                  data-focusable-checkbox
                                  tabIndex={-1}
                                  className={clsx(
                                    'flex items-center justify-center gap-1.5 border-2 rounded-xl py-3.5 px-2.5 transition-all duration-200 cursor-pointer active:scale-[0.98]',
                                    !newProductIsDummy
                                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                                      : 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400'
                                  )}
                                >
                                  <input type="checkbox" id="dummy" checked={newProductIsDummy} onChange={e => setNewProductIsDummy(e.target.checked)}
                                    className={clsx('w-3.5 h-3.5 rounded pointer-events-none', !newProductIsDummy ? 'accent-emerald-500' : 'accent-amber-500')} />
                                  <label htmlFor="dummy" className="font-bold text-xs cursor-pointer select-none">
                                    {newProductIsDummy ? 'Paper' : 'Real'}
                                  </label>
                                </div>
                              </div>
                              <div>
                                <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">HSN / SAC Code</label>
                                <input type="text" value={newProductHsn} onChange={e => setNewProductHsn(e.target.value)}
                                  className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm font-mono tracking-widest text-sm" />
                              </div>
                              <div>
                                <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Tax Rate %</label>
                                <Select
                                  value={String(newProductTaxRate)}
                                  onChange={v => handleTaxRateChange(v)}
                                  options={[0, 5, 12, 18, 28].map(r => ({ value: String(r), label: r + '%' }))}
                                  triggerClassName="rounded-xl h-[46px]"
                                />
                              </div>
                            </>
                          ) : null}
                        </div>
                      )}
                    </section>
                  </div>
                  <div className="flex items-center justify-end px-5 py-3 border-t border-border/50 bg-background">
                    <button type="button" data-enter-submit onClick={() => handleCreateAndAddProduct()} disabled={!newProductName.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm">
                      <Save className="w-3.5 h-3.5" />
                      {editingProductItemId ? 'Update Product' : 'Add to Inventory'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {billItems.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Package className="w-6 h-6 mx-auto mb-1.5 opacity-50" />
            <p className="text-xs font-medium">No products added yet</p>
            <p className="text-[11px] mt-0.5">Search and select products above</p>
          </div>
        ) : (
          <div className="overflow-x-auto pb-2 scrollbar-thin">
            <div className={clsx("space-y-1.5", isEstimate ? "min-w-[768px]" : "min-w-[1100px]")}>
              {isEstimate ? (
              <>
                <div className="grid grid-cols-[30px_1fr_80px_100px_100px_100px_36px_36px] gap-3 px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 border-b border-border/40 mb-1.5">
                  <span className="text-center">#</span>
                  <span>Product</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Purchase</span>
                  <span className="text-right">MRP</span>
                  <span className="text-right">Offer</span>
                  <span></span>
                  <span></span>
                </div>
                {billItems.map((item, index) => (                    <div key={item.product_id} className="grid grid-cols-[30px_1fr_80px_100px_100px_100px_36px_36px] gap-3 px-3 py-2 bg-card border border-border/80 hover:border-amber-500/40 rounded-xl transition-all duration-200 hover:shadow-sm group items-center">
                      <span className="text-xs font-semibold text-muted-foreground/60 text-center select-none">
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-foreground truncate flex items-center gap-1.5">
                          <span>{item.name.replace(/\s*\((GST|EST|Estimate)\)$/i, '')}</span>
                          {/\s*\((GST|EST|Estimate)\)$/i.test(item.name) && (
                            <span className="text-[8px] px-1.2 py-0.2 rounded font-black tracking-wide border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400 uppercase select-none leading-none">
                              {item.name.match(/\s*\((GST|EST|Estimate)\)$/i)?.[1]}
                            </span>
                          )}
                        </span>
                        {item.stock !== undefined && item.stock !== '' && (
                          <span className="block text-[10px] text-muted-foreground font-semibold mt-0.5">Stock: {Number(item.stock).toFixed(0)}</span>
                        )}
                      </span>
                      <input
                        type="number" step="0.01" min="0"
                        value={item.quantity}
                        onChange={e => updateBillItem(item.product_id, 'quantity', e.target.value)}
                        className="w-full bg-background border border-border/80 rounded-lg px-2 py-1.5 text-right text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners h-8"
                      />
                      <input
                        type="number" step="0.01" min="0"
                        value={item.purchase_price}
                        onChange={e => updateBillItem(item.product_id, 'purchase_price', e.target.value)}
                        className="w-full bg-background border border-border/80 rounded-lg px-2 py-1.5 text-right text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners h-8"
                      />
                      <input
                        type="number" step="0.01" min="0"
                        value={item.selling_price}
                        onChange={e => updateBillItem(item.product_id, 'selling_price', e.target.value)}
                        className="w-full bg-background border border-border/80 rounded-lg px-2 py-1.5 text-right text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners h-8"
                      />
                      <input
                        type="number" step="0.01" min="0"
                        value={item.offer_price || ''}
                        onChange={e => updateBillItem(item.product_id, 'offer_price', e.target.value)}
                        className="w-full bg-background border border-border/80 rounded-lg px-2 py-1.5 text-right text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners h-8"
                        placeholder="—"
                      />
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => openProductEditor(item)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/30 hover:text-amber-500 hover:bg-amber-500/10 transition-all cursor-pointer opacity-0 group-hover:opacity-100 shrink-0"
                          title="Edit Product"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => removeBillItem(item.product_id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Remove Item">
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <button
                        onClick={() => otherSectionAddItem?.({
                          product_id: item.product_id,
                          name: item.name,
                          quantity: item.quantity,
                          purchase_price: item.purchase_price,
                          selling_price: item.selling_price,
                          offer_price: item.offer_price,
                          is_gst_applicable: item.is_gst_applicable,
                          tax_rate_percent: item.tax_rate_percent,
                          hsn_sac_code: item.hsn_sac_code,
                        })}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-amber-500/50 hover:text-amber-500 hover:bg-amber-500/10 transition-all cursor-pointer shrink-0 opacity-0 group-hover:opacity-100 mx-auto"
                        title="Send to GST Bill"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                ))}
              </>
            ) : (
              <>
                <div className="grid grid-cols-[30px_1fr_70px_60px_70px_70px_70px_55px_55px_55px_70px_50px_34px] gap-3 px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 border-b border-border/40 mb-1.5">
                  <span className="text-center">#</span>
                  <span>Product</span>
                  <span className="text-center">HSN</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Purchase</span>
                  <span className="text-right">MRP</span>
                  <span className="text-right">Offer</span>
                  <span className="text-right">Tax%</span>
                  <span className="text-right">CGST</span>
                  <span className="text-right">SGST</span>
                  <span className="text-right">Total</span>
                  <span></span>
                  <span></span>
                </div>
                {billItems.map((item, index) => {
                  const taxableAmt = (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0);
                  const taxRate = item.tax_rate_percent || 0;
                  const hasGst = type === 'GST' && (item.is_gst_applicable ?? 1) === 1 && taxRate > 0;
                  const gstAmt = hasGst ? taxableAmt * (taxRate / 100) : 0;
                  const itemTotal = taxableAmt + gstAmt;
                  // Dummy = paper stock / tax record only (no stock add); Real = stock-in.
                  const isDummy = (item.skip_stock_update ?? ((getOtherSectionItems?.() ?? []).some(i => i.product_id === item.product_id) ? 1 : 0)) === 1;
                  return (
                    <div key={item.product_id} className="grid grid-cols-[30px_1fr_70px_60px_70px_70px_70px_55px_55px_55px_70px_50px_34px] gap-3 px-3 py-2 bg-card border border-border/80 hover:border-emerald-500/40 rounded-xl transition-all duration-200 hover:shadow-sm group items-center">
                      <span className="text-xs font-semibold text-muted-foreground/60 text-center select-none">
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-foreground truncate leading-tight flex items-center gap-1.5">
                          <span>{item.name.replace(/\s*\((GST|EST|Estimate)\)$/i, '')}</span>
                          {/\s*\((GST|EST|Estimate)\)$/i.test(item.name) && (
                            <span className="text-[8px] px-1.2 py-0.2 rounded font-black tracking-wide border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 uppercase select-none leading-none">
                              {item.name.match(/\s*\((GST|EST|Estimate)\)$/i)?.[1]}
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => toggleBillItemDummy(item)}
                            title={isDummy ? 'Paper stock (no stock added) — click for Real stock' : 'Real stock (adds stock) — click for paper stock'}
                            className={clsx(
                              'text-[9px] px-1.5 py-0.5 rounded font-bold border transition-all cursor-pointer select-none',
                              isDummy
                                ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30 hover:bg-orange-500/20'
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                            )}
                          >
                            {isDummy ? 'Paper' : 'Real'}
                          </button>
                          {item.stock !== undefined && item.stock !== '' && (
                            <span className="text-[10px] text-muted-foreground font-semibold">Stock: {Number(item.stock).toFixed(0)}</span>
                          )}
                        </span>
                      </span>
                      <input
                        type="text"
                        value={item.hsn_sac_code || ''}
                        onChange={e => updateBillItem(item.product_id, 'hsn_sac_code', e.target.value)}
                        className="w-full bg-background border border-border/80 rounded-lg px-1.5 py-1 text-center text-[10px] font-mono font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none h-7"
                        placeholder="HSN"
                      />
                      <input
                        type="number" step="0.01" min="0"
                        value={item.quantity}
                        onChange={e => updateBillItem(item.product_id, 'quantity', e.target.value)}
                        className="w-full bg-background border border-border/80 rounded-lg px-2 py-1.5 text-right text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners h-8"
                      />
                      <input
                        type="number" step="0.01" min="0"
                        value={item.purchase_price}
                        onChange={e => updateBillItem(item.product_id, 'purchase_price', e.target.value)}
                        className="w-full bg-background border border-border/80 rounded-lg px-2 py-1.5 text-right text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners h-8"
                      />
                      <input
                        type="number" step="0.01" min="0"
                        value={item.selling_price}
                        onChange={e => updateBillItem(item.product_id, 'selling_price', e.target.value)}
                        className="w-full bg-background border border-border/80 rounded-lg px-2 py-1.5 text-right text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners h-8"
                      />
                      <input
                        type="number" step="0.01" min="0"
                        value={item.offer_price || ''}
                        onChange={e => updateBillItem(item.product_id, 'offer_price', e.target.value)}
                        className="w-full bg-background border border-border/80 rounded-lg px-2 py-1.5 text-right text-xs font-semibold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none no-spinners h-8"
                        placeholder="—"
                      />
                      <select
                        value={item.tax_rate_percent ?? 0}
                        onChange={e => {
                          const val = Number(e.target.value);
                          setBillItems(prev => prev.map(i =>
                            i.product_id === item.product_id
                              ? { ...i, tax_rate_percent: val, is_gst_applicable: val > 0 ? 1 : 0 }
                              : i
                          ));
                        }}
                        className="w-full bg-background border border-border/80 rounded-lg px-1 py-1.5 text-right text-[10px] font-bold focus:border-primary focus:ring-1 focus:ring-primary/10 focus:outline-none cursor-pointer h-8"
                      >
                        <option value={0}>0%</option>
                        <option value={3}>3%</option>
                        <option value={5}>5%</option>
                        <option value={12}>12%</option>
                        <option value={18}>18%</option>
                        <option value={28}>28%</option>
                      </select>
                      <div className="text-right text-xs">
                        {hasGst ? (
                          <span className="font-bold text-foreground">₹{(gstAmt / 2).toFixed(2)}</span>
                        ) : (
                          <span className="text-muted-foreground/50 font-semibold">₹0.00</span>
                        )}
                      </div>
                      <div className="text-right text-xs">
                        {hasGst ? (
                          <span className="font-bold text-foreground">₹{(gstAmt / 2).toFixed(2)}</span>
                        ) : (
                          <span className="text-muted-foreground/50 font-semibold">₹0.00</span>
                        )}
                      </div>
                      <div className="text-right font-bold text-foreground text-xs">
                        ₹{itemTotal.toFixed(2)}
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => openProductEditor(item)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/30 hover:text-amber-500 hover:bg-amber-500/10 transition-all cursor-pointer opacity-0 group-hover:opacity-100 shrink-0"
                          title="Edit Product"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => removeBillItem(item.product_id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Remove Item">
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <button
                        onClick={() => otherSectionAddItem?.({
                          product_id: item.product_id,
                          name: item.name,
                          quantity: item.quantity,
                          purchase_price: item.purchase_price,
                          selling_price: item.selling_price,
                          offer_price: item.offer_price,
                          is_gst_applicable: item.is_gst_applicable,
                          tax_rate_percent: item.tax_rate_percent,
                          hsn_sac_code: item.hsn_sac_code,
                        })}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-emerald-500/50 hover:text-emerald-500 hover:bg-emerald-500/10 transition-all cursor-pointer shrink-0 opacity-0 group-hover:opacity-100 mx-auto"
                        title="Send to Estimate Bill"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </>
            )}
            </div>
          </div>
        )}

        {billItems.length > 0 && !isEstimate && (() => {
          const total = getBillTotal();
          const totalGst = billItems.reduce((acc, item) => {
            const rate = item.tax_rate_percent || 0;
            const taxableAmt = (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0);
            if ((item.is_gst_applicable ?? 1) === 1 && rate > 0) {
              return acc + taxableAmt * (rate / 100);
            }
            return acc;
          }, 0);
          const halfGst = totalGst / 2;
          const taxableValue = total - totalGst;
          
          const autoRoundOff = Math.round(total) - total;
          const currentRoundOff = manualRoundOff !== '' ? (Number(manualRoundOff) || 0) : autoRoundOff;
          const roundedTotal = total + currentRoundOff;
          return (
            <div className="flex justify-end mt-3 pt-2.5 border-t border-border/60">
              <div className="w-64 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-semibold">Taxable Value</span>
                  <span className="font-bold text-foreground">₹{taxableValue.toFixed(2)}</span>
                </div>
                {totalGst > 0 && (
                  <>
                    <div className="flex justify-between text-xs pl-3">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">CGST</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{halfGst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs pl-3">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">SGST</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{halfGst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs border-t border-border/40 pt-1">
                      <span className="text-muted-foreground font-bold">Total GST</span>
                      <span className="font-black text-emerald-600 dark:text-emerald-400">₹{totalGst.toFixed(2)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between items-center text-xs border-t border-border/40 pt-1">
                  <span className="text-muted-foreground font-semibold">Round Off</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder={autoRoundOff.toFixed(2)}
                    value={manualRoundOff}
                    onChange={e => setManualRoundOff(e.target.value)}
                    className="w-20 text-right bg-background border border-border/80 rounded px-1.5 py-0.5 text-foreground font-bold text-xs focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
                  />
                </div>
                <div className="flex justify-between text-sm border-t-2 border-emerald-500/40 pt-1.5">
                  <span className="font-black uppercase tracking-wider text-foreground">Grand Total</span>
                  <span className="text-base font-black text-emerald-600">₹{roundedTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          );
        })()}
        {billItems.length > 0 && isEstimate && (() => {
          const total = getBillTotal();
          const autoRoundOff = Math.round(total) - total;
          const currentRoundOff = manualRoundOff !== '' ? (Number(manualRoundOff) || 0) : autoRoundOff;
          const roundedTotal = total + currentRoundOff;
          return (
            <div className="flex justify-end mt-3 pt-2.5 border-t border-border/60">
              <div className="w-64 space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-semibold">Subtotal</span>
                  <span className="font-bold text-foreground">₹{total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-t border-border/40 pt-1">
                  <span className="text-muted-foreground font-semibold">Round Off</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder={autoRoundOff.toFixed(2)}
                    value={manualRoundOff}
                    onChange={e => setManualRoundOff(e.target.value)}
                    className="w-20 text-right bg-background border border-border/80 rounded px-1.5 py-0.5 text-foreground font-bold text-xs focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20"
                  />
                </div>
                <div className="flex justify-between text-sm border-t-2 border-amber-500/40 pt-1.5">
                  <span className="font-black uppercase tracking-wider text-foreground">Total</span>
                  <p className="text-base font-black text-amber-600">₹{roundedTotal.toFixed(2)}</p>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
      {newProductIsAddingGrade && (
        <Modal
          isOpen={newProductIsAddingGrade}
          onClose={() => { setNewProductIsAddingGrade(false); setNewProductGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' }); }}
          title="Create New Grade"
          className="max-w-lg backdrop-blur-none"
          overlayClassName="z-[110]"
          closeButton={
            <button type="button" onClick={() => { setNewProductIsAddingGrade(false); setNewProductGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' }); }}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30"
              title="Close">
              <X className="w-4 h-4 text-destructive" />
            </button>
          }
        >
          <div className="space-y-3" onKeyDown={handleFormKeyDown} data-enter-nav>
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
              Grade for category: <span className="font-bold text-foreground">{newProductCategory}</span>
            </p>
            <section className="bg-background border border-border/80 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                  <Tag className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-blue-500 uppercase tracking-wider">Grade Details</span>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Grade Name *</label>
                  <input
                    autoFocus
                    placeholder="e.g. Grade A, Scrap, Heavy"
                    value={newProductGradeForm.grade_name}
                    onChange={e => setNewProductGradeForm({ ...newProductGradeForm, grade_name: e.target.value })}
                    className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Purchase (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₹</span>
                      <input
                        type="number" step="0.01"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        placeholder="0.00"
                        value={newProductGradeForm.purchase_price}
                        onChange={e => setNewProductGradeForm({ ...newProductGradeForm, purchase_price: e.target.value })}
                        className="w-full bg-background border border-border/80 rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm font-mono font-bold"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Base MRP (₹/Kg)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₹</span>
                      <input
                        type="number" step="0.01"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        placeholder="0.00"
                        value={newProductGradeForm.rate}
                        onChange={e => setNewProductGradeForm({ ...newProductGradeForm, rate: e.target.value })}
                        className="w-full bg-background border border-border/80 rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm font-mono font-bold"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Offer (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₹</span>
                      <input
                        type="number" step="0.01"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        placeholder="0.00"
                        value={newProductGradeForm.offer_price}
                        onChange={e => setNewProductGradeForm({ ...newProductGradeForm, offer_price: e.target.value })}
                        className="w-full bg-background border border-border/80 rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                data-enter-submit
                onClick={handleCreateNewGrade}
                disabled={newProductSavingGrade || !newProductGradeForm.grade_name.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-xl hover:bg-primary/95 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shadow-sm"
              >
                {newProductSavingGrade ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Save Grade
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
});
