import { useState, useRef, useEffect } from 'react';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import {
  Search, X, Package, Trash2, Recycle, RotateCcw, Minus, Plus, CreditCard,
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
    customerState, setCustomerState,
    scrapDeduction, scrapInvoiceNumber, setScrapDeduction, setScrapInvoiceNumber, clearScrapDeduction
  } = useCartStore();
  const { shopName, role: authRole, tenantId, userId, userName, logout } = useAuthStore();
  const { subtotal, cgst, sgst, igst, totalTax, discount, grandTotal } = useCartTotals();

  // Calculate total savings from per-item offers/discounts (before global F8 discount)
  const totalItemSavings = items.reduce((sum, item) => {
    const rate = item.pricing_mode === 'GRADE_RATE' ? item.base_price + (item.grade_rate || 0) : item.base_price;
    const qty = Number(item.quantity) || 0;
    const rawTotal = item.billing_type === 'WEIGHT' ? rate * (item.calculated_weight || 0) : rate * qty;
    let effectivePrice = rate;
    if (item.offer_price) {
      effectivePrice = Number(item.offer_price);
    } else if (item.discount_flat) {
      effectivePrice = rate - Number(item.discount_flat);
    } else if (item.discount_percent) {
      effectivePrice = rate * (1 - Number(item.discount_percent) / 100);
    }
    effectivePrice = Math.max(effectivePrice, 0);
    const total = item.billing_type === 'WEIGHT' ? effectivePrice * (item.calculated_weight || 0) : effectivePrice * qty;
    return sum + (rawTotal - total);
  }, 0);

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);


  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  const receivedInputRef = useRef<HTMLInputElement>(null);
  const [shopGstin, setShopGstin] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [upiId, setUpiId] = useState('');
  const [showUpiQr, setShowUpiQr] = useState(true);
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState('');

  const tabs = useTabStore(s => s.tabs);
  const activeTabId = useTabStore(s => s.activeTabId);
  const addTab = useTabStore(s => s.addTab);
  const updateActiveTab = useTabStore(s => s.updateActiveTab);
  const syncActiveSnapshot = useTabStore(s => s.syncActiveSnapshot);

  const tabCounter = useRef(0);
  const initialized = useRef(false);

  const handleAddTab = () => {
    tabCounter.current++;
    addTab(undefined, `Bill ${tabCounter.current}`);
  };

  const activeTab = tabs.find(t => t.id === activeTabId);
  const paymentMethod = activeTab?.paymentMethod ?? 'CASH';
  const receivedAmount = activeTab?.receivedAmount ?? 0;
  const customerName = activeTab?.customerName ?? '';
  const customerPhone = activeTab?.customerPhone ?? '';
  const customerGstin = activeTab?.customerGstin ?? '';

  const displayGrandTotal = Math.max(0, grandTotal - scrapDeduction);
  const balanceAmount = receivedAmount - displayGrandTotal;

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    useTabStore.setState({ tabs: [], activeTabId: '' });
    handleAddTab();
  }, []);

  // receivedAmount stays 0 until user enters a value — no auto-fill to grandTotal

  useEffect(() => {
    searchRef.current?.focus();
  }, [activeTabId]);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_gstin' }).then((v: any) => {
      if (v) setShopGstin(v);
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_address' }).then((v: any) => {
      if (v) setShopAddress(v);
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_phone' }).then((v: any) => {
      if (v) setShopPhone(v);
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'upi_id' }).then((v: any) => {
      if (v) setUpiId(v);
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_upi_qr' }).then((v: any) => {
      if (v !== null && v !== undefined) setShowUpiQr(Boolean(v));
    });
    window.electronAPI.settingsGet({ tenant_id: 'global', key: 'invoice_counter_config' }).then((cfg: any) => {
      if (cfg) {
        setNextInvoiceNumber(`${cfg.prefix || 'INV-'}${cfg.counter || 1}`);
      }
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

  // Scrap state
  const [isScrapMode, setIsScrapMode] = useState(false);
  const [scrapSearchResults, setScrapSearchResults] = useState<any[]>([]);
  const [showScrapKgDialog, setShowScrapKgDialog] = useState(false);
  const [selectedScrapItem, setSelectedScrapItem] = useState<any>(null);
  const [scrapKgInput, setScrapKgInput] = useState('');
  const [scrapProcessing, setScrapProcessing] = useState(false);



  useEffect(() => {
    if (searchQuery.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      if (!window.electronAPI) return;
      const { tenantId } = useAuthStore.getState();
      // Numeric searches fetch more results so client-side prefix filtering doesn't miss valid barcode matches
      const fetchLimit = /^\d+$/.test(searchQuery) ? 50 : 8;
      const products = await window.electronAPI.dbGetProducts({ tenant_id: tenantId, search: searchQuery, limit: fetchLimit });
      if (Array.isArray(products)) {
        // Client-side filter: for numeric searches, only show prefix matches on barcode/item_code
        // (backend fix in main.ts requires Electron restart, this works immediately)
        const filtered = /^\d+$/.test(searchQuery)
          ? products.filter(p => {
              const barcode = String(p.sku_barcode || '');
              const code = String(p.item_code || '');
              return barcode.startsWith(searchQuery) || code.startsWith(searchQuery);
            })
          : products;
        setResults(filtered);
        setSelectedIndex(0);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Scrap item search (when scrap mode active)
  useEffect(() => {
    if (!isScrapMode || searchQuery.length < 2) { setScrapSearchResults([]); return; }
    const t = setTimeout(async () => {
      if (!window.electronAPI) return;
      const { tenantId } = useAuthStore.getState();
      const items = await window.electronAPI.dbGetScrapItemsBySearch({ tenant_id: tenantId || '', search: searchQuery });
      if (Array.isArray(items)) {
        setScrapSearchResults(items);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [searchQuery, isScrapMode]);

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
            discount_percent: item.discount_percent ?? null,
            discount_flat: item.discount_flat ?? null,
            offer_price: item.offer_price ?? null,
            sku_barcode: item.sku_barcode || null,
            brand_manufacturer: item.brand_manufacturer || null,
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
      discount_percent: product.discount_percent ?? null,
      discount_flat: product.discount_flat ?? null,
      offer_price: product.offer_price ?? null,
      sku_barcode: product.sku_barcode || null,
      brand_manufacturer: product.brand_manufacturer || null,
    });
    setSearchQuery('');
    setResults([]);
    setTimeout(() => {
      const input = qtyRefs.current[product.product_id];
      if (input) { input.focus(); input.select(); }
    }, 0);
  };

  const handleSelectScrapItem = (item: any) => {
    setSelectedScrapItem(item);
    setScrapKgInput('');
    setShowScrapKgDialog(true);
    setScrapSearchResults([]);
    setSearchQuery('');
  };

  const handleSaveScrapTransaction = async () => {
    if (!selectedScrapItem || !scrapKgInput || !window.electronAPI) return;
    const kg = Number(scrapKgInput);
    if (kg <= 0) return;
    setScrapProcessing(true);
    try {
      const { tenantId } = useAuthStore.getState();
      const numRes = await window.electronAPI.dbGetNextScrapInvoiceNumber({ tenant_id: tenantId || '' });
      if (!numRes.success || !numRes.invoiceNumber) throw new Error('Failed to generate scrap invoice number');
      const scrapInvoiceNum = numRes.invoiceNumber;
      const rate = Number(selectedScrapItem.purchase_price) || 0;
      const totalAmount = kg * rate;
      const txRes = await window.electronAPI.dbAddScrapTransaction({
        transaction_id: uuidv4(),
        tenant_id: tenantId,
        type: 'PURCHASE',
        scrap_item_id: selectedScrapItem.scrap_item_id,
        quantity: kg,
        rate,
        total_amount: totalAmount,
        party_name: '',
        notes: `Generated from billing - Invoice: ${scrapInvoiceNum}`,
        scrap_invoice_number: scrapInvoiceNum || null,
      });
      if (txRes.success) {
        setScrapDeduction(totalAmount, scrapInvoiceNum);
        setShowScrapKgDialog(false);
        setSelectedScrapItem(null);
        setScrapKgInput('');
      } else {
        console.error('Failed to save scrap transaction', txRes.error);
      }
    } catch (e) {
      console.error('Scrap transaction error', e);
    } finally {
      setScrapProcessing(false);
    }
  };

  const handleScrapInvoiceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Only allow digits — strip any non-digit characters
    const digits = raw.replace(/\D/g, '');
    const fullNumber = digits ? `SCRAP-${digits}` : '';
    setScrapInvoiceNumber(fullNumber);
    if (fullNumber) {
      window.electronAPI?.dbGetScrapInvoiceByNumber({ tenant_id: tenantId || '', scrap_invoice_number: fullNumber }).then((res: any) => {
        if (res && res.totalAmount) {
          setScrapDeduction(res.totalAmount, fullNumber);
        }
      });
    } else {
      clearScrapDeduction();
    }
  };

  const handleSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { setSelectedIndex(i => Math.min(i + 1, results.length - 1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setSelectedIndex(i => Math.max(i - 1, 0)); e.preventDefault(); }
    else if (e.key === 'Enter') { if (results[selectedIndex]) handleSelectProduct(results[selectedIndex]); }
    else if (e.key === 'Escape') { setResults([]); setSearchQuery(''); }
  };

  const handleCheckout = async () => {
    if (displayGrandTotal === 0 || items.length === 0) return;
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

      // Apply per-item discount to get effective rate
      let effectiveRate = rate;
      if (item.offer_price) {
        effectiveRate = Number(item.offer_price);
      } else if (item.discount_flat) {
        effectiveRate = rate - Number(item.discount_flat);
      } else if (item.discount_percent) {
        effectiveRate = rate * (1 - Number(item.discount_percent) / 100);
      }
      effectiveRate = Math.max(effectiveRate, 0);

      const total = item.billing_type === 'WEIGHT' ? effectiveRate * (item.calculated_weight || 0) : effectiveRate * qty;
      const unitPrice = qty > 0 ? total / qty : effectiveRate;
      return { item_id: uuidv4(), product_id: item.product_id, name: item.name, quantity: qty, unit_price: unitPrice, tax_amount: invoiceType === 'GST' ? total * (item.tax_rate_percent / 100) : 0, total };
    });

    setIsCheckingOut(true);
    setHardwareError(null);

    try {
      const cfg = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
      const width = cfg?.receiptWidthCm ? Number(cfg.receiptWidthCm) : 5.8;
      const charsPerLine = cfg?.charsPerLine ? Number(cfg.charsPerLine) : undefined;

      const state = useCartStore.getState();
      const receiptData: ReceiptData = {
        shopName: shopName || 'My Shop', shopGstin: shopGstin || undefined,
        shopState: state.shopState || undefined,
        shopAddress: shopAddress || undefined,
        shopPhone: shopPhone || undefined,
        upiId: upiId || undefined,
        showUpiQr: showUpiQr,
        invoiceNumber: invoice_number, date: new Date().toLocaleString(),
        cashierName: useAuthStore.getState().userName || useAuthStore.getState().role || undefined,
        items: lineItems.map((i, idx) => {
          const cartItem = items[idx];
          let originalRate = cartItem.pricing_mode === 'GRADE_RATE' ? cartItem.base_price + (cartItem.grade_rate || 0) : cartItem.base_price;
          let discountLabel: string | undefined;
          if (cartItem.offer_price) {
            discountLabel = 'Offer';
          } else if (cartItem.discount_flat) {
            discountLabel = `-₹${Number(cartItem.discount_flat).toFixed(0)}`;
          } else if (cartItem.discount_percent) {
            discountLabel = `${cartItem.discount_percent}% OFF`;
          }
          return { name: i.name, quantity: i.quantity, unit_price: i.unit_price, total: i.total, originalRate: discountLabel ? originalRate : undefined, discountLabel };
        }),
        subtotal, tax: totalTax,
        cgst: invoiceType === 'GST' ? cgst : undefined,
        sgst: invoiceType === 'GST' ? sgst : undefined,
        igst: invoiceType === 'GST' ? igst : undefined,
        discount, discountType: state.discountType,
        discountValue: state.discountValue, grandTotal,
        scrapDeduction, scrapInvoiceNumber: scrapInvoiceNumber || undefined,
        receivedAmount, balanceAmount, invoiceType,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerGstin: invoiceType === 'GST' ? customerGstin || undefined : undefined,
        customerState: invoiceType === 'GST' ? customerState || undefined : undefined,
      };

      const printResult = await window.electronAPI.printReceipt(tenantId || 'global', generateReceiptText(receiptData, width, charsPerLine));
      if (!printResult.success) {
        setHardwareError(`Printing issue: ${printResult.error || 'check printer'}`);
        setIsCheckingOut(false); return;
      }

      await window.electronAPI.openCashDrawer(tenantId || 'global');

      const result = await window.electronAPI.dbCheckout({
        invoice_id, tenant_id: tenantId || 'unset', user_id: userId || 'unset', invoice_number,
        invoice_type: invoiceType, subtotal, tax_total: totalTax, discount_total: discount,
        discount_type: useCartStore.getState().discountType, discount_value: useCartStore.getState().discountValue,
        grand_total: displayGrandTotal, payment_method: paymentMethod,
        received_amount: receivedAmount, balance_amount: balanceAmount,
        customer_name: customerName || null, customer_phone: customerPhone || null,
        customer_gstin: invoiceType === 'GST' ? customerGstin || null : null,
        customer_state: invoiceType === 'GST' ? customerState || null : null,
        scrap_deduction: scrapDeduction, scrap_invoice_number: scrapInvoiceNumber || null,
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
    <div className="flex flex-col h-full w-full bg-background overflow-hidden text-foreground">
      {/* ─── TOP HEADER ─── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0 gap-4 shadow-sm z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shadow-inner">
            <Store className="w-5 h-5" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground truncate block">{shopName || 'Billing Terminal'}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Active" />
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {nextInvoiceNumber && (
                <span className="text-xs font-bold font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20 shrink-0 flex items-center gap-1">
                  <span                  className="text-[10px] font-sans font-bold uppercase tracking-wider text-primary/70">Inv:</span>
                  {nextInvoiceNumber}
                </span>
              )}
              <span              className="text-xs text-muted-foreground font-semibold bg-muted px-1.5 py-0.5 rounded-md inline-flex items-center gap-1">
                {authRole === 'OWNER' ? 'Owner' : (userName || currentUserRole || 'Staff')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              onClick={() => { clearCart(); updateActiveTab({ customerName: '', customerPhone: '', customerGstin: '', paymentMethod: 'CASH', receivedAmount: 0 }); syncActiveSnapshot(); }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
              title="Clear Cart"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Clear Cart</span>
            </button>
          )}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-sales-history'))}
            className="flex items-center gap-1.5 px-3.5 py-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 font-bold text-sm cursor-pointer"
            title="Sales History"
          >
            <TrendingUp className="w-4 h-4 text-primary" />
            <span>History</span>
          </button>
          <button
            onClick={() => setIsScrapMode(!isScrapMode)}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl transition-all duration-200 active:scale-95 cursor-pointer",
              isScrapMode
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            title="Scrap Mode"
          >
            <Recycle className={clsx("w-4 h-4", isScrapMode && "text-amber-500")} />
            <span>Scrap</span>
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-settings-manager'))}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <div className="h-5 w-px bg-border mx-1" />
          {authRole === 'OWNER' ? (
            <button
              onClick={() => setRole('OWNER')}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30"
              title="Dashboard"
            >
              <X className="w-4 h-4 text-destructive" />
            </button>
          ) : (
            <button
              onClick={logout}
              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* ─── TABS BAR ─── */}
      <div className="shrink-0 bg-muted/20 border-b border-border/40">
        <BillingTabBar onAddTab={handleAddTab} />
      </div>

      {/* ─── MAIN POS WORKSPACE ─── */}
      <div className="flex flex-1 overflow-hidden bg-background">
        
        {/* ═══ LEFT SIDE: Search + Cart (58%) ═══ */}
        <div className="flex flex-col w-[58%] border-r border-border bg-muted/10">
          
          {/* Prominent Search bar */}
          <div className="p-3 pb-2.5 bg-card border-b border-border/60">
            <div ref={searchContainerRef} className="relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    ref={searchRef}
                    type="text"
                    autoFocus
                    placeholder={isScrapMode ? "Search scrap items or products... (Scrap Mode)" : "Search products or scan barcode... (Press F2)"}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKey}
                    className="w-full pl-10 pr-9 py-2.5 bg-background border border-border/80 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl text-sm font-medium text-foreground transition-all shadow-sm placeholder:text-muted-foreground/50"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => { setSearchQuery(''); setResults([]); searchRef.current?.focus(); }}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full text-muted-foreground transition-colors border border-destructive/30"
                    >
                      <X className="w-4 h-4 text-destructive" />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setShowPastBill(true)}
                    className="px-3 py-2.5 bg-background hover:bg-muted border border-border/80 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap shadow-sm active:scale-95 cursor-pointer"
                  >
                    <Receipt className="w-3.5 h-3.5 text-primary" />
                  <span>Past Bill</span>
                </button>
              </div>

              {(results.length > 0 || (isScrapMode && scrapSearchResults.length > 0)) && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="max-h-[260px] overflow-y-auto">
                    {results.map((p, i) => {
                      const mrp = p.pricing_mode === 'GRADE_RATE' ? p.base_price + (p.grade_rate || 0) : p.base_price;
                      const showOffer = p.offer_price && Number(p.offer_price) > 0;
                      const displayPrice = showOffer ? Number(p.offer_price) : mrp;
                      const isSelected = i === selectedIndex;
                      return (
                        <button
                          key={p.product_id}
                          onClick={() => handleSelectProduct(p)}
                          onMouseEnter={() => setSelectedIndex(i)}
                          className={clsx(
                            'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-border/40 last:border-0 cursor-pointer',
                            isSelected ? 'bg-primary/5 border-l-4 border-l-primary pl-2' : 'hover:bg-muted/40'
                          )}
                        >
                          <div className={clsx(
                            'p-2 rounded-xl shrink-0 transition-colors',
                            isSelected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                          )}>
                            <Package className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-foreground truncate">{p.name}</div>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                              <span className="font-mono bg-muted/70 px-1 py-0.5 rounded text-[10px]">{p.sku_barcode || 'NO BARCODE'}</span>
                              <span>&middot;</span>
                              <span className={clsx(
                                'font-semibold',
                                p.current_stock <= 0 ? 'text-destructive' : p.current_stock < 10 ? 'text-amber-500' : 'text-emerald-500'
                              )}>
                                Stock: {p.current_stock}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {showOffer ? (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground/70 font-semibold">MRP:</span>
                                <span className="text-xs font-semibold text-muted-foreground line-through">{formatCurrency(mrp)}</span>
                                <span className="text-[10px] text-emerald-500 font-semibold ml-1">Offer:</span>
                                <span className="font-black text-sm text-emerald-500">{formatCurrency(displayPrice)}</span>
                              </div>
                            ) : (
                              <div className="font-black text-sm text-primary">{formatCurrency(displayPrice)}</div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    {isScrapMode && scrapSearchResults.length > 0 && results.length > 0 && (
                      <div className="px-3 py-1.5 text-[10px] font-black text-muted-foreground uppercase tracking-wider bg-muted/30 border-y border-border/40">
                        Scrap Items
                      </div>
                    )}
                    {isScrapMode && scrapSearchResults.map((s, i) => {
                      const rate = Number(s.selling_price) || 0;
                      const stock = Number(s.current_stock) || 0;
                      return (
                        <button
                          key={s.scrap_item_id}
                          onClick={() => handleSelectScrapItem(s)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-border/40 last:border-0 cursor-pointer hover:bg-amber-500/5"
                        >
                          <div className="p-2 rounded-xl shrink-0 bg-amber-500/10 text-amber-500">
                            <Recycle className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-foreground truncate">{s.name}</div>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                              <span className="font-semibold text-amber-600 dark:text-amber-400">Scrap</span>
                              <span>&middot;</span>
                              <span className={clsx(
                                'font-semibold',
                                stock <= 0 ? 'text-destructive' : 'text-emerald-500'
                              )}>
                                Stock: {stock.toFixed(1)} {s.unit || 'Kgs'}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-black text-sm text-amber-500">{formatCurrency(rate)}/{s.unit || 'Kg'}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Cart Header info */}
          <div className="flex items-center justify-between px-6 py-2.5 bg-muted/40 border-b border-border/60 shrink-0">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">
              Items in Cart {items.length > 0 && `(${items.length})`}
            </span>
            {items.length > 0 && totalItemSavings > 0 && (
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
                Total Savings: {formatCurrency(totalItemSavings)}
              </span>
            )}
          </div>

          {/* Customer details — moved to top of cart */}
          <div className="px-4 py-2.5 border-b border-border/50 bg-card/40 shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <User className={clsx('absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-all duration-300', paymentMethod === 'CREDIT' ? 'text-amber-500' : 'text-muted-foreground/50')} />
                <input
                  placeholder={paymentMethod === 'CREDIT' ? 'Name *' : 'Customer Name'}
                  value={customerName}
                  onChange={e => updateActiveTab({ customerName: e.target.value })}
                  className={clsx(
                    'w-full pl-9 pr-3 py-2 bg-background border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 transition-all duration-300',
                    paymentMethod === 'CREDIT'
                      ? 'border-amber-400 bg-amber-500/5 focus:ring-amber-500/30 focus:border-amber-500'
                      : 'border-border focus:ring-primary/20 focus:border-primary'
                  )}
                />
              </div>
              <div className="relative flex-1">
                <Phone className={clsx('absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-all duration-300', paymentMethod === 'CREDIT' ? 'text-amber-500' : 'text-muted-foreground/50')} />
                <input
                  placeholder={paymentMethod === 'CREDIT' ? 'Phone *' : 'Phone Number'}
                  value={customerPhone}
                  onChange={e => updateActiveTab({ customerPhone: e.target.value })}
                  className={clsx(
                    'w-full pl-9 pr-3 py-2 bg-background border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 transition-all duration-300',
                    paymentMethod === 'CREDIT'
                      ? 'border-amber-400 bg-amber-500/5 focus:ring-amber-500/30 focus:border-amber-500'
                      : 'border-border focus:ring-primary/20 focus:border-primary'
                  )}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex bg-muted/60 p-0.5 rounded-lg border border-border/40">
                <button
                  onClick={() => setInvoiceType('BILL_OF_SUPPLY')}
                  className={clsx(
                    'px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap',
                    invoiceType === 'BILL_OF_SUPPLY'
                      ? 'bg-card text-foreground shadow-sm border border-border/20'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Bill of Supply
                </button>
                <button
                  onClick={() => setInvoiceType('GST')}
                  className={clsx(
                    'px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap',
                    invoiceType === 'GST'
                      ? 'bg-card text-foreground shadow-sm border border-border/20'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  GST Invoice
                </button>
              </div>
              {invoiceType === 'GST' && (
                <div className="flex items-center gap-2 flex-1">
                  <div className="relative flex-1 max-w-[120px]">
                    <select
                      value={customerState}
                      onChange={e => setCustomerState(e.target.value)}
                      className="w-full py-1.5 pl-2 pr-5 bg-background border border-border rounded-lg text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                    >
                      {INDIAN_STATES.map(state => (
                        <option key={state.code} value={state.code}>{state.name} ({state.code})</option>
                      ))}
                    </select>
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground/60">
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <div className="relative flex-1 max-w-[140px]">
                    <Building className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
                    <input
                      placeholder="GSTIN"
                      value={customerGstin}
                      onChange={e => updateActiveTab({ customerGstin: e.target.value.toUpperCase() })}
                      maxLength={15}
                      className="w-full pl-7 pr-2 py-1.5 bg-background border border-border rounded-lg text-xs font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 uppercase"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Cart List */}
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 gap-2 text-center max-w-xs mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-card border border-border/60 flex items-center justify-center text-muted-foreground shadow-sm">
                  {emptyIcon}
                </div>
                <div>
                  <p className="font-bold text-sm text-foreground/80">Your cart is empty</p>
                  <p className="text-xs text-muted-foreground/80 mt-0.5">Search or scan to add items</p>
                </div>
                <div className="flex gap-1.5 mt-1">
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-card border rounded shadow-sm">F2: Search</kbd>
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-card border rounded shadow-sm">F8: Discount</kbd>
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-card border rounded shadow-sm">F12: Print</kbd>
                </div>
              </div>
            ) : (
              items.map(item => {
                const rate = item.pricing_mode === 'GRADE_RATE' ? item.base_price + (item.grade_rate || 0) : item.base_price;
                const qty = Number(item.quantity) || 0;

                // Apply per-item discount
                let effectivePrice = rate;
                if (item.offer_price) {
                  effectivePrice = Number(item.offer_price);
                } else if (item.discount_flat) {
                  effectivePrice = rate - Number(item.discount_flat);
                } else if (item.discount_percent) {
                  effectivePrice = rate * (1 - Number(item.discount_percent) / 100);
                }
                effectivePrice = Math.max(effectivePrice, 0);
                const total = item.billing_type === 'WEIGHT' ? effectivePrice * (item.calculated_weight || 0) : effectivePrice * qty;

                return (
                  <div
                    key={item.product_id}
                    className="flex items-center gap-3 px-4 py-3 bg-card border border-border/80 hover:border-primary/30 rounded-xl transition-all duration-200 hover:shadow-sm group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-foreground truncate">{item.name}</span>
                        {item.billing_type === 'WEIGHT' && (
                          <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded uppercase tracking-wider">
                            By Weight
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                        {item.sku_barcode && (
                          <span className="font-mono bg-muted/70 px-1 py-0.5 rounded">{item.sku_barcode}</span>
                        )}
                        {item.brand_manufacturer && (
                          <span className="font-semibold text-muted-foreground/80">{item.brand_manufacturer}</span>
                        )}
                        {!item.sku_barcode && !item.brand_manufacturer && (
                          <span className="text-muted-foreground/50 italic">No barcode</span>
                        )}
                      </div>
                    </div>

                    {/* Touch-Friendly Large Quantity Adjusters */}
                    <div className="flex items-center gap-0.5 shrink-0 bg-muted/40 border border-border/80 rounded-lg p-0.5">
                      <button
                        onClick={() => { const q = Number(item.quantity); if (q > 1) updateQuantity(item.product_id, q - 1); else removeItem(item.product_id); }}
                        className="w-8 h-8 flex items-center justify-center rounded-md bg-background border border-border/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-90 cursor-pointer font-bold"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        ref={(el) => { qtyRefs.current[item.product_id] = el; }}
                        className="w-10 text-center h-8 bg-transparent border-0 text-sm font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={item.quantity}
                        onChange={e => updateQuantity(item.product_id, e.target.value === '' ? '' : Number(e.target.value))}
                      />
                      <button
                        onClick={() => updateQuantity(item.product_id, (Number(item.quantity) || 0) + 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-md bg-background border border-border/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-90 cursor-pointer font-bold"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Weight adjustments controls */}
                    {item.billing_type === 'WEIGHT' && (
                      <div className="flex items-center gap-0.5 bg-muted/40 border border-border/80 rounded-lg p-0.5 shrink-0">
                        <input
                          type="number"
                          step="0.001"
                          className={clsx(
                            'w-14 text-center h-7 bg-transparent border-0 text-xs font-bold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                            !item.weight_override_allowed && 'opacity-40 cursor-not-allowed'
                          )}
                          value={item.calculated_weight || ''}
                          disabled={!item.weight_override_allowed}
                          onChange={e => { if (item.weight_override_allowed) updateWeight(item.product_id, e.target.value === '' ? 0 : Number(e.target.value)); }}
                        />
                        <span className="text-[10px] text-muted-foreground font-black uppercase pr-1.5">Kg</span>
                      </div>
                    )}

                    <div className="text-right min-w-[80px] shrink-0">
                      {effectivePrice !== rate ? (
                        <>
                          <div className="font-black text-sm text-emerald-500">{formatCurrency(total)}</div>
                          <div className="text-[10px] text-muted-foreground/60 line-through font-semibold -mt-0.5">MRP: {formatCurrency(rate)}</div>
                        </>
                      ) : (
                        <div className="font-black text-sm text-primary">{formatCurrency(total)}</div>
                      )}
                    </div>

                    <button
                      onClick={() => removeItem(item.product_id)}
                      className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
                      title="Remove Item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ═══ RIGHT SIDE: Transaction Console & Payment (42%) ═══ */}
        <div className="flex flex-col w-[42%] bg-card shadow-2xl z-25">

          {/* ── RIGHT PANEL HEADER ── */}
          <div className="shrink-0 px-5 py-2.5 border-b border-border/60 bg-card">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em]">Transaction Console</p>
          </div>

          {/* ── Scrollable content area ── */}
          <div className="flex-1 overflow-y-auto px-5 py-3">
            {/* Payment method grid buttons */}
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_OPTIONS.map(opt => {
                  const isActive = paymentMethod === opt.value;
                  let activeBg = '';
                  let activeText = '';
                  let activeBorder = '';
                  let activeIconBg = '';
                  if (opt.value === 'CASH')   { activeBg = 'bg-emerald-500/10'; activeText = 'text-emerald-600 dark:text-emerald-400'; activeBorder = 'border-emerald-500'; activeIconBg = 'bg-emerald-500/15'; }
                  if (opt.value === 'CARD')   { activeBg = 'bg-blue-500/10';    activeText = 'text-blue-600 dark:text-blue-400';    activeBorder = 'border-blue-500';    activeIconBg = 'bg-blue-500/15'; }
                  if (opt.value === 'UPI')    { activeBg = 'bg-violet-500/10';  activeText = 'text-violet-600 dark:text-violet-400';  activeBorder = 'border-violet-500';  activeIconBg = 'bg-violet-500/15'; }
                  if (opt.value === 'CREDIT') { activeBg = 'bg-amber-500/10';   activeText = 'text-amber-600 dark:text-amber-400';   activeBorder = 'border-amber-500';   activeIconBg = 'bg-amber-500/15'; }

                  return (
                    <button
                      key={opt.value}
                      onClick={() => updateActiveTab({ paymentMethod: opt.value })}
                      className={clsx(
                        'flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl border-2 transition-all duration-200 active:scale-95 cursor-pointer',
                        isActive
                          ? `${activeBg} ${activeBorder} ${activeText} shadow-sm`
                          : 'border-border/70 text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:border-border'
                      )}
                    >
                      <div className={clsx(
                        'p-2 rounded-xl transition-colors',
                        isActive ? activeIconBg : 'bg-muted'
                      )}>
                        <opt.icon className="w-4.5 h-4.5" />
                      </div>
                      <span className="text-xs font-extrabold">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

          {/* ── STICKY FOOTER: Totals + Actions ── */}
          <div className="shrink-0 border-t border-border/50 bg-background">

            {/* Calculation breakdown */}
            <div className="px-5 py-2.5 space-y-1.5 text-xs border-b border-border/40">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-semibold text-sm">Items Subtotal</span>
                <span className="font-bold text-foreground text-sm">{formatCurrency(subtotal)}</span>
              </div>

              {invoiceType === 'GST' && totalTax > 0 && (
                <>
                  {igst > 0 ? (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground text-sm">IGST (Out of State)</span>
                      <span className="font-semibold text-foreground/80 text-sm">{formatCurrency(igst)}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-sm">CGST</span>
                        <span className="font-semibold text-foreground/80 text-sm">{formatCurrency(cgst)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-sm">SGST</span>
                        <span className="font-semibold text-foreground/80 text-sm">{formatCurrency(sgst)}</span>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Discount row */}
              <div className="flex items-center justify-between pt-1 border-t border-border/30">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground font-semibold text-sm">Discount</span>
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-muted border rounded text-muted-foreground/60 shadow-sm">F8</kbd>
                  {discount > 0 && (
                    <span className="text-xs font-black text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">-{formatCurrency(discount)}</span>
                  )}
                  {scrapDeduction > 0 && (
                    <span className="text-xs font-black text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-full">-{formatCurrency(scrapDeduction)}</span>
                  )}
                </div>
                {/* Inline discount input */}
                <div className="flex items-center bg-muted/50 border border-border/60 rounded-xl p-0.5 shadow-sm">
                  <div className="flex bg-card rounded-lg mr-1 border border-border/30">
                    <button
                      onClick={() => setDiscount(discountValue || 0, 'FIXED')}
                      className={clsx(
                        'px-2 py-1 text-xs font-black rounded-lg transition-all cursor-pointer',
                        discountType === 'FIXED' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >₹</button>
                    <button
                      onClick={() => setDiscount(discountValue || 0, 'PERCENTAGE')}
                      className={clsx(
                        'px-2 py-1 text-xs font-black rounded-lg transition-all cursor-pointer',
                        discountType === 'PERCENTAGE' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >%</button>
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
                    className="w-24 h-9 bg-transparent border-0 text-base text-right pr-3 font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>

            {/* Scrap deduction row */}
            {scrapDeduction > 0 && (
              <div className="flex justify-between items-center pt-1 border-t border-border/30">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground font-semibold text-sm">Scrap ({scrapInvoiceNumber})</span>
                </div>
                <span className="text-xs font-black text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-full">-{formatCurrency(scrapDeduction)}</span>
              </div>
            )}

            {/* Scrap invoice number field */}
            <div className={clsx(
              'flex items-center justify-between pt-1 border-t border-border/30 transition-all duration-300',
              isScrapMode ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground font-semibold text-sm">Scrap Inv</span>
              </div>
              <div className="flex items-center bg-muted/50 border border-border/60 rounded-xl p-0.5 shadow-sm">
                <input
                  type="text"
                  inputMode="numeric"
                  value={scrapInvoiceNumber.replace(/^SCRAP-/, '')}
                  onChange={handleScrapInvoiceChange}
                  placeholder="001"
                  className="w-24 h-9 bg-transparent border-0 text-base font-black text-amber-600 text-right pr-3 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                {scrapInvoiceNumber && (
                  <button
                    onClick={() => clearScrapDeduction()}
                    className="p-1 text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            </div>

            {/* Grand Total + Received + Change — same container always (no layout shift) */}
            <div className="mx-3 my-1.5 flex items-center gap-1.5 px-3 py-3 bg-primary/10 border-2 border-primary/25 rounded-2xl">
              {/* Total amount */}
              <div className="shrink-0">
                <p className="text-[9px] font-black text-primary uppercase tracking-wider">
                  {scrapDeduction > 0 ? 'After Scrap' : 'Total'}
                </p>
                <p className="text-xl font-black text-foreground leading-none">{formatCurrency(displayGrandTotal)}</p>
              </div>
              {/* Divider — fades for CARD/UPI */}
              <div className={clsx('w-px h-8 bg-primary/20 transition-all duration-300', paymentMethod === 'CARD' || paymentMethod === 'UPI' ? 'opacity-0' : 'opacity-100')} />
              {/* Received input — fades for CARD/UPI (keeps space) */}
              <div className={clsx('flex-1 min-w-0 transition-all duration-300', paymentMethod === 'CARD' || paymentMethod === 'UPI' ? 'opacity-0 pointer-events-none' : 'opacity-100')}>
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
                    placeholder={grandTotal.toFixed(2)}
                    inputMode="decimal"
                    className="w-full pl-5 pr-2 py-1.5 bg-background/80 border border-border/50 focus:border-primary focus:ring-1 focus:ring-primary/15 rounded-lg text-sm font-black text-right text-foreground placeholder:text-muted-foreground/35 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
              {/* Change input — fades for CARD/UPI (keeps space) */}
              <div className={clsx('flex-1 min-w-0 max-w-[120px] transition-all duration-300', paymentMethod === 'CARD' || paymentMethod === 'UPI' ? 'opacity-0 pointer-events-none' : 'opacity-100')}>
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-wider mb-0.5">
                  {paymentMethod === 'CREDIT' ? 'Balance' : 'Change'}
                </p>
                <div className="relative">
                  <span className={clsx(
                    'absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black',
                    balanceAmount >= 0 ? 'text-emerald-500' : 'text-destructive'
                  )}>₹</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={Math.abs(balanceAmount)}
                    readOnly
                    inputMode="decimal"
                    className={clsx(
                      'w-full pl-5 pr-2 py-1.5 border rounded-lg text-sm font-black text-right transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                      balanceAmount >= 0
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-destructive/10 border-destructive/30 text-destructive'
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Status alerts */}
            <div className="px-4 space-y-1.5">
              {hardwareError && (
                <div                className="px-3 py-2.5 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-2.5 text-destructive text-sm font-bold animate-in fade-in duration-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{hardwareError}</span>
                  <button onClick={() => setHardwareError(null)} className="hover:bg-destructive/20 p-0.5 rounded-lg transition-colors cursor-pointer border border-destructive/30">
                    <X className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              )}
              {checkoutSuccess && (
                <div                className="px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-bold animate-in fade-in duration-200">
                  <CheckCircle2 className="w-4 h-4 shrink-0 animate-bounce" />
                  <span>Invoice completed & Receipt printed!</span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2.5 px-4 py-3">
              <button
                onClick={handleHoldBill}
                disabled={items.length === 0}
                className="w-[30%] py-3 rounded-xl border-2 border-border text-muted-foreground font-black text-sm hover:bg-muted hover:text-foreground hover:border-muted-foreground/30 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-sm cursor-pointer"
              >
                Hold
              </button>
              <button
                onClick={handleCheckout}
                disabled={isCheckingOut || items.length === 0}
                className="flex-1 py-3 flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-black text-sm shadow-md hover:bg-primary/90 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed tracking-wide cursor-pointer"
              >
                {isCheckingOut ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    <span>FINALIZING...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4.5 h-4.5" />
                    <span>PRINT &amp; CHECKOUT (F12)</span>
                  </>
                )}
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* ─── Scrap Kg Input Dialog ─── */}
      <Modal
        isOpen={showScrapKgDialog}
        onClose={() => { setShowScrapKgDialog(false); setSelectedScrapItem(null); setScrapKgInput(''); }}
        title={
          <div className="flex items-center gap-2.5 font-bold text-foreground">
            <Recycle className="w-5 h-5 text-amber-500" />
            <span>Scrap - {selectedScrapItem?.name || ''}</span>
          </div>
        }
      >
        <div className="space-y-4 p-2">
          <div>
            <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Quantity (Kgs)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={scrapKgInput}
              onChange={e => setScrapKgInput(e.target.value)}
              placeholder="Enter kg"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
              autoFocus
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Rate: <span className="font-bold text-amber-500">{formatCurrency(Number(selectedScrapItem?.selling_price) || 0)}/kg</span>
            {scrapKgInput && !isNaN(Number(scrapKgInput)) && Number(scrapKgInput) > 0 && (
              <span>
                &nbsp;&middot;&nbsp; Total: <span className="font-bold text-foreground">{formatCurrency(Number(scrapKgInput) * (Number(selectedScrapItem?.selling_price) || 0))}</span>
              </span>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => { setShowScrapKgDialog(false); setSelectedScrapItem(null); setScrapKgInput(''); }}
              variant="outline"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveScrapTransaction}
              disabled={!scrapKgInput || isNaN(Number(scrapKgInput)) || Number(scrapKgInput) <= 0 || scrapProcessing}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
            >
              {scrapProcessing ? 'Saving...' : 'Add & Deduct'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Past Bill Modal Archive ─── */}
      <Modal
        isOpen={showPastBill}
        onClose={() => { setShowPastBill(false); setPastBillSuccess(null); setPastBillView('search'); }}
        title={
          <div className="flex items-center gap-2.5 font-bold text-foreground">
            <Receipt className="w-5 h-5 text-primary" />
            <span>Invoice History Archive</span>
          </div>
        }
      >
        <div className="space-y-4 min-w-[560px] text-foreground">
          {pastBillSuccess && pastBillView === 'search' ? (
            <div className="p-8 bg-primary/5 text-primary border border-primary/20 rounded-2xl text-center space-y-4 shadow-inner">
              <CheckCircle2 className="w-12 h-12 mx-auto text-primary animate-pulse" />
              <div>
                <p className="font-black text-base">{pastBillSuccess}</p>
                <p className="text-xs text-muted-foreground/80 mt-1">Receipt configurations updated on active POS databases</p>
              </div>
              <button
                onClick={() => { setShowPastBill(false); setPastBillSuccess(null); setPastBillView('search'); }}
                className="px-4 py-2 text-xs font-bold text-destructive hover:bg-destructive/10 border border-destructive/20 rounded-xl transition-all duration-200"
              >
                Close View
              </button>
            </div>
          ) : pastBillView === 'detail' && selectedPastInvoice ? (
            <div className="space-y-4.5">
              {/* Back link */}
              <button
                onClick={() => { setPastBillView('search'); setEditMode(false); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 font-bold transition-colors active:scale-95"
              >
                &larr; Back to Search Archive
              </button>

              {/* Invoice details header */}
              <div className="flex justify-between items-start border-b border-border/60 pb-3">
                <div>
                  <h3 className="font-extrabold text-base text-foreground tracking-wide">{selectedPastInvoice.invoice_number}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{new Date(selectedPastInvoice.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-black text-primary">{formatCurrency(selectedPastInvoice.grand_total)}</div>
                  <div className="text-xs text-muted-foreground font-semibold mt-0.5 uppercase tracking-wider">{selectedPastInvoice.payment_method}</div>
                </div>
              </div>

              {/* Customer summary */}
              {(selectedPastInvoice.customer_name || selectedPastInvoice.customer_phone) && (
                <div className="grid grid-cols-2 gap-4 p-3.5 bg-muted/40 border border-border/50 rounded-2xl text-sm">
                  {selectedPastInvoice.customer_name && (
                    <div>
                      <span className="text-muted-foreground font-medium text-sm">Customer Name:</span>
                      <p className="font-bold text-foreground mt-0.5 text-sm">{selectedPastInvoice.customer_name}</p>
                    </div>
                  )}
                  {selectedPastInvoice.customer_phone && (
                    <div>
                      <span className="text-muted-foreground font-medium text-sm">Phone Number:</span>
                      <p className="font-bold text-foreground mt-0.5 text-sm">{selectedPastInvoice.customer_phone}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Invoice items table */}
              <div className="border border-border/80 rounded-2xl overflow-hidden bg-card shadow-sm">
                <div className="grid grid-cols-12 gap-2.5 px-4 py-2.5 text-xs font-black text-muted-foreground bg-muted/40 uppercase tracking-widest border-b border-border">
                  <div className="col-span-5">Product Details</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-2 text-right">Rate</div>
                  <div className="col-span-2 text-right">Total</div>
                  {editMode && <div className="col-span-1" />}
                </div>
                <div className="divide-y divide-border/50 max-h-60 overflow-y-auto">
                  {(editMode ? editedItems : pastInvoiceItems).map((item, index) => (
                    <div key={item.item_id || index} className="grid grid-cols-12 gap-2.5 px-4 py-3 items-center text-sm">
                      <div className="col-span-5 font-bold text-foreground/90 truncate">{item.name}</div>
                      {editMode ? (
                        <>
                          <div className="col-span-2">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              className="w-full text-center h-8 bg-muted/30 border border-border rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              value={item.quantity}
                              onChange={e => handleEditItem(index, 'quantity', e.target.value === '' ? 0 : Number(e.target.value))}
                            />
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              className="w-full text-right h-8 bg-muted/30 border border-border rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              value={item.unit_price}
                              onChange={e => handleEditItem(index, 'unit_price', e.target.value === '' ? 0 : Number(e.target.value))}
                            />
                          </div>
                          <div className="col-span-2 text-right font-extrabold text-foreground">{formatCurrency(item.total)}</div>
                          <div className="col-span-1 text-right">
                            <button
                              onClick={() => handleRemoveEditItem(index)}
                              className="p-1 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors border border-destructive/30"
                            >
                              <X className="w-3.5 h-3.5 text-destructive" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="col-span-2 text-center text-muted-foreground font-semibold">{item.quantity}</div>
                          <div className="col-span-2 text-right text-muted-foreground font-semibold">{formatCurrency(item.unit_price)}</div>
                          <div className="col-span-2 text-right font-extrabold text-foreground">{formatCurrency(item.total)}</div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Detail Totals calculation summary */}
              <div className="space-y-2 text-sm border-b border-border/50 pb-3">
                <div className="flex justify-between text-muted-foreground font-medium">
                  <span>Subtotal</span>
                  <span className="font-bold text-foreground">{formatCurrency(editMode ? editedItems.reduce((s, i) => s + i.total, 0) : selectedPastInvoice.subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground font-medium">
                  <span>Tax Amount</span>
                  <span className="font-bold text-foreground">{formatCurrency(editMode ? editedItems.reduce((s, i) => s + (i.tax_amount || 0), 0) : selectedPastInvoice.tax_total)}</span>
                </div>
                {selectedPastInvoice.discount_total > 0 && !editMode && (
                  <div className="flex justify-between text-destructive font-medium">
                    <span>Discount Applied {selectedPastInvoice.discount_type === 'PERCENTAGE' && selectedPastInvoice.discount_value ? `(${selectedPastInvoice.discount_value}%)` : ''}</span>
                    <span className="font-bold">-{formatCurrency(selectedPastInvoice.discount_total)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-sm pt-2.5 border-t border-border">
                  <span>Grand Total</span>
                  <span className="text-primary font-black text-base">
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

              {/* Admin modifications block */}
              {authRole === 'OWNER' && (
                <div className="space-y-4 p-4 bg-muted/20 border border-border/60 rounded-2xl shadow-inner">
                  <div className="space-y-3">
                    <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Apply Special Discount Override</div>
                    <div className="flex gap-2 p-1 bg-muted rounded-xl border border-border/40 text-sm">
                      <button
                        onClick={() => setTempDiscountType('FIXED')}
                        className={clsx(
                          'flex-1 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer',
                          tempDiscountType === 'FIXED' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                        )}
                      >
                        Fixed Amount (₹)
                      </button>
                      <button
                        onClick={() => setTempDiscountType('PERCENTAGE')}
                        className={clsx(
                          'flex-1 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer',
                          tempDiscountType === 'PERCENTAGE' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                        )}
                      >
                        Percentage (%)
                      </button>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      max={tempDiscountType === 'PERCENTAGE' ? '100' : undefined}
                      value={tempDiscountValue || ''}
                      onChange={e => setTempDiscountValue(Number(e.target.value))}
                      placeholder={tempDiscountType === 'PERCENTAGE' ? 'Enter discount %' : 'Enter discount amount'}
                      className="bg-background rounded-xl border border-border/80 py-2 text-sm font-bold focus:ring-primary/20"
                    />
                  </div>

                  <div className="flex gap-3 pt-1">
                    {!editMode ? (
                      <>
                        <Button variant="outline" onClick={() => setEditMode(true)} className="flex-1 rounded-xl py-2.5 text-sm font-bold border-border/80">
                          <Tag className="w-3.5 h-3.5 mr-1 text-primary" /> Modify Items
                        </Button>
                        <Button onClick={handleApplyPastDiscount} disabled={isSavingPastBill} className="flex-1 rounded-xl py-2.5 text-sm font-black shadow-md">
                          {isSavingPastBill ? 'Applying...' : 'Apply Discount'}
                        </Button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setEditMode(false); setEditedItems(pastInvoiceItems.map((i: any) => ({ ...i }))); }}
                          className="flex-1 px-4 py-2.5 text-sm font-bold text-destructive hover:bg-destructive/10 border border-destructive/20 rounded-xl transition-all duration-200 active:scale-95"
                        >
                          Cancel Editing
                        </button>
                        <Button onClick={handleSavePastBill} disabled={isSavingPastBill} className="flex-1 rounded-xl py-2.5 text-sm font-black shadow-md">
                          {isSavingPastBill ? 'Saving...' : 'Save Changes'}
                        </Button>
                      </>
                    )}
                  </div>

                  {pastBillSuccess && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-xl text-center text-xs font-bold animate-in fade-in">
                      <CheckCircle2 className="w-4 h-4 inline mr-1.5 text-emerald-500" />
                      {pastBillSuccess}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-border/40">
                <button
                  onClick={() => { setShowPastBill(false); setPastBillSuccess(null); setPastBillView('search'); }}
                  className="px-4 py-2 text-sm font-bold text-destructive hover:bg-destructive/10 border border-destructive/20 rounded-xl transition-all duration-200"
                >
                  Close Archive
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-2.5">
                <Input
                  placeholder="Enter invoice ID, number, or customer name..."
                  value={pastBillSearch}
                  onChange={e => setPastBillSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearchPast(); } }}
                  className="rounded-xl bg-background border border-border/80 text-sm font-medium focus:ring-primary/20"
                />
                <Button onClick={handleSearchPast} className="rounded-xl px-5 text-sm font-bold tracking-wide">Search</Button>
              </div>
              {foundInvoices.length > 0 && (
                <div className="space-y-2 max-h-[320px] overflow-y-auto pt-2.5">
                  {foundInvoices.map(inv => (
                    <div
                      key={inv.invoice_id}
                      onClick={() => handleSelectPastInvoice(inv)}
                      className={clsx(
                        'p-3.5 border rounded-2xl cursor-pointer flex justify-between items-center transition-all duration-200 text-sm hover:-translate-y-px hover:shadow-md',
                        selectedPastInvoiceId === inv.invoice_id
                          ? 'border-primary bg-primary/5 shadow-sm shadow-primary/5'
                          : 'border-border/80 hover:bg-muted/40'
                      )}
                    >
                      <div className="space-y-1">
                        <div className="font-bold text-foreground/90">{inv.invoice_number}</div>
                        <div className="text-xs text-muted-foreground font-mono">{new Date(inv.created_at).toLocaleString()}</div>
                        {inv.discount_total > 0 && (
                          <div className="text-xs text-destructive font-black bg-destructive/5 border border-destructive/10 px-1.5 py-0.5 rounded inline-block">
                            Discounted (-{formatCurrency(inv.discount_total)})
                          </div>
                        )}
                      </div>
                      <div className="text-right space-y-1">
                        <div className="font-black text-primary text-sm">{formatCurrency(inv.grand_total)}</div>
                        {inv.cashier_name && (
                          <div className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded inline-block font-semibold">
                            {inv.cashier_name}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {foundInvoices.length === 0 && pastBillSearch && (
                <div                className="text-center text-muted-foreground/60 text-sm py-8 bg-muted/20 border border-border/50 border-dashed rounded-2xl">
                  No match found in active invoice records
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

    </div>
  );
}
