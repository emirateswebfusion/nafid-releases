import React from 'react';
import {
  Package, List, RefreshCw,
  Layers, Plus, Save, Clock, X, LayoutGrid
} from 'lucide-react';
import Barcode from 'react-barcode';
import { Select } from '../../ui/Select';
import clsx from 'clsx';

export interface CreateProductModalProps {
  isOpen: boolean;
  editingProductId: string | null;
  productFormView: 'grid' | 'list';
  setProductFormView: (v: 'grid' | 'list') => void;
  handleFormKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  productFormDialogRef: React.RefObject<HTMLDivElement | null>;
  resetProductForm: () => void;
  newProductName: string;
  setNewProductName: (v: string) => void;
  newProductBarcode: string;
  setNewProductBarcode: (v: string) => void;
  generateProductBarcode: () => void;
  newProductBrand: string;
  setNewProductBrand: (v: string) => void;
  newProductCategory: string;
  setNewProductCategory: (v: string) => void;
  newProductIsCustomCategory: boolean;
  setNewProductIsCustomCategory: (v: boolean) => void;
  configuredCategories: string[];
  firstInputRef: React.RefObject<HTMLInputElement | null>;
  editingProductSnapshot: any;
  invoiceType: string;
  newProductGrades: any[];
  newProductGradeId: string;
  newProductIsAddingGrade: boolean;
  handleProductGradeChange: (gradeId: string) => void;
  setNewProductIsAddingGrade: (v: boolean) => void;
  newProductUom: string;
  setNewProductUom: (v: string) => void;
  newProductPurchasePrice: string | number;
  handleProductPurchasePriceChange: (v: string) => void;
  newProductBasePrice: string | number;
  handleProductBasePriceChange: (v: string) => void;
  newProductStock: string | number;
  setNewProductStock: (v: any) => void;
  newProductPcs: string | number;
  setNewProductPcs: (v: any) => void;
  newProductReorderLevel: string | number;
  setNewProductReorderLevel: (v: any) => void;
  enableRealPaperStock: boolean;
  newProductIsDummy: boolean;
  setNewProductIsDummy: (v: boolean) => void;
  newProductDiscountPercent: string | number;
  setNewProductDiscountPercent: (v: any) => void;
  newProductDiscountFlat: string | number;
  setNewProductDiscountFlat: (v: any) => void;
  newProductOfferPrice: string | number;
  setNewProductOfferPrice: (v: any) => void;
  pricingTiers: any[];
  productFormTierPrices: Record<string, string>;
  setProductFormTierPrices: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  newProductTaxRate: number;
  setNewProductTaxRate: (v: number) => void;
  newProductHsn: string;
  setNewProductHsn: (v: string) => void;
  newProductItemCode: string;
  setNewProductItemCode: (v: string) => void;
  newProductIsGstApplicable: boolean;
  setNewProductIsGstApplicable: (v: boolean) => void;
  handleCreateAndAddProduct: (action?: number, isExistingEdit?: boolean, isTempItem?: boolean) => any;
}

