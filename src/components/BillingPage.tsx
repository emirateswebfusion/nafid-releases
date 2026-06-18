import { useState, useRef, useEffect } from 'react';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import {
  Search, X, Package, Trash2, Minus, Plus, CreditCard,
  Store, LogOut, Receipt, Settings, Tag, Phone, User,
  Wallet, Banknote, Smartphone, BookOpen, AlertCircle,
  CheckCircle2, Building, TrendingUp
} from 'lucide-react';
import { useCartStore, useCartTotals } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';
import { generateReceiptText, type ReceiptData } from '../utils/receiptGenerator';
import { useTabStore } from '../store/tabStore';
import { BillingTabBar } from './BillingTabBar';

const INDIAN_STATES = [
  { code: 'MH', name: 'Maharashtra' },
  { code: 'DL', name: 'Delhi' },
  { code: 'KA', name: 'Karnataka' },
  { code: 'TN', name: 'Tamil Nadu' },
  { code: 'TS', name: 'Telangana' },
  { code: 'AP', name: 'Andhra Pradesh' },
  { code: 'GJ', name: 'Gujarat' },
  { code: 'WB', name: 'West Bengal' },
  { code: 'UP', name: 'Uttar Pradesh' },
  { code: 'HR', name: 'Haryana' },
  { code: 'KL', name: 'Kerala' },
  { code: 'MP', name: 'Madhya Pradesh' },
  { code: 'RJ', name: 'Rajasthan' },
  { code: 'PB', name: 'Punjab' },
  { code: 'BR', name: 'Bihar' },
  { code: 'OD', name: 'Odisha' },
  { code: 'AS', name: 'Assam' },
  { code: 'UT', name: 'Uttarakhand' },
  { code: 'GA', name: 'Goa' },
];

type PaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'CREDIT';

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: typeof Wallet; color: string }[] = [
  { value: 'CASH', label: 'Cash', icon: Banknote, color: 'text-emerald-500' },
  { value: 'CARD', label: 'Card', icon: Wallet, color: 'text-blue-500' },
  { value: 'UPI', label: 'UPI', icon: Smartphone, color: 'text-violet-500' },
  { value: 'CREDIT', label: 'Credit', icon: BookOpen, color: 'text-amber-500' },
];

function formatCurrency(amount: number): string {
  return `\u20B9${amount.toFixed(2)}`;
}

