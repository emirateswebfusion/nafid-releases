import { useState, useEffect, useRef, useCallback } from 'react';
import { useCartStore } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { PackagePlus, Pencil, Save, Printer, RefreshCw, Search, Plus, Minus, Trash2, AlertTriangle, X } from 'lucide-react';
import Barcode from 'react-barcode';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { Modal } from './ui/Modal';
import { Skeleton } from './ui/Skeleton';

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
  average_weight_per_piece?: number | null;
  weight_override_allowed?: number;
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
  average_weight_per_piece: '' as string | number | null,
  weight_override_allowed: false,
};

// ─── Main Component ─────────────────────────────────────────────────────────
export function InventoryManager({ onClose }: { onClose: () => void }) {
  const { shopDomain } = useCartStore();
  const { tenantId } = useAuthStore();

  // View state: 'list' | 'add' | 'edit'
  const [view, setView] = useState<'list' | 'add' | 'edit'>('list');
  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'updated_at'>('created_at');
  const [filterDate, setFilterDate] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({ ...DEFAULT_FORM });
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [printQuantity, setPrintQuantity] = useState<number | string>(1);
  const [printPrice, setPrintPrice] = useState(true);
  const [printModalProduct, setPrintModalProduct] = useState<Product | null>(null);
  const [adjustingStockId, setAdjustingStockId] = useState<string | null>(null);
  const [hasNewSyncData, setHasNewSyncData] = useState(false);
  const [priceCoding, setPriceCoding] = useState<Record<string, string> | null>(null);
  const [grades, setGrades] = useState<any[]>([]);
  const [isCustomCategory, setIsCustomCategory] = useState(false);

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
  }, [searchQuery, sortBy, filterDate]);

  // Sync listener
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onSyncDataUpdated(() => {
        console.log('[InventoryManager] Data updated via sync. Prompting refresh...');
        setHasNewSyncData(true);
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

      window.electronAPI.dbGetGrades(tenantId || 'global')
        .then(res => {
          if (Array.isArray(res)) setGrades(res);
        })
        .catch(console.error);
    }
  }, [tenantId]);

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
        filterDate: filterDate
      });

      if (reset) {
        const count = await window.electronAPI.dbGetProductsCount({
          tenant_id: tenantId,
          search: searchQuery,
          filterDate: filterDate
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

  // Intersection Observer for infinite scrolling
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
      average_weight_per_piece: product.average_weight_per_piece ?? '',
      weight_override_allowed: product.weight_override_allowed === 1,
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
      setAdjustingStockId(product.product_id);
      try {
        const res = await window.electronAPI.dbAdjustStock({ product_id: product.product_id, delta });
        if (res.success) {
          setProducts(prev => prev.map(p => 
            p.product_id === product.product_id 
              ? { ...p, current_stock: Number(p.current_stock) + delta } 
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

      if (field === 'base_price' && next.discount_percent !== undefined && next.discount_percent !== '') {
        const pct = parseFloat(next.discount_percent as string);
        if (!isNaN(pct)) {
          next.discount_flat = value ? ((value * pct) / 100).toFixed(2) : '';
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

  const handleDiscountPercentChange = (val: string) => {
    if (val === '') {
      setFormData(prev => ({ ...prev, discount_percent: '', discount_flat: '' }));
      return;
    }
    const percent = parseFloat(val);
    const base = Number(formData.base_price) || 0;
    const flat = base && !isNaN(percent) ? ((base * percent) / 100).toFixed(2) : '';
    setFormData(prev => ({ ...prev, discount_percent: val, discount_flat: flat, offer_price: '' }));
  };

  const handleDiscountFlatChange = (val: string) => {
    if (val === '') {
      setFormData(prev => ({ ...prev, discount_percent: '', discount_flat: '' }));
      return;
    }
    const flat = parseFloat(val);
    const base = Number(formData.base_price) || 0;
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
      // Fallback for hot-reloading without electron restart
      let sp: number | undefined;
      let spType: 'SP' | 'OFF' = 'SP';
      if (formData.offer_price) {
        sp = Number(formData.offer_price);
        spType = 'OFF';
      } else if (formData.discount_flat) {
        sp = (Number(formData.base_price) || 0) - Number(formData.discount_flat);
        spType = 'SP';
      } else if (formData.discount_percent) {
        sp = (Number(formData.base_price) || 0) * (1 - Number(formData.discount_percent) / 100);
        spType = 'SP';
      }
      if (sp !== undefined && sp === formData.base_price) {
         sp = undefined;
      }
      if (printPrice) {
        localStorage.setItem('printBarcodePrice', formData.base_price.toString());
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
        printPrice ? Number(formData.base_price) : undefined, 
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
      let sp: number | undefined;
      let spType: 'SP' | 'OFF' = 'SP';
      if (p.offer_price) {
        sp = Number(p.offer_price);
        spType = 'OFF';
      } else if (p.discount_flat) {
        sp = (p.base_price || 0) - Number(p.discount_flat);
        spType = 'SP';
      } else if (p.discount_percent) {
        sp = (p.base_price || 0) * (1 - Number(p.discount_percent) / 100);
        spType = 'SP';
      }
      if (sp !== undefined && sp === p.base_price) {
         sp = undefined;
      }
      if (printPrice) {
        localStorage.setItem('printBarcodePrice', p.base_price.toString());
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
        printPrice ? p.base_price : undefined, 
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
        link.setAttribute('download', filterDate ? `products_${filterDate}.csv` : 'products_all.csv');
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
      setTimeout(() => setStatusMessage(null), 2000);
    }
    
    setLoading(true);

    const payload = {
      ...(editingProduct ?? { product_id: uuidv4(), tenant_id: tenantId || 'unset', sync_status: 'pending' }),
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
      average_weight_per_piece: formData.average_weight_per_piece === '' ? null : Number(formData.average_weight_per_piece),
      weight_override_allowed: formData.weight_override_allowed ? 1 : 0,
    };

    if (window.electronAPI) {
      const res = view === 'edit'
        ? await window.electronAPI.dbUpdateProduct(payload)
        : await window.electronAPI.dbAddProduct(payload);

      if (res.success) {
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
        setTimeout(() => setStatusMessage(null), 4000);
      }
    }
    setLoading(false);
  };

  // No frontend filtering/sorting needed anymore, it's done in the backend
  const filtered = products;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      fullScreen={true}
      title={
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-lg">
            {view === 'list' ? <Search className="w-6 h-6" /> : view === 'add' ? <PackagePlus className="w-6 h-6" /> : <Pencil className="w-6 h-6" />}
          </div>
          <div>
            <h2 className="text-2xl font-bold">
              {view === 'list' ? 'Inventory' : view === 'add' ? 'Add New Product' : `Edit: ${editingProduct?.name}`}
            </h2>
            {view === 'list' && <p className="text-muted-foreground text-sm font-normal">{totalCount !== null ? totalCount : '...'} products in stock</p>}
          </div>
        </div>
      }
      closeButton={
        view !== 'list' ? (
          <button onClick={() => setView('list')} className="p-2 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded-lg transition-colors border border-border shadow-sm">
            <X className="w-5 h-5" />
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-col h-full overflow-hidden">
        
        {/* Action Header inside modal */}
        {view === 'list' && (
          <div className="flex justify-between items-center p-4 border-b border-border bg-muted/10 shrink-0">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by name, barcode, or category..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg py-2.5 pl-10 pr-4 text-foreground focus:border-primary focus:outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input 
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="bg-background border border-border rounded-lg py-2 px-3 text-sm text-foreground focus:border-primary focus:outline-none"
              />
              <button onClick={downloadCsv} className="p-2 text-muted-foreground hover:text-primary transition-colors bg-muted rounded-lg" title="Download CSV">
                <Save className="w-5 h-5" />
              </button>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="bg-background border border-border rounded-lg py-2 px-3 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="name">Sort by Name</option>
                <option value="created_at">Sort by Added Date (Desc)</option>
                <option value="updated_at">Sort by Updated Date (Desc)</option>
              </select>
              <button onClick={openAdd} className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-bold flex items-center gap-2 transition-colors shadow-sm">
                <Plus className="w-4 h-4" /> Add Product
              </button>
            </div>
          </div>
        )}

        {/* ── PRODUCT LIST VIEW ────────────────────────────────────────────── */}
        {view === 'list' && (
          <div className="flex flex-col flex-1 min-h-0 bg-background">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border shrink-0 bg-muted/5">
              <div className="col-span-3">Product</div>
              <div className="col-span-1 text-center">Unit</div>
              <div className="col-span-1 text-right">Purchase</div>
              <div className="col-span-2 text-right">MRP</div>
              <div className="col-span-2 text-right text-emerald-500 font-bold">Final Price</div>
              <div className="col-span-2 text-center">Stock</div>
              <div className="col-span-1 text-center">Actions</div>
            </div>

            {/* Rows */}
            <div className="flex-1 overflow-y-auto divide-y divide-border relative">
              {hasNewSyncData && (
                <div className="sticky top-2 z-10 mx-4 mb-2">
                  <button 
                    onClick={() => {
                      setHasNewSyncData(false);
                      setOffset(0);
                      setHasMore(true);
                      loadProducts(true);
                    }}
                    className="w-full bg-primary text-primary-foreground font-bold text-sm py-2 px-4 rounded-xl shadow-lg border border-primary-foreground/20 flex items-center justify-center gap-2 hover:bg-primary/90 transition-all animate-in fade-in slide-in-from-top-4"
                  >
                    <RefreshCw className="w-4 h-4" />
                    New data synced — Click to refresh
                  </button>
                </div>
              )}
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
              ) : filtered.map(p => {
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

                return (
                  <div key={p.product_id} className="grid grid-cols-12 gap-2 px-6 py-4 items-center hover:bg-muted/30 transition-colors">
                    <div className="col-span-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="text-foreground font-semibold text-sm">{p.name}</p>
                          <p className="text-muted-foreground text-xs font-mono mt-0.5">
                            {p.item_code && <span className="font-bold mr-2 text-primary">{p.item_code}</span>}
                            {p.sku_barcode}
                          </p>
                          <div className="flex gap-2 mt-1">
                            {p.category && <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded font-medium">{p.category}</span>}
                            {p.brand_manufacturer && <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded font-medium">{p.brand_manufacturer}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="col-span-1 text-center text-muted-foreground text-sm font-medium">{p.uom}</div>
                    <div className="col-span-1 text-right text-muted-foreground text-sm font-medium">₹{Number(p.purchase_price).toFixed(2)}</div>
                    <div className="col-span-2 flex flex-col items-end justify-center">
                      <span className={clsx("text-sm", finalPrice !== null ? 'line-through text-muted-foreground/60' : 'text-primary font-bold')}>
                        ₹{displayMrp.toFixed(2)}
                      </span>
                      {gradeRate !== null && p.pricing_mode === 'GRADE_RATE' && (
                        <span className="text-[10px] text-indigo-500 font-medium leading-tight mt-0.5 max-w-[100px] text-right">
                          incl. Grade Rate (₹{gradeRate})
                        </span>
                      )}
                    </div>
                    <div className="col-span-2 text-right text-emerald-500 font-bold text-sm">
                      {finalPrice !== null ? `₹${finalPrice.toFixed(2)}` : '-'}
                    </div>

                    {/* Stock with +/- */}
                    <div className="col-span-2 flex items-center justify-center gap-2">
                      <button 
                        onClick={() => handleAdjustStock(p, -1)} 
                        disabled={adjustingStockId === p.product_id}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className={clsx('text-sm font-bold w-12 text-center flex items-center justify-center', isLowStock ? 'text-amber-500' : 'text-foreground')}>
                        {adjustingStockId === p.product_id ? (
                           <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                        ) : (
                           <>
                             {Number(p.current_stock).toFixed(0)}
                             {isLowStock && <AlertTriangle className="inline w-3 h-3 ml-1 text-amber-500" />}
                           </>
                        )}
                      </span>
                      <button 
                        onClick={() => handleAdjustStock(p, 1)} 
                        disabled={adjustingStockId === p.product_id}
                        className="p-1 text-muted-foreground hover:text-emerald-500 transition-colors disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Actions */}
                    <div className="col-span-1 flex items-center justify-center gap-2">
                      <button onClick={() => { setPrintModalProduct(p); setPrintQuantity(1); setPrintPrice(true); }} className="p-2 text-muted-foreground hover:text-blue-500 hover:bg-muted rounded-lg transition-colors" title="Print Barcode">
                        <Printer className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEdit(p)} className="p-2 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors" title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(p)} className="p-2 text-muted-foreground hover:text-destructive hover:bg-muted rounded-lg transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}

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
              <div className="shrink-0 border-t border-border bg-muted/20 px-6 py-4 text-center text-muted-foreground text-sm font-medium">
                End of inventory list ({totalCount !== null ? totalCount : products.length} total products)
              </div>
            )}
            
            {/* Low Stock summary bar */}
            {products.some(p => p.current_stock <= p.reorder_level && p.reorder_level > 0) && (
              <div className="shrink-0 border-t border-amber-500/30 bg-amber-500/10 px-6 py-3 flex items-center gap-2 text-amber-600 text-sm">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-semibold">{products.filter(p => p.current_stock <= p.reorder_level && p.reorder_level > 0).length} item(s) are at or below Low Stock Alert</span>
              </div>
            )}
          </div>
        )}

        {/* ── ADD / EDIT FORM VIEW ─────────────────────────────────────────── */}
        {(view === 'add' || view === 'edit') && (
          <div className="flex flex-col flex-1 min-h-0 bg-background">
            <div className="flex-1 overflow-y-auto p-8 space-y-10 max-w-5xl mx-auto w-full">

              {/* Section 1: Core */}
              <section>
                <h3 className="text-lg font-bold text-primary mb-4 border-b border-border pb-2">1. Basic Details</h3>
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Item Name *</label>
                      <input type="text" value={formData.name} onChange={e => handleInputChange('name', e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm" />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-muted-foreground mb-1.5 block">Item Code</label>
                      <input type="text" maxLength={10} value={formData.item_code} onChange={e => handleInputChange('item_code', e.target.value.toUpperCase())} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none font-mono tracking-widest shadow-sm uppercase" />
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-5">
                        <div>
                          <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Category</label>
                          {isCustomCategory || configuredCategories.length === 0 ? (
                            <div className="flex gap-2">
                               <input type="text" value={formData.category} onChange={e => handleInputChange('category', e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm" placeholder="Custom Category" />
                               {configuredCategories.length > 0 && (
                                 <button type="button" onClick={() => { setIsCustomCategory(false); handleInputChange('category', ''); }} className="text-xs font-bold text-muted-foreground hover:text-foreground">Cancel</button>
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
                              className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm appearance-none"
                            >
                              <option value="">-- Select Category --</option>
                              {configuredCategories.map(c => <option key={String(c)} value={String(c)}>{c}</option>)}
                              <option value="CUSTOM">Custom...</option>
                            </select>
                          )}
                        </div>
                        {grades.filter(g => g.category === formData.category).length > 0 && (
                          <div className="p-4 bg-muted/10 border border-border rounded-xl">
                            <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Select Grade</label>
                            <select 
                              value={formData.grade_id} 
                              onChange={e => handleInputChange('grade_id', e.target.value)} 
                              className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm appearance-none"
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
                        <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Brand / Mfg</label>
                        <input type="text" value={formData.brand_manufacturer} onChange={e => handleInputChange('brand_manufacturer', e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted/30 p-5 rounded-2xl border border-border flex flex-col justify-center">
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-sm font-semibold text-muted-foreground">Barcode *</label>
                        <button onClick={generateBarcode} className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-md transition-colors">
                          <RefreshCw className="w-3 h-3" /> Auto Generate
                        </button>
                      </div>
                      <input type="text" value={formData.sku_barcode} onChange={e => handleInputChange('sku_barcode', e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none font-mono tracking-widest mb-4 shadow-sm" />
                      {formData.sku_barcode && (
                        <div className="flex flex-col items-center p-4 bg-white rounded-xl border border-border shadow-sm">
                          <Barcode value={formData.sku_barcode} height={50} displayValue={true} background="#ffffff" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Section 2: Billing & Grades */}
              <section>
                <h3 className="text-lg font-bold text-indigo-500 mb-4 border-b border-border pb-2">2. Billing Setup & Grades</h3>
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Billing Type</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => handleInputChange('billing_type', 'PIECE')}
                          className={clsx('py-3 px-4 rounded-xl border text-sm font-bold transition-all', formData.billing_type === 'PIECE' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:bg-muted/50')}
                        >
                          Piece-Based
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInputChange('billing_type', 'WEIGHT')}
                          className={clsx('py-3 px-4 rounded-xl border text-sm font-bold transition-all', formData.billing_type === 'WEIGHT' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:bg-muted/50')}
                        >
                          Weight-Based
                        </button>
                      </div>
                    </div>
                    {formData.billing_type === 'WEIGHT' && (
                      <div className="grid grid-cols-2 gap-5 p-4 bg-muted/10 border border-border rounded-xl">
                        <div>
                          <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Avg Weight / Piece (Kg)</label>
                          <input type="number" step="0.001" value={formData.average_weight_per_piece || ''} onChange={e => handleInputChange('average_weight_per_piece', e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm" />
                        </div>
                        <div className="flex items-center mt-6">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={!!formData.weight_override_allowed} onChange={e => handleInputChange('weight_override_allowed', e.target.checked)} className="w-5 h-5 rounded border-border text-primary focus:ring-primary" />
                            <span className="text-sm font-medium text-foreground">Allow weight override during billing</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Section 3: Inventory & Pricing */}
              <section>
                <h3 className="text-lg font-bold text-emerald-500 mb-4 border-b border-border pb-2">3. Inventory & Pricing</h3>
                <div className="grid grid-cols-5 gap-5">
                  {[
                    { label: 'Purchase Price', field: 'purchase_price', prefix: '₹' },
                    { label: 'MRP *', field: 'base_price', prefix: '₹' },
                    { label: 'Current Stock', field: 'current_stock' },
                    { label: 'Low Stock Alert', field: 'reorder_level' },
                  ].map(({ label, field, prefix }) => (
                    <div key={field}>
                      <label className="block text-sm font-semibold text-muted-foreground mb-1.5">{label}</label>
                      <div className="relative">
                        {prefix && <span className="absolute left-3 top-3 text-muted-foreground font-medium">{prefix}</span>}
                        <input
                          type="number" step="0.01"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          value={(formData as any)[field]}
                          onChange={e => handleInputChange(field, e.target.value)}
                          className={clsx(
                            'w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm no-spinners', 
                            prefix && 'pl-8', 
                            field === 'base_price' && 'text-emerald-600 dark:text-emerald-400 font-bold'
                          )}
                        />
                      </div>
                    </div>
                  ))}
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5 whitespace-nowrap">Measuring Unit (UOM)</label>
                    <select value={formData.uom} onChange={e => handleInputChange('uom', e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm appearance-none">
                      {['Pcs', 'Kgs', 'Grams', 'Mtrs', 'Ltrs', 'Box', 'Dozen'].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              </section>

              {/* Section 4: Discount & Offers */}
              <section>
                <h3 className="text-lg font-bold text-blue-500 mb-4 border-b border-border pb-2">4. Discount & Offers</h3>
                <div className="grid grid-cols-2 gap-8">
                  {/* Discount Block */}
                  <div className="space-y-4 bg-muted/10 p-5 rounded-2xl border border-border">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-foreground">Discount</h4>
                      <span className="text-xs text-muted-foreground">Applies to MRP</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Percentage (%)</label>
                        <input
                          type="number"
                          step="0.01"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          value={formData.discount_percent || ''}
                          onChange={e => handleDiscountPercentChange(e.target.value)}
                          disabled={!!formData.offer_price}
                          className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Flat Amount (₹)</label>
                        <input
                          type="number"
                          step="0.01"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          value={formData.discount_flat || ''}
                          onChange={e => handleDiscountFlatChange(e.target.value)}
                          disabled={!!formData.offer_price}
                          className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Offer Block */}
                  <div className="space-y-4 bg-muted/10 p-5 rounded-2xl border border-border">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-foreground">Offer</h4>
                      <span className="text-xs text-muted-foreground">Overrides MRP</span>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Final Offer Price (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        value={formData.offer_price || ''}
                        onChange={e => handleOfferPriceChange(e.target.value)}
                        disabled={!!formData.discount_percent || !!formData.discount_flat}
                        className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners"
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Section 5: Taxes & Config */}
              <section>
                <h3 className="text-lg font-bold text-orange-500 mb-4 border-b border-border pb-2">5. Taxes & Config</h3>
                <div className="grid grid-cols-3 gap-6">
                  <div className="flex items-center gap-3 bg-muted/30 border border-border p-4 rounded-xl">
                    <input type="checkbox" id="gst" checked={formData.is_gst_applicable} onChange={e => handleInputChange('is_gst_applicable', e.target.checked)} className="w-5 h-5 accent-primary rounded cursor-pointer" />
                    <label htmlFor="gst" className="text-foreground font-semibold cursor-pointer select-none">Is GST Applicable?</label>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">HSN / SAC Code</label>
                    <input type="text" value={formData.hsn_sac_code} onChange={e => handleInputChange('hsn_sac_code', e.target.value)} disabled={!formData.is_gst_applicable} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:opacity-50 transition-all shadow-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Tax Rate %</label>
                    <select value={formData.tax_rate_percent} onChange={e => handleInputChange('tax_rate_percent', parseFloat(e.target.value))} disabled={!formData.is_gst_applicable} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:opacity-50 transition-all shadow-sm appearance-none">
                      {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>
                </div>
              </section>

              {/* Section 5: Domain Attributes */}
              {shopDomain !== 'GENERAL' && (
                <section>
                  <h3 className="text-lg font-bold text-amber-500 mb-4 border-b border-border pb-2">5. Domain Fields — {shopDomain}</h3>
                  <div className="grid grid-cols-2 gap-5 bg-amber-500/5 p-6 rounded-2xl border border-amber-500/20">
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
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-border bg-card flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                {statusMessage && (
                  <div className={clsx(
                    "px-4 py-2.5 rounded-xl text-sm font-bold text-center animate-pulse border",
                    statusMessage.type === 'success' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"
                  )}>
                    {statusMessage.text}
                  </div>
                )}
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2 bg-muted rounded-xl p-1 px-3 border border-border">
                  <span className="text-muted-foreground text-sm font-semibold">Qty:</span>
                  <input 
                    type="number" 
                    min="1" 
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    value={printQuantity} 
                    onChange={e => setPrintQuantity(e.target.value === '' ? '' : e.target.value)} 
                    className="w-12 bg-transparent text-foreground focus:outline-none text-center font-bold no-spinners" 
                  />
                </div>
                <div className="flex items-center gap-2 bg-muted rounded-xl p-1 px-3 border border-border">
                  <input 
                    type="checkbox" 
                    id="print_price" 
                    checked={printPrice} 
                    onChange={e => setPrintPrice(e.target.checked)} 
                    className="w-4 h-4 accent-primary rounded cursor-pointer" 
                  />
                  <label htmlFor="print_price" className="text-muted-foreground text-sm font-semibold cursor-pointer select-none whitespace-nowrap">Show Price</label>
                </div>
                <button onClick={printBarcode} className="px-6 py-3 bg-muted hover:bg-muted/80 border border-border text-foreground rounded-xl font-bold flex items-center gap-2 transition-all shadow-sm">
                  <Printer className="w-5 h-5" />
                  Print Label
                </button>
                <button onClick={handleSave} disabled={loading} className="px-8 py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold flex items-center gap-2 shadow-sm transition-all">
                  <Save className="w-5 h-5" />
                  {loading ? 'Saving...' : view === 'edit' ? 'Update Product' : 'Add to Inventory'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {printModalProduct && (
        <Modal
          isOpen={true}
          onClose={() => setPrintModalProduct(null)}
          title="Print Barcode Label"
          className="max-w-md"
        >
          <div className="flex flex-col gap-6">
             <div className="bg-muted/30 p-4 rounded-xl border border-border flex flex-col items-center justify-center text-center">
                <Barcode value={printModalProduct.sku_barcode} height={40} displayValue={false} margin={0} width={1.5} background="transparent" />
                <p className="font-bold text-foreground mt-3">{printModalProduct.name}</p>
                <p className="text-sm font-mono text-muted-foreground">{printModalProduct.sku_barcode}</p>
             </div>
             
             <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Number of Labels</label>
                  <input type="number" min="1" onWheel={e => (e.target as HTMLInputElement).blur()} value={printQuantity} onChange={e => setPrintQuantity(e.target.value === '' ? '' : e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm no-spinners" />
                </div>
                
                <div className="flex items-center gap-3 bg-muted/10 border border-border p-4 rounded-xl hover:bg-muted/30 transition-colors">
                  <input type="checkbox" id="modal_print_price" checked={printPrice} onChange={e => setPrintPrice(e.target.checked)} className="w-5 h-5 accent-primary rounded cursor-pointer" />
                  <label htmlFor="modal_print_price" className="text-foreground font-semibold cursor-pointer select-none flex-1">
                    Show Price on Label
                  </label>
                </div>
             </div>
             
             <div className="flex justify-between items-center mt-2 border-t border-border pt-6">
                <div className="flex-1">
                  {statusMessage && (
                    <div className={clsx(
                      "px-4 py-2.5 rounded-xl text-sm font-bold text-center animate-pulse border",
                      statusMessage.type === 'success' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"
                    )}>
                      {statusMessage.text}
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-3 ml-4">
                  <button onClick={() => { setPrintModalProduct(null); setStatusMessage(null); }} className="px-5 py-2.5 text-muted-foreground font-semibold hover:text-foreground transition-colors">
                    Cancel
                  </button>
                  <button onClick={() => printProductLabel(printModalProduct)} className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-bold flex items-center gap-2 shadow-sm transition-all">
                    <Printer className="w-5 h-5" />
                    Print Labels
                  </button>
                </div>
             </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

// ─── Helper sub-component ────────────────────────────────────────────────────
function DomainField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-muted-foreground mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none transition-all shadow-sm" />
    </div>
  );
}
