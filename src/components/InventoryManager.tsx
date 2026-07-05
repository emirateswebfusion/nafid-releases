import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { useCartStore } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { PackagePlus, Pencil, Save, Printer, RefreshCw, Search, Plus, Minus, Trash2, AlertTriangle, X, Package, Tag, CheckCircle2, AlertCircle, Receipt, Building2, IndianRupee, FileText } from 'lucide-react';
import Barcode from 'react-barcode';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { Modal } from './ui/Modal';
import { Skeleton } from './ui/Skeleton';
import { DateRangeFilter } from './ui/DateRangeFilter';
import { DEFAULT_CODE_TYPE, type CodeType } from '../labelCodeTypes';

// ─── Types ─────────────────────────────────────────────────────────────────
interface Product {
  product_id: string;
  tenant_id: string;
  name: string;
  item_code: string;
  sku_barcode: string;
  category: string;
  brand_manufacturer: string;
  uom: string;
  purchase_price: number;
  base_price: number;
  current_stock: number;
  reorder_level: number;
  is_gst_applicable: number;
  hsn_sac_code: string;
  tax_rate_percent: number;
  domain_attributes: string; // JSON string from SQLite
  discount_percent?: number | null;
  discount_flat?: number | null;
  offer_price?: number | null;
  billing_type?: string;
  grade_id?: string;
  pricing_mode?: string;
  sync_status: string;
  created_at?: string;
  updated_at?: string;
}

const DEFAULT_FORM = {
  item_code: '',
  sku_barcode: '',
  name: '',
  category: '',
  brand_manufacturer: '',
  uom: 'Pcs',
  purchase_price: '' as string | number,
  base_price: '' as string | number,
  current_stock: '' as string | number,
  reorder_level: '' as string | number,
  is_gst_applicable: false,
  hsn_sac_code: '',
  tax_rate_percent: 0,
  domain_attributes: {} as Record<string, any>,
  discount_percent: '' as string | number | null,
  discount_flat: '' as string | number | null,
  offer_price: '' as string | number | null,
  billing_type: 'PIECE',
  grade_id: '',
  pricing_mode: 'FIXED_PRICE',
  show_gst_purchase: false,
  gst_same_as_current: false,
  gst_purchase_price: '' as string | number,
  gst_purchase_quantity: '' as string | number,
  gst_supplier_id: '',
  gst_supplier_name: '',
  gst_bill_number: '',
  gst_bill_date: new Date().toISOString().split('T')[0],
};

