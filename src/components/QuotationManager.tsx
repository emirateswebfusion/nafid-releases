import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { useTabStore, type TabSnapshot, saveStoredTabs } from '../store/tabStore';
import { X, Search, Printer, FileText, RefreshCw, Pencil, Trash, CheckCircle2, AlertCircle, Plus, Eye, Building2 } from 'lucide-react';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import clsx from 'clsx';
import { generateQuotationHtml, type QuotationPrintData, type QuotationPrintItem } from '../utils/quotationHtmlGenerator';
import { numberToIndianWords, parseUTCDate } from '../utils/receiptGenerator';
import { getStoreTimezone } from '../utils/timezoneHelper';
import { RedCrossButton } from './ui/RedCrossButton';

interface Quotation {
  quotation_id: string;
  quotation_number: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_gstin?: string;
  customer_state?: string;
  is_gst?: number;
  discount_total?: number;
  round_off?: number;
  biller_name?: string;
  terms_conditions: string;
  subtotal: number;
  tax_total: number;
  grand_total: number;
  status: string;
  converted_to_invoice: number;
  invoice_id: string;
  created_at: string;
}

interface QuotationItem {
  item_id: string;
  product_id: string;
  name: string;
  quantity: number;
  weight?: number;
  rate: number;
  amount: number;
  hsn_code?: string;
  uom?: string;
  tax_rate_percent?: number;
  discount_amount?: number;
  discount_percent?: number;
  taxable_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  is_gst_applicable?: boolean | number;
}