export const CreateProductModal: React.FC<CreateProductModalProps> = ({
  isOpen,
  editingProductId,
  productFormView,
  setProductFormView,
  handleFormKeyDown,
  productFormDialogRef,
  resetProductForm,
  newProductName,
  setNewProductName,
  newProductBarcode,
  setNewProductBarcode,
  generateProductBarcode,
  newProductBrand,
  setNewProductBrand,
  newProductCategory,
  setNewProductCategory,
  newProductIsCustomCategory,
  setNewProductIsCustomCategory,
  configuredCategories,
  firstInputRef,
  editingProductSnapshot,
  invoiceType,
  newProductGrades,
  newProductGradeId,
  newProductIsAddingGrade,
  handleProductGradeChange,
  setNewProductIsAddingGrade,
  newProductUom,
  setNewProductUom,
  newProductPurchasePrice,
  handleProductPurchasePriceChange,
  newProductBasePrice,
  handleProductBasePriceChange,
  newProductStock,
  setNewProductStock,
  newProductPcs,
  setNewProductPcs,
  newProductReorderLevel,
  setNewProductReorderLevel,
  enableRealPaperStock,
  newProductIsDummy,
  setNewProductIsDummy,
  newProductDiscountPercent,
  setNewProductDiscountPercent,
  newProductDiscountFlat,
  setNewProductDiscountFlat,
  newProductOfferPrice,
  setNewProductOfferPrice,
  pricingTiers,
  productFormTierPrices,
  setProductFormTierPrices,
  newProductTaxRate,
  setNewProductTaxRate,
  newProductHsn,
  setNewProductHsn,
  newProductItemCode,
  setNewProductItemCode,
  newProductIsGstApplicable,
  setNewProductIsGstApplicable,
  handleCreateAndAddProduct,
}) => {
  if (!isOpen) return null;

  return (
    <>
          <div className="fixed inset-0 bg-black/40 z-[100]" />
          <div ref={productFormDialogRef} className="fixed inset-0 z-[101] flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) resetProductForm(); }}>
            <div className="w-full max-w-6xl bg-card dark:bg-card border border-border rounded-[28px] shadow-2xl overflow-hidden" onKeyDown={handleFormKeyDown}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <Package className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black text-primary uppercase tracking-wider">{editingProductId ? 'Edit Product' : 'New Product'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => {
                    const next = productFormView === 'grid' ? 'list' : 'grid';
                    setProductFormView(next);
                    localStorage.setItem('productFormView', next);
                  }}
                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-border/30"
                    title={productFormView === 'grid' ? 'Switch to List View' : 'Switch to Grid View'}>
                    {productFormView === 'grid' ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
                  </button>
                  <button type="button" onClick={resetProductForm}
                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30"
                    title="Close">
                    <X className="w-4 h-4 text-destructive" />
                  </button>
                </div>
              </div>
              <div className="p-5 max-h-[70vh] overflow-y-auto space-y-3" data-enter-nav>
                {/* 1. Basic Details */}
                <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
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
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 text-sm" />
                      </div>
                      <div className="flex-1 min-w-[90px]">
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Code</label>
                        <input type="text" maxLength={10} value={newProductItemCode} onChange={e => setNewProductItemCode(e.target.value.toUpperCase())}
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 font-mono tracking-widest uppercase text-sm" />
                      </div>
                      <div className="flex-1 min-w-[110px]">
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Category</label>
                        {newProductIsCustomCategory ? (
                          <div className="relative">
                            <input type="text" value={newProductCategory} onChange={e => setNewProductCategory(e.target.value)} placeholder="Category"
                              className="w-full bg-background border border-border rounded-lg p-2.5 pr-9 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 text-sm" />
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
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 text-sm" />
                      </div>
                      <div className="flex-1 min-w-[120px]">
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Barcode *</label>
                          <button type="button" onClick={generateProductBarcode}
                            className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full cursor-pointer">
                            <RefreshCw className="w-2.5 h-2.5 inline-block" /> Auto
                          </button>
                        </div>
                        <input type="text" value={newProductBarcode} onChange={e => setNewProductBarcode(e.target.value)}
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 font-mono tracking-widest text-sm" />
                        {newProductBarcode && <div className="mt-2 flex justify-center overflow-hidden rounded bg-white py-1"><Barcode value={newProductBarcode} width={1} height={32} displayValue={false} margin={0} /></div>}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Item Name *</label>
                          <input ref={firstInputRef} type="text" value={newProductName} onChange={e => setNewProductName(e.target.value)}
                            className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Item Code</label>
                          <input type="text" maxLength={10} value={newProductItemCode} onChange={e => setNewProductItemCode(e.target.value.toUpperCase())}
                            className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none font-mono tracking-widest shadow-sm uppercase text-sm" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Category</label>
                            {newProductIsCustomCategory ? (
                              <div className="relative">
                                <input type="text" value={newProductCategory} onChange={e => setNewProductCategory(e.target.value)} placeholder="Enter category"
                                  className="w-full bg-background border border-border rounded-xl p-3 pr-10 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
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
                              className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                          </div>
                        </div>
                      </div>
                      <div className="bg-muted/20 p-4 rounded-xl border border-border flex flex-col justify-center shadow-sm">
                        <div>
                          <div className="flex justify-between items-center mb-1.5">
                            <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Barcode *</label>
                            <button type="button" onClick={generateProductBarcode}
                              className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-full transition-all cursor-pointer">
                              <RefreshCw className="w-3 h-3" /> Auto Generate
                            </button>
                          </div>
                          <input type="text" value={newProductBarcode} onChange={e => setNewProductBarcode(e.target.value)}
                            className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none font-mono tracking-widest shadow-sm text-sm" />
                          {newProductBarcode && <div className="mt-3 flex justify-center overflow-hidden rounded-xl border border-border bg-white py-2"><Barcode value={newProductBarcode} height={48} displayValue={true} background="#ffffff" /></div>}
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
                          onChange={handleProductGradeChange}
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
                <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                      <Package className="w-4 h-4" />
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
                        <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                          {label}
                          {(field === 'basePrice' || field === 'purchasePrice') && newProductGradeId && (
                            <span className="ml-1.5 font-normal normal-case text-indigo-500">(from grade)</span>
                          )}
                        </label>
                        <div className="relative">
                          {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">{prefix}</span>}
                          <input
                            type="number" step="0.01"
                            onWheel={e => (e.target as HTMLInputElement).blur()}
                            value={field === 'purchasePrice' ? newProductPurchasePrice : field === 'basePrice' ? newProductBasePrice : field === 'stock' ? newProductStock : newProductReorderLevel}
                            onChange={e => {
                              const val = e.target.value;
                              if (field === 'purchasePrice') handleProductPurchasePriceChange(val);
                              else if (field === 'basePrice') handleProductBasePriceChange(val);
                              else if (field === 'stock') setNewProductStock(val);
                              else setNewProductReorderLevel(val);
                            }}
                            className={clsx(
                              'w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm',
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
                    <div className={clsx('flex-1 min-w-0 overflow-hidden transition-all duration-500 ease-in-out', (['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'].includes((newProductUom || '').toLowerCase()) || (editingProductSnapshot?.uom === newProductUom && editingProductSnapshot?.billing_type === 'WEIGHT')) ? 'max-w-[250px] opacity-100' : 'max-w-0 opacity-0')}>
                      <div className="flex items-center gap-1 mb-1.5">
                        <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider">Pcs</label>
                        <span className="text-[10px] text-muted-foreground/60 font-normal normal-case">(optional)</span>
                      </div>
                      <input
                        type="number" min="1" step="1"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        value={newProductPcs}
                        onChange={e => setNewProductPcs(e.target.value)}
                        className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                        placeholder="e.g. 20"
                      />
                    </div>
                  </div>
                  {pricingTiers.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-border">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-500">
                          <Layers className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-black text-violet-500 uppercase tracking-wider">Tier Prices</span>
                        <span className="text-[10px] text-muted-foreground font-normal normal-case">(blank = use MRP)</span>
                      </div>
                      <div className="flex gap-4 flex-wrap">
                        {pricingTiers.map((tier: any) => (
                          <div key={tier.pricing_tier_id} className="flex-1 min-w-[140px]">
                            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5 truncate">
                              {tier.name}
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">₹</span>
                              <input
                                type="number" step="0.01"
                                onWheel={e => (e.target as HTMLInputElement).blur()}
                                value={productFormTierPrices[tier.pricing_tier_id] ?? ''}
                                onChange={e => setProductFormTierPrices(prev => ({ ...prev, [tier.pricing_tier_id]: e.target.value }))}
                                placeholder={newProductBasePrice ? `= ${newProductBasePrice}` : 'MRP'}
                                className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm pl-8"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                {/* 3. Discount & Offers */}
                <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                    <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                      <Package className="w-4 h-4" />
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
                          onChange={e => {
                            const val = e.target.value;
                            setNewProductDiscountPercent(val);
                            if (val) {
                              const mrp = Number(newProductBasePrice) || 0;
                              const pct = parseFloat(val);
                              const flat = mrp > 0 && !isNaN(pct) ? ((mrp * pct) / 100).toFixed(2) : '';
                              setNewProductDiscountFlat(flat);
                            } else {
                              setNewProductDiscountFlat('');
                            }
                            setNewProductOfferPrice('');
                          }}
                          disabled={!!newProductOfferPrice}
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50 no-spinners text-sm" />
                      </div>
                      <div className="flex-1 min-w-[100px]">
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Disc ₹</label>
                        <input type="number" step="0.01"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          value={newProductDiscountFlat}
                          onChange={e => {
                            const val = e.target.value;
                            setNewProductDiscountFlat(val);
                            if (val) {
                              const mrp = Number(newProductBasePrice) || 0;
                              const flat = parseFloat(val);
                              const pct = mrp > 0 && !isNaN(flat) ? ((flat / mrp) * 100).toFixed(2) : '';
                              setNewProductDiscountPercent(pct);
                            } else {
                              setNewProductDiscountPercent('');
                            }
                            setNewProductOfferPrice('');
                          }}
                          disabled={!!newProductOfferPrice}
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50 no-spinners text-sm" />
                      </div>
                      <div className="flex-1 min-w-[110px]">
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Offer Price ₹</label>
                        <input type="number" step="0.01"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          value={newProductOfferPrice}
                          onChange={e => {
                            setNewProductOfferPrice(e.target.value);
                            setNewProductDiscountPercent('');
                            setNewProductDiscountFlat('');
                          }}
                          disabled={!!newProductDiscountPercent || !!newProductDiscountFlat}
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50 no-spinners text-sm" />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3 bg-muted/10 p-4 rounded-xl border border-border">
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
                              onChange={e => {
                                const val = e.target.value;
                                setNewProductDiscountPercent(val);
                                if (val) {
                                  const mrp = Number(newProductBasePrice) || 0;
                                  const pct = parseFloat(val);
                                  const flat = mrp > 0 && !isNaN(pct) ? ((mrp * pct) / 100).toFixed(2) : '';
                                  setNewProductDiscountFlat(flat);
                                } else {
                                  setNewProductDiscountFlat('');
                                }
                                setNewProductOfferPrice('');
                              }}
                              disabled={!!newProductOfferPrice}
                              className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm" />
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Flat Amount (₹)</label>
                            <input type="number" step="0.01"
                              onWheel={e => (e.target as HTMLInputElement).blur()}
                              value={newProductDiscountFlat}
                              onChange={e => {
                                const val = e.target.value;
                                setNewProductDiscountFlat(val);
                                if (val) {
                                  const mrp = Number(newProductBasePrice) || 0;
                                  const flat = parseFloat(val);
                                  const pct = mrp > 0 && !isNaN(flat) ? ((flat / mrp) * 100).toFixed(2) : '';
                                  setNewProductDiscountPercent(pct);
                                } else {
                                  setNewProductDiscountPercent('');
                                }
                                setNewProductOfferPrice('');
                              }}
                              disabled={!!newProductOfferPrice}
                              className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm" />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3 bg-muted/10 p-4 rounded-xl border border-border">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-foreground">Offer</h4>
                          <span className="text-xs text-muted-foreground">Overrides MRP</span>
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Final Offer Price (₹)</label>
                          <input type="number" step="0.01"
                            onWheel={e => (e.target as HTMLInputElement).blur()}
                            value={newProductOfferPrice}
                            onChange={e => {
                              setNewProductOfferPrice(e.target.value);
                              setNewProductDiscountPercent('');
                              setNewProductDiscountFlat('');
                            }}
                            disabled={!!newProductDiscountPercent || !!newProductDiscountFlat}
                            className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm" />
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                {/* 4. Taxes & Config */}
                <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                    <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500">
                      <Package className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-orange-500 uppercase tracking-wider">4. Taxes & Config</span>
                  </div>
                  {productFormView === 'list' ? (
                    <div className="flex gap-3 items-start">
                      {invoiceType === 'GST' ? (
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
                              className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 font-mono tracking-widest text-sm" />
                          </div>
                          <div className="flex-1 min-w-[100px]">
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Tax Rate %</label>
                            <Select
                              value={String(newProductTaxRate)}
                              onChange={v => setNewProductTaxRate(parseFloat(v))}
                              options={[0, 5, 12, 18, 28].map(r => ({ value: String(r), label: r + '%' }))}
                              triggerClassName="rounded-lg h-[40px] text-sm"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="min-w-[140px]">
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">GST Applicable</label>
                            <div
                              onClick={() => setNewProductIsGstApplicable(!newProductIsGstApplicable)}
                              onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); setNewProductIsGstApplicable(!newProductIsGstApplicable); } }}
                              data-focusable-checkbox
                              tabIndex={-1}
                              className={clsx(
                                'flex items-center justify-center gap-1.5 border-2 rounded-lg py-2.5 px-2.5 transition-all duration-200 cursor-pointer active:scale-[0.98] h-[40px]',
                                newProductIsGstApplicable
                                  ? 'bg-primary/10 border-primary text-primary shadow-sm'
                                  : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50 hover:border-border'
                              )}
                            >
                              <input type="checkbox" checked={newProductIsGstApplicable} onChange={e => setNewProductIsGstApplicable(e.target.checked)}
                                className="w-3 h-3 rounded pointer-events-none accent-primary" />
                              <span className={clsx('font-bold text-xs select-none', newProductIsGstApplicable ? 'text-primary' : 'text-muted-foreground')}>
                                {newProductIsGstApplicable ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                          </div>
                          {newProductIsGstApplicable && (
                            <div className="min-w-[120px]">
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
                          )}
                          <div className="flex-1 min-w-[120px]">
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">HSN / SAC Code</label>
                            <input type="text" value={newProductHsn} onChange={e => setNewProductHsn(e.target.value)} disabled={!newProductIsGstApplicable}
                              className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50 font-mono tracking-widest text-sm" />
                          </div>
                          <div className="flex-1 min-w-[100px]">
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Tax Rate %</label>
                            <Select
                              value={String(newProductTaxRate)}
                              onChange={v => setNewProductTaxRate(parseFloat(v))}
                              disabled={!newProductIsGstApplicable}
                              options={[0, 5, 12, 18, 28].map(r => ({ value: String(r), label: r + '%' }))}
                              triggerClassName="rounded-lg h-[40px] text-sm"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className={clsx('grid gap-4', (invoiceType !== 'GST' && newProductIsGstApplicable) ? 'grid-cols-4' : 'grid-cols-3')}>
                      {invoiceType === 'GST' ? (
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
                                  : 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400 shadow-sm'
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
                              className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm font-mono tracking-widest text-sm" />
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Tax Rate %</label>
                            <Select
                              value={String(newProductTaxRate)}
                              onChange={v => setNewProductTaxRate(parseFloat(v))}
                              options={[0, 5, 12, 18, 28].map(r => ({ value: String(r), label: r + '%' }))}
                              triggerClassName="rounded-xl h-[46px]"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">GST Applicable</label>
                            <div
                              onClick={() => setNewProductIsGstApplicable(!newProductIsGstApplicable)}
                              onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); setNewProductIsGstApplicable(!newProductIsGstApplicable); } }}
                              data-focusable-checkbox
                              tabIndex={-1}
                              className={clsx(
                                'flex items-center justify-center gap-1.5 border-2 rounded-xl py-3.5 px-2.5 transition-all duration-200 cursor-pointer active:scale-[0.98]',
                                newProductIsGstApplicable
                                  ? 'bg-primary/10 border-primary text-primary shadow-sm'
                                  : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50 hover:border-border'
                              )}
                            >
                              <input type="checkbox" id="gst" checked={newProductIsGstApplicable} onChange={e => setNewProductIsGstApplicable(e.target.checked)}
                                className={clsx('w-3.5 h-3.5 rounded pointer-events-none', newProductIsGstApplicable ? 'accent-primary' : 'accent-muted-foreground')} />
                              <label htmlFor="gst" className={clsx('font-bold text-xs cursor-pointer select-none', newProductIsGstApplicable ? 'text-primary' : 'text-muted-foreground')}>
                                {newProductIsGstApplicable ? 'Enabled' : 'Disabled'}
                              </label>
                            </div>
                          </div>
                          {enableRealPaperStock && newProductIsGstApplicable && (
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
                                    : 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400 shadow-sm'
                                )}
                              >
                                <input type="checkbox" id="dummy" checked={newProductIsDummy} onChange={e => setNewProductIsDummy(e.target.checked)}
                                  className={clsx('w-3.5 h-3.5 rounded pointer-events-none', !newProductIsDummy ? 'accent-emerald-500' : 'accent-amber-500')} />
                                <label htmlFor="dummy" className="font-bold text-xs cursor-pointer select-none">
                                  {newProductIsDummy ? 'Paper' : 'Real'}
                                </label>
                              </div>
                            </div>
                          )}
                          <div>
                            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">HSN / SAC Code</label>
                            <input type="text" value={newProductHsn} onChange={e => setNewProductHsn(e.target.value)} disabled={!newProductIsGstApplicable}
                              className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none disabled:opacity-50 transition-all shadow-sm font-mono tracking-widest text-sm" />
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Tax Rate %</label>
                            <Select
                              value={String(newProductTaxRate)}
                              onChange={v => setNewProductTaxRate(parseFloat(v))}
                              disabled={!newProductIsGstApplicable}
                              options={[0, 5, 12, 18, 28].map(r => ({ value: String(r), label: r + '%' }))}
                              triggerClassName="rounded-xl h-[46px]"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </section>

              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-background">
                <button type="button" data-enter-submit onClick={async () => { await handleCreateAndAddProduct(); }} disabled={!newProductName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm">
                  <Save className="w-3.5 h-3.5" />
                  {editingProductId ? 'Update Product' : 'Add to Inventory'}
                </button>
                <button type="button" onClick={() => handleCreateAndAddProduct(3, false, true)} disabled={!newProductName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-violet-500/15 hover:bg-violet-500/25 disabled:opacity-50 text-violet-600 dark:text-violet-400 border border-violet-500/40 rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm"
                  title="Save as temp item — appears only on this bill, no barcode, not saved to inventory or stock">
                  <Clock className="w-3.5 h-3.5" />
                  Save as Temp
                </button>
              </div>
            </div>
          </div>
        </>
  );
};