// ─── Main Component ─────────────────────────────────────────────────────────
export function InventoryManager({ onClose }: { onClose: () => void }) {
  const { shopDomain } = useCartStore();
  const { tenantId } = useAuthStore();

  const [view, setView] = useState<'list' | 'add' | 'edit'>('list');
  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'updated_at'>('created_at');
  const [filterDate, setFilterDate] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({ ...DEFAULT_FORM });
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [printQuantity, setPrintQuantity] = useState<number | string>(1);
  const [printPrice, setPrintPrice] = useState(true);
  const [printModalProduct, setPrintModalProduct] = useState<Product | null>(null);
  const [adjustingStockId, setAdjustingStockId] = useState<string | null>(null);
  const [priceCoding, setPriceCoding] = useState<Record<string, string> | null>(null);
  const [showLowStockAlert, setShowLowStockAlert] = useState(true);
  const [labelCodeType, setLabelCodeType] = useState<CodeType>(DEFAULT_CODE_TYPE);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [grades, setGrades] = useState<any[]>([]);
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [nameSuggestions, setNameSuggestions] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierCreate, setShowSupplierCreate] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierAddress, setNewSupplierAddress] = useState('');
  const [selectedNameIndex, setSelectedNameIndex] = useState(0);
  const nameContainerRef = useRef<HTMLDivElement>(null);

  const configuredCategories = Array.from(new Set(grades.map(g => g.category)));

  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const LIMIT = 50;

  // Load products when search or sort changes (reset)
  useEffect(() => {
    const timeout = setTimeout(() => {
      setOffset(0);
      setHasMore(true);
      loadProducts(true);
    }, 300); // debounce search
    return () => clearTimeout(timeout);
  }, [searchQuery, sortBy, filterDate, filterDateEnd]);

  // Sync listener — auto-refresh silently
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onSyncDataUpdated(() => {
        console.log('[InventoryManager] Data updated via sync. Auto-refreshing...');
        loadProducts(true);
      });
    }
  }, []);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'price_coding' })
        .then(res => {
          if (res) setPriceCoding(res);
        })
        .catch(console.error);

      window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'label_code_type' })
        .then(res => {
          if (res === 'barcode' || res === 'qrcode') setLabelCodeType(res);
        })
        .catch(console.error);

      window.electronAPI.dbGetGrades(tenantId || 'global')
        .then(res => {
          if (Array.isArray(res)) setGrades(res);
        })
        .catch(console.error);

      window.electronAPI.dbGetParties(tenantId || 'global')
        .then(res => {
          if (Array.isArray(res)) setSuppliers(res);
        })
        .catch(console.error);
    }
  }, [tenantId]);

  useEffect(() => {
    if (view === 'add' && window.electronAPI) {
      window.electronAPI.dbGetNextPurchaseBillNumber({ tenant_id: tenantId || 'global' })
        .then(res => {
          if (res.success && res.billNumber) {
            setFormData(prev => ({ ...prev, gst_bill_number: res.billNumber }));
          }
        })
        .catch(console.error);
    }
  }, [view, tenantId]);

  // Keep GST fields in sync when "Same as Current Product" is enabled
  useEffect(() => {
    if (formData.gst_same_as_current && formData.show_gst_purchase) {
      const syncPrice = formData.purchase_price;
      const syncQty = formData.current_stock;
      if (formData.gst_purchase_price !== syncPrice || formData.gst_purchase_quantity !== syncQty) {
        setFormData(prev => ({
          ...prev,
          gst_purchase_price: syncPrice,
          gst_purchase_quantity: syncQty,
        }));
      }
    }
  }, [formData.gst_same_as_current, formData.show_gst_purchase, formData.purchase_price, formData.current_stock, formData.gst_purchase_price, formData.gst_purchase_quantity]);

  useEffect(() => {
    if (labelCodeType === 'qrcode' && formData.sku_barcode) {
      QRCode.toDataURL(formData.sku_barcode, { width: 150, margin: 1 })
        .then(url => setQrPreviewUrl(url))
        .catch(() => setQrPreviewUrl(null));
    } else {
      setQrPreviewUrl(null);
    }
  }, [labelCodeType, formData.sku_barcode]);

  const loadProducts = async (reset = false) => {
    setIsFetching(true);
    if (window.electronAPI) {
      const { tenantId } = useAuthStore.getState();
      const currentOffset = reset ? 0 : offset;
      const result = await window.electronAPI.dbGetProducts({
        tenant_id: tenantId,
        limit: LIMIT,
        offset: currentOffset,
        search: searchQuery,
        sortBy: sortBy,
        filterDate: filterDate,
        filterDateEnd: filterDateEnd
      });

      if (reset) {
        const count = await window.electronAPI.dbGetProductsCount({
          tenant_id: tenantId,
          search: searchQuery,
          filterDate: filterDate,
          filterDateEnd: filterDateEnd
        });
        setTotalCount(count);
      }

      if (Array.isArray(result)) {
        if (reset) {
          setProducts(result);
        } else {
          setProducts(prev => {
             // filter out duplicates just in case
             const existingIds = new Set(prev.map(p => p.product_id));
             return [...prev, ...result.filter(p => !existingIds.has(p.product_id))];
          });
        }
        setOffset(currentOffset + result.length);
        setHasMore(result.length === LIMIT);
      }
    }
    setIsFetching(false);
  };

  // ── Name autocomplete ───────────────────────────────────────────────
  const nameSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!formData.name || formData.name.length < 2) {
      setNameSuggestions([]);
      return;
    }
    if (nameSearchTimeout.current) clearTimeout(nameSearchTimeout.current);
    nameSearchTimeout.current = setTimeout(async () => {
      if (!window.electronAPI) return;
      const { tenantId } = useAuthStore.getState();
      const products = await window.electronAPI.dbGetProducts({
        tenant_id: tenantId,
        search: formData.name,
        limit: 8,
        sortBy: 'name'
      });
      if (Array.isArray(products)) {
        setNameSuggestions(products);
        setSelectedNameIndex(0);
      }
    }, 300);
    return () => {
      if (nameSearchTimeout.current) clearTimeout(nameSearchTimeout.current);
    };
  }, [formData.name]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (nameContainerRef.current && !nameContainerRef.current.contains(e.target as Node)) {
        setNameSuggestions([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (!nameSuggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedNameIndex(prev => Math.min(prev + 1, nameSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedNameIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && selectedNameIndex >= 0) {
      e.preventDefault();
      selectNameSuggestion(nameSuggestions[selectedNameIndex]);
    } else if (e.key === 'Escape') {
      setNameSuggestions([]);
    }
  };

  const selectNameSuggestion = (product: Product) => {
    setNameSuggestions([]);
    openEdit(product);
  };

  // ── Intersection Observer for infinite scrolling ──
  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useCallback((node: HTMLDivElement | null) => {
    if (isFetching || !hasMore || view !== 'list') return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        loadProducts(false);
      }
    }, { threshold: 1.0 });

    if (node) observer.current.observe(node);
  }, [isFetching, hasMore, view, offset]);

  const openAdd = async () => {
    let nextBarcode = '';
    if (window.electronAPI) {
      try {
        const lastProduct = await window.electronAPI.dbGetProducts({
          tenant_id: tenantId,
          limit: 1,
          sortBy: 'created_at'
        });
        if (Array.isArray(lastProduct) && lastProduct.length > 0 && lastProduct[0].sku_barcode) {
          const lastBarcode = lastProduct[0].sku_barcode;
          const match = lastBarcode.match(/(\d+)[^\d]*$/);
          if (match) {
            const numStr = match[1];
            const nextNum = (BigInt(numStr) + 1n).toString();
            nextBarcode = nextNum.padStart(numStr.length, '0');
          } else {
            // If the barcode doesn't contain a number, default to '1'
            nextBarcode = '1';
          }
        }
      } catch (err) {
        console.error("Failed to fetch last barcode", err);
      }
    }

    setFormData({ ...DEFAULT_FORM, sku_barcode: nextBarcode });
    setEditingProduct(null);
    setView('add');
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    const validGradeId = product.grade_id && grades.some(g => g.grade_id === product.grade_id) ? product.grade_id : '';
    setFormData({
      item_code: product.item_code || '',
      sku_barcode: product.sku_barcode || '',
      name: product.name,
      category: product.category || '',
      brand_manufacturer: product.brand_manufacturer || '',
      uom: product.uom || 'Pcs',
      purchase_price: product.purchase_price || '',
      base_price: product.base_price || '',
      current_stock: product.current_stock ?? '',
      reorder_level: product.reorder_level ?? '',
      is_gst_applicable: product.is_gst_applicable === 1,
      hsn_sac_code: product.hsn_sac_code || '',
      tax_rate_percent: product.tax_rate_percent || 0,
      domain_attributes: (() => {
        try { return JSON.parse(product.domain_attributes || '{}'); } catch { return {}; }
      })(),
      discount_percent: product.discount_percent ?? '',
      discount_flat: product.discount_flat ?? '',
      offer_price: product.offer_price ?? '',
      billing_type: product.billing_type || 'PIECE',
      grade_id: validGradeId,
      pricing_mode: validGradeId ? (product.pricing_mode || 'FIXED_PRICE') : 'FIXED_PRICE',
    });
    setIsCustomCategory(product.category ? !configuredCategories.includes(product.category) : false);
    setView('edit');
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    if (window.electronAPI) {
      const res = await window.electronAPI.dbDeleteProduct(product.product_id);
      if (res.success) {
        setProducts(prev => prev.filter(p => p.product_id !== product.product_id));
        setTotalCount(prev => prev !== null ? prev - 1 : null);
      } else {
        alert('Delete failed: ' + res.error);
      }
    }
  };

  const handleAdjustStock = async (product: Product, delta: number) => {
    if (window.electronAPI) {
      const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs'];
      const step = weightUoms.includes(product.uom) ? 0.1 : 1;
      const adjustedDelta = delta * step;
      setAdjustingStockId(product.product_id);
      try {
        const res = await window.electronAPI.dbAdjustStock({ product_id: product.product_id, delta: adjustedDelta });
        if (res.success) {
          setProducts(prev => prev.map(p => 
            p.product_id === product.product_id 
              ? { ...p, current_stock: Number(p.current_stock) + adjustedDelta } 
              : p
          ));
        } else {
          alert('Failed to adjust stock: ' + res.error);
        }
      } catch (err: any) {
        alert('Failed to adjust stock: ' + err.message);
      } finally {
        setAdjustingStockId(null);
      }
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      
      if (field === 'purchase_price' && priceCoding) {
        const oldPriceStr = String(prev.purchase_price).replace(/\D/g, '');
        let oldCode = '';
        for (const char of oldPriceStr) {
          if (priceCoding[char]) oldCode += priceCoding[char];
        }
        
        const newPriceStr = String(value).replace(/\D/g, '');
        let newCode = '';
        for (const char of newPriceStr) {
          if (priceCoding[char]) newCode += priceCoding[char];
        }

        let currentBarcode = prev.sku_barcode || '';
        
        if (oldCode && currentBarcode.endsWith(oldCode)) {
          currentBarcode = currentBarcode.substring(0, currentBarcode.length - oldCode.length);
        }
        
        if (newCode) {
           currentBarcode = currentBarcode + newCode;
        }
        
        next.sku_barcode = currentBarcode;
      }

      if (field === 'grade_id') {
        next.pricing_mode = value ? 'GRADE_RATE' : 'FIXED_PRICE';
      }

      if (field === 'uom') {
        const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs'];
        next.billing_type = weightUoms.includes(value) ? 'WEIGHT' : 'PIECE';
      }

      if (field === 'current_stock' && view === 'add') {
        setPrintQuantity(value === '' ? '' : value);
      }

      if (field === 'gst_same_as_current' && value) {
        next.gst_purchase_price = next.purchase_price;
        next.gst_purchase_quantity = next.current_stock;
      }

      if ((field === 'base_price' || field === 'grade_id') && next.discount_percent !== undefined && next.discount_percent !== '') {
        const pct = parseFloat(next.discount_percent as string);
        if (!isNaN(pct)) {
          const base = getEffectiveMrp(next);
          next.discount_flat = base ? ((base * pct) / 100).toFixed(2) : '';
        }
      }
      return next;
    });
  };

  const handleDomainAttrChange = (field: string, value: any) =>
    setFormData(prev => ({
      ...prev,
      domain_attributes: { ...prev.domain_attributes, [field]: value }
    }));

  const handleCreateSupplier = async () => {
    if (!newSupplierName.trim()) return;
    if (window.electronAPI) {
      const partyId = uuidv4();
      const res = await window.electronAPI.dbAddParty({
        party_id: partyId,
        tenant_id: tenantId,
        name: newSupplierName.trim(),
        phone: newSupplierPhone.trim() || null,
        address: newSupplierAddress.trim() || null,
        balance: 0,
        balance_type: 'PAYABLE',
        notes: 'Purchase Supplier',
        created_by: useAuthStore.getState().userId,
        created_by_name: useAuthStore.getState().userName,
      });
      if (res.success) {
        const newParty = { party_id: partyId, tenant_id: tenantId, name: newSupplierName.trim(), phone: newSupplierPhone.trim() || null, address: newSupplierAddress.trim() || null, balance: 0, balance_type: 'PAYABLE' };
        setSuppliers(prev => [...prev, newParty]);
        setFormData(prev => ({ ...prev, gst_supplier_id: partyId, gst_supplier_name: newSupplierName.trim() }));
        setShowSupplierCreate(false);
        setNewSupplierName('');
        setNewSupplierPhone('');
        setNewSupplierAddress('');
      } else {
        setStatusMessage({ text: 'Failed to create supplier: ' + (res.error || ''), type: 'error' });
        setTimeout(() => setStatusMessage(null), 3000);
      }
    }
  };

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    (s.phone && s.phone.includes(supplierSearch))
  );

  const getEffectiveMrp = (data: any = formData) => {
    const appliedGrade = data.grade_id ? grades.find(g => g.grade_id === data.grade_id) : null;
    const gradeRate = appliedGrade ? Number(appliedGrade.rate) : null;
    return gradeRate !== null && data.pricing_mode === 'GRADE_RATE' 
      ? Number(data.base_price) + gradeRate 
      : Number(data.base_price) || 0;
  };

  const handleDiscountPercentChange = (val: string) => {
    if (val === '') {
      setFormData(prev => ({ ...prev, discount_percent: '', discount_flat: '' }));
      return;
    }
    const percent = parseFloat(val);
    const base = getEffectiveMrp();
    const flat = base && !isNaN(percent) ? ((base * percent) / 100).toFixed(2) : '';
    setFormData(prev => ({ ...prev, discount_percent: val, discount_flat: flat, offer_price: '' }));
  };

  const handleDiscountFlatChange = (val: string) => {
    if (val === '') {
      setFormData(prev => ({ ...prev, discount_percent: '', discount_flat: '' }));
      return;
    }
    const flat = parseFloat(val);
    const base = getEffectiveMrp();
    const percent = base && !isNaN(flat) ? ((flat / base) * 100).toFixed(2) : '';
    setFormData(prev => ({ ...prev, discount_percent: percent, discount_flat: val, offer_price: '' }));
  };

  const handleOfferPriceChange = (val: string) => {
    if (val === '') {
      setFormData(prev => ({ ...prev, offer_price: '' }));
      return;
    }
    setFormData(prev => ({ ...prev, offer_price: val, discount_percent: '', discount_flat: '' }));
  };

  const generateBarcode = () => {
    let prefix = formData.item_code || '';
    let priceCode = '';
    
    if (priceCoding && formData.purchase_price) {
      const priceStr = String(formData.purchase_price).replace(/\D/g, '');
      for (const char of priceStr) {
        if (priceCoding[char]) priceCode += priceCoding[char];
      }
    }

    if (prefix.length + priceCode.length > 10) {
      prefix = prefix.substring(0, Math.max(0, 10 - priceCode.length));
    }
    
    const remainingLength = 10 - prefix.length - priceCode.length;
    let randomPart = '';
    if (remainingLength > 0) {
      const min = Math.pow(10, remainingLength - 1);
      const max = Math.pow(10, remainingLength) - 1;
      randomPart = Math.floor(min + Math.random() * (max - min + 1)).toString();
    }
    
    handleInputChange('sku_barcode', prefix + randomPart + priceCode);
  };

  const printBarcode = async () => {
    if (!formData.sku_barcode) return;
    setStatusMessage({ text: 'Connecting to printer...', type: 'success' });
    
    if (window.electronAPI) {
      const appliedGrade = formData.grade_id ? grades.find(g => g.grade_id === formData.grade_id) : null;
      const gradeRate = appliedGrade ? Number(appliedGrade.rate) : null;
      const effectiveMrp = gradeRate !== null && formData.pricing_mode === 'GRADE_RATE' 
        ? Number(formData.base_price) + gradeRate 
        : Number(formData.base_price);

      let sp: number | undefined;
      let spType: 'SP' | 'OFF' = 'SP';
      if (formData.offer_price) {
        sp = Number(formData.offer_price);
        spType = 'OFF';
      } else if (formData.discount_flat) {
        sp = effectiveMrp - Number(formData.discount_flat);
        spType = 'SP';
      } else if (formData.discount_percent) {
        sp = effectiveMrp * (1 - Number(formData.discount_percent) / 100);
        spType = 'SP';
      }
      if (sp !== undefined && sp === effectiveMrp) {
         sp = undefined;
      }
      if (printPrice) {
        localStorage.setItem('printBarcodePrice', effectiveMrp.toString());
        if (sp !== undefined) {
          localStorage.setItem('printBarcodeSp', sp.toString());
          localStorage.setItem('printBarcodeSpType', spType);
        } else {
          localStorage.removeItem('printBarcodeSp');
          localStorage.removeItem('printBarcodeSpType');
        }
      } else {
        localStorage.removeItem('printBarcodePrice');
        localStorage.removeItem('printBarcodeSp');
        localStorage.removeItem('printBarcodeSpType');
      }
      localStorage.setItem('printBarcodeName', formData.name);

      const res = await window.electronAPI.printBarcode(
        tenantId || 'global', 
        formData.sku_barcode, 
        printPrice ? effectiveMrp : undefined, 
        formData.name, 
        Math.max(1, Number(printQuantity) || 1), 
        printPrice ? sp : undefined,
        printPrice ? spType : undefined
      );
      if (res.success) {
        setStatusMessage({ text: `Barcode printed successfully (${printQuantity} label${Number(printQuantity) > 1 ? 's' : ''})!`, type: 'success' });
        setPrintQuantity(1);
      } else {
        setStatusMessage({ text: `Print Failed: ${res.error || 'Printer not connected'}`, type: 'error' });
      }
      
      // Clear message after 3 seconds
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      alert('Print command dispatched (mock)');
      setPrintQuantity(1);
    }
  };

  const printProductLabel = async (p: Product) => {
    if (!p.sku_barcode) return;
    setStatusMessage({ text: 'Connecting to printer...', type: 'success' });
    
    if (window.electronAPI) {
      const appliedGrade = p.grade_id ? grades.find(g => g.grade_id === p.grade_id) : null;
      const gradeRate = appliedGrade ? Number(appliedGrade.rate) : null;
      const effectiveMrp = gradeRate !== null && p.pricing_mode === 'GRADE_RATE' 
        ? Number(p.base_price) + gradeRate 
        : Number(p.base_price);

      let sp: number | undefined;
      let spType: 'SP' | 'OFF' = 'SP';
      if (p.offer_price) {
        sp = Number(p.offer_price);
        spType = 'OFF';
      } else if (p.discount_flat) {
        sp = effectiveMrp - Number(p.discount_flat);
        spType = 'SP';
      } else if (p.discount_percent) {
        sp = effectiveMrp * (1 - Number(p.discount_percent) / 100);
        spType = 'SP';
      }
      if (sp !== undefined && sp === effectiveMrp) {
         sp = undefined;
      }
      if (printPrice) {
        localStorage.setItem('printBarcodePrice', effectiveMrp.toString());
        if (sp !== undefined) {
          localStorage.setItem('printBarcodeSp', sp.toString());
          localStorage.setItem('printBarcodeSpType', spType);
        } else {
          localStorage.removeItem('printBarcodeSp');
          localStorage.removeItem('printBarcodeSpType');
        }
      } else {
        localStorage.removeItem('printBarcodePrice');
        localStorage.removeItem('printBarcodeSp');
        localStorage.removeItem('printBarcodeSpType');
      }
      localStorage.setItem('printBarcodeName', p.name);

      const res = await window.electronAPI.printBarcode(
        tenantId || 'global', 
        p.sku_barcode, 
        printPrice ? effectiveMrp : undefined, 
        p.name, 
        Math.max(1, Number(printQuantity) || 1), 
        printPrice ? sp : undefined,
        printPrice ? spType : undefined
      );
      if (res.success) {
        setStatusMessage({ text: `Barcode printed successfully (${printQuantity} label${Number(printQuantity) > 1 ? 's' : ''})!`, type: 'success' });
        setTimeout(() => setPrintModalProduct(null), 2000);
      } else {
        setStatusMessage({ text: `Print Failed: ${res.error || 'Printer not connected'}`, type: 'error' });
      }
      
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ text: 'Print command dispatched (mock)', type: 'success' });
      setTimeout(() => {
        setPrintModalProduct(null);
        setStatusMessage(null);
      }, 2000);
    }
  };

  const downloadCsv = async () => {
    setStatusMessage({ text: 'Generating CSV...', type: 'success' });
    if (window.electronAPI) {
      const { tenantId } = useAuthStore.getState();
      const result = await window.electronAPI.dbGetProducts({
        tenant_id: tenantId,
        filterDate: filterDate,
        filterDateEnd: filterDateEnd,
        limit: 100000 
      });
      if (Array.isArray(result) && result.length > 0) {
        const headers = ['Name', 'Item Code', 'Barcode', 'Category', 'Brand', 'UOM', 'Purchase Price', 'MRP', 'Discount Percentage', 'Offer Price', 'Current Stock', 'Added Date'];
        const csvContent = [
          headers.join(','),
          ...result.map(p => `"${(p.name || '').replace(/"/g, '""')}","${p.item_code || ''}","${p.sku_barcode || ''}","${p.category || ''}","${p.brand_manufacturer || ''}","${p.uom || ''}",${p.purchase_price || 0},${p.base_price || 0},${p.discount_percent || 0},${p.offer_price || 0},${p.current_stock || 0},"${p.created_at || ''}"`)
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const csvName = filterDateEnd ? `products_${filterDate}_${filterDateEnd}.csv` : filterDate ? `products_${filterDate}.csv` : 'products_all.csv';
        link.setAttribute('download', csvName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setStatusMessage({ text: 'CSV Downloaded', type: 'success' });
      } else {
        setStatusMessage({ text: 'No products to download for this date', type: 'error' });
      }
    }
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleSave = async () => {
    if (!formData.name || Number(formData.base_price) <= 0) {
      setStatusMessage({ text: 'Please fill in Name and a valid MRP.', type: 'error' });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    let finalBarcode = formData.sku_barcode;
    if (!finalBarcode) {
      let prefix = formData.item_code || '';
      if (prefix.length > 12) {
        prefix = prefix.substring(0, 12);
      }
      const remainingLength = 12 - prefix.length;
      let code = prefix;
      if (remainingLength > 0) {
        const min = Math.pow(10, remainingLength - 1);
        const max = Math.pow(10, remainingLength) - 1;
        const randomPart = Math.floor(min + Math.random() * (max - min + 1)).toString();
        code += randomPart;
      }
      
      let priceCode = '';
      if (priceCoding && formData.purchase_price) {
        const priceStr = String(formData.purchase_price).replace(/\D/g, '');
        for (const char of priceStr) {
          if (priceCoding[char]) priceCode += priceCoding[char];
        }
      }
      finalBarcode = code + priceCode;
      // Don't just setFormData, pass it directly to payload since state update is async
      setFormData(prev => ({ ...prev, sku_barcode: finalBarcode }));
      setStatusMessage({ text: 'Barcode auto-generated.', type: 'success' });
      setTimeout(() => setStatusMessage(null), 3000);
    }
    
    setLoading(true);

    const payload = {
      ...(editingProduct ?? { product_id: uuidv4(), tenant_id: tenantId || 'unset', sync_status: 'pending', created_at: new Date().toISOString() }),
      ...formData,
      sku_barcode: finalBarcode,
      purchase_price: Number(formData.purchase_price) || 0,
      base_price: Number(formData.base_price) || 0,
      current_stock: Number(formData.current_stock) || 0,
      reorder_level: Number(formData.reorder_level) || 0,
      is_gst_applicable: formData.is_gst_applicable ? 1 : 0,
      domain_attributes: JSON.stringify(formData.domain_attributes),
      discount_percent: formData.discount_percent === '' ? null : Number(formData.discount_percent),
      discount_flat: formData.discount_flat === '' ? null : Number(formData.discount_flat),
      offer_price: formData.offer_price === '' ? null : Number(formData.offer_price),
      billing_type: formData.billing_type,
      grade_id: formData.grade_id || null,
      pricing_mode: formData.grade_id ? 'GRADE_RATE' : 'FIXED_PRICE',
    };

    if (window.electronAPI) {
      const res = view === 'edit'
        ? await window.electronAPI.dbUpdateProduct(payload)
        : await window.electronAPI.dbAddProduct(payload);

      if (res.success) {
        // If GST Purchase details provided, create a purchase bill entry
        if (view === 'add' && formData.show_gst_purchase && formData.gst_purchase_price !== '' && Number(formData.gst_purchase_price) > 0) {
          const purchaseBillId = uuidv4();
          const itemId = uuidv4();
          const gstQty = Number(formData.gst_purchase_quantity) || 0;
          const gstPrice = Number(formData.gst_purchase_price) || 0;
          const gstTotal = gstQty * gstPrice;
          const supplierName = formData.gst_supplier_name || (suppliers.find(s => s.party_id === formData.gst_supplier_id)?.name) || 'Unknown Supplier';

          await window.electronAPI.dbAddPurchaseBill({
            purchase_bill_id: purchaseBillId,
            tenant_id: tenantId,
            bill_number: formData.gst_bill_number || `TEMP-${Date.now()}`,
            supplier_id: formData.gst_supplier_id || null,
            supplier_name: supplierName,
            bill_date: formData.gst_bill_date || new Date().toISOString().split('T')[0],
            notes: `Auto-created from product: ${formData.name}`,
            total_amount: gstTotal,
            items: [{
              item_id: itemId,
              product_id: payload.product_id,
              name: formData.name,
              quantity: gstQty,
              purchase_price: gstPrice,
              total_amount: gstTotal,
              is_gst_applicable: payload.is_gst_applicable,
              tax_rate_percent: payload.tax_rate_percent,
              hsn_sac_code: payload.hsn_sac_code,
            }],
          });
        }

        if (view === 'edit') {
          // Optimistic update for edit
          setProducts(prev => prev.map(p => p.product_id === payload.product_id ? { ...p, ...payload } as Product : p));
        } else {
          // Optimistic update for add
          setProducts(prev => [payload as Product, ...prev]);
          setTotalCount(prev => prev !== null ? prev + 1 : null);
        }
        setView('list');
      } else {
        let errorMessage = res.error || 'Unknown error occurred';
        if (errorMessage.includes('UNIQUE constraint failed')) {
          if (errorMessage.includes('sku_barcode')) {
            errorMessage = 'A product with this barcode already exists.';
          } else {
            errorMessage = 'A product with this exact Name and Brand already exists.';
          }
        }
        setStatusMessage({ text: 'Failed to save: ' + errorMessage, type: 'error' });
        setTimeout(() => setStatusMessage(null), 3000);
      }
    }
    setLoading(false);
  };

  const filtered = products;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr.replace(' ', 'T'));
    if (isNaN(d.getTime())) return '-';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const dayName = d.toLocaleDateString('en-IN', { weekday: 'long' });
    return `${dd}/${mm}/${yyyy} ${dayName}`;
  };

  const groupedByDate = filtered.reduce<Record<string, typeof products>>((acc, p) => {
    const date = formatDate(p.created_at);
    if (!acc[date]) acc[date] = [];
    acc[date].push(p);
    return acc;
  }, {});

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0 gap-4 shadow-sm z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shadow-inner">
            {view === 'list' ? <Package className="w-5 h-5" /> : view === 'add' ? <PackagePlus className="w-5 h-5" /> : <Pencil className="w-5 h-5" />}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">
                {view === 'list' ? 'Inventory' : view === 'add' ? 'Add New Product' : `Edit: ${editingProduct?.name}`}
              </h1>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Active" />
            </div>
            {view === 'list' &&                <p className="text-xs text-muted-foreground font-semibold mt-0.5">{totalCount !== null ? totalCount : '...'} products in stock</p>}
            {view !== 'list' && (
              <span className="text-xs text-muted-foreground font-semibold bg-muted px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 mt-0.5">
                {useAuthStore.getState().role === 'OWNER' ? 'Owner' : (useAuthStore.getState().userName || 'Staff')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {view !== 'list' ? (
            <button onClick={() => setView('list')} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30" title="Back to list">
              <X className="w-4 h-4 text-destructive" />
            </button>
          ) : (
            <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30" title="Close">
              <X className="w-4 h-4 text-destructive" />
            </button>
          )}
        </div>
      </header>
      
      {/* Action Header inside page */}
      {view === 'list' && (
        <div className="flex justify-between items-center gap-4 px-6 py-3 border-b border-border bg-card/50 shrink-0 shadow-sm">
          <div className="flex-1 max-w-lg">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name, barcode, brand, or category..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-9 py-2.5 bg-background border border-border/80 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl text-sm font-medium text-foreground transition-all shadow-sm placeholder:text-muted-foreground/50"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full text-muted-foreground transition-colors border border-destructive/30"
                >
                  <X className="w-4 h-4 text-destructive" />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DateRangeFilter
              startDate={filterDate}
              endDate={filterDateEnd}
              onChange={(start, end) => {
                setFilterDate(start);
                setFilterDateEnd(end);
              }}
            />
            <div className="h-5 w-px bg-border" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-background border border-border rounded-xl py-2.5 px-4 pr-8 text-sm font-medium text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 appearance-none transition-all"
            >
              <option value="name">Sort by Name</option>
              <option value="created_at">Sort by Date Added</option>
              <option value="updated_at">Sort by Date Updated</option>
            </select>
            <button onClick={downloadCsv} className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/5 border border-border/80 rounded-xl transition-all active:scale-95 cursor-pointer" title="Download CSV">
              <Save className="w-4 h-4" />
            </button>
            <button onClick={openAdd} className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm border border-primary/10 active:scale-95 cursor-pointer">
              <Plus className="w-4 h-4" /> Add Product
            </button>
          </div>
        </div>
      )}

      {/* ── PRODUCT LIST VIEW ────────────────────────────────────────────── */}
      {view === 'list' && (
        <div className="flex flex-col flex-1 min-h-0 bg-background">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-2 px-6 py-2.5 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border/60 shrink-0 bg-muted/40">
            <div className="col-span-3">Product</div>
            <div className="col-span-1 text-center">Unit</div>
            <div className="col-span-1 text-right">Purchase</div>
            <div className="col-span-2 text-right">MRP</div>
            <div className="col-span-1 text-right text-emerald-500">Final</div>
            <div className="col-span-3 text-center">Stock</div>
            <div className="col-span-1 text-center">Actions</div>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto divide-y divide-border relative">
            {isFetching && offset === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={`skel-${i}`} className="grid grid-cols-12 gap-2 px-6 py-4 items-center">
                  <div className="col-span-3">
                    <div className="flex items-center gap-2">
                      <div className="space-y-2 w-full">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                        <div className="flex gap-2 mt-1">
                          <Skeleton className="h-4 w-12" />
                          <Skeleton className="h-4 w-16" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-center"><Skeleton className="h-4 w-8" /></div>
                  <div className="col-span-1 flex justify-end"><Skeleton className="h-4 w-16" /></div>
                  <div className="col-span-2 flex justify-end"><Skeleton className="h-4 w-16" /></div>
                  <div className="col-span-2 flex justify-end"><Skeleton className="h-4 w-16" /></div>
                  <div className="col-span-2 flex justify-center gap-2">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-5 w-10" />
                    <Skeleton className="h-6 w-6 rounded-full" />
                  </div>
                  <div className="col-span-1 flex justify-center gap-2">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <Skeleton className="h-8 w-8 rounded-lg" />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-16">
                <PackagePlus className="w-12 h-12 mb-3" />
                <p className="font-medium text-foreground">No products found</p>
                <p className="text-sm mt-1">Click "Add Product" to seed your inventory</p>
              </div>
            ) : Object.entries(groupedByDate).map(([date, items]) => (
              <Fragment key={date}>
                <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm px-6 py-1.5 text-xs font-black text-primary uppercase tracking-wider border-b border-border/60">
                  {date}
                </div>
                {items.map(p => {
                  const isLowStock = p.current_stock <= p.reorder_level && p.reorder_level > 0;
                  
                  let finalPrice: number | null = null;
                  const appliedGrade = p.grade_id ? grades.find(g => g.grade_id === p.grade_id) : null;
                  const gradeRate = appliedGrade ? Number(appliedGrade.rate) : null;
                  const displayMrp = gradeRate !== null && p.pricing_mode === 'GRADE_RATE' 
                    ? Number(p.base_price) + gradeRate 
                    : Number(p.base_price);

                  if (p.offer_price) {
                    finalPrice = Number(p.offer_price);
                  } else if (p.discount_flat) {
                    finalPrice = displayMrp - Number(p.discount_flat);
                  } else if (p.discount_percent) {
                    finalPrice = displayMrp * (1 - Number(p.discount_percent) / 100);
                  }
                  if (finalPrice !== null && isNaN(finalPrice)) finalPrice = null;

                  const da = (() => { try { return JSON.parse(p.domain_attributes || '{}'); } catch { return {}; } })();
                  const piecesPerKg = Number(da.pcs) || 0;
                  const estPieces = piecesPerKg > 0 ? Math.round(Number(p.current_stock) * piecesPerKg) : 0;

                  return (
                    <div key={p.product_id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center bg-card border-b border-border/40 hover:border-primary/30 hover:shadow-sm transition-all duration-150 group">
                      <div className="col-span-3">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-muted/40 text-muted-foreground shrink-0">
                            <Package className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="text-foreground font-bold text-sm">{p.name}</p>
                            <p className="text-muted-foreground text-xs font-mono mt-0.5">
                              {p.item_code && <span className="font-bold mr-2 text-primary">{p.item_code}</span>}
                              {p.sku_barcode}
                            </p>
                            <div className="flex gap-1.5 mt-1">
                              {p.category && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-semibold">{p.category}</span>}
                              {p.brand_manufacturer && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-semibold">{p.brand_manufacturer}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-1 text-center text-muted-foreground text-sm font-semibold">{p.uom}</div>
                      <div className="col-span-1 text-right text-muted-foreground text-sm font-semibold">₹{Number(p.purchase_price).toFixed(2)}</div>
                      <div className="col-span-2 flex flex-col items-end justify-center">
                        <span className={clsx("text-sm", finalPrice !== null ? 'line-through text-muted-foreground/60' : 'text-primary font-bold')}>
                          ₹{displayMrp.toFixed(2)}
                        </span>
                        {gradeRate !== null && p.pricing_mode === 'GRADE_RATE' && (
                          <span className="text-[10px] text-indigo-500 font-semibold leading-tight mt-0.5 text-right">
                            +₹{gradeRate} Grade
                          </span>
                        )}
                      </div>
                      <div className="col-span-1 text-right text-emerald-500 font-bold text-sm">
                        {finalPrice !== null ? `₹${finalPrice.toFixed(2)}` : '-'}
                      </div>

                      {/* Stock with +/- */}
                      <div className="col-span-3 flex items-center justify-center gap-1.5">
                        <button 
                          onClick={() => handleAdjustStock(p, -1)} 
                          disabled={adjustingStockId === p.product_id}
                          className="w-7 h-7 flex items-center justify-center rounded-md bg-background border border-border/50 text-muted-foreground hover:bg-muted hover:text-destructive transition-all active:scale-90 disabled:opacity-50 cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className={clsx('text-sm font-black w-14 text-center flex flex-col items-center justify-center leading-tight', isLowStock ? 'text-amber-500' : 'text-foreground')}>
                          {adjustingStockId === p.product_id ? (
                             <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                          ) : (
                             <>
                               <span>{Number(p.current_stock).toFixed(3).replace(/\.?0+$/, '')}</span>
                               {estPieces > 0 && <span className="text-[9px] text-muted-foreground/60 font-medium">(~{estPieces} pcs)</span>}
                               {isLowStock && <AlertTriangle className="w-3 h-3 ml-0.5 shrink-0 text-amber-500" />}
                             </>
                          )}
                        </span>
                        <button 
                          onClick={() => handleAdjustStock(p, 1)} 
                          disabled={adjustingStockId === p.product_id}
                          className="w-7 h-7 flex items-center justify-center rounded-md bg-background border border-border/50 text-muted-foreground hover:bg-muted hover:text-emerald-500 transition-all active:scale-90 disabled:opacity-50 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Actions */}
                      <div className="col-span-1 flex items-center justify-center gap-1">
                        <button onClick={() => { setPrintModalProduct(p); setPrintQuantity(1); setPrintPrice(true); }} className="p-1.5 text-muted-foreground hover:text-blue-500 hover:bg-muted rounded-lg transition-colors cursor-pointer" title="Print Barcode">
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openEdit(p)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors cursor-pointer" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(p)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded-lg transition-colors cursor-pointer" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </Fragment>
            ))}

            {/* Infinite Scroll Target */}
            {hasMore && (
              <div ref={lastElementRef} className="py-6 flex justify-center items-center shrink-0">
                <div className="flex gap-1 items-center text-muted-foreground text-sm font-medium">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Loading more items...</span>
                </div>
              </div>
            )}
          </div>

          {!hasMore && products.length > 0 && (
            <div className="shrink-0 border-t border-border/60 bg-muted/20 px-6 py-4 text-center text-sm font-bold text-muted-foreground">
              End of inventory list &middot; {totalCount !== null ? totalCount : products.length} total products
            </div>
          )}
          
          {/* Low Stock summary bar */}
          {showLowStockAlert && products.some(p => p.current_stock <= p.reorder_level && p.reorder_level > 0) && (
            <div className="shrink-0 border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="flex-1">{products.filter(p => p.current_stock <= p.reorder_level && p.reorder_level > 0).length} item(s) at or below Low Stock Alert</span>
              <button onClick={() => setShowLowStockAlert(false)} className="p-1 rounded-md border border-amber-500/30 hover:bg-amber-500/15 transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── ADD / EDIT FORM VIEW ─────────────────────────────────────────── */}
      {(view === 'add' || view === 'edit') && (
        <div className="flex flex-col flex-1 min-h-0 bg-background">
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 max-w-full mx-auto w-full">

            {/* Section 1: Core */}
            <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <PackagePlus className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-wider">1. Basic Details</span>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div ref={nameContainerRef} className="relative">
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Item Name *</label>
                    <input type="text" value={formData.name} onChange={e => { handleInputChange('name', e.target.value); setSelectedNameIndex(0); }} onKeyDown={handleNameKeyDown} className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                    {nameSuggestions.length > 0 && (
                      <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-border/80 rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
                        {nameSuggestions.map((p, i) => (
                          <button
                            key={p.product_id}
                            type="button"
                            onMouseDown={() => selectNameSuggestion(p)}
                            onMouseEnter={() => setSelectedNameIndex(i)}
                            className={clsx(
                              'w-full text-left px-4 py-3 flex items-center gap-3 border-b border-border/40 last:border-0 transition-colors cursor-pointer',
                              i === selectedNameIndex ? 'bg-primary/10 text-primary' : 'bg-card text-foreground hover:bg-muted'
                            )}
                          >
                            <Package className="w-4 h-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold truncate">{p.name}</p>
                              <p className="text-xs text-muted-foreground font-mono truncate">
                                {p.item_code && <span className="font-bold mr-1.5 text-primary">{p.item_code}</span>}
                                {p.sku_barcode}
                                {p.brand_manufacturer && <span className="ml-1.5 text-muted-foreground/60">| {p.brand_manufacturer}</span>}
                              </p>
                            </div>
                            {p.current_stock !== undefined && (
                              <span className={clsx(
                                'text-xs font-bold shrink-0 px-2 py-0.5 rounded-full',
                                Number(p.current_stock) <= 0 ? 'bg-red-500/10 text-red-500' :
                                Number(p.current_stock) <= Number(p.reorder_level) ? 'bg-amber-500/10 text-amber-500' :
                                'bg-emerald-500/10 text-emerald-500'
                              )}>
                                {Number(p.current_stock).toFixed(0)} in stock
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Item Code</label>
                    <input type="text" maxLength={10} value={formData.item_code} onChange={e => handleInputChange('item_code', e.target.value.toUpperCase())} className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none font-mono tracking-widest shadow-sm uppercase text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Category</label>
                        {isCustomCategory || configuredCategories.length === 0 ? (
                          <div className="flex gap-2">
                             <input type="text" value={formData.category} onChange={e => handleInputChange('category', e.target.value)} className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" placeholder="Custom Category" />
                             {configuredCategories.length > 0 && (
                               <button type="button" onClick={() => { setIsCustomCategory(false); handleInputChange('category', ''); }} className="text-sm font-bold text-red-500 hover:text-red-600 shrink-0">Cancel</button>
                             )}
                          </div>
                        ) : (
                          <select 
                            value={configuredCategories.includes(formData.category) ? formData.category : (formData.category ? 'CUSTOM' : '')} 
                            onChange={e => {
                              if (e.target.value === 'CUSTOM') {
                                setIsCustomCategory(true);
                                handleInputChange('category', '');
                              } else {
                                handleInputChange('category', e.target.value);
                              }
                            }} 
                            className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm appearance-none text-sm"
                          >
                            <option value="">-- Select Category --</option>
                            {configuredCategories.map(c => <option key={String(c)} value={String(c)}>{c}</option>)}
                            <option value="CUSTOM">Custom...</option>
                          </select>
                        )}
                      </div>
                      {grades.filter(g => g.category === formData.category).length > 0 && (
                        <div className="p-4 bg-muted/10 border border-border/80 rounded-xl">
                          <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Select Grade</label>
                          <select 
                            value={formData.grade_id} 
                            onChange={e => handleInputChange('grade_id', e.target.value)} 
                            className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm appearance-none text-sm"
                          >
                            <option value="">-- No Grade Selected --</option>
                            {grades.filter(g => g.category === formData.category).map(g => (
                              <option key={g.grade_id} value={g.grade_id}>{g.grade_name} (+₹{g.rate})</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Brand / Mfg</label>
                      <input type="text" value={formData.brand_manufacturer} onChange={e => handleInputChange('brand_manufacturer', e.target.value)} className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                    </div>
                  </div>
                </div>

                <div className="bg-muted/20 p-4 rounded-xl border border-border/80 flex flex-col justify-center shadow-sm">
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Barcode *</label>
                      <button onClick={generateBarcode} className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-full transition-all">
                        <RefreshCw className="w-3 h-3" /> Auto Generate
                      </button>
                    </div>
                    <input type="text" value={formData.sku_barcode} onChange={e => handleInputChange('sku_barcode', e.target.value)} className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none font-mono tracking-widest mb-4 shadow-sm text-sm" />
                    {formData.sku_barcode && (
                      <div className="flex flex-col items-center p-4 bg-white rounded-xl border border-border shadow-sm">
                        {labelCodeType === 'qrcode' ? (
                          <img src={qrPreviewUrl || ''} alt="QR Code" style={{ width: '100px', height: '100px', imageRendering: 'pixelated' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <Barcode value={formData.sku_barcode} height={50} displayValue={true} background="#ffffff" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2: Inventory & Pricing */}
            <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <Tag className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-emerald-500 uppercase tracking-wider">2. Inventory & Pricing</span>
              </div>
              <div className="flex gap-4">
                {[
                  { label: 'Purchase Price', field: 'purchase_price', prefix: '₹' },
                  { label: 'MRP *', field: 'base_price', prefix: '₹' },
                  { label: 'Current Stock', field: 'current_stock' },
                  { label: 'Low Stock Alert', field: 'reorder_level' },
                ].map(({ label, field, prefix }) => (
                  <div key={field} className="flex-1 min-w-0">
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{label}</label>
                    <div className="relative">
                      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">{prefix}</span>}
                      <input
                        type="number" step="0.01"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        value={(formData as any)[field]}
                        onChange={e => handleInputChange(field, e.target.value)}
                        className={clsx(
                          'w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm', 
                          prefix && 'pl-8', 
                          field === 'base_price' && 'text-emerald-600 dark:text-emerald-400 font-bold'
                        )}
                      />
                    </div>
                  </div>
                ))}
                <div className="flex-1 min-w-0">
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">UOM</label>
                  <select value={formData.uom} onChange={e => handleInputChange('uom', e.target.value)} className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm appearance-none text-sm">
                    {['Pcs', 'Kgs', 'Grams', 'Mtrs', 'Ltrs', 'Box', 'Dozen'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className={clsx('flex-1 min-w-0 overflow-hidden transition-all duration-500 ease-in-out', ['Kgs', 'Grams', 'Mtrs', 'Ltrs'].includes(formData.uom) ? 'max-w-[250px] opacity-100' : 'max-w-0 opacity-0')}>
                  <div className="flex items-center gap-1 mb-1.5">
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider">Pcs</label>
                    <span className="text-[10px] text-muted-foreground/60 font-normal normal-case">(optional)</span>
                  </div>
                  <input
                    type="number" min="1" step="1"
                    value={formData.domain_attributes?.pcs || ''}
                    onChange={e => handleDomainAttrChange('pcs', e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                    placeholder="e.g. 20"
                  />
                </div>
              </div>
            </section>

            {/* Section 3: Discount & Offers */}
            <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                  <Tag className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-blue-500 uppercase tracking-wider">3. Discount & Offers</span>
              </div>
              <div className="grid grid-cols-2 gap-6">
                {/* Discount Block */}
                <div className="space-y-3 bg-muted/10 p-4 rounded-xl border border-border/80">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-foreground">Discount</h4>
                    <span className="text-xs text-muted-foreground">Applies to MRP</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Percentage (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        value={formData.discount_percent || ''}
                        onChange={e => handleDiscountPercentChange(e.target.value)}
                        disabled={!!formData.offer_price}
                        className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Flat Amount (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        value={formData.discount_flat || ''}
                        onChange={e => handleDiscountFlatChange(e.target.value)}
                        disabled={!!formData.offer_price}
                        className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Offer Block */}
                <div className="space-y-3 bg-muted/10 p-4 rounded-xl border border-border/80">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-foreground">Offer</h4>
                    <span className="text-xs text-muted-foreground">Overrides MRP</span>
                  </div>
                  <div>                      <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Final Offer Price (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      onWheel={e => (e.target as HTMLInputElement).blur()}
                      value={formData.offer_price || ''}
                      onChange={e => handleOfferPriceChange(e.target.value)}
                      disabled={!!formData.discount_percent || !!formData.discount_flat}
                      className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Section 4: Taxes & Config */}
            <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500">
                  <Package className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-orange-500 uppercase tracking-wider">4. Taxes & Config</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">GST Applicable</label>
                  <div
                    onClick={() => handleInputChange('is_gst_applicable', !formData.is_gst_applicable)}
                    className={clsx(
                      'flex items-center justify-center gap-1.5 border-2 rounded-xl py-3.5 px-2.5 transition-all duration-200 cursor-pointer active:scale-[0.98]',
                      formData.is_gst_applicable
                        ? 'bg-primary/10 border-primary text-primary shadow-sm'
                        : 'bg-muted/30 border-border/80 text-muted-foreground hover:bg-muted/50 hover:border-border'
                    )}
                  >
                    <input
                      type="checkbox"
                      id="gst"
                      checked={formData.is_gst_applicable}
                      onChange={e => handleInputChange('is_gst_applicable', e.target.checked)}
                      className={clsx(
                        'w-3.5 h-3.5 rounded pointer-events-none',
                        formData.is_gst_applicable ? 'accent-primary' : 'accent-muted-foreground'
                      )}
                    />
                    <label htmlFor="gst" className={clsx(
                      'font-bold text-xs cursor-pointer select-none',
                      formData.is_gst_applicable ? 'text-primary' : 'text-muted-foreground'
                    )}>
                      {formData.is_gst_applicable ? 'Enabled' : 'Disabled'}
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">HSN / SAC Code</label>
                  <input type="text" value={formData.hsn_sac_code} onChange={e => handleInputChange('hsn_sac_code', e.target.value)} disabled={!formData.is_gst_applicable} className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none disabled:opacity-50 transition-all shadow-sm text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Tax Rate %</label>
                  <select value={formData.tax_rate_percent} onChange={e => handleInputChange('tax_rate_percent', parseFloat(e.target.value))} disabled={!formData.is_gst_applicable} className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none disabled:opacity-50 transition-all shadow-sm appearance-none text-sm">
                    {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                  </select>
                </div>
              </div>
            </section>

            {/* Section 4: Domain Attributes */}
            {shopDomain !== 'GENERAL' && (
              <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                    <Package className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black text-amber-500 uppercase tracking-wider">4. Domain Fields — {shopDomain}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {shopDomain === 'HARDWARE' && (<>
                    <DomainField label="Dimensions (L×W×H)" value={formData.domain_attributes['dimensions'] || ''} onChange={v => handleDomainAttrChange('dimensions', v)} />
                    <DomainField label="Material" value={formData.domain_attributes['material'] || ''} onChange={v => handleDomainAttrChange('material', v)} />
                    <DomainField label="Batch Number" value={formData.domain_attributes['batch_number'] || ''} onChange={v => handleDomainAttrChange('batch_number', v)} />
                    <DomainField label="Expiry Date" type="date" value={formData.domain_attributes['expiry_date'] || ''} onChange={v => handleDomainAttrChange('expiry_date', v)} />
                  </>)}
                  {shopDomain === 'JEWELRY' && (<>
                    <DomainField label="Purity (e.g. 22K)" value={formData.domain_attributes['purity'] || ''} onChange={v => handleDomainAttrChange('purity', v)} />
                    <DomainField label="Weight (Grams)" type="number" value={formData.domain_attributes['weight_grams'] || ''} onChange={v => handleDomainAttrChange('weight_grams', v)} />
                    <DomainField label="Making Charge %" type="number" value={formData.domain_attributes['making_charge_pct'] || ''} onChange={v => handleDomainAttrChange('making_charge_pct', v)} />
                    <DomainField label="Hallmark HUID" value={formData.domain_attributes['hallmark_huid'] || ''} onChange={v => handleDomainAttrChange('hallmark_huid', v)} />
                  </>)}
                </div>
              </section>
            )}

            {/* Section 5: GST Purchase Details — only in Add mode */}
            {view === 'add' && (
              <section className="rounded-2xl overflow-hidden shadow-sm border border-purple-500/20" style={{background: 'linear-gradient(135deg, var(--card) 0%, color-mix(in srgb, var(--card) 96%, #a855f7) 100%)'}}>
                {/* Section Header */}
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-purple-500/15" style={{background: 'linear-gradient(90deg, color-mix(in srgb, #a855f7 12%, transparent), color-mix(in srgb, #a855f7 4%, transparent))'}}>
                  <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-purple-500/15 text-purple-500 shrink-0">
                    <Receipt className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-black text-purple-500 uppercase tracking-widest">5. GST Purchase Entry</span>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-tight">Record the purchase bill linked to this stock addition</p>
                  </div>
                  {/* Toggle Switch */}
                  <label className="flex items-center gap-2.5 cursor-pointer select-none shrink-0">
                    <span className="text-xs font-bold text-muted-foreground">{formData.show_gst_purchase ? 'Enabled' : 'Disabled'}</span>
                    <div
                      onClick={() => handleInputChange('show_gst_purchase', !formData.show_gst_purchase)}
                      className={clsx(
                        'relative w-11 h-6 rounded-full transition-all duration-300 cursor-pointer shadow-inner',
                        formData.show_gst_purchase ? 'bg-purple-500' : 'bg-muted/60 border border-border/80'
                      )}
                    >
                      <div className={clsx(
                        'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300',
                        formData.show_gst_purchase ? 'left-5' : 'left-0.5'
                      )} />
                    </div>
                  </label>
                </div>

                {/* Collapsed — info callout */}
                {!formData.show_gst_purchase && (
                  <div className="px-5 py-4 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/8 text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">No purchase entry will be recorded</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">Enable this to log the supplier bill, purchase price, and quantity into your GST purchase ledger for ITC (Input Tax Credit) tracking.</p>
                    </div>
                  </div>
                )}

                {/* Expanded form */}
                {formData.show_gst_purchase && (
                  <div className="px-5 py-4 space-y-5">

                    {/* Auto-fill toggle */}
                    <div
                      onClick={() => handleInputChange('gst_same_as_current', !formData.gst_same_as_current)}
                      className={clsx(
                        'flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer select-none transition-all duration-200',
                        formData.gst_same_as_current
                          ? 'bg-purple-500/10 border-purple-500/30 shadow-sm'
                          : 'bg-muted/10 border-border/60 hover:bg-muted/20 hover:border-border/80'
                      )}
                    >
                      <div className={clsx(
                        'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-200',
                        formData.gst_same_as_current ? 'bg-purple-500 border-purple-500' : 'border-border/80 bg-background'
                      )}>
                        {formData.gst_same_as_current && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={clsx('text-sm font-bold', formData.gst_same_as_current ? 'text-purple-600 dark:text-purple-400' : 'text-foreground')}>Same as Current Product</span>
                        <p className="text-xs text-muted-foreground mt-0.5">Auto-fills price &amp; quantity from the main product fields above</p>
                      </div>
                      {formData.gst_same_as_current && (
                        <span className="text-xs font-bold text-purple-500 bg-purple-500/10 px-2 py-0.5 rounded-full shrink-0">Auto</span>
                      )}
                    </div>

                    {/* Purchase Price & Quantity */}
                    <div className="rounded-xl border border-border/60 overflow-hidden">
                      <div className="px-4 py-2 bg-muted/20 border-b border-border/50 flex items-center gap-2">
                        <IndianRupee className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-black text-muted-foreground uppercase tracking-wider">Purchase Figures</span>
                      </div>
                      <div className="grid grid-cols-2 gap-0 divide-x divide-border/50">
                        <div className="p-4">
                          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Purchase Price</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm select-none">₹</span>
                            <input
                              type="number" step="0.01"
                              onWheel={e => (e.target as HTMLInputElement).blur()}
                              value={formData.gst_purchase_price}
                              onChange={e => handleInputChange('gst_purchase_price', e.target.value)}
                              disabled={formData.gst_same_as_current}
                              placeholder="0.00"
                              className="w-full bg-background border border-border/70 rounded-lg p-2.5 pl-7 text-foreground focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 focus:outline-none transition-all no-spinners text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>
                        <div className="p-4">
                          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Quantity</label>
                          <div className="relative">
                            <input
                              type="number" step="0.01"
                              onWheel={e => (e.target as HTMLInputElement).blur()}
                              value={formData.gst_purchase_quantity}
                              onChange={e => handleInputChange('gst_purchase_quantity', e.target.value)}
                              disabled={formData.gst_same_as_current}
                              placeholder="0"
                              className="w-full bg-background border border-border/70 rounded-lg p-2.5 text-foreground focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 focus:outline-none transition-all no-spinners text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Supplier & Bill Reference */}
                    <div className="grid grid-cols-2 gap-4">

                      {/* Supplier Block */}
                      <div className="rounded-xl border border-border/60 overflow-hidden">
                        <div className="px-4 py-2 bg-muted/20 border-b border-border/50 flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs font-black text-muted-foreground uppercase tracking-wider">Supplier</span>
                        </div>
                        <div className="p-4">
                          {showSupplierCreate ? (
                            <div className="space-y-2">
                              <input
                                type="text" placeholder="Supplier Name *"
                                value={newSupplierName}
                                onChange={e => setNewSupplierName(e.target.value)}
                                className="w-full bg-background border border-border/70 rounded-lg p-2.5 text-foreground focus:border-purple-500 focus:ring-1 focus:ring-purple-500/10 focus:outline-none text-sm"
                              />
                              <input
                                type="text" placeholder="Phone (optional)"
                                value={newSupplierPhone}
                                onChange={e => setNewSupplierPhone(e.target.value)}
                                className="w-full bg-background border border-border/70 rounded-lg p-2.5 text-foreground focus:border-purple-500 focus:ring-1 focus:ring-purple-500/10 focus:outline-none text-sm"
                              />
                              <input
                                type="text" placeholder="Address (optional)"
                                value={newSupplierAddress}
                                onChange={e => setNewSupplierAddress(e.target.value)}
                                className="w-full bg-background border border-border/70 rounded-lg p-2.5 text-foreground focus:border-purple-500 focus:ring-1 focus:ring-purple-500/10 focus:outline-none text-sm"
                              />
                              <div className="flex gap-2 pt-1">
                                <button onClick={handleCreateSupplier} className="flex-1 px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-xs font-bold transition-all cursor-pointer">
                                  Save Supplier
                                </button>
                                <button onClick={() => { setShowSupplierCreate(false); setNewSupplierName(''); setNewSupplierPhone(''); setNewSupplierAddress(''); }} className="px-3 py-2 text-red-500 border border-red-200 dark:border-red-900 rounded-lg text-xs font-bold transition-all cursor-pointer">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="relative">
                              <input
                                type="text"
                                placeholder="Search or select supplier..."
                                value={supplierSearch}
                                onChange={e => {
                                  setSupplierSearch(e.target.value);
                                  const match = suppliers.find(s => s.name.toLowerCase() === e.target.value.toLowerCase());
                                  if (match) {
                                    setFormData(prev => ({ ...prev, gst_supplier_id: match.party_id, gst_supplier_name: match.name }));
                                  }
                                }}
                                className="w-full bg-background border border-border/70 rounded-lg p-2.5 text-foreground focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 focus:outline-none transition-all text-sm"
                              />
                              {supplierSearch && filteredSuppliers.length > 0 && (
                                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-border/80 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                                  {filteredSuppliers.map(s => (
                                    <button
                                      key={s.party_id}
                                      type="button"
                                      onMouseDown={() => {
                                        setFormData(prev => ({ ...prev, gst_supplier_id: s.party_id, gst_supplier_name: s.name }));
                                        setSupplierSearch(s.name);
                                      }}
                                      className="w-full text-left px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted border-b border-border/40 last:border-0 transition-colors cursor-pointer flex items-center gap-2"
                                    >
                                      <span className="font-bold">{s.name}</span>
                                      {s.phone && <span className="text-xs text-muted-foreground">{s.phone}</span>}
                                      {s.balance_type === 'PAYABLE' && s.balance > 0 && (
                                        <span className="text-xs text-red-500 ml-auto font-bold">₹{Number(s.balance).toFixed(2)}</span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => setShowSupplierCreate(true)}
                                className="mt-2 text-xs font-bold text-purple-500 hover:text-purple-600 flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <Plus className="w-3 h-3" /> Add New Supplier
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Bill Reference Block */}
                      <div className="rounded-xl border border-border/60 overflow-hidden">
                        <div className="px-4 py-2 bg-muted/20 border-b border-border/50 flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs font-black text-muted-foreground uppercase tracking-wider">Bill Reference</span>
                        </div>
                        <div className="p-4 space-y-3">
                          <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Bill / Invoice No.</label>
                            <input
                              type="text"
                              value={formData.gst_bill_number}
                              onChange={e => handleInputChange('gst_bill_number', e.target.value)}
                              placeholder="e.g. INV-2024-001"
                              className="w-full bg-background border border-border/70 rounded-lg p-2.5 text-foreground focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 focus:outline-none transition-all font-mono tracking-wider text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Bill Date</label>
                            <input
                              type="date"
                              value={formData.gst_bill_date}
                              onChange={e => handleInputChange('gst_bill_date', e.target.value)}
                              className="w-full bg-background border border-border/70 rounded-lg p-2.5 text-foreground focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 focus:outline-none transition-all text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ITC Info strip */}
                    <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-purple-500/6 border border-purple-500/15">
                      <div className="w-4 h-4 rounded-full bg-purple-500/15 text-purple-500 flex items-center justify-center shrink-0 mt-0.5 text-xs font-black">i</div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        This purchase entry will be recorded in your <span className="font-bold text-foreground">GST Purchase Ledger</span> and may be used for <span className="font-bold text-foreground">Input Tax Credit (ITC)</span> reconciliation.
                      </p>
                    </div>

                  </div>
                )}
              </section>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border/50 bg-background">
            {/* Status alerts */}
            <div className="px-4 pt-2">
              {statusMessage && (
                <div className={clsx(
                  "px-3 py-2.5 rounded-xl border text-sm font-bold flex items-center gap-2 animate-in fade-in duration-200",
                  statusMessage.type === 'success' ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 border-destructive/20 text-destructive"
                )}>
                  {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span className="flex-1">{statusMessage.text}</span>
                </div>
              )}
            </div>

            {/* Action row */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-muted/50 border border-border/60 rounded-xl p-0.5 px-2 shadow-sm">
                  <span className="text-muted-foreground text-sm font-bold">Qty:</span>
                  <input 
                    type="number" 
                    min="1" 
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    value={printQuantity} 
                    onChange={e => setPrintQuantity(e.target.value === '' ? '' : e.target.value)} 
                    className="w-10 h-7 bg-transparent text-foreground focus:outline-none text-center font-black text-sm no-spinners" 
                  />
                </div>
                <label className="flex items-center gap-1.5 bg-muted/50 border border-border/60 rounded-xl px-3 py-1.5 cursor-pointer hover:bg-muted transition-colors select-none shadow-sm">
                  <input 
                    type="checkbox" 
                    id="print_price" 
                    checked={printPrice} 
                    onChange={e => setPrintPrice(e.target.checked)} 
                    className="w-3.5 h-3.5 accent-primary rounded cursor-pointer" 
                  />
                  <span className="text-muted-foreground text-xs font-bold whitespace-nowrap">Price</span>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={printBarcode} className="flex items-center gap-1.5 px-3.5 py-2 bg-muted hover:bg-muted/80 border border-border/80 text-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm">
                  <Printer className="w-3.5 h-3.5" />
                  Print Label
                </button>
                <button onClick={handleSave} disabled={loading} className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm">
                  <Save className="w-3.5 h-3.5" />
                  {loading ? 'Saving...' : view === 'edit' ? 'Update Product' : 'Add to Inventory'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}



      {printModalProduct && (
        <Modal
          isOpen={true}
          onClose={() => { setPrintModalProduct(null); setStatusMessage(null); }}
          className="max-w-lg"
          closeButton={null}
        >
          <div className="flex flex-col">
            {/* ── Label Preview Card ── */}
            <div className="px-6 pt-6 pb-4">
              <div className="bg-white rounded-2xl border-2 border-dashed border-muted-foreground/25 p-6 flex flex-col items-center text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,0,0,0.02)_10px,rgba(0,0,0,0.02)_20px)]" />
                <div className="relative">
                  {labelCodeType === 'qrcode' ? (
                    <QRCodePreview barcode={printModalProduct.sku_barcode} />
                  ) : (
                    <Barcode value={printModalProduct.sku_barcode} height={50} displayValue={false} margin={0} width={1.8} background="transparent" />
                  )}
                  <p className="font-bold text-gray-800 text-lg mt-3 tracking-tight">{printModalProduct.name}</p>
                  <p className="font-mono text-sm text-gray-500 tracking-wider mt-0.5">{printModalProduct.sku_barcode}</p>
                  <div className={clsx(
                    "mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold",
                    printPrice ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" : "bg-muted text-muted-foreground border border-border"
                  )}>
                    <span>MRP:</span>
                    <span className="text-sm">
                      ₹{(() => {
                        const g = printModalProduct.grade_id ? grades.find(gr => gr.grade_id === printModalProduct.grade_id) : null;
                        const gr = g ? Number(g.rate) : null;
                        return (gr !== null && printModalProduct.pricing_mode === 'GRADE_RATE' ? Number(printModalProduct.base_price) + gr : Number(printModalProduct.base_price)).toFixed(2);
                      })()}
                    </span>
                  </div>
                  {!printPrice && (
                    <div className="mt-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                      Price Hidden
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Settings ── */}
            <div className="px-6 pb-2 space-y-3">
              <div className="grid grid-cols-[1fr_auto] gap-4 items-end">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Number of Labels</label>
                  <div className="flex items-center gap-2 bg-background border border-border rounded-xl p-1 pl-3 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
                    <span className="text-muted-foreground text-sm font-semibold shrink-0">
                      <Printer className="w-4 h-4 inline -mt-0.5 mr-1.5" />
                      ×
                    </span>
                    <input
                      type="number"
                      min="1"
                      onWheel={e => (e.target as HTMLInputElement).blur()}
                      value={printQuantity}
                      onChange={e => setPrintQuantity(e.target.value === '' ? '' : e.target.value)}
                      className="w-16 bg-transparent text-foreground focus:outline-none text-center font-bold text-lg no-spinners py-1.5"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-3 bg-muted/30 border border-border rounded-xl px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors select-none">
                  <input
                    type="checkbox"
                    checked={printPrice}
                    onChange={e => setPrintPrice(e.target.checked)}
                    className="w-4 h-4 accent-primary rounded cursor-pointer"
                  />
                  <span className="text-sm font-semibold text-foreground">Show Price</span>
                </label>
              </div>
            </div>

            {/* ── Status & Actions ── */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-border mt-3 gap-4">
              <div className="flex-1 min-w-0">
                {statusMessage && (
                  <div className={clsx(
                    "px-3 py-2 rounded-lg text-sm font-bold animate-in fade-in",
                    statusMessage.type === 'success' ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
                  )}>
                    {statusMessage.text}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => { setPrintModalProduct(null); setStatusMessage(null); }}
                  className="px-4 py-2.5 text-sm font-semibold text-red-500 hover:text-red-600 border border-red-200 dark:border-red-900 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => printProductLabel(printModalProduct)}
                  className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-all"
                >
                  <Printer className="w-4 h-4" />
                  Print {printQuantity !== '' && Number(printQuantity) > 1 ? `${printQuantity} Labels` : 'Label'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Helper sub-components ───────────────────────────────────────────────────
function QRCodePreview({ barcode }: { barcode: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(barcode, { width: 120, margin: 1 })
      .then(u => setUrl(u))
      .catch(() => setUrl(null));
  }, [barcode]);
  if (!url) return <div style={{ width: '100px', height: '50px', background: '#f0f0f0' }} />;
  return <img src={url} alt="QR" style={{ width: '100px', height: '100px', imageRendering: 'pixelated' }} />;
}

function DomainField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-muted-foreground mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none transition-all shadow-sm" />
    </div>
  );
}
