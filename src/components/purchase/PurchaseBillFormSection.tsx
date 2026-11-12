import { roundMoney } from '../../utils/pricing/moneyRounding';
import { localizeTaxText, getCurrencyDecimals } from '../../utils/localization/storeProfile';
import { getCurrencyPrefix } from '../../utils/localization/storeProfile';
import { forwardRef, useState, useRef, useEffect, useMemo, useImperativeHandle } from 'react';
import { type PurchaseBillFormHandle, type Product, type PurchaseFormItem, type PurchaseAddItem } from './purchaseTypes';
import { usePurchaseProductFormState } from './hooks/usePurchaseProductFormState';
import { hasBridge, isDesktopRuntime } from '../../data/client';
import { settingsApi } from '../../data/settings';
import { usePurchaseProductActions } from './hooks/usePurchaseProductActions';
import { usePurchaseBillEditLoad } from './hooks/usePurchaseBillEditLoad';
import { productsApi } from '../../data/products';
import { gradesApi } from '../../data/grades';
import { pricingTiersApi } from '../../data/pricingTiers';
import { usePurchaseProductSearchResults } from './hooks/usePurchaseProductSearchResults';
import { usePurchaseQuickProduct } from './hooks/usePurchaseQuickProduct';
import { usePurchaseBillSave } from './hooks/usePurchaseBillSave';
import clsx from 'clsx';
import { Select } from '../ui/Select';
import { Send, Package } from 'lucide-react';
import { PurchaseProductSearch } from './views/PurchaseProductSearch';
import { PurchaseBillItemsTable } from './views/PurchaseBillItemsTable';
import { PurchaseAddGradeDialog } from './views/PurchaseAddGradeDialog';
import { PurchaseCleanupDialog } from './views/PurchaseCleanupDialog';
import type { PurchaseBillEditingData } from './purchaseTypes';

/**
 * One bill (GST or estimate) in the purchase bill form: bill number / invoice / payment, product search, items,
 * totals and save. The screen holds one per bill type and talks to it through `PurchaseBillFormHandle`.
 */