export function QuotationManager({ onClose, isRestricted }: { onClose: () => void; isRestricted?: boolean }) {
  useCloseOnEscape(onClose);
  const { shopName, tenantId, role: authRole, userName } = useAuthStore();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'CONVERTED'>('ALL');
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [quotationItems, setQuotationItems] = useState<QuotationItem[]>([]);
  const [showDetail, setShowDetail] = useState(false);

  // Shop & Bank settings
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopGstin, setShopGstin] = useState('');
  const [shopState, setShopState] = useState('');
  const [shopEmail, setShopEmail] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [upiId, setUpiId] = useState('');
  const [quotationGstEnabledSetting, setQuotationGstEnabledSetting] = useState(true);

  // Active view GST toggle for preview
  const [previewGstEnabled, setPreviewGstEnabled] = useState(true);

  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    variant: 'blue' | 'red' | 'emerald';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    variant: 'blue',
    onConfirm: () => {},
  });

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadQuotations();
    if (window.electronAPI) {
      const tid = tenantId || 'global';
      Promise.all([
        window.electronAPI.settingsGet({ tenant_id: tid, key: 'shop_address' }),
        window.electronAPI.settingsGet({ tenant_id: tid, key: 'shop_phone' }),
        window.electronAPI.settingsGet({ tenant_id: tid, key: 'shop_gstin' }),
        window.electronAPI.settingsGet({ tenant_id: tid, key: 'shop_state' }),
        window.electronAPI.settingsGet({ tenant_id: tid, key: 'shop_email' }),
        window.electronAPI.settingsGet({ tenant_id: tid, key: 'bank_name' }),
        window.electronAPI.settingsGet({ tenant_id: tid, key: 'bank_account_number' }),
        window.electronAPI.settingsGet({ tenant_id: tid, key: 'bank_ifsc' }),
        window.electronAPI.settingsGet({ tenant_id: tid, key: 'bank_branch' }),
        window.electronAPI.settingsGet({ tenant_id: tid, key: 'upi_id' }),
        window.electronAPI.settingsGet({ tenant_id: tid, key: 'quotation_gst_enabled' }),
        window.electronAPI.settingsGet({ tenant_id: tid, key: 'print_format' }),
      ]).then(([addr, ph, gst, st, em, bName, bAcc, bIfsc, bBranch, upi, qGst, pFmt]) => {
        if (addr) setShopAddress(addr);
        if (ph) setShopPhone(ph);
        if (gst) setShopGstin(gst);
        if (st) setShopState(st);
        if (em) setShopEmail(em);
        if (bName) setBankName(bName);
        if (bAcc) setBankAccount(bAcc);
        if (bIfsc) setBankIfsc(bIfsc);
        if (bBranch) setBankBranch(bBranch);
        if (upi) setUpiId(upi);

        let gstFlag = true;
        if (qGst !== undefined && qGst !== null) {
          gstFlag = qGst !== 'false' && qGst !== false;
        } else if (pFmt?.billSettings?.quotationGstEnabled !== undefined) {
          gstFlag = Boolean(pFmt.billSettings.quotationGstEnabled);
        }
        setQuotationGstEnabledSetting(gstFlag);
      }).catch(err => console.error('[QuotationManager] Failed to load shop settings:', err));
    }
    if (window.electronAPI?.onSyncDataUpdated) {
      const unsub = window.electronAPI.onSyncDataUpdated(() => {
        loadQuotations();
      });
      return () => {
        if (typeof unsub === 'function') (unsub as any)();
      };
    }
  }, [tenantId]);

  const loadQuotations = async () => {
    setLoading(true);
    try {
      if (window.electronAPI) {
        const tid = tenantId || 'global';
        const qs = await window.electronAPI.dbGetQuotations({ tenant_id: tid });
        if (Array.isArray(qs)) {
          setQuotations(qs);
          localStorage.setItem('nafid_quotations_cache', JSON.stringify(qs));
        }
      }
    } catch (err) {
      console.error('[QuotationManager] Failed to load quotations:', err);
      const cached = localStorage.getItem('nafid_quotations_cache');
      if (cached) {
        try { setQuotations(JSON.parse(cached)); } catch (e) {}
      }
    }
    setLoading(false);
  };

  const formatCurrency = (amount: number) => `\u20B9${(Number(amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleCreateNewQuotation = () => {
    useCartStore.getState().setRole('BILLER');
    useCartStore.getState().clearCart();
    useCartStore.getState().setReturnMode(false);
    useCartStore.getState().setIsScrapMode(false);
    useCartStore.getState().setEditingQuotation(null, null);
    useCartStore.getState().setEditingInvoice(null, null, null);
    useCartStore.getState().setQuotationMode(true);
    localStorage.setItem('pendingNewQuotation', 'true');

    const quotationSnapshot: TabSnapshot = {
      items: [],
      invoiceType: quotationGstEnabledSetting ? 'GST' : 'BILL_OF_SUPPLY',
      discountType: 'FIXED',
      discountValue: 0,
      customerState: shopState || 'KL',
      scrapDeduction: 0,
      scrapInvoiceNumber: '',
      returnDeduction: 0,
      returnInvoiceNumber: '',
      isQuotationMode: true,
      isReturnMode: false,
      isScrapMode: false,
      returnRefundMethod: 'ADJUST_BILL',
      editingQuotationId: null,
      editingQuotationNumber: null,
      editingInvoiceId: null,
      editingInvoiceNumber: null,
      editingInvoiceRole: null,
      pendingScrapInvoiceToEdit: null,
    };

    const tabStore = useTabStore.getState();
    const existingTabs = tabStore.tabs;
    const currentActiveTabId = tabStore.activeTabId;
    const activeTab = existingTabs.find(t => t.id === currentActiveTabId);

    if (activeTab && (!activeTab.snapshot?.items || activeTab.snapshot.items.length === 0) && !activeTab.snapshot?.editingInvoiceNumber) {
      const updated = existingTabs.map(t => t.id === currentActiveTabId ? {
        ...t,
        title: 'New Quote',
        customerName: '',
        customerPhone: '',
        customerGstin: '',
        customerAddress: '',
        receivedAmount: 0,
        reservedInvoiceNumber: '',
        reservedQuotationNumber: '',
        snapshot: quotationSnapshot,
      } : t);
      useTabStore.setState({ tabs: updated });
      saveStoredTabs(updated, currentActiveTabId);
    } else {
      tabStore.addTab(quotationSnapshot, 'New Quote');
    }

    window.dispatchEvent(new CustomEvent('open-new-quotation'));
    onClose();
  };

  const viewQuotation = async (q: Quotation) => {
    setSelectedQuotation(q);

    let itemsToSet: QuotationItem[] = [];
    if (window.electronAPI) {
      const its = await window.electronAPI.dbGetQuotationItems(q.quotation_id);
      if (Array.isArray(its) && its.length > 0) {
        itemsToSet = its;
      } else if (Array.isArray((q as any).items) && (q as any).items.length > 0) {
        itemsToSet = (q as any).items;
      }
    } else if (Array.isArray((q as any).items)) {
      itemsToSet = (q as any).items;
    }
    if (itemsToSet.length > 1) {
      const timestamps = itemsToSet.map((i: any) => i.created_at ? new Date(i.created_at).getTime() : 0).filter(Boolean);
      const uniqueTs = Array.from(new Set(timestamps));
      if (uniqueTs.length > 1) {
        const latestTs = Math.max(...uniqueTs);
        itemsToSet = itemsToSet.filter((i: any) => (i.created_at ? new Date(i.created_at).getTime() : 0) === latestTs);
      }
    }
    setQuotationItems(itemsToSet);

    // Determine GST mode:
    // 1. If shop setting "Enable GST in Quotations" is enabled, quotation should display GST boxes!
    // 2. Or if explicitly marked as GST (q.is_gst === 1) or has tax total > 0
    // 3. Or if any item in the quotation has HSN code or GST applicable
    const hasGstInItems = itemsToSet.some(i => Boolean(i.hsn_code || (i as any).hsn_sac_code || Number(i.tax_rate_percent) > 0 || i.is_gst_applicable));
    const isGstDoc = quotationGstEnabledSetting || q.is_gst === 1 || Number(q.tax_total) > 0 || hasGstInItems;
    setPreviewGstEnabled(Boolean(isGstDoc));

    setShowDetail(true);
  };

  const buildPrintData = (): QuotationPrintData | null => {
    if (!selectedQuotation) return null;

    const printItems: QuotationPrintItem[] = quotationItems.map(item => ({
      name: item.name,
      quantity: Number(item.quantity) || 0,
      rate: Number(item.rate) || 0,
      amount: Number(item.amount) || 0,
      hsn_code: item.hsn_code || (item as any).hsn_sac_code || null,
      uom: item.uom || ((item as any).billing_type === 'WEIGHT' ? 'KG' : 'PCS'),
      billing_type: (item as any).billing_type,
      weight: item.weight,
      discount_amount: item.discount_amount != null ? Number(item.discount_amount) : undefined,
      discount_percent: item.discount_percent != null ? Number(item.discount_percent) : undefined,
      taxable_amount: item.taxable_amount != null ? Number(item.taxable_amount) : Number(item.amount) || 0,
      tax_rate_percent: item.tax_rate_percent != null ? Number(item.tax_rate_percent) : 0,
      cgst_amount: item.cgst_amount != null ? Number(item.cgst_amount) : undefined,
      sgst_amount: item.sgst_amount != null ? Number(item.sgst_amount) : undefined,
      igst_amount: item.igst_amount != null ? Number(item.igst_amount) : undefined,
      is_gst_applicable: item.is_gst_applicable,
    }));

    return {
      shopName: shopName || 'NAFID STORE',
      shopAddress: shopAddress || undefined,
      shopPhone: shopPhone || undefined,
      shopEmail: shopEmail || undefined,
      shopGstin: shopGstin || undefined,
      shopState: shopState || undefined,
      quotationNumber: selectedQuotation.quotation_number,
      date: parseUTCDate(selectedQuotation.created_at).toLocaleDateString('en-IN', {
        timeZone: getStoreTimezone(),
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }),
      validUntil: '15 Days from Date of Issue',
      billerName: selectedQuotation.biller_name || userName || undefined,
      customerName: selectedQuotation.customer_name || undefined,
      customerPhone: selectedQuotation.customer_phone || undefined,
      customerAddress: selectedQuotation.customer_address || undefined,
      customerGstin: selectedQuotation.customer_gstin || undefined,
      customerState: selectedQuotation.customer_state || undefined,
      reverseCharge: 'No',
      isGstEnabled: previewGstEnabled,
      items: printItems,
      subtotal: Number(selectedQuotation.subtotal) || 0,
      discountTotal: selectedQuotation.discount_total != null ? Number(selectedQuotation.discount_total) : undefined,
      taxableAmount: previewGstEnabled ? (Number(selectedQuotation.subtotal) || 0) : undefined,
      taxTotal: previewGstEnabled ? (Number(selectedQuotation.tax_total) || 0) : 0,
      grandTotal: previewGstEnabled
        ? (Number(selectedQuotation.grand_total) || 0)
        : (Number(selectedQuotation.subtotal) || 0),
      termsAndConditions: selectedQuotation.terms_conditions || undefined,
      bankName: bankName || undefined,
      bankAccount: bankAccount || undefined,
      bankIfsc: bankIfsc || undefined,
      bankBranch: bankBranch || undefined,
      bankHolderName: shopName || undefined,
      upiId: upiId || undefined,
    };
  };

  const handlePrint = async () => {
    const printData = buildPrintData();
    if (!printData) return;

    const fullHtml = generateQuotationHtml(printData);

    if (window.electronAPI) {
      const printResult = await window.electronAPI.printA4Html(tenantId || 'global', fullHtml);
      if (!printResult.success) {
        const pw = window.open('', '_blank');
        if (pw) { pw.document.write(fullHtml); pw.document.close(); setTimeout(() => pw.print(), 500); }
      }
    } else {
      const pw = window.open('', '_blank');
      if (pw) { pw.document.write(fullHtml); pw.document.close(); setTimeout(() => pw.print(), 500); }
    }
  };

  const handleExportPdf = async () => {
    if (!selectedQuotation) return;
    const printData = buildPrintData();
    if (!printData) return;

    const defaultFilename = `Quotation_${selectedQuotation.quotation_number || 'Detail'}.pdf`;
    const fullHtml = generateQuotationHtml(printData);

    if (window.electronAPI?.exportA4Pdf) {
      const res = await window.electronAPI.exportA4Pdf(tenantId || 'global', fullHtml, defaultFilename);
      if (!res.success && res.error) {
        setStatusMessage({ text: `Export PDF failed: ${res.error}`, type: 'error' });
      }
    } else {
      const pw = window.open('', '_blank');
      if (pw) {
        pw.document.write(fullHtml);
        pw.document.title = defaultFilename.replace('.pdf', '');
        pw.document.close();
        setTimeout(() => pw.print(), 500);
      }
    }
  };

  const handleEditQuotation = (q: Quotation) => {
    setConfirmDialog({
      isOpen: true,
      title: `Edit ${q.quotation_number}`,
      message: `Are you sure you want to edit ${q.quotation_number}? This will open all quotation items in billing mode.`,
      confirmText: 'Edit Quotation',
      variant: 'blue',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        if (window.electronAPI) {
          const its = await window.electronAPI.dbGetQuotationItems(q.quotation_id);
          if (Array.isArray(its)) {
            localStorage.setItem('editQuotationData', JSON.stringify({ quotation: q, items: its }));
            window.dispatchEvent(new CustomEvent('open-quotation-edit'));
            onClose();
          }
        }
      },
    });
  };

  const handleDeleteQuotation = (q: Quotation) => {
    setConfirmDialog({
      isOpen: true,
      title: `Delete ${q.quotation_number}`,
      message: `Are you sure you want to delete ${q.quotation_number}? This action cannot be undone.`,
      confirmText: 'Delete Quotation',
      variant: 'red',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        if (window.electronAPI) {
          const res = await window.electronAPI.dbDeleteQuotation(q.quotation_id);
          if (res.success) {
            setStatusMessage({ text: `Quotation ${q.quotation_number} deleted`, type: 'success' });
            setQuotations(prev => {
              const updated = prev.filter(item => item.quotation_id !== q.quotation_id);
              localStorage.setItem('nafid_quotations_cache', JSON.stringify(updated));
              return updated;
            });
            await loadQuotations();
            if (showDetail) setShowDetail(false);
          } else {
            setStatusMessage({ text: res.error || 'Delete failed', type: 'error' });
          }
        }
        setTimeout(() => setStatusMessage(null), 3000);
      },
    });
  };

  const handleConvertToInvoice = (q: Quotation) => {
    setConfirmDialog({
      isOpen: true,
      title: `Convert ${q.quotation_number}`,
      message: `Convert ${q.quotation_number} to invoice? This will load items directly into POS checkout.`,
      confirmText: 'Convert to Invoice',
      variant: 'emerald',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        if (window.electronAPI) {
          const its = await window.electronAPI.dbGetQuotationItems(q.quotation_id);
          if (Array.isArray(its)) {
            localStorage.setItem('editQuotationData', JSON.stringify({ quotation: q, items: its, convertToInvoice: true }));
            window.dispatchEvent(new CustomEvent('open-quotation-edit'));
            onClose();
          }
        }
      },
    });
  };

  const formatDateLabel = (dateStr: string) => {
    const tz = getStoreTimezone();
    const d = parseUTCDate(dateStr);
    return `${d.toLocaleDateString('en-IN', { timeZone: tz, weekday: 'long' })} — ${d.toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: 'long', year: 'numeric' })}`;
  };

  const filteredQuotations = useMemo(() => {
    return quotations.filter(q => {
      const matchesSearch = !search ||
        q.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        q.quotation_number?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && q.status !== 'CONVERTED') ||
        (statusFilter === 'CONVERTED' && q.status === 'CONVERTED');
      return matchesSearch && matchesStatus;
    });
  }, [quotations, search, statusFilter]);

  // Derived state for on-screen quotation preview
  const previewHasDiscounts = useMemo(() => {
    return quotationItems.some(i => (i.discount_amount && i.discount_amount > 0) || (i.discount_percent && i.discount_percent > 0));
  }, [quotationItems]);

  const previewHasHsn = useMemo(() => {
    return previewGstEnabled || quotationItems.some(i => Boolean(i.hsn_code && i.hsn_code.trim()));
  }, [previewGstEnabled, quotationItems]);

  const isInterState = useMemo(() => {
    if (!previewGstEnabled || !selectedQuotation) return false;
    const cState = (selectedQuotation.customer_state || '').trim().toLowerCase();
    const sState = (shopState || '').trim().toLowerCase();
    return Boolean(cState && sState && cState !== sState);
  }, [previewGstEnabled, selectedQuotation, shopState]);

  const previewGrandTotal = useMemo(() => {
    if (!selectedQuotation) return 0;
    if (previewGstEnabled) {
      if (Number(selectedQuotation.grand_total) > Number(selectedQuotation.subtotal)) {
        return Number(selectedQuotation.grand_total);
      }
      const totalTaxFromItems = quotationItems.reduce((acc, i) => {
        const lineTotal = Number(i.amount) || ((Number(i.rate) || 0) * (Number(i.quantity) || 0));
        const rate = Number(i.tax_rate_percent) || 0;
        return acc + (lineTotal * (rate / 100));
      }, 0);
      return (Number(selectedQuotation.subtotal) || 0) + totalTaxFromItems;
    }
    return Number(selectedQuotation.subtotal) || 0;
  }, [previewGstEnabled, selectedQuotation, quotationItems]);

  const previewAmountInWords = useMemo(() => {
    return numberToIndianWords(Math.round(previewGrandTotal * 100) / 100);
  }, [previewGrandTotal]);

  const hasConfiguredBank = Boolean(bankName || bankAccount || bankIfsc || upiId);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background font-sans">
      {/* Header */}
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
          <div className="p-1.5 sm:p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-bold text-foreground truncate">
                {showDetail ? `Quotation ${selectedQuotation?.quotation_number}` : 'Quotations & Estimates'}
              </h1>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            </div>
            {!showDetail && (
              <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium leading-none mt-0.5">{quotations.length} quotations on record</p>
            )}
            {showDetail && (
              <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
                {previewGstEnabled ? 'GST-Enabled Quotation' : 'Standard Non-GST Quotation'} • {quotationItems.length} items
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={showDetail ? () => setShowDetail(false) : (isRestricted ? () => useAuthStore.getState().logout() : onClose)}
              className="p-1.5 sm:p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4 text-destructive" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-muted/20">
        {/* LIST VIEW */}
        {!showDetail && (
          <div className="w-full px-4 sm:px-6 pt-4 sm:pt-6 pb-10 space-y-4">
            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 bg-card border border-border rounded-xl sm:rounded-2xl p-2.5 sm:p-3 lg:p-3.5 shadow-xs">
              <div className="relative flex-1 max-w-full sm:max-w-md lg:max-w-lg">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by quote number, customer name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 sm:py-2 bg-background border border-border rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:border-primary transition-all"
                />
              </div>

              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <div className="flex items-center p-1 bg-muted/60 rounded-xl border border-border text-xs">
                  <button
                    onClick={() => setStatusFilter('ALL')}
                    className={clsx('px-2.5 sm:px-3 py-1 rounded-lg font-bold transition-all cursor-pointer', statusFilter === 'ALL' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setStatusFilter('ACTIVE')}
                    className={clsx('px-2.5 sm:px-3 py-1 rounded-lg font-bold transition-all cursor-pointer', statusFilter === 'ACTIVE' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setStatusFilter('CONVERTED')}
                    className={clsx('px-2.5 sm:px-3 py-1 rounded-lg font-bold transition-all cursor-pointer', statusFilter === 'CONVERTED' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
                  >
                    Converted
                  </button>
                </div>

                <button
                  onClick={handleCreateNewQuotation}
                  className="px-3.5 sm:px-4 py-1.5 sm:py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> New Quote
                </button>
              </div>
            </div>

            {/* Quotations List */}
            {loading ? (
              <div className="text-center py-16 sm:py-24 text-muted-foreground text-xs sm:text-sm font-bold">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                Loading quotations...
              </div>
            ) : filteredQuotations.length === 0 ? (
              <div className="text-center py-12 sm:py-20 bg-card border border-border rounded-xl sm:rounded-2xl p-6 sm:p-10">
                <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <h3 className="text-sm sm:text-base font-bold text-foreground">No Quotations Found</h3>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">Create your first quotation or adjust your search filter.</p>
                <button
                  onClick={handleCreateNewQuotation}
                  className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Create Quotation
                </button>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl sm:rounded-2xl overflow-hidden shadow-xs divide-y divide-border">
                {filteredQuotations.map(q => {
                  const isGst = q.is_gst === 1 || Number(q.tax_total) > 0;
                  return (
                    <div
                      key={q.quotation_id}
                      onClick={() => viewQuotation(q)}
                      className="p-3 sm:p-4 lg:p-5 flex items-center justify-between gap-3 sm:gap-4 lg:gap-6 hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-bold text-xs sm:text-sm text-primary">{q.quotation_number}</span>
                          <span className={clsx(
                            'text-[10px] font-bold px-2 py-0.5 rounded-md border',
                            q.status === 'CONVERTED'
                              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                              : 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                          )}>
                            {q.status === 'CONVERTED' ? 'Converted to Invoice' : 'Active'}
                          </span>
                          <span className={clsx(
                            'text-[10px] font-bold px-2 py-0.5 rounded-md border',
                            isGst ? 'bg-purple-500/10 text-purple-600 border-purple-500/20' : 'bg-slate-500/10 text-slate-600 border-slate-500/20'
                          )}>
                            {isGst ? 'GST' : 'Non-GST'}
                          </span>
                        </div>
                        <div className="font-bold text-xs sm:text-sm text-foreground truncate">{q.customer_name || 'Cash Customer'}</div>
                        <div className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                          {formatDateLabel(q.created_at)}
                          {q.customer_phone ? ` • ${q.customer_phone}` : ''}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-sm sm:text-base lg:text-lg text-foreground">{formatCurrency(q.grand_total)}</div>
                        {Number(q.tax_total) > 0 && (
                          <div className="text-[10px] sm:text-[11px] text-muted-foreground">GST: {formatCurrency(q.tax_total)}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => viewQuotation(q)}
                          className="p-1.5 sm:p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {q.status === 'ACTIVE' && (
                          <button
                            onClick={() => handleEditQuotation(q)}
                            className="p-1.5 sm:p-2 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all"
                            title="Edit Quote"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteQuotation(q)}
                          className="p-1.5 sm:p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                          title="Delete Quote"
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* QUOTATION DETAIL (REFERENCE-MATCHED REDESIGN) */}
        {showDetail && selectedQuotation && (
          <div className="w-full px-4 sm:px-6 pt-4 sm:pt-6 pb-10 space-y-4">
            {/* Top Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 bg-card border border-border rounded-xl sm:rounded-2xl p-2.5 sm:p-3 lg:p-3.5 shadow-xs">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-[11px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider">Format:</span>
                <button
                  type="button"
                  onClick={() => setPreviewGstEnabled(!previewGstEnabled)}
                  className={clsx(
                    'px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5',
                    previewGstEnabled
                      ? 'bg-purple-500/15 border-purple-500/40 text-purple-700 dark:text-purple-300'
                      : 'bg-slate-500/15 border-slate-500/40 text-slate-700 dark:text-slate-300'
                  )}
                >
                  <span className={clsx('w-2 h-2 rounded-full', previewGstEnabled ? 'bg-purple-500' : 'bg-slate-400')} />
                  {previewGstEnabled ? 'GST Enabled (Tax Breakdown)' : 'Non-GST (Compact)'}
                </button>
                <span className="text-[10px] sm:text-[11px] text-muted-foreground hidden sm:inline">
                  (Toggle adjusts columns &amp; tax summary dynamically)
                </span>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <button
                  onClick={handlePrint}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 bg-muted hover:bg-muted/80 border border-border text-foreground rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
                >
                  <Printer className="w-3.5 h-3.5" /> Print Quotation
                </button>
                <button
                  onClick={handleExportPdf}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
                >
                  <FileText className="w-3.5 h-3.5" /> Export PDF
                </button>
                {selectedQuotation.status === 'ACTIVE' && (
                  <>
                    <button
                      onClick={() => handleEditQuotation(selectedQuotation)}
                      className="px-3 sm:px-3.5 py-1.5 sm:py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => handleConvertToInvoice(selectedQuotation)}
                      className="px-3 sm:px-3.5 py-1.5 sm:py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Convert to Invoice
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Document Box matching Reference Styling */}
            <div
              ref={printRef}
              className="max-w-5xl mx-auto bg-white text-slate-900 border border-slate-900 rounded-lg sm:rounded-xl p-4 sm:p-6 md:p-8 lg:p-10 shadow-md font-sans text-xs transition-all"
              style={{ minHeight: 'auto', backgroundColor: '#ffffff', color: '#111111' }}
            >
              {/* 1. SHOP HEADER */}
              <div className="text-center pb-2.5 sm:pb-3 md:pb-4 border-b-2 border-slate-900">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-wider text-black">
                  {shopName || 'NAFID STORE'}
                </h1>
                {shopAddress && (
                  <p className="text-[11px] sm:text-xs font-semibold text-slate-700 mt-0.5 sm:mt-1">{shopAddress}</p>
                )}
                <p className="text-[10px] sm:text-[11px] md:text-xs font-semibold text-slate-700 mt-0.5">
                  {[
                    shopPhone ? `Phone: ${shopPhone}` : '',
                    shopEmail ? `Email: ${shopEmail}` : '',
                    shopGstin ? `GSTIN: ${shopGstin}` : '',
                    shopState ? `State: ${shopState}` : '',
                  ].filter(Boolean).join(' | ')}
                </p>
                <div className="mt-2 sm:mt-2.5">
                  <span className="inline-block px-3 sm:px-4 py-0.5 text-[10px] sm:text-xs font-extrabold uppercase tracking-widest border border-slate-900 bg-slate-100 text-black">
                    QUOTATION
                  </span>
                </div>
              </div>

              {/* 2. CUSTOMER & QUOTATION DETAILS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 border-b-2 border-slate-900">
                {/* Left: Receiver Details */}
                <div className="p-2.5 sm:p-3.5 md:p-4 sm:border-r-2 sm:border-slate-900">
                  <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-black border-b border-dashed border-slate-900 pb-1 mb-1.5 sm:mb-2">
                    Receiver Details / Quotation To
                  </div>
                  <div className="font-bold text-xs sm:text-sm md:text-base text-black">
                    {selectedQuotation.customer_name || 'Cash Customer'}
                  </div>
                  {selectedQuotation.customer_address && (
                    <div className="text-[11px] sm:text-xs text-black mt-0.5">{selectedQuotation.customer_address}</div>
                  )}
                  {selectedQuotation.customer_phone && (
                    <div className="text-[11px] sm:text-xs text-black mt-0.5"><strong>Phone:</strong> {selectedQuotation.customer_phone}</div>
                  )}
                  {selectedQuotation.customer_gstin && (
                    <div className="text-[11px] sm:text-xs text-black mt-0.5"><strong>GSTIN:</strong> {selectedQuotation.customer_gstin}</div>
                  )}
                  {selectedQuotation.customer_state && (
                    <div className="text-[11px] sm:text-xs text-black mt-0.5"><strong>State:</strong> {selectedQuotation.customer_state}</div>
                  )}
                </div>

                {/* Right: Quotation Information */}
                <div className="p-2.5 sm:p-3.5 md:p-4">
                  <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-black border-b border-dashed border-slate-900 pb-1 mb-1.5 sm:mb-2">
                    Quotation Information
                  </div>
                  <table className="w-full text-[11px] sm:text-xs">
                    <tbody>
                      <tr>
                        <td className="font-bold text-black py-0.5 sm:py-1">Quotation No.:</td>
                        <td className="text-right tabular-nums font-bold text-black py-0.5 sm:py-1 tracking-wide">{selectedQuotation.quotation_number}</td>
                      </tr>
                      <tr>
                        <td className="font-bold text-black py-0.5 sm:py-1">Date:</td>
                        <td className="text-right text-black py-0.5 sm:py-1">{formatDateLabel(selectedQuotation.created_at)}</td>
                      </tr>
                      <tr>
                        <td className="font-bold text-black py-0.5 sm:py-1">Valid Until:</td>
                        <td className="text-right text-black py-0.5 sm:py-1">15 Days from Issue Date</td>
                      </tr>
                      {previewGstEnabled && (
                        <>
                          <tr>
                            <td className="font-bold text-black py-0.5 sm:py-1">Reverse Charge:</td>
                            <td className="text-right text-black py-0.5 sm:py-1">No</td>
                          </tr>
                          <tr>
                            <td className="font-bold text-black py-0.5 sm:py-1">Place of Supply:</td>
                            <td className="text-right text-black py-0.5 sm:py-1">{selectedQuotation.customer_state || shopState || 'Local'}</td>
                          </tr>
                        </>
                      )}
                      {selectedQuotation.biller_name && (
                        <tr>
                          <td className="font-bold text-black py-0.5 sm:py-1">Prepared By:</td>
                          <td className="text-right text-black py-0.5 sm:py-1">{selectedQuotation.biller_name}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3. PRODUCT TABLE */}
              <div className="overflow-x-auto -mx-1 sm:mx-0">
                <table className="w-full border-collapse text-[10.5px] sm:text-xs">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center font-bold text-[9px] sm:text-[10px] uppercase w-8 sm:w-10">#</th>
                      <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-left font-bold text-[9px] sm:text-[10px] uppercase min-w-[120px]">Description of Goods</th>
                      {previewHasHsn && (
                        <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center font-bold text-[9px] sm:text-[10px] uppercase w-16 sm:w-20">HSN/SAC</th>
                      )}
                      <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center font-bold text-[9px] sm:text-[10px] uppercase w-12 sm:w-16">Qty</th>
                      <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center font-bold text-[9px] sm:text-[10px] uppercase w-12 sm:w-16">UOM</th>
                      <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right font-bold text-[9px] sm:text-[10px] uppercase w-16 sm:w-20">Unit Price</th>
                      {previewHasDiscounts && (
                        <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right font-bold text-[9px] sm:text-[10px] uppercase w-14 sm:w-16">Disc.</th>
                      )}
                      {previewGstEnabled && (
                        <>
                          <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right font-bold text-[9px] sm:text-[10px] uppercase w-16 sm:w-20">Taxable Val</th>
                          {isInterState ? (
                            <>
                              <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center font-bold text-[9px] sm:text-[10px] uppercase w-12 sm:w-14">IGST %</th>
                              <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right font-bold text-[9px] sm:text-[10px] uppercase w-14 sm:w-16">IGST Amt</th>
                            </>
                          ) : (
                            <>
                              <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center font-bold text-[9px] sm:text-[10px] uppercase w-12 sm:w-14">CGST %</th>
                              <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right font-bold text-[9px] sm:text-[10px] uppercase w-14 sm:w-16">CGST Amt</th>
                              <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center font-bold text-[9px] sm:text-[10px] uppercase w-12 sm:w-14">SGST %</th>
                              <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right font-bold text-[9px] sm:text-[10px] uppercase w-14 sm:w-16">SGST Amt</th>
                            </>
                          )}
                        </>
                      )}
                      <th className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right font-bold text-[9px] sm:text-[10px] uppercase w-20 sm:w-24">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotationItems.map((item, idx) => {
                      const qty = Number(item.quantity) || 0;
                      const rate = Number(item.rate) || 0;
                      const lineTotal = Number(item.amount) || (rate * qty);
                      const taxRate = Number(item.tax_rate_percent) || 0;
                      const halfRate = taxRate / 2;
                      const taxableVal = (item.taxable_amount != null && Number(item.taxable_amount) > 0)
                        ? Number(item.taxable_amount)
                        : (rate * qty > 0 ? (rate * qty) : lineTotal);
                      const cgstAmt = item.cgst_amount != null ? Number(item.cgst_amount) : Math.round(taxableVal * (halfRate / 100) * 100) / 100;
                      const sgstAmt = item.sgst_amount != null ? Number(item.sgst_amount) : Math.round(taxableVal * (halfRate / 100) * 100) / 100;
                      const igstAmt = item.igst_amount != null ? Number(item.igst_amount) : Math.round(taxableVal * (taxRate / 100) * 100) / 100;

                      return (
                        <tr key={item.item_id || idx} className="hover:bg-slate-50">
                          <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center font-medium">{idx + 1}</td>
                          <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-left font-semibold text-black">{item.name}</td>
                          {previewHasHsn && (
                            <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center text-slate-700">{item.hsn_code || '-'}</td>
                          )}
                          <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center">{qty}</td>
                          <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center uppercase">{item.uom || (item.weight ? 'KG' : 'PCS')}</td>
                          <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right tabular-nums font-semibold">{formatCurrency(rate)}</td>
                          {previewHasDiscounts && (
                            <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right tabular-nums font-semibold">
                              {item.discount_percent ? `${item.discount_percent}%` : (item.discount_amount ? formatCurrency(item.discount_amount) : '-')}
                            </td>
                          )}
                          {previewGstEnabled && (
                            <>
                              <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right tabular-nums font-semibold">{formatCurrency(taxableVal)}</td>
                              {isInterState ? (
                                <>
                                  <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center">{taxRate}%</td>
                                  <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right tabular-nums font-semibold">{formatCurrency(igstAmt)}</td>
                                </>
                              ) : (
                                <>
                                  <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center">{halfRate}%</td>
                                  <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right tabular-nums font-semibold">{formatCurrency(cgstAmt)}</td>
                                  <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-center">{halfRate}%</td>
                                  <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right tabular-nums font-semibold">{formatCurrency(sgstAmt)}</td>
                                </>
                              )}
                            </>
                          )}
                          <td className="p-1.5 sm:p-2 md:p-2.5 border border-slate-900 text-right tabular-nums font-bold text-black">{formatCurrency(lineTotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 4. TOTALS & SUMMARY SECTION */}
              <div className="grid grid-cols-1 sm:grid-cols-2 border-b-2 border-slate-900">
                {/* Words and Terms */}
                <div className="p-2.5 sm:p-3.5 md:p-4 sm:border-r-2 sm:border-slate-900 flex flex-col justify-between">
                  <div>
                    <div className="p-2 sm:p-2.5 md:p-3 bg-slate-50 border border-slate-900 rounded-md mb-2 sm:mb-3">
                      <span className="text-[9px] sm:text-[10px] font-black uppercase text-black block mb-0.5">Amount Chargeable (in words)</span>
                      <span className="text-xs sm:text-sm font-bold text-black block leading-snug">{previewAmountInWords} Only</span>
                    </div>

                    {selectedQuotation.terms_conditions && (
                      <div className="pt-1">
                        <span className="text-[9px] sm:text-[10px] font-black uppercase text-black block mb-1">Terms &amp; Conditions</span>
                        <p className="text-[10px] sm:text-[11px] text-black whitespace-pre-line leading-relaxed">{selectedQuotation.terms_conditions}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Amount Summary Table */}
                <div className="p-0">
                  <table className="w-full text-[11px] sm:text-xs">
                    <tbody>
                      <tr className="border-b border-slate-200">
                        <td className="p-2 sm:p-2.5 font-bold text-black">Subtotal</td>
                        <td className="p-2.5 text-right tabular-nums font-semibold text-black">{formatCurrency(selectedQuotation.subtotal)}</td>
                      </tr>
                      {selectedQuotation.discount_total != null && Number(selectedQuotation.discount_total) > 0 && (
                        <tr className="border-b border-slate-200 text-red-600">
                          <td className="p-2 sm:p-2.5 font-bold">Discount Total</td>
                          <td className="p-2.5 text-right tabular-nums font-semibold">-{formatCurrency(selectedQuotation.discount_total)}</td>
                        </tr>
                      )}
                      {previewGstEnabled && (
                        <>
                          <tr className="border-b border-slate-200">
                            <td className="p-2 sm:p-2.5 font-bold text-black">Taxable Amount</td>
                            <td className="p-2.5 text-right tabular-nums font-semibold text-black">{formatCurrency(selectedQuotation.subtotal)}</td>
                          </tr>
                          {isInterState ? (
                            <tr className="border-b border-slate-200">
                              <td className="p-2 sm:p-2.5 font-bold text-black">Integrated Tax (IGST)</td>
                              <td className="p-2.5 text-right tabular-nums font-semibold text-black">{formatCurrency(selectedQuotation.tax_total)}</td>
                            </tr>
                          ) : (
                            <>
                              <tr className="border-b border-slate-200">
                                <td className="p-2 sm:p-2.5 font-bold text-black">Central Tax (CGST)</td>
                                <td className="p-2.5 text-right tabular-nums font-semibold text-black">{formatCurrency(selectedQuotation.tax_total / 2)}</td>
                              </tr>
                              <tr className="border-b border-slate-200">
                                <td className="p-2 sm:p-2.5 font-bold text-black">State Tax (SGST)</td>
                                <td className="p-2.5 text-right tabular-nums font-semibold text-black">{formatCurrency(selectedQuotation.tax_total / 2)}</td>
                              </tr>
                            </>
                          )}
                        </>
                      )}
                      {selectedQuotation.round_off ? (
                        <tr className="border-b border-slate-200">
                          <td className="p-2 sm:p-2.5 font-bold text-black">Round Off</td>
                          <td className="p-2.5 text-right tabular-nums font-semibold text-black">{formatCurrency(selectedQuotation.round_off)}</td>
                        </tr>
                      ) : null}
                      <tr className="bg-slate-100 border-t-2 border-slate-900">
                        <td className="p-2.5 sm:p-3 font-black text-xs sm:text-sm uppercase text-black">Grand Total</td>
                        <td className="p-2.5 sm:p-3 text-right tabular-nums font-black text-sm sm:text-base md:text-lg text-black">{formatCurrency(previewGrandTotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 5. BANK ACCOUNT DETAILS & SIGNATURE (BOTTOM OF FINAL PAGE) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 pt-1.5 sm:pt-2">
                {/* Left: Bank Account Box */}
                <div className="p-2.5 sm:p-3.5 md:p-4 sm:border-r-2 sm:border-slate-900">
                  <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-black border-b border-dashed border-slate-900 pb-1 mb-1.5 sm:mb-2">
                    Bank Account Details
                  </div>
                  {hasConfiguredBank ? (
                    <div className="space-y-1 text-[11px] sm:text-xs text-black">
                      {bankName && <div><strong className="inline-block w-20 sm:w-24 text-black">Bank Name:</strong> {bankName}</div>}
                      <div><strong className="inline-block w-20 sm:w-24 text-black">A/C Holder:</strong> {shopName || 'NAFID STORE'}</div>
                      {bankAccount && <div><strong className="inline-block w-20 sm:w-24 text-black">Account No.:</strong> {bankAccount}</div>}
                      {bankBranch && <div><strong className="inline-block w-20 sm:w-24 text-black">Branch:</strong> {bankBranch}</div>}
                      {bankIfsc && <div><strong className="inline-block w-20 sm:w-24 text-black">IFSC Code:</strong> {bankIfsc}</div>}
                      {upiId && <div><strong className="inline-block w-20 sm:w-24 text-black">UPI ID:</strong> {upiId}</div>}
                    </div>
                  ) : (
                    <p className="text-[11px] sm:text-xs text-black italic">Please contact shop directly for wire transfer details.</p>
                  )}
                </div>

                {/* Right: Authorized Signatory */}
                <div className="p-2.5 sm:p-3.5 md:p-4 flex flex-col justify-between items-end text-right min-h-[80px] sm:min-h-[90px]">
                  <div className="text-[11px] sm:text-xs font-bold text-black">
                    For <strong>{shopName || 'NAFID STORE'}</strong>
                  </div>
                  <div className="mt-8 sm:mt-12 md:mt-14 pt-2 border-t border-dashed border-slate-900 min-w-[130px] sm:min-w-[150px] text-center text-[10px] sm:text-xs font-bold text-black">
                    Authorized Signatory
                  </div>
                </div>
              </div>

              {/* Footer Note */}
              <p className="text-[9px] sm:text-[10px] text-black text-center pt-2 sm:pt-3 border-t border-slate-200 mt-2">
                This is a computer-generated quotation issued on {new Date().toLocaleDateString('en-IN')}.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <AlertCircle className={clsx(
                  "w-5 h-5",
                  confirmDialog.variant === 'red' ? "text-red-500" :
                  confirmDialog.variant === 'emerald' ? "text-emerald-500" :
                  "text-blue-500"
                )} />
                <span>{confirmDialog.title}</span>
              </h3>
              <button
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {confirmDialog.message}
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 border border-border text-foreground font-bold text-xs rounded-xl hover:bg-muted transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className={clsx(
                  "px-4 py-2 text-white font-bold text-xs rounded-xl transition-all active:scale-95 shadow-sm cursor-pointer border-0",
                  confirmDialog.variant === 'red' ? "bg-red-500 hover:bg-red-600" :
                  confirmDialog.variant === 'emerald' ? "bg-emerald-500 hover:bg-emerald-600" :
                  "bg-blue-500 hover:bg-blue-600"
                )}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {statusMessage && (
        <div className="fixed bottom-5 right-5 z-[9999] px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto max-w-md">
          <div className={clsx("p-2 rounded-xl shrink-0", statusMessage.type === 'success' ? "bg-emerald-500/25 text-emerald-400" : "bg-red-500/25 text-red-400")}>
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0 leading-snug">
            <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">
              {statusMessage.type === 'success' ? 'QUOTATION STATUS' : 'QUOTATION ALERT'}
            </span>
            <span className="text-white font-bold text-xs block leading-tight">{statusMessage.text}</span>
          </div>
          <RedCrossButton onClick={() => setStatusMessage(null)} size="sm" />
        </div>
      )}
    </div>
  );
}
