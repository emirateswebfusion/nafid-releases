import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { useTabStore, type TabSnapshot, saveStoredTabs } from '../store/tabStore';
import { X, Search, Printer, FileText, RefreshCw, Pencil, Trash, CheckCircle2, AlertCircle, Plus } from 'lucide-react';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import clsx from 'clsx';
import { generateInvoiceHtml } from '../utils/invoiceHtmlGenerator';
import { parsePrintFormat } from '../utils/printFormatHelper';
import { DEFAULT_BILL_SETTINGS, type ReceiptData, parseUTCDate } from '../utils/receiptGenerator';
import { getStoreTimezone } from '../utils/timezoneHelper';
import { isAdminRole } from '../utils/permissions';
import { RedCrossButton } from './ui/RedCrossButton';

interface Quotation {
  quotation_id: string;
  quotation_number: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
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
  weight: number;
  rate: number;
  amount: number;
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
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopGstin, setShopGstin] = useState('');
  const [shopState, setShopState] = useState('');

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
      ]).then(([addr, ph, gst, st]) => {
        if (addr) setShopAddress(addr);
        if (ph) setShopPhone(ph);
        if (gst) setShopGstin(gst);
        if (st) setShopState(st);
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

  const formatCurrency = (amount: number) => `\u20B9${amount.toFixed(2)}`;

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
      invoiceType: 'BILL_OF_SUPPLY',
      discountType: 'FIXED',
      discountValue: 0,
      customerState: 'KL',
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
    if (window.electronAPI) {
      const its = await window.electronAPI.dbGetQuotationItems(q.quotation_id);
      if (Array.isArray(its) && its.length > 0) {
        setQuotationItems(its);
      } else if (Array.isArray((q as any).items) && (q as any).items.length > 0) {
        setQuotationItems((q as any).items);
      } else {
        setQuotationItems(Array.isArray(its) ? its : []);
      }
    } else if (Array.isArray((q as any).items)) {
      setQuotationItems((q as any).items);
    }
    setShowDetail(true);
  };

  const handlePrint = async () => {
    if (window.electronAPI) {
      const printFmtRaw = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'print_format' });
      const printFmt = parsePrintFormat(printFmtRaw);
      if (printFmt.format === 'half-a4' && selectedQuotation) {
        const [shopNameVal, shopGstin, shopAddr, shopPh, upi, shopStateVal] = await Promise.all([
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_name' }),
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_gstin' }),
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_address' }),
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_phone' }),
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'upi_id' }),
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_state' }),
        ]);
        const billSettings = {
          ...DEFAULT_BILL_SETTINGS,
          ...(printFmt.billSettings || {}),
          instructions: selectedQuotation.terms_conditions || printFmt.billSettings?.instructions || '',
        };
        const receiptData: ReceiptData = {
          shopName: billSettings.showShopName !== false ? (shopNameVal || shopName || 'My Shop') : '',
          shopGstin: billSettings.showShopGstin !== false ? (shopGstin || undefined) : undefined,
          shopState: billSettings.showShopState !== false ? (shopStateVal || undefined) : undefined,
          shopAddress: billSettings.showShopAddress !== false ? (shopAddr || undefined) : undefined,
          shopPhone: billSettings.showPhone !== false ? (shopPh || undefined) : undefined,
          upiId: upi || undefined,
          showUpiQr: true,
          showProductOffers: printFmt.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
          invoiceNumber: selectedQuotation.quotation_number,
          invoiceType: 'QUOTATION',
          date: formatDateLabel(selectedQuotation.created_at),
          billerName: billSettings.showBillerName !== false ? ((selectedQuotation as any).biller_name || userName || undefined) : undefined,
          items: quotationItems.map(item => ({
            name: item.name,
            quantity: item.quantity,
            unit_price: item.rate,
            total: item.amount,
            billing_type: (item as any).billing_type,
            pieces_sold: (item as any).pieces_sold != null ? Number((item as any).pieces_sold) : undefined,
            pieces_override: (item as any).pieces_override != null ? Number((item as any).pieces_override) : undefined,
            unit: (item as any).unit || (item as any).uom,
          })),
          subtotal: selectedQuotation.subtotal,
          tax: selectedQuotation.tax_total,
          discount: 0,
          grandTotal: selectedQuotation.grand_total,
          customerName: billSettings.showCustomerName ? (selectedQuotation.customer_name || undefined) : undefined,
          customerPhone: billSettings.showCustomerPhone !== false ? (selectedQuotation.customer_phone || undefined) : undefined,
          customerAddress: billSettings.showCustomerAddress !== false ? (selectedQuotation.customer_address || undefined) : undefined,
          customerState: billSettings.showCustomerState !== false ? ((selectedQuotation as any).customer_state || undefined) : undefined,
          billSettings,
          a5Orientation: printFmt.a5Orientation || 'horizontal',
        };
        const invoiceHtml = generateInvoiceHtml(receiptData, 'half-a4');
        const printResult = await window.electronAPI.printA4Html(tenantId || 'global', invoiceHtml);
        if (!printResult.success) {
          const pw = window.open('', '_blank');
          if (pw) { pw.document.write(invoiceHtml); pw.document.close(); setTimeout(() => pw.print(), 500); }
        }
        return;
      }
    }

    const content = printRef.current?.innerHTML || '';
    const fullHtml = `<!DOCTYPE html>
      <html>
        <head>
          <title>Quotation - ${shopName}</title>
          <style>
            @page { size: A4; margin: 15mm; }
            html, body { background: #ffffff !important; background-color: #ffffff !important; color: #1a1a1a !important; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; padding: 0; margin: 0; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
            .header h1 { font-size: 24px; margin: 0; text-transform: uppercase; }
            .header p { font-size: 12px; color: #444; margin: 3px 0; font-weight: 500; }
            .qtn-info { display: flex; justify-content: space-between; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; }
            tfoot { display: table-row-group !important; page-break-inside: avoid !important; break-inside: avoid !important; }
            th { background: #f5f5f5; padding: 8px 6px; border: 1px solid #ddd; text-align: left; font-size: 10px; text-transform: uppercase; }
            td { padding: 6px; border: 1px solid #ddd; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .total-row td { font-weight: bold; }
            .terms { margin-top: 25px; padding-top: 12px; border-top: 1px solid #ddd; }
            .terms h3 { font-size: 14px; margin-bottom: 6px; font-weight: bold; color: #000; }
            .terms p { font-size: 13px; color: #1a1a1a; line-height: 1.5; white-space: pre-line; }
            @media print {
              html, body { background: #ffffff !important; background-color: #ffffff !important; color: #1a1a1a !important; }
              tfoot { display: table-row-group !important; page-break-inside: avoid !important; break-inside: avoid !important; }
            }
          </style>
        </head>
        <body>${content}</body>
      </html>`;

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
    const defaultFilename = `Quotation_${selectedQuotation.quotation_number || 'Detail'}.pdf`;

    let htmlToExport = '';

    if (window.electronAPI) {
      const printFmtRaw = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'print_format' });
      const printFmt = parsePrintFormat(printFmtRaw);
      if (printFmt.format === 'half-a4') {
        const [shopNameVal, shopGstinVal, shopAddrVal, shopPhVal, upiVal, shopStateVal] = await Promise.all([
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_name' }),
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_gstin' }),
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_address' }),
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_phone' }),
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'upi_id' }),
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_state' }),
        ]);
        const billSettings = {
          ...DEFAULT_BILL_SETTINGS,
          ...(printFmt.billSettings || {}),
          instructions: selectedQuotation.terms_conditions || printFmt.billSettings?.instructions || '',
        };
        const receiptData: ReceiptData = {
          shopName: billSettings.showShopName !== false ? (shopNameVal || shopName || 'My Shop') : '',
          shopGstin: billSettings.showShopGstin !== false ? (shopGstinVal || shopGstin || undefined) : undefined,
          shopState: billSettings.showShopState !== false ? (shopStateVal || shopState || undefined) : undefined,
          shopAddress: billSettings.showShopAddress !== false ? (shopAddrVal || shopAddress || undefined) : undefined,
          shopPhone: billSettings.showPhone !== false ? (shopPhVal || shopPhone || undefined) : undefined,
          upiId: upiVal || undefined,
          showUpiQr: true,
          showProductOffers: printFmt.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
          invoiceNumber: selectedQuotation.quotation_number,
          invoiceType: 'QUOTATION',
          date: formatDateLabel(selectedQuotation.created_at),
          billerName: billSettings.showBillerName !== false ? ((selectedQuotation as any).biller_name || userName || undefined) : undefined,
          items: quotationItems.map(item => ({
            name: item.name,
            quantity: item.quantity,
            unit_price: item.rate,
            total: item.amount,
            billing_type: (item as any).billing_type,
            pieces_sold: (item as any).pieces_sold != null ? Number((item as any).pieces_sold) : undefined,
            pieces_override: (item as any).pieces_override != null ? Number((item as any).pieces_override) : undefined,
            unit: (item as any).unit || (item as any).uom,
          })),
          subtotal: selectedQuotation.subtotal,
          tax: selectedQuotation.tax_total,
          discount: 0,
          grandTotal: selectedQuotation.grand_total,
          customerName: billSettings.showCustomerName !== false ? (selectedQuotation.customer_name || undefined) : undefined,
          customerPhone: billSettings.showCustomerPhone !== false ? (selectedQuotation.customer_phone || undefined) : undefined,
          customerAddress: billSettings.showCustomerAddress !== false ? (selectedQuotation.customer_address || undefined) : undefined,
          customerState: billSettings.showCustomerState !== false ? ((selectedQuotation as any).customer_state || undefined) : undefined,
          billSettings,
          a5Orientation: printFmt.a5Orientation || 'horizontal',
        };
        htmlToExport = generateInvoiceHtml(receiptData, 'half-a4');
      }
    }

    if (!htmlToExport) {
      const content = printRef.current?.innerHTML || '';
      htmlToExport = `<!DOCTYPE html>
        <html>
          <head>
            <title>Quotation - ${selectedQuotation.quotation_number}</title>
            <style>
              @page { size: A4; margin: 15mm; }
              html, body { background: #ffffff !important; background-color: #ffffff !important; color: #1a1a1a !important; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; padding: 0; margin: 0; }
              .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
              .header h1 { font-size: 24px; margin: 0; text-transform: uppercase; }
              .header p { font-size: 12px; color: #444; margin: 3px 0; font-weight: 500; }
              .qtn-info { display: flex; justify-content: space-between; margin-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; }
              tfoot { display: table-row-group !important; page-break-inside: avoid !important; break-inside: avoid !important; }
              th { background: #f5f5f5; padding: 8px 6px; border: 1px solid #ddd; text-align: left; font-size: 10px; text-transform: uppercase; }
              td { padding: 6px; border: 1px solid #ddd; }
              .text-right { text-align: right; }
              .text-center { text-align: center; }
              .total-row td { font-weight: bold; }
              .terms { margin-top: 25px; padding-top: 12px; border-top: 1px solid #ddd; }
              .terms h3 { font-size: 14px; margin-bottom: 6px; font-weight: bold; color: #000; }
              .terms p { font-size: 13px; color: #1a1a1a; line-height: 1.5; white-space: pre-line; }
              @media print {
                html, body { background: #ffffff !important; background-color: #ffffff !important; color: #1a1a1a !important; }
                tfoot { display: table-row-group !important; page-break-inside: avoid !important; break-inside: avoid !important; }
              }
            </style>
          </head>
          <body>${content}</body>
        </html>`;
    }

    if (window.electronAPI?.exportA4Pdf) {
      const res = await window.electronAPI.exportA4Pdf(tenantId || 'global', htmlToExport, defaultFilename);
      if (!res.success && res.error) {
        setStatusMessage({ text: `Export PDF failed: ${res.error}`, type: 'error' });
      }
    } else {
      const pw = window.open('', '_blank');
      if (pw) {
        pw.document.write(htmlToExport);
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

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background font-sans">
      
      {/* Header */}
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 px-5 py-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">
                {showDetail ? 'Quotation Detail' : 'Quotations Directory'}
              </h1>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            </div>
            {!showDetail && (
              <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">{quotations.length} total quotations</p>
            )}
            {showDetail && (
              <span className="text-[11px] text-muted-foreground font-medium bg-muted px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 mt-0.5">
                {isAdminRole(authRole) ? 'Admin Mode' : (userName || 'Staff')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <RedCrossButton
              onClick={showDetail ? () => setShowDetail(false) : (isRestricted ? () => useAuthStore.getState().logout() : onClose)}
              title="Close"
            />
          </div>
        </div>
      </header>

      {/* Action Bar (list view) */}
      {!showDetail && (
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3 border-b border-border bg-card shrink-0 shadow-sm">
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by customer name or QTN number..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl py-2 pl-10 pr-4 text-xs font-medium text-foreground transition-all shadow-sm placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="flex items-center gap-1 p-1 bg-muted rounded-xl border border-border shrink-0 text-xs">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={clsx("px-3 py-1 font-bold rounded-lg transition-all", statusFilter === 'ALL' ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter('ACTIVE')}
                className={clsx("px-3 py-1 font-bold rounded-lg transition-all", statusFilter === 'ACTIVE' ? "bg-background text-emerald-600 dark:text-emerald-400 shadow-sm" : "text-muted-foreground")}
              >
                Active
              </button>
              <button
                onClick={() => setStatusFilter('CONVERTED')}
                className={clsx("px-3 py-1 font-bold rounded-lg transition-all", statusFilter === 'CONVERTED' ? "bg-background text-blue-600 dark:text-blue-400 shadow-sm" : "text-muted-foreground")}
              >
                Billed
              </button>
            </div>
          </div>

          <button
            onClick={handleCreateNewQuotation}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Create New Quotation
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 bg-background">

        {/* QUOTATION LIST */}
        {!showDetail && (
          <div className="flex flex-col flex-1 min-h-0 bg-background">
            <div className="grid grid-cols-12 gap-2 px-6 py-2.5 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border shrink-0 bg-muted/40 select-none">
              <div className="col-span-2">QTN #</div>
              <div className="col-span-3">Customer Name</div>
              <div className="col-span-2 text-right">Amount</div>
              <div className="col-span-2 text-center">Status</div>
              <div className="col-span-2 text-right">Created Date</div>
              <div className="col-span-1 text-center">Actions</div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredQuotations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-16 select-none">
                  <FileText className="w-12 h-12 mb-3 opacity-30" />
                  <p className="font-extrabold text-foreground text-base">No quotations found</p>
                  <p className="text-xs text-muted-foreground mt-1">Click "+ Create New Quotation" to issue a quote.</p>
                </div>
              ) : Object.entries(
                filteredQuotations.reduce<Record<string, Quotation[]>>((acc, q) => {
                  const label = formatDateLabel(q.created_at);
                  if (!acc[label]) acc[label] = [];
                  acc[label].push(q);
                  return acc;
                }, {})
              ).map(([date, qs]) => (
                <div key={date}>
                  <div className="sticky top-0 z-10 bg-muted px-6 py-1.5 text-xs font-black text-primary uppercase tracking-wider border-b border-border">
                    {date}
                  </div>
                  {qs.map(q => (
                    <div key={q.quotation_id} className="grid grid-cols-12 gap-2 px-6 py-3.5 items-center bg-card border-b border-border hover:border-primary/30 hover:shadow-sm transition-all duration-150 group cursor-pointer" onClick={() => viewQuotation(q)}>
                      <div className="col-span-2 font-mono font-bold text-primary">{q.quotation_number}</div>
                      <div className="col-span-3 font-semibold text-foreground truncate">{q.customer_name || 'Walk-in Customer'}</div>
                      <div className="col-span-2 text-right font-bold text-foreground">{formatCurrency(q.grand_total)}</div>
                      <div className="col-span-2 text-center">
                        <span className={clsx(
                          'text-xs font-bold px-2.5 py-0.5 rounded-full border',
                          q.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : q.status === 'CONVERTED' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                        )}>{q.status === 'CONVERTED' ? 'BILLED' : q.status}</span>
                      </div>
                      <div className="col-span-2 text-right text-muted-foreground text-xs font-medium">{parseUTCDate(q.created_at).toLocaleDateString('en-IN', { timeZone: getStoreTimezone() })}</div>
                      <div className="col-span-1 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {q.status === 'ACTIVE' && (
                            <button
                              onClick={() => handleEditQuotation(q)}
                              className="p-1.5 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all cursor-pointer"
                              title="Edit in Billing"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteQuotation(q)}
                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all cursor-pointer"
                            title="Delete Quotation"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* QUOTATION DETAIL */}
        {showDetail && selectedQuotation && (
          <div className="max-w-4xl mx-auto p-6">
            <div ref={printRef} className="space-y-6 bg-card border border-border rounded-2xl p-8 shadow-sm">
              <div className="text-center border-b-2 border-foreground pb-4">
                <h1 className="text-3xl font-black uppercase tracking-wide text-foreground">{shopName || 'NAFID Store'}</h1>
                {shopAddress && <p className="text-xs font-semibold text-foreground/80 mt-1">{shopAddress}</p>}
                {(shopPhone || shopGstin || shopState) && (
                  <p className="text-xs font-semibold text-foreground/80 mt-0.5">
                    {[shopPhone ? `Phone: ${shopPhone}` : '', shopGstin ? `GSTIN: ${shopGstin}` : '', shopState ? `State: ${shopState}` : ''].filter(Boolean).join(' | ')}
                  </p>
                )}
                <p className="text-sm text-primary mt-2 uppercase font-extrabold tracking-widest">OFFICIAL QUOTATION</p>
              </div>

              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-foreground font-bold uppercase tracking-wider">Quotation Number</p>
                  <p className="font-mono font-bold text-lg text-primary">{selectedQuotation.quotation_number}</p>
                  <p className="text-xs font-semibold text-foreground/80 mt-1">Date: {parseUTCDate(selectedQuotation.created_at).toLocaleDateString('en-IN', { timeZone: getStoreTimezone(), day: '2-digit', month: 'long', year: 'numeric' })}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-foreground font-bold uppercase tracking-wider">Customer Details</p>
                  <p className="font-bold text-foreground text-sm">{selectedQuotation.customer_name || 'N/A'}</p>
                  {selectedQuotation.customer_phone && <p className="text-xs font-semibold text-foreground/80">{selectedQuotation.customer_phone}</p>}
                  {selectedQuotation.customer_address && <p className="text-xs font-semibold text-foreground/80">{selectedQuotation.customer_address}</p>}
                </div>
              </div>

              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted">
                    <th className="p-3 text-left text-xs font-bold uppercase text-muted-foreground border border-border">#</th>
                    <th className="p-3 text-left text-xs font-bold uppercase text-muted-foreground border border-border">Item Description</th>
                    <th className="p-3 text-center text-xs font-bold uppercase text-muted-foreground border border-border">Qty</th>
                    <th className="p-3 text-center text-xs font-bold uppercase text-muted-foreground border border-border">Weight</th>
                    <th className="p-3 text-right text-xs font-bold uppercase text-muted-foreground border border-border">Rate (₹)</th>
                    <th className="p-3 text-right text-xs font-bold uppercase text-muted-foreground border border-border">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {quotationItems.map((item, idx) => (
                    <tr key={item.item_id}>
                      <td className="p-3 border border-border text-center">{idx + 1}</td>
                      <td className="p-3 border border-border font-medium">{item.name}</td>
                      <td className="p-3 border border-border text-center">{item.quantity}</td>
                      <td className="p-3 border border-border text-center">{item.weight ? `${item.weight} KG` : '-'}</td>
                      <td className="p-3 border border-border text-right">{formatCurrency(item.rate)}</td>
                      <td className="p-3 border border-border text-right font-bold">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot style={{ display: 'table-row-group' }}>
                  <tr className="font-bold">
                    <td colSpan={5} className="p-3 border border-border text-right">Subtotal</td>
                    <td className="p-3 border border-border text-right">{formatCurrency(selectedQuotation.subtotal)}</td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="p-3 border border-border text-right text-muted-foreground">GST Tax</td>
                    <td className="p-3 border border-border text-right">{formatCurrency(selectedQuotation.tax_total)}</td>
                  </tr>
                  <tr className="font-black text-lg">
                    <td colSpan={5} className="p-3 border border-border text-right">Grand Total</td>
                    <td className="p-3 border border-border text-right text-primary">{formatCurrency(selectedQuotation.grand_total)}</td>
                  </tr>
                </tfoot>
              </table>

              {selectedQuotation.terms_conditions && (
                <div className="border-t border-border pt-4">
                  <h3 className="font-bold text-sm mb-2">Terms & Conditions</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{selectedQuotation.terms_conditions}</p>
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center pt-4 border-t border-border">
                Generated by Nafid — {new Date().toLocaleString('en-IN')}
              </p>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={handlePrint} className="px-4 py-2.5 bg-muted hover:bg-muted/80 border border-border text-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-sm">
                <Printer className="w-4 h-4" /> Print
              </button>
              <button onClick={handleExportPdf} className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-sm">
                <FileText className="w-4 h-4" /> PDF Export
              </button>
              {selectedQuotation.status === 'ACTIVE' && (
                <>
                  <button onClick={() => handleEditQuotation(selectedQuotation)} className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-sm">
                    <Pencil className="w-4 h-4" /> Edit Quote
                  </button>
                  <button onClick={() => handleConvertToInvoice(selectedQuotation)} className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-sm">
                    <CheckCircle2 className="w-4 h-4" /> Convert to Sales Invoice
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Custom Confirmation Modal */}
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

      {/* Floating Toast Notification */}
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