export const PurchaseBillFormSection = forwardRef<PurchaseBillFormHandle, {
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
  otherSectionAddItem?: (item: PurchaseAddItem) => void;
  editingData?: PurchaseBillEditingData;
  getOtherSectionItems?: () => PurchaseFormItem[];
}>(({ type, tenantId, billDate, supplierName, supplierId, notes, onStatusMessage, onSaved, onItemsLoaded, onItemsChange, onShareAll, otherSectionAddItem, editingData, getOtherSectionItems }, ref) => {
  const [billNumber, setBillNumber] = useState('');
  const [peekedBillNumber, setPeekedBillNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [manualRoundOff, setManualRoundOff] = useState<string>('');
  const [createdProductIds, setCreatedProductIds] = useState<string[]>([]);
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [pendingCloseAction] = useState<(() => void) | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [highlightedProductIndex, setHighlightedProductIndex] = useState(0);
  const productItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (highlightedProductIndex >= 0 && productItemRefs.current[highlightedProductIndex]) {
      productItemRefs.current[highlightedProductIndex]?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [highlightedProductIndex]);
  const [billItems, setBillItems] = useState<PurchaseFormItem[]>([]);
  const hsnInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [_isSaving, setIsSaving] = useState(false);
  const [priceCoding, setPriceCoding] = useState<Record<string, string> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const productSearchInputRef = useRef<HTMLInputElement>(null);
  const productForm = usePurchaseProductFormState();
  const {
    firstInputRef, showProductCreateForm, setShowProductCreateForm, setNewProductName, newProductItemCode, newProductBarcode,
    setNewProductBarcode, newProductPurchasePrice, setNewProductPurchasePrice, newProductBasePrice, newProductTaxRate, setNewProductTaxRate,
    setNewProductDiscountPercent, setNewProductDiscountFlat, setNewProductOfferPrice, newProductIsGstApplicable, setNewProductGrades, newProductIsAddingGrade,
    setConfiguredCategories, editingProductItemId,
  } = productForm;
  const [searchDropdownPos, setSearchDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [pricingTiers, setPricingTiers] = useState<import("../../data/pricingTiers").PricingTier[]>([]);
  const activePricingTiers = useMemo(() => {
    return pricingTiers.filter(t => (t.is_active === 1 || t.is_active === true || t.is_active === '1') && !t.is_deleted);
  }, [pricingTiers]);
  const [paymentType, setPaymentType] = useState<'CASH' | 'CREDIT' | 'UPI' | 'BANK_TRANSFER'>('CASH');
  const [sharedEstimateMode, setSharedEstimateMode] = useState(false);
  const [enableRealPaperStock, setEnableRealPaperStock] = useState(true);

  useEffect(() => {
    const loadRealPaperSetting = () => {
      if (hasBridge('settingsGet')) {
        settingsApi.get({ tenant_id: tenantId || 'global', key: 'enable_real_paper_stock' }).then(val => {
          if (val !== null && val !== undefined) setEnableRealPaperStock(Boolean(val));
        }).catch(() => {});
      }
    };
    loadRealPaperSetting();
    window.addEventListener('settings:updated', loadRealPaperSetting);
    return () => window.removeEventListener('settings:updated', loadRealPaperSetting);
  }, [tenantId]);

  const { openProductEditor, resetProductForm, handleCreateNewGrade } = usePurchaseProductActions({
    productForm, getOtherSectionItems, onStatusMessage, setPaymentType, setSharedEstimateMode, tenantId,
  });

  usePurchaseBillEditLoad({
    editingData, onItemsLoaded, setBillItems, setBillNumber, setInvoiceNumber, setManualRoundOff,
    setPaymentType, setPeekedBillNumber, setPriceCoding, tenantId, type,
  });

  useEffect(() => {
    if (isDesktopRuntime() && tenantId && showProductCreateForm) {
      productsApi.getProducts({ tenant_id: tenantId, limit: 200 })
        .then((res: import("../../data/products").Product[]) => {
          if (Array.isArray(res)) {
            const cats = [...new Set(res.map(p => p.category).filter(Boolean))] as string[];
            setConfiguredCategories(cats);
          }
        })
          .catch(console.error);
      gradesApi.getGrades(tenantId)
        .then((res: import("../../data/grades").Grade[]) => {
          if (Array.isArray(res)) setNewProductGrades(res);
        })
        .catch(console.error);
      pricingTiersApi.getPricingTiers(tenantId)
        .then((res: import("../../data/pricingTiers").PricingTier[]) => {
          if (Array.isArray(res)) setPricingTiers(res);
        })
        .catch(console.error);
    }
  }, [showProductCreateForm, tenantId, setConfiguredCategories, setNewProductGrades]);

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
  }, [showProductCreateForm, setNewProductName, setShowProductCreateForm]);

  const searchProducts = async (q: string) => {
    setProductSearch(q);
    setHighlightedProductIndex(0);
    setProducts([]);
    setIsSearchingProducts(q.trim().length > 0);
    setShowProductCreateForm(false);
  };

  usePurchaseProductSearchResults({
    productSearch, setHighlightedProductIndex, setIsSearchingProducts, setProducts, tenantId,
  });

  const addProductToBill = async (product: Product) => {
    if (billItems.some(i => i.product_id === product.product_id)) return;

    const isPaperProduct = (() => {
      try {
        const da = typeof product.domain_attributes === 'string'
          ? JSON.parse(product.domain_attributes || '{}')
          : (product.domain_attributes || {});
        return da.gst_type === 'PAPER' || Number(da.paper_stock || 0) > 0 || (Number(product.current_stock || 0) <= 0 && Number((product as typeof product & { paper_stock?: number }).paper_stock || 0) > 0);
      } catch { return false; }
    })();

    const isSharedWithOther = (getOtherSectionItems?.() ?? []).some(i => i.product_id === product.product_id);

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
      is_gst_applicable: type === 'GST' ? (product.is_gst_applicable ?? 1) : 0,
      tax_rate_percent: type === 'GST' ? (product.tax_rate_percent ?? 18) : 0,
      hsn_sac_code: product.hsn_sac_code || '',
      skip_stock_update: type === 'GST' ? (isPaperProduct || isSharedWithOther ? 1 : 0) : 0,
    }]);
    setProductSearch('');
    setProducts([]);
    setTimeout(() => { hsnInputRefs.current[hsnInputRefs.current.length - 1]?.focus(); }, 0);
  };

  const removeBillItem = (productId: string) => {
    setBillItems(prev => prev.filter(i => i.product_id !== productId));
  };

  const updateBillItem = (productId: string, field: 'quantity' | 'purchase_price' | 'selling_price' | 'offer_price' | 'hsn_sac_code', value: string) => {
    setBillItems(prev => prev.map(i => i.product_id === productId ? { ...i, [field]: value } : i));
  };