export function BillingPage() {
  const searchRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const {
    items, invoiceType, setInvoiceType, clearCart, setDiscount,
    currentUserRole, setRole, discountType, discountValue,
    addItem, updateQuantity, removeItem, updateWeight,
    customerState, setCustomerState, shopState
  } = useCartStore();
  const { shopName, role: authRole, tenantId, userId, logout } = useAuthStore();
  const { subtotal, cgst, sgst, igst, totalTax, discount, grandTotal, taxableAmount } = useCartTotals();

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);


  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  const receivedInputRef = useRef<HTMLInputElement>(null);
  const [shopGstin, setShopGstin] = useState('');

  const tabs = useTabStore(s => s.tabs);
  const activeTabId = useTabStore(s => s.activeTabId);
  const addTab = useTabStore(s => s.addTab);
  const updateActiveTab = useTabStore(s => s.updateActiveTab);
  const syncActiveSnapshot = useTabStore(s => s.syncActiveSnapshot);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const paymentMethod = activeTab?.paymentMethod ?? 'CASH';
  const receivedAmount = activeTab?.receivedAmount ?? 0;
  const customerName = activeTab?.customerName ?? '';
  const customerPhone = activeTab?.customerPhone ?? '';
  const customerGstin = activeTab?.customerGstin ?? '';

  const balanceAmount = receivedAmount - grandTotal;

  useEffect(() => {
    if (tabs.length === 0) {
      const { items, invoiceType, discountType, discountValue, customerState } = useCartStore.getState();
      if (items.length > 0) {
        addTab({ items, invoiceType, discountType, discountValue, customerState });
      } else {
        addTab();
      }
    }
  }, []);

  useEffect(() => {
    if (paymentMethod !== 'CASH') {
      updateActiveTab({ receivedAmount: grandTotal });
    } else if (receivedAmount === 0) {
      updateActiveTab({ receivedAmount: grandTotal });
    }
  }, [paymentMethod, grandTotal]);

  useEffect(() => {
    searchRef.current?.focus();
  }, [activeTabId]);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_gstin' }).then((v: any) => {
      if (v) setShopGstin(v);
    });
  }, [tenantId]);

  const [showPastBill, setShowPastBill] = useState(false);
  const [pastBillSearch, setPastBillSearch] = useState('');
  const [foundInvoices, setFoundInvoices] = useState<any[]>([]);
  const [selectedPastInvoiceId, setSelectedPastInvoiceId] = useState<string | null>(null);
  const [selectedPastInvoice, setSelectedPastInvoice] = useState<any | null>(null);
  const [pastInvoiceItems, setPastInvoiceItems] = useState<any[]>([]);
  const [isSavingPastBill, setIsSavingPastBill] = useState(false);
  const [pastBillSuccess, setPastBillSuccess] = useState<string | null>(null);
  const [tempDiscountValue, setTempDiscountValue] = useState(0);
  const [tempDiscountType, setTempDiscountType] = useState<'FIXED' | 'PERCENTAGE'>('FIXED');
  const [editMode, setEditMode] = useState(false);
  const [editedItems, setEditedItems] = useState<any[]>([]);
  const [pastBillView, setPastBillView] = useState<'search' | 'detail'>('search');



  useEffect(() => {
    if (searchQuery.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      if (!window.electronAPI) return;
      const { tenantId } = useAuthStore.getState();
      const products = await window.electronAPI.dbGetProducts({ tenant_id: tenantId, search: searchQuery, limit: 8 });
      if (Array.isArray(products)) { setResults(products); setSelectedIndex(0); }
    }, 150);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) setResults([]);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const productId = e.detail?.product_id;
      if (productId) {
        setTimeout(() => {
          const input = qtyRefs.current[productId];
          if (input) { input.focus(); input.select(); }
        }, 0);
      }
    };
    window.addEventListener('product-added', handler as EventListener);
    return () => window.removeEventListener('product-added', handler as EventListener);
  }, []);

  useEffect(() => {
    const search = localStorage.getItem('pastBillSearch');
    if (search) {
      setPastBillSearch(search);
      setShowPastBill(true);
      localStorage.removeItem('pastBillSearch');
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      const search = localStorage.getItem('pastBillSearch');
      if (search) {
        setPastBillSearch(search);
        setShowPastBill(true);
        localStorage.removeItem('pastBillSearch');
      }
    };
    window.addEventListener('open-past-bill', handler);
    return () => window.removeEventListener('open-past-bill', handler);
  }, []);

  // Listen for Edit Bill from Sales History — loads items directly into cart
  useEffect(() => {
    const handler = () => {
      const raw = localStorage.getItem('editBillData');
      if (!raw) return;
      localStorage.removeItem('editBillData');

      try {
        const { invoice, items: invoiceItems } = JSON.parse(raw);
        if (!invoiceItems?.length) return;

        // Clear current cart and load items
        clearCart();

        // Set invoice type
        if (invoice.invoice_type === 'GST' || invoice.invoice_type === 'BILL_OF_SUPPLY') {
          setInvoiceType(invoice.invoice_type);
        }

        // Set discount
        if (Number(invoice.discount_value) > 0) {
          setDiscount(Number(invoice.discount_value), invoice.discount_type || 'FIXED');
        }

        // Add each item to cart
        invoiceItems.forEach((item: any) => {
          const productId = item.product_id || item.item_id || `edit-${Date.now()}-${Math.random()}`;
          addItem({
            product_id: productId,
            name: item.name || 'Product',
            base_price: Number(item.unit_price) || 0,
            purchase_price: Number(item.purchase_price) || 0,
            tax_rate_percent: Number(item.tax_rate_percent) || 0,
            billing_type: item.billing_type,
            pricing_mode: item.pricing_mode,
            grade_id: item.grade_id,
            grade_rate: item.grade_rate,
            average_weight_per_piece: item.average_weight_per_piece,
            weight_override_allowed: item.weight_override_allowed,
          });
          // Set the quantity
          const qty = Number(item.quantity) || 1;
          if (qty > 0) {
            updateQuantity(productId, qty);
          }
          // Set weight for weight-based items
          if (item.billing_type === 'WEIGHT' && Number(item.calculated_weight) > 0) {
            updateWeight(productId, Number(item.calculated_weight));
          }
        });

        // Set customer info
        updateActiveTab({
          customerName: invoice.customer_name || '',
          customerPhone: invoice.customer_phone || '',
          customerGstin: invoice.customer_gstin || '',
          paymentMethod: invoice.payment_method || 'CASH',
          receivedAmount: Number(invoice.received_amount) || 0,
        });

        // Sync tab snapshot so items persist across tab switches
        syncActiveSnapshot();
      } catch (e) {
        console.error('Failed to load edit bill data', e);
      }
    };

    window.addEventListener('open-edit-bill', handler);
    return () => window.removeEventListener('open-edit-bill', handler);
  }, []);

  useEffect(() => {
    if (showPastBill && pastBillSearch) {
      const timer = setTimeout(() => handleSearchPast(), 100);
      return () => clearTimeout(timer);
    }
  }, [showPastBill, pastBillSearch]);

  const handleSelectProduct = (product: any) => {
    addItem({
      product_id: product.product_id,
      name: product.name,
      base_price: product.base_price,
      purchase_price: product.purchase_price ?? 0,
      tax_rate_percent: product.tax_rate_percent ?? 0,
      billing_type: product.billing_type,
      grade_id: product.grade_id,
      pricing_mode: product.pricing_mode,
      average_weight_per_piece: product.average_weight_per_piece,
      weight_override_allowed: product.weight_override_allowed === 1 || product.weight_override_allowed === true,
      grade_rate: product.grade_rate,
    });
    setSearchQuery('');
    setResults([]);
    setTimeout(() => {
      const input = qtyRefs.current[product.product_id];
      if (input) { input.focus(); input.select(); }
    }, 0);
  };

  const handleSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { setSelectedIndex(i => Math.min(i + 1, results.length - 1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setSelectedIndex(i => Math.max(i - 1, 0)); e.preventDefault(); }
    else if (e.key === 'Enter') { if (results[selectedIndex]) handleSelectProduct(results[selectedIndex]); }
    else if (e.key === 'Escape') { setResults([]); setSearchQuery(''); }
  };

  const handleCheckout = async () => {
    if (grandTotal === 0 || items.length === 0) return;
    if (!window.electronAPI) return;
    if (paymentMethod === 'CREDIT' && (!customerName.trim() || !customerPhone.trim())) {
      setHardwareError('Customer name and phone are required for Credit');
      return;
    }

    const invoice_id = uuidv4();
    // Generate invoice number from counter, fallback to timestamp-based
    let invoice_number = `INV-${Date.now()}-${invoice_id.substring(0, 4).toUpperCase()}`;
    try {
      if (window.electronAPI) {
        const { tenantId } = useAuthStore.getState();
        const result = await window.electronAPI.dbGetNextInvoiceNumber({ tenant_id: tenantId || 'global' });
        if (result.success && result.invoiceNumber) {
          invoice_number = result.invoiceNumber;
        }
      }
    } catch (e) {
      console.error('Failed to generate invoice number from counter, using fallback', e);
    }

    const lineItems = items.map(item => {
      const rate = item.pricing_mode === 'GRADE_RATE' ? item.base_price + (item.grade_rate || 0) : item.base_price;
      const qty = Number(item.quantity) || 0;
      const total = item.billing_type === 'WEIGHT' ? rate * (item.calculated_weight || 0) : rate * qty;
      const unitPrice = qty > 0 ? total / qty : rate;
      return { item_id: uuidv4(), product_id: item.product_id, name: item.name, quantity: qty, unit_price: unitPrice, tax_amount: invoiceType === 'GST' ? total * (item.tax_rate_percent / 100) : 0, total };
    });

    setIsCheckingOut(true);
    setHardwareError(null);

    try {
      const cfg = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
      const width = cfg?.receiptWidthCm ? Number(cfg.receiptWidthCm) : 5.8;

      const state = useCartStore.getState();
      const receiptData: ReceiptData = {
        shopName: shopName || 'My Shop', shopGstin: invoiceType === 'GST' ? shopGstin || undefined : undefined,
        shopState: invoiceType === 'GST' ? state.shopState || undefined : undefined,
        invoiceNumber: invoice_number, date: new Date().toLocaleString(),
        cashierName: useAuthStore.getState().role || undefined,
        items: lineItems.map(i => ({ name: i.name, quantity: i.quantity, unit_price: i.unit_price, total: i.total })),
        subtotal, tax: totalTax,
        cgst: invoiceType === 'GST' ? cgst : undefined,
        sgst: invoiceType === 'GST' ? sgst : undefined,
        igst: invoiceType === 'GST' ? igst : undefined,
        discount, discountType: state.discountType,
        discountValue: state.discountValue, grandTotal,
        receivedAmount, balanceAmount, invoiceType,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerGstin: invoiceType === 'GST' ? customerGstin || undefined : undefined,
        customerState: invoiceType === 'GST' ? customerState || undefined : undefined,
      };

      const printResult = await window.electronAPI.printReceipt(tenantId || 'global', generateReceiptText(receiptData, width));
      if (!printResult.success) {
        setHardwareError(`Printing issue: ${printResult.error || 'check printer'}`);
        setIsCheckingOut(false); return;
      }

      await window.electronAPI.openCashDrawer(tenantId || 'global');

      const result = await window.electronAPI.dbCheckout({
        invoice_id, tenant_id: tenantId || 'unset', user_id: userId || 'unset', invoice_number,
        invoice_type: invoiceType, subtotal, tax_total: totalTax, discount_total: discount,
        discount_type: useCartStore.getState().discountType, discount_value: useCartStore.getState().discountValue,
        grand_total: grandTotal, payment_method: paymentMethod,
        received_amount: receivedAmount, balance_amount: balanceAmount,
        customer_name: customerName || null, customer_phone: customerPhone || null,
        customer_gstin: invoiceType === 'GST' ? customerGstin || null : null,
        customer_state: invoiceType === 'GST' ? customerState || null : null,
        items: lineItems,
      });
      if (!result.success) { setHardwareError(`Checkout failed: ${result.error}`); setIsCheckingOut(false); return; }
    } catch {
      setHardwareError('Hardware communication error.'); setIsCheckingOut(false); return;
    }

    setCheckoutSuccess(true);
    setIsCheckingOut(false);
    setTimeout(() => { clearCart(); updateActiveTab({ customerName: '', customerPhone: '', customerGstin: '', paymentMethod: 'CASH', receivedAmount: 0 }); syncActiveSnapshot(); setCheckoutSuccess(false); }, 1800);
  };

  const handleHoldBill = () => {
    if (items.length === 0) return;
    const bill = { id: uuidv4(), heldAt: new Date().toISOString(), items, invoiceType, discountType, discountValue, customerName, customerPhone, paymentMethod, customerGstin };
    const stored = JSON.parse(localStorage.getItem('vendora-held-bills') || '[]');
    stored.push(bill);
    localStorage.setItem('vendora-held-bills', JSON.stringify(stored));
    clearCart(); updateActiveTab({ customerName: '', customerPhone: '', customerGstin: '' }); syncActiveSnapshot();
  };

  const handleSearchPast = async () => {
    if (!window.electronAPI || !pastBillSearch) return;
    setPastBillSuccess(null);
    setPastBillView('search');
    const res = await window.electronAPI.dbGetInvoices({ tenant_id: tenantId || 'global', search: pastBillSearch });
    setFoundInvoices(Array.isArray(res) ? res : []);
    if (Array.isArray(res) && res.length === 1) {
      setSelectedPastInvoiceId(res[0].invoice_id);
    } else {
      setSelectedPastInvoiceId(null);
    }
  };

  const handleSelectPastInvoice = async (inv: any) => {
    setSelectedPastInvoice(inv);
    setSelectedPastInvoiceId(inv.invoice_id);
    setPastBillView('detail');
    setEditMode(false);
    setPastBillSuccess(null);
    setTempDiscountValue(inv.discount_value || 0);
    setTempDiscountType(inv.discount_type || 'FIXED');
    if (window.electronAPI) {
      const data = await window.electronAPI.dbGetInvoiceItems(inv.invoice_id);
      const items = Array.isArray(data) ? data : [];
      setPastInvoiceItems(items);
      setEditedItems(items.map((item: any) => ({ ...item })));
    }
  };

  const handleEditItem = (index: number, field: string, value: any) => {
    setEditedItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        const qty = field === 'quantity' ? Number(value) : Number(updated[index].quantity);
        const price = field === 'unit_price' ? Number(value) : Number(updated[index].unit_price);
        updated[index].total = qty * price;
      }
      return updated;
    });
  };

  const handleRemoveEditItem = (index: number) => {
    setEditedItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSavePastBill = async () => {
    if (!window.electronAPI || !selectedPastInvoice || !authRole) return;
    setIsSavingPastBill(true);
    setPastBillSuccess(null);
    try {
      const newSubtotal = editedItems.reduce((sum, item) => sum + item.total, 0);
      const newTaxTotal = editedItems.reduce((sum, item) => sum + (item.tax_amount || 0), 0);
      let newDiscountTotal = 0;
      if (tempDiscountType === 'PERCENTAGE') {
        newDiscountTotal = newSubtotal * (tempDiscountValue / 100);
      } else {
        newDiscountTotal = tempDiscountValue;
      }
      const newGrandTotal = newSubtotal + newTaxTotal - newDiscountTotal;

      const r = await window.electronAPI.dbUpdateInvoice({
        invoice_id: selectedPastInvoice.invoice_id,
        tenant_id: tenantId || 'global',
        role: authRole,
        subtotal: newSubtotal,
        tax_total: newTaxTotal,
        discount_total: newDiscountTotal,
        discount_type: tempDiscountType,
        discount_value: tempDiscountValue,
        grand_total: newGrandTotal,
        payment_method: selectedPastInvoice.payment_method || 'CASH',
        customer_name: selectedPastInvoice.customer_name,
        customer_phone: selectedPastInvoice.customer_phone,
        customer_gstin: selectedPastInvoice.customer_gstin,
        customer_state: selectedPastInvoice.customer_state,
        items: editedItems.map(item => ({
          item_id: item.item_id,
          product_id: item.product_id,
          name: item.name,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          tax_amount: Number(item.tax_amount || 0),
          total: Number(item.total),
        })),
      });
      if (r.success) {
        setPastBillSuccess('Bill updated successfully!');
        setEditMode(false);
      } else {
        alert('Failed: ' + r.error);
      }
    } catch {
      alert('Failed to save bill');
    } finally {
      setIsSavingPastBill(false);
    }
  };

  const handleApplyPastDiscount = async () => {
    if (!window.electronAPI || !selectedPastInvoiceId || !authRole) return;
    setIsSavingPastBill(true);
    setPastBillSuccess(null);
    try {
      const r = await window.electronAPI.dbApplyInvoiceDiscount({
        invoice_id: selectedPastInvoiceId,
        discount_type: tempDiscountType,
        discount_value: tempDiscountValue,
        role: authRole,
      });
      if (r.success) {
        setPastBillSuccess('Discount applied successfully!');
        if (selectedPastInvoice) {
          setSelectedPastInvoice({ ...selectedPastInvoice, discount_type: tempDiscountType, discount_value: tempDiscountValue });
        }
      } else {
        alert('Failed: ' + r.error);
      }
    } catch {
      alert('Failed to apply discount');
    } finally {
      setIsSavingPastBill(false);
    }
  };

  useKeyboardShortcuts({
    'F2': () => searchRef.current?.focus(),
    'F8': () => discountRef.current?.focus(),
    'F12': handleCheckout,
  });

  const emptyIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* ─── TOP BAR ─── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Store className="w-5 h-5" />
          </div>
          <div className="min-w-0 leading-tight">
            <span className="text-sm font-bold text-foreground truncate block">{shopName || 'Shop'}</span>
            {currentUserRole !== authRole && <span className="text-[10px] text-muted-foreground font-mono">{currentUserRole}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {items.length > 0 && (
            <button onClick={clearCart} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 rounded-lg transition-colors" title="Clear all items">
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
          <button onClick={() => window.dispatchEvent(new CustomEvent('open-sales-history'))}
            className="flex items-center gap-1.5 px-3 py-2 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors" title="Sales History">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs font-semibold">Sales</span>
          </button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('open-settings-manager'))}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors" title="Settings">
            <Settings className="w-4 h-4" />
          </button>
          {authRole === 'OWNER' ? (
            <button onClick={() => setRole('OWNER')}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors" title="Back to dashboard">
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={logout}
              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* ─── TAB BAR ─── */}
      <BillingTabBar />

      {/* ─── MAIN ─── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ═══ LEFT: Search + Cart ═══ */}
        <div className="flex flex-col w-[60%] border-r border-border">
          {/* Search */}
          <div className="p-4 pb-2">
            <div ref={searchContainerRef} className="relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input ref={searchRef} type="text" autoFocus
                    placeholder="Search product or scan barcode..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKey}
                    className="w-full pl-10 pr-10 py-3 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                  {searchQuery && (
                    <button onClick={() => { setSearchQuery(''); setResults([]); searchRef.current?.focus(); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full text-muted-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button onClick={() => setShowPastBill(true)}
                  className="px-3 py-3 bg-muted/40 border border-border rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all flex items-center gap-1.5 whitespace-nowrap">
                  <Receipt className="w-3.5 h-3.5" />
                  Past Bill
                </button>
              </div>

              {results.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1">
                  {results.map((p, i) => {
                    const price = p.pricing_mode === 'GRADE_RATE' ? p.base_price + (p.grade_rate || 0) : p.base_price;
                    return (
                      <button key={p.product_id} onClick={() => handleSelectProduct(p)}
                        onMouseEnter={() => setSelectedIndex(i)}
                        className={clsx('w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-border/50 last:border-0',
                          i === selectedIndex ? 'bg-primary/10' : 'hover:bg-muted')}>
                        <div className={clsx('p-2 rounded-lg shrink-0', i === selectedIndex ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground')}>
                          <Package className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-foreground truncate">{p.name}</div>
                          <div className="text-[11px] text-muted-foreground">{p.sku_barcode || '—'} &middot; Stock: {p.current_stock}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-sm text-foreground">{formatCurrency(price)}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Cart header */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Cart {items.length > 0 && `(${items.length})`}
            </span>
            {items.length > 0 && (
              <span className="text-xs text-muted-foreground">{formatCurrency(subtotal)}</span>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-2">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground/60">
                  {emptyIcon}
                </div>
                <p className="font-medium text-sm">Cart is empty</p>
                <p className="text-xs text-muted-foreground/60">Search products or scan a barcode</p>
              </div>
            ) : (
              items.map(item => {
                const rate = item.pricing_mode === 'GRADE_RATE' ? item.base_price + (item.grade_rate || 0) : item.base_price;
                const total = item.billing_type === 'WEIGHT'
                  ? rate * (item.calculated_weight || 0)
                  : rate * (Number(item.quantity) || 0);

                return (
                  <div key={item.product_id}
                    className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-xl transition-all hover:border-primary/20 group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-foreground truncate">{item.name}</span>
                        {item.billing_type === 'WEIGHT' && <span className="text-[9px] font-mono text-muted-foreground bg-muted px-1 rounded">kg</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button onClick={() => { const q = Number(item.quantity); if (q > 1) updateQuantity(item.product_id, q - 1); else removeItem(item.product_id); }}
                        className="p-1.5 rounded-lg bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input type="number" min="1"
                        ref={(el) => { qtyRefs.current[item.product_id] = el; }}
                        className="w-14 text-center h-9 bg-muted/30 border border-border rounded-lg text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={item.quantity}
                        onChange={e => updateQuantity(item.product_id, e.target.value === '' ? '' : Number(e.target.value))} />
                      <button onClick={() => updateQuantity(item.product_id, (Number(item.quantity) || 0) + 1)}
                        className="p-1.5 rounded-lg bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {item.billing_type === 'WEIGHT' && (
                      <div className="flex items-center gap-1.5">
                        <input type="number" step="0.001"
                          className={clsx('w-16 text-center h-9 bg-muted/30 border border-border rounded-lg text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                            !item.weight_override_allowed && 'opacity-50 cursor-not-allowed')}
                          value={item.calculated_weight || ''}
                          disabled={!item.weight_override_allowed}
                          onChange={e => { if (item.weight_override_allowed) updateWeight(item.product_id, e.target.value === '' ? 0 : Number(e.target.value)); }} />
                        <span className="text-[9px] text-muted-foreground font-bold uppercase">Kg</span>
                      </div>
                    )}

                    <div className="text-right min-w-[76px]">
                      <div className="font-bold text-sm text-primary">{formatCurrency(total)}</div>
                    </div>

                    <button onClick={() => removeItem(item.product_id)}
                      className="p-1.5 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ═══ RIGHT: Summary + Checkout ═══ */}
        <div className="flex flex-col w-[40%] bg-card">
          {/* Invoice type + Customer */}
          <div className="px-5 pt-2.5 pb-2 space-y-2 border-b border-border">
            <div className="flex bg-muted/60 p-0.5 rounded-lg">
              <button onClick={() => setInvoiceType('BILL_OF_SUPPLY')}
                className={clsx('flex-1 py-2 rounded-lg text-sm font-semibold transition-all',
                  invoiceType === 'BILL_OF_SUPPLY' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                Bill of Supply
              </button>
              <button onClick={() => setInvoiceType('GST')}
                className={clsx('flex-1 py-2 rounded-lg text-sm font-semibold transition-all',
                  invoiceType === 'GST' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                GST Invoice
              </button>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                    <input placeholder={paymentMethod === 'CREDIT' ? 'Customer name *' : 'Customer name'} value={customerName} onChange={e => updateActiveTab({ customerName: e.target.value })}
                  className={clsx("w-full pl-8 pr-2.5 py-2 bg-muted/20 border rounded-lg text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all", paymentMethod === 'CREDIT' ? 'border-amber-400' : 'border-border')} />
              </div>
              <div className="relative flex-1">
                <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                    <input placeholder={paymentMethod === 'CREDIT' ? 'Phone *' : 'Phone'} value={customerPhone} onChange={e => updateActiveTab({ customerPhone: e.target.value })}
                  className={clsx("w-full pl-8 pr-2.5 py-2 bg-muted/20 border rounded-lg text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all", paymentMethod === 'CREDIT' ? 'border-amber-400' : 'border-border')} />
              </div>
            </div>
            {invoiceType === 'GST' && (
              <div className="flex gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="relative flex-1">
                  <Building className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                  <input placeholder="Customer GSTIN" value={customerGstin} onChange={e => updateActiveTab({ customerGstin: e.target.value.toUpperCase() })} maxLength={15}
                    className="w-full pl-8 pr-2.5 py-2 bg-muted/20 border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all uppercase" />
                </div>
                <div className="relative flex-1">
                  <select 
                    value={customerState} 
                    onChange={e => setCustomerState(e.target.value)}
                    className="w-full pl-3 pr-8 py-2 bg-muted/20 border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none cursor-pointer"
                  >
                    {INDIAN_STATES.map(state => (
                      <option key={state.code} value={state.code} className="bg-card text-foreground">
                        {state.name} ({state.code})
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground/50">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            )}
            {invoiceType === 'GST' && shopGstin && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-primary/5 border border-primary/10 rounded-lg animate-in fade-in slide-in-from-top-1 duration-200">
                <Building className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-[11px] font-medium text-foreground/80">
                  Shop GSTIN: <span className="font-bold text-primary">{shopGstin}</span>
                </span>
                <span className="text-[11px] text-muted-foreground ml-auto">
                  {shopState} {customerState && shopState !== customerState ? '→ ' + customerState : ''}
                </span>
              </div>
            )}
          </div>

          {/* Spacer to push checkout section to the bottom */}
          <div className="flex-1" />

          {/* Totals */}
          <div className="px-5 pt-2 pb-0 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-semibold text-foreground">{formatCurrency(subtotal)}</span>
            </div>

            {invoiceType === 'GST' && totalTax > 0 && (
              <div className="pl-3 space-y-1">
                {igst > 0 ? (
                  <div className="flex justify-between text-xs text-muted-foreground"><span>IGST</span><span>{formatCurrency(igst)}</span></div>
                ) : (
                  <>
                    <div className="flex justify-between text-xs text-muted-foreground"><span>CGST</span><span>{formatCurrency(cgst)}</span></div>
                    <div className="flex justify-between text-xs text-muted-foreground"><span>SGST</span><span>{formatCurrency(sgst)}</span></div>
                  </>
                )}
              </div>
            )}

            {/* Discount Section */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground">Discount</span>
                <div className="flex items-center gap-2">
                  {discount > 0 && (
                    <span className="text-xs font-bold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full shrink-0 animate-in fade-in">
                      -{formatCurrency(discount)}
                    </span>
                  )}
                  <div className="flex items-center bg-muted/50 border border-border rounded-xl p-1 shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
                    <div className="flex bg-background/50 p-0.5 rounded-lg border border-border/40 mr-1.5">
                      <button 
                        onClick={() => setDiscount(discountValue || 0, 'FIXED')}
                        className={clsx(
                          'px-2 py-0.5 text-[10px] font-bold rounded transition-all duration-200 cursor-pointer',
                          discountType === 'FIXED' 
                            ? 'bg-primary text-primary-foreground shadow-sm' 
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        ₹
                      </button>
                      <button 
                        onClick={() => setDiscount(discountValue || 0, 'PERCENTAGE')}
                        className={clsx(
                          'px-2 py-0.5 text-[10px] font-bold rounded transition-all duration-200 cursor-pointer',
                          discountType === 'PERCENTAGE' 
                            ? 'bg-primary text-primary-foreground shadow-sm' 
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        %
                      </button>
                    </div>
                    <input 
                      ref={discountRef} 
                      type="number" 
                      min="0" 
                      max={discountType === 'PERCENTAGE' ? '100' : undefined}
                      value={discountValue || ''}
                      onChange={e => setDiscount(e.target.value === '' ? 0 : Number(e.target.value), discountType)}
                      placeholder="0" 
                      inputMode="decimal"
                      className="w-16 h-7 bg-transparent border-0 text-xs text-right pr-1 text-foreground placeholder:text-muted-foreground/45 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none font-bold" 
                    />
                  </div>
                </div>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-[11px] text-muted-foreground/80 pl-1 animate-in fade-in">
                  <span>Taxable Value</span>
                  <span className="font-medium text-foreground/80">{formatCurrency(taxableAmount)}</span>
                </div>
              )}
            </div>

            {/* Payment */}
            <div className={clsx("grid grid-cols-4 gap-1 pt-1.5 border-t border-border", paymentMethod !== 'CARD' && paymentMethod !== 'UPI' && 'mb-1.5')}>
              {PAYMENT_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => updateActiveTab({ paymentMethod: opt.value })}
                  className={clsx(
                    'flex flex-col items-center gap-0.5 py-2 rounded-lg border text-[10px] font-medium transition-all',
                    paymentMethod === opt.value
                      ? 'bg-primary/10 text-primary border-primary/40'
                      : 'text-muted-foreground border-border/60 hover:bg-muted/40 hover:text-foreground'
                  )}>
                  <opt.icon className={clsx('w-4 h-4', paymentMethod === opt.value ? '' : 'opacity-50')} />
                  {opt.label}
                </button>
              ))}
            </div>
            </div>

            {paymentMethod !== 'CARD' && paymentMethod !== 'UPI' && (
              <div className="px-5 pt-2 pb-1 space-y-1.5 border-t border-border animate-in fade-in">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Received</span>
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground/60 pointer-events-none">₹</span>
                    <input ref={receivedInputRef} type="number" min="0" step="any"
                      value={receivedAmount || ''}
                      onChange={e => updateActiveTab({ receivedAmount: e.target.value === '' ? 0 : Number(e.target.value) })}
                      onFocus={e => e.target.select()}
                      placeholder="0.00"
                      inputMode="decimal"
                      className="w-full pl-6 pr-2.5 py-1.5 bg-muted/20 border border-border rounded-lg text-sm font-bold text-right text-foreground placeholder:text-muted-foreground/45 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-medium text-muted-foreground">{paymentMethod === 'CREDIT' ? 'Balance' : 'Change'}</span>
                  <span className={clsx('text-sm font-bold', balanceAmount >= 0 ? 'text-emerald-500' : 'text-destructive')}>
                    {balanceAmount >= 0 ? '+' : ''}{formatCurrency(balanceAmount)}
                  </span>
                </div>
              </div>
            )}

          {/* Grand Total */}
          <div className="px-5 pt-2 pb-1.5 border-t border-border bg-muted/10 mt-2">
            <div className="flex items-end justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total</span>
              <span className="text-3xl font-black text-foreground tracking-tight">{formatCurrency(grandTotal)}</span>
            </div>
          </div>

          {/* Messages */}
          <div className="px-5 py-1 space-y-1">
            {hardwareError && (
              <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive text-xs font-medium animate-in fade-in slide-in-from-top-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1">{hardwareError}</span>
                <button onClick={() => setHardwareError(null)} className="hover:bg-destructive/20 p-0.5 rounded"><X className="w-3 h-3" /></button>
              </div>
            )}
            {checkoutSuccess && (
              <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2 text-emerald-500 text-xs font-medium animate-in fade-in slide-in-from-top-1">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Bill printed successfully!</span>
              </div>
            )}
          </div>

          {/* ─── Actions ─── */}
          <div className="px-5 pb-5 flex gap-2">
            <button onClick={handleHoldBill} disabled={items.length === 0}
              className="w-1/4 py-4 rounded-2xl border-2 border-border text-muted-foreground font-semibold text-sm hover:bg-muted hover:border-muted-foreground/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.97]">
              Hold
            </button>
            <button onClick={handleCheckout} disabled={isCheckingOut || items.length === 0}
              className="flex-1 py-4 flex items-center justify-center gap-2.5 rounded-2xl bg-primary text-primary-foreground font-bold text-base shadow-lg hover:bg-primary/90 transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed">
              {isCheckingOut ? (
                <><div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> PROCESSING</>
              ) : (
                <><CreditCard className="w-5 h-5" /> Print {formatCurrency(grandTotal)}</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Past Bill Modal ─── */}
      <Modal isOpen={showPastBill} onClose={() => { setShowPastBill(false); setPastBillSuccess(null); setPastBillView('search'); }}
        title={<div className="flex items-center gap-2"><Receipt className="w-5 h-5 text-primary" /><span>Past Bill</span></div>}>
        <div className="space-y-4 min-w-[520px]">
          {pastBillSuccess && pastBillView === 'search' ? (
            <div className="p-6 bg-primary/5 text-primary border border-primary/20 rounded-xl text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 mx-auto opacity-80" />
              <p className="font-semibold">{pastBillSuccess}</p>
              <Button variant="outline" onClick={() => { setShowPastBill(false); setPastBillSuccess(null); setPastBillView('search'); }}>Close</Button>
            </div>
          ) : pastBillView === 'detail' && selectedPastInvoice ? (
            <div className="space-y-4">
              {/* Back button */}
              <button onClick={() => { setPastBillView('search'); setEditMode(false); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                ← Back to search
              </button>

              {/* Invoice header */}
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">{selectedPastInvoice.invoice_number}</h3>
                  <p className="text-xs text-muted-foreground">{new Date(selectedPastInvoice.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-primary">{formatCurrency(selectedPastInvoice.grand_total)}</div>
                </div>
              </div>

              {/* Customer info */}
              {(selectedPastInvoice.customer_name || selectedPastInvoice.customer_phone) && (
                <div className="flex gap-4 p-3 bg-muted/30 rounded-lg text-xs">
                  {selectedPastInvoice.customer_name && (
                    <div><span className="text-muted-foreground">Customer: </span><span className="font-medium">{selectedPastInvoice.customer_name}</span></div>
                  )}
                  {selectedPastInvoice.customer_phone && (
                    <div><span className="text-muted-foreground">Phone: </span><span className="font-medium">{selectedPastInvoice.customer_phone}</span></div>
                  )}
                </div>
              )}

              {/* Items list */}
              <div className="space-y-2 max-h-64 overflow-y-auto border border-border rounded-xl p-2">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border">
                  <div className="col-span-5">Item</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-2 text-right">Rate</div>
                  <div className="col-span-2 text-right">Total</div>
                  {editMode && <div className="col-span-1" />}
                </div>
                {(editMode ? editedItems : pastInvoiceItems).map((item, index) => (
                  <div key={item.item_id || index} className="grid grid-cols-12 gap-2 px-3 py-2 items-center text-sm">
                    <div className="col-span-5 font-medium truncate">{item.name}</div>
                    {editMode ? (
                      <>
                        <div className="col-span-2">
                          <input type="number" min="0" step="any"
                            className="w-full text-center h-8 bg-muted/30 border border-border rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={item.quantity}
                            onChange={e => handleEditItem(index, 'quantity', e.target.value === '' ? 0 : Number(e.target.value))} />
                        </div>
                        <div className="col-span-2">
                          <input type="number" min="0" step="any"
                            className="w-full text-right h-8 bg-muted/30 border border-border rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={item.unit_price}
                            onChange={e => handleEditItem(index, 'unit_price', e.target.value === '' ? 0 : Number(e.target.value))} />
                        </div>
                        <div className="col-span-2 text-right font-bold">{formatCurrency(item.total)}</div>
                        <div className="col-span-1 text-right">
                          <button onClick={() => handleRemoveEditItem(index)}
                            className="p-1 text-muted-foreground hover:text-destructive">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="col-span-2 text-center text-muted-foreground">{item.quantity}</div>
                        <div className="col-span-2 text-right text-muted-foreground">{formatCurrency(item.unit_price)}</div>
                        <div className="col-span-2 text-right font-bold">{formatCurrency(item.total)}</div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCurrency(editMode ? editedItems.reduce((s, i) => s + i.total, 0) : selectedPastInvoice.subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span>{formatCurrency(editMode ? editedItems.reduce((s, i) => s + (i.tax_amount || 0), 0) : selectedPastInvoice.tax_total)}</span>
                </div>
                {selectedPastInvoice.discount_total > 0 && !editMode && (
                  <div className="flex justify-between text-destructive">
                    <span>Discount {selectedPastInvoice.discount_type === 'PERCENTAGE' && selectedPastInvoice.discount_value ? `(${selectedPastInvoice.discount_value}%)` : ''}</span>
                    <span>-{formatCurrency(selectedPastInvoice.discount_total)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg pt-2 border-t border-border">
                  <span>Grand Total</span>
                  <span className="text-primary">
                    {formatCurrency(
                      editMode
                        ? (editedItems.reduce((s, i) => s + i.total, 0) + editedItems.reduce((s, i) => s + (i.tax_amount || 0), 0) - 
                          (tempDiscountType === 'PERCENTAGE' 
                            ? editedItems.reduce((s, i) => s + i.total, 0) * (tempDiscountValue / 100)
                            : tempDiscountValue))
                        : selectedPastInvoice.grand_total
                    )}
                  </span>
                </div>
              </div>

              {/* Admin controls */}
              {authRole === 'OWNER' && (
                <div className="space-y-3 pt-2 border-t border-border">
                  {/* Discount controls */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase">Apply Discount</div>
                    <div className="flex gap-2 p-1 bg-muted rounded-lg">
                      <button onClick={() => setTempDiscountType('FIXED')}
                        className={clsx('flex-1 py-2 rounded-md font-semibold text-sm transition-all', tempDiscountType === 'FIXED' ? 'bg-background shadow text-foreground' : 'text-muted-foreground')}>Fixed (₹)</button>
                      <button onClick={() => setTempDiscountType('PERCENTAGE')}
                        className={clsx('flex-1 py-2 rounded-md font-semibold text-sm transition-all', tempDiscountType === 'PERCENTAGE' ? 'bg-background shadow text-foreground' : 'text-muted-foreground')}>Percent (%)</button>
                    </div>
                    <Input type="number" min="0" max={tempDiscountType === 'PERCENTAGE' ? '100' : undefined}
                      value={tempDiscountValue || ''} onChange={e => setTempDiscountValue(Number(e.target.value))}
                      placeholder={tempDiscountType === 'PERCENTAGE' ? 'Enter %' : 'Enter amount'} />
                  </div>

                  <div className="flex gap-2">
                    {!editMode ? (
                      <>
                        <Button variant="outline" onClick={() => setEditMode(true)} className="flex-1">
                          <Tag className="w-4 h-4" /> Edit Items
                        </Button>
                        <Button onClick={handleApplyPastDiscount} disabled={isSavingPastBill} className="flex-1">
                          {isSavingPastBill ? 'Applying...' : 'Apply Discount'}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" onClick={() => { setEditMode(false); setEditedItems(pastInvoiceItems.map((i: any) => ({ ...i }))); }} className="flex-1">
                          Cancel
                        </Button>
                        <Button onClick={handleSavePastBill} disabled={isSavingPastBill} className="flex-1">
                          {isSavingPastBill ? 'Saving...' : 'Save Changes'}
                        </Button>
                      </>
                    )}
                  </div>

                  {pastBillSuccess && (
                    <div className="p-3 bg-primary/5 text-primary border border-primary/20 rounded-lg text-center text-sm font-semibold animate-in fade-in">
                      <CheckCircle2 className="w-5 h-5 inline mr-1" />
                      {pastBillSuccess}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => { setShowPastBill(false); setPastBillSuccess(null); setPastBillView('search'); }}>Close</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Input placeholder="Search by invoice number or customer..."
                  value={pastBillSearch}
                  onChange={e => setPastBillSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearchPast(); } }} />
                <Button onClick={handleSearchPast}>Search</Button>
              </div>
              {foundInvoices.length > 0 && (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {foundInvoices.map(inv => (
                    <div key={inv.invoice_id} onClick={() => handleSelectPastInvoice(inv)}
                      className={clsx('p-3 border rounded-lg cursor-pointer flex justify-between items-center transition-colors text-sm hover:bg-muted/50',
                        selectedPastInvoiceId === inv.invoice_id ? 'border-primary bg-primary/5' : 'border-border')}>
                      <div>
                        <div className="font-medium">{inv.invoice_number}</div>
                        <div className="text-[11px] text-muted-foreground">{new Date(inv.created_at).toLocaleString()}</div>
                        {inv.discount_total > 0 && (
                          <div className="text-[10px] text-destructive font-medium">Discounted (-{formatCurrency(inv.discount_total)})</div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{formatCurrency(inv.grand_total)}</div>
                        {inv.cashier_name && <div className="text-[10px] text-muted-foreground">{inv.cashier_name}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {foundInvoices.length === 0 && pastBillSearch && (
                <div className="text-center text-muted-foreground text-sm py-4">No invoices found</div>
              )}
            </>
          )}
        </div>
      </Modal>

    </div>
  );
}