// Real / Dummy toggle per GST-bill line: Dummy = paper stock / tax record only
  // (no stock add), Real = stock-in.
  const toggleBillItemDummy = (item: PurchaseFormItem) => {
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
    return rate > 0 ? roundMoney(base * (1 + rate / 100)) : base;
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
    const toEffective = (base: number) => base > 0 && rate > 0 ? roundMoney(base * (1 + rate / 100)) : base;
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
    const toEffective = (r: number) => gst && r > 0 ? roundMoney(base * (1 + r / 100)) : base;
    applyBarcodePriceCode(
      encodePrice(toEffective(oldRate)),
      encodePrice(toEffective(newRate))
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
    if (!isDesktopRuntime() || !tenantId) return;
    const priceCode = getPriceCode();
    const res = await productsApi.generateBarcode({ tenant_id: tenantId, item_code: newProductItemCode || undefined, strip_suffix: priceCode || undefined });
    if (res.success && res.barcode) {
      setNewProductBarcode(res.barcode + priceCode);
    }
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

  const { handleCreateAndAddProduct } = usePurchaseQuickProduct({
    productForm, getPriceCode, hsnInputRefs, onStatusMessage, resetProductForm, setBillItems, setCreatedProductIds,
    setProducts, setProductSearch, tenantId, type,
  });

  const { handleSave } = usePurchaseBillSave({
    billDate, billItems, billNumber, editingData, getBillTotal, getOtherSectionItems, invoiceNumber,
    manualRoundOff, notes, onSaved, onStatusMessage, paymentType, peekedBillNumber, setBillNumber,
    setCreatedProductIds, setIsSaving, supplierId, supplierName, tenantId, type,
  });

  const addItemToSection = async (item: PurchaseAddItem) => {
    const isGstBill = type === 'GST';
    setBillItems(prev => {
      if (prev.some(i => i.product_id === item.product_id)) return prev;
      return [...prev, {
        ...item,
        is_gst_applicable: isGstBill ? (item.is_gst_applicable ?? 1) : 0,
        tax_rate_percent: isGstBill ? (item.tax_rate_percent ?? 18) : 0,
        skip_stock_update: isGstBill ? 1 : 0,
      }];
    });
  };

  useImperativeHandle(ref, () => ({
    save: handleSave,
    get hasItems() { return billItems.length > 0; },
    focusSearch: () => productSearchInputRef.current?.focus(),
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
      if (!editingProductItemId && isDesktopRuntime() && tenantId && !newProductBarcode) {
        productsApi.getProducts({ tenant_id: tenantId, limit: 1, sortBy: 'created_at' })
          .then((lastProduct) => {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- newProductBarcode is excluded so assigning the generated value does not restart the focus timer or barcode lookup.
  }, [showProductCreateForm, tenantId, editingProductItemId, firstInputRef, setNewProductBarcode]);

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
            onChange={v => setPaymentType(v as 'CASH' | 'CREDIT' | 'UPI' | 'BANK_TRANSFER')}
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
            title={localizeTaxText(`Share all items to ${isEstimate ? 'GST Bill' : 'Estimate Bill'}`)}
          >
            <Send className="w-3.5 h-3.5" />
            Share All
          </button>
        )}
        </div>
      </div>

      {/* Products Section */}
      <div className="p-5">
        {/* Idea 2: Proactive Tip Banner */}
        <div className="mb-3 px-3.5 py-2.5 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2.5 shadow-2xs">
          <span className="text-base shrink-0">💡</span>
          <p className="font-medium leading-snug">
            <span className="font-bold">Important Tip:</span> If a product already exists in your inventory or was added earlier in this bill, search &amp; select it from the dropdown list below instead of creating a new product.
          </p>
        </div>

        <PurchaseProductSearch
          activePricingTiers={activePricingTiers} addProductToBill={addProductToBill}
          autoGenerateBarcode={autoGenerateBarcode} enableRealPaperStock={enableRealPaperStock}
          handleCreateAndAddProduct={handleCreateAndAddProduct} handleDiscountFlatChange={handleDiscountFlatChange}
          handleDiscountPercentChange={handleDiscountPercentChange} handleFormKeyDown={handleFormKeyDown}
          handleOfferPriceChange={handleOfferPriceChange} handlePurchasePriceChange={handlePurchasePriceChange}
          handleTaxRateChange={handleTaxRateChange} highlightedProductIndex={highlightedProductIndex}
          isSearchingProducts={isSearchingProducts} productItemRefs={productItemRefs} products={products}
          productSearch={productSearch} productSearchInputRef={productSearchInputRef}
          resetProductForm={resetProductForm} searchDropdownPos={searchDropdownPos} searchProducts={searchProducts}
          searchRef={searchRef} setHighlightedProductIndex={setHighlightedProductIndex} setProducts={setProducts}
          setProductSearch={setProductSearch} type={type} productForm={productForm}
        />

        {billItems.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Package className="w-6 h-6 mx-auto mb-1.5 opacity-50" />
            <p className="text-xs font-medium">No products added yet</p>
            <p className="text-[11px] mt-0.5">Search and select products above</p>
          </div>
        ) : (
          <PurchaseBillItemsTable
            billItems={billItems} enableRealPaperStock={enableRealPaperStock}
            getOtherSectionItems={getOtherSectionItems} hsnInputRefs={hsnInputRefs} isEstimate={isEstimate}
            openProductEditor={openProductEditor} otherSectionAddItem={otherSectionAddItem}
            removeBillItem={removeBillItem} setBillItems={setBillItems} toggleBillItemDummy={toggleBillItemDummy}
            type={type} updateBillItem={updateBillItem}
          />
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
                  <span className="font-bold text-foreground">{getCurrencyPrefix()}{taxableValue.toFixed(getCurrencyDecimals())}</span>
                </div>
                {totalGst > 0 && (
                  <>
                    <div className="flex justify-between text-xs pl-3">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">CGST</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{getCurrencyPrefix()}{halfGst.toFixed(getCurrencyDecimals())}</span>
                    </div>
                    <div className="flex justify-between text-xs pl-3">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">SGST</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{getCurrencyPrefix()}{halfGst.toFixed(getCurrencyDecimals())}</span>
                    </div>
                    <div className="flex justify-between text-xs border-t border-border/40 pt-1">
                      <span className="text-muted-foreground font-bold">Total {localizeTaxText("GST")}</span>
                      <span className="font-black text-emerald-600 dark:text-emerald-400">{getCurrencyPrefix()}{totalGst.toFixed(getCurrencyDecimals())}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between items-center text-xs border-t border-border/40 pt-1">
                  <span className="text-muted-foreground font-semibold">Round Off</span>
                  <input
                    type="number"
                    step="any"
                    placeholder={autoRoundOff.toFixed(getCurrencyDecimals())}
                    value={manualRoundOff}
                    onChange={e => setManualRoundOff(e.target.value)}
                    className="w-20 text-right bg-background border border-border/80 rounded px-1.5 py-0.5 text-foreground font-bold text-xs focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
                  />
                </div>
                <div className="flex justify-between text-sm border-t-2 border-emerald-500/40 pt-1.5">
                  <span className="font-black uppercase tracking-wider text-foreground">Grand Total</span>
                  <span className="text-base font-black text-emerald-600">{getCurrencyPrefix()}{roundedTotal.toFixed(getCurrencyDecimals())}</span>
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
                  <span className="font-bold text-foreground">{getCurrencyPrefix()}{total.toFixed(getCurrencyDecimals())}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-t border-border/40 pt-1">
                  <span className="text-muted-foreground font-semibold">Round Off</span>
                  <input
                    type="number"
                    step="any"
                    placeholder={autoRoundOff.toFixed(getCurrencyDecimals())}
                    value={manualRoundOff}
                    onChange={e => setManualRoundOff(e.target.value)}
                    className="w-20 text-right bg-background border border-border/80 rounded px-1.5 py-0.5 text-foreground font-bold text-xs focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20"
                  />
                </div>
                <div className="flex justify-between text-sm border-t-2 border-amber-500/40 pt-1.5">
                  <span className="font-black uppercase tracking-wider text-foreground">Total</span>
                  <p className="text-base font-black text-amber-600">{getCurrencyPrefix()}{roundedTotal.toFixed(getCurrencyDecimals())}</p>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
      {newProductIsAddingGrade && (
        <PurchaseAddGradeDialog
          handleCreateNewGrade={handleCreateNewGrade} handleFormKeyDown={handleFormKeyDown} productForm={productForm}
        />
      )}

      {/* Idea 1: Discard Cleanup Confirmation Modal */}
      {showCleanupModal && (
        <PurchaseCleanupDialog
          createdProductIds={createdProductIds} pendingCloseAction={pendingCloseAction}
          setCreatedProductIds={setCreatedProductIds} setShowCleanupModal={setShowCleanupModal}
          showCleanupModal={showCleanupModal}
        />
      )}
    </>
  );
});
