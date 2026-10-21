import React from 'react';
import {
  Package, PackagePlus, Pencil, RefreshCw, Plus, Trash, Building2,
  IndianRupee, FileText, Check, Loader2, Printer, Save,
  AlertCircle, X, ChevronDown, Layers, Tag, Receipt
} from 'lucide-react';
import Barcode from 'react-barcode';
import clsx from 'clsx';
import { useCartStore } from '../../../store/cartStore';
import { Select } from '../../ui/Select';
import { DomainField, type Product } from '../inventoryHelpers';

export interface InventoryFormViewProps {
  view: 'list' | 'add' | 'edit';
  loading: boolean;
  handleFormKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  firstInputRef: React.RefObject<HTMLInputElement | null>;
  formData: any;
  handleInputChange: (field: string, value: any) => void;
  handleDomainAttrChange: (field: string, value: any) => void;
  generateBarcode: () => void;
  categoryContainerRef: React.RefObject<HTMLDivElement | null>;
  showCategorySuggestions: boolean;
  setShowCategorySuggestions: (v: boolean) => void;
  categorySuggestions: string[];
  selectedCategoryIndex: number;
  setSelectedCategoryIndex: (idx: number) => void;
  selectCategorySuggestion: (cat: string) => void;
  handleCategoryKeyDown: (e: React.KeyboardEvent) => void;
  nameContainerRef: React.RefObject<HTMLDivElement | null>;
  nameSuggestions: Product[];
  selectedNameIndex: number;
  setSelectedNameIndex: (idx: number) => void;
  selectNameSuggestion: (p: Product) => void;
  handleNameKeyDown: (e: React.KeyboardEvent) => void;
  categoryGrades: any[];
  isAddingGrade: boolean;
  setIsAddingGrade: (v: boolean) => void;
  grades: any[];
  handleDiscountPercentChange: (v: string) => void;
  handleDiscountFlatChange: (v: string) => void;
  handleOfferPriceChange: (v: string) => void;
  activePricingTiers: any[];
  tierPrices: Record<string, string>;
  setTierPrices: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  enableRealPaperStock: boolean;
  showSupplierCreate: boolean;
  setShowSupplierCreate: (v: boolean) => void;
  supplierSearch: string;
  setSupplierSearch: (v: string) => void;
  suppliers: any[];
  filteredSuppliers: any[];
  newSupplierName: string;
  setNewSupplierName: (v: string) => void;
  newSupplierPhone: string;
  setNewSupplierPhone: (v: string) => void;
  newSupplierAddress: string;
  setNewSupplierAddress: (v: string) => void;
  handleCreateSupplier: () => void;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  labelCodeType: string;
  qrPreviewUrl: string | null;
  printQuantity: number | string;
  setPrintQuantity: (v: any) => void;
  printPrice: boolean;
  setPrintPrice: (v: boolean) => void;
  printBarcode: () => void;
  handleSave: () => void;
  setView: (v: any) => void;
}

export const InventoryFormView: React.FC<InventoryFormViewProps> = ({
  view,
  loading,
  handleFormKeyDown,
  firstInputRef,
  formData,
  handleInputChange,
  handleDomainAttrChange,
  generateBarcode,
  categoryContainerRef,
  showCategorySuggestions,
  setShowCategorySuggestions,
  categorySuggestions,
  selectedCategoryIndex,
  setSelectedCategoryIndex,
  selectCategorySuggestion,
  handleCategoryKeyDown,
  nameContainerRef,
  nameSuggestions,
  selectedNameIndex,
  setSelectedNameIndex,
  selectNameSuggestion,
  handleNameKeyDown,
  categoryGrades,
  isAddingGrade,
  setIsAddingGrade,
  grades,
  handleDiscountPercentChange,
  handleDiscountFlatChange,
  handleOfferPriceChange,
  activePricingTiers,
  tierPrices,
  setTierPrices,
  enableRealPaperStock,
  showSupplierCreate,
  setShowSupplierCreate,
  supplierSearch,
  setSupplierSearch,
  suppliers,
  filteredSuppliers,
  newSupplierName,
  setNewSupplierName,
  newSupplierPhone,
  setNewSupplierPhone,
  newSupplierAddress,
  setNewSupplierAddress,
  handleCreateSupplier,
  setFormData,
  labelCodeType,
  qrPreviewUrl,
  printQuantity,
  setPrintQuantity,
  printPrice,
  setPrintPrice,
  printBarcode,
  handleSave,
  setView,
}) => {
  const { shopDomain } = useCartStore();

  return (
        <div className="flex flex-col flex-1 min-h-0 bg-background" onKeyDown={handleFormKeyDown}>
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 max-w-full mx-auto w-full" data-enter-nav>

            {/* Section 1: Core */}
            <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <PackagePlus className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-wider">1. Basic Details</span>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div ref={nameContainerRef} className="relative">
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Item Name *</label>
                    <input ref={firstInputRef} type="text" value={formData.name} onChange={e => { handleInputChange('name', e.target.value); setSelectedNameIndex(0); }} onKeyDown={handleNameKeyDown} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                    {nameSuggestions.length > 0 && (
                      <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
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
                    <input type="text" maxLength={10} value={formData.item_code} onChange={e => handleInputChange('item_code', e.target.value.toUpperCase())} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none font-mono tracking-widest shadow-sm uppercase text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div ref={categoryContainerRef} className="relative">
                      <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Category</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={formData.category}
                          onChange={e => {
                            handleInputChange('category', e.target.value);
                            setShowCategorySuggestions(true);
                            setSelectedCategoryIndex(0);
                          }}
                          onFocus={() => setShowCategorySuggestions(true)}
                          onKeyDown={handleCategoryKeyDown}
                          className="w-full bg-background border border-border rounded-xl p-3 pr-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm"
                          placeholder="Type or select category..."
                        />
                        {formData.category && (
                          <button
                            type="button"
                            onClick={() => {
                              handleInputChange('category', '');
                              setShowCategorySuggestions(true);
                            }}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/60 hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer"
                            title="Clear category"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {showCategorySuggestions && categorySuggestions.length > 0 && (
                        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                          {categorySuggestions.map((cat, i) => (
                            <button
                              key={cat}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                selectCategorySuggestion(cat);
                              }}
                              onMouseEnter={() => setSelectedCategoryIndex(i)}
                              className={clsx(
                                'w-full text-left px-4 py-2.5 flex items-center justify-between text-sm transition-colors cursor-pointer border-b border-border/40 last:border-0',
                                i === selectedCategoryIndex ? 'bg-primary/10 text-primary font-bold' : 'bg-card text-foreground hover:bg-muted'
                              )}
                            >
                              <span>{cat}</span>
                              {cat.toLowerCase() === (formData.category || '').trim().toLowerCase() && (
                                <Check className="w-4 h-4 text-primary shrink-0" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Brand / Mfg</label>
                      <input type="text" value={formData.brand_manufacturer} onChange={e => handleInputChange('brand_manufacturer', e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                    </div>
                  </div>
                  {formData.category.trim() && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider">Grade</label>
                        {!isAddingGrade && (
                          <button
                            type="button"
                            onClick={() => setIsAddingGrade(true)}
                            className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-full transition-all cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> New Grade
                          </button>
                        )}
                      </div>
                      {categoryGrades.length > 0 && !isAddingGrade && (
                        <Select
                          value={formData.grade_id}
                          onChange={v => handleInputChange('grade_id', v)}
                          placeholder="No grade (manual pricing)"
                          searchable
                          options={categoryGrades.map(g => ({
                            value: g.grade_id,
                            label: (g.grade_name || '(General)') + ' (₹' + g.rate + ')'
                          }))}
                          renderOption={(option, isSelected) => {
                            const grade = grades.find(g => g.grade_id === option.value);
                            return (
                              <>
                                <div className="flex-1 min-w-0">
                                  <div className={clsx('text-sm truncate', isSelected && 'font-medium')}>{grade?.grade_name || '(General)'}</div>
                                  <div className="text-xs text-muted-foreground">₹{Number(grade?.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                </div>
                                {isSelected && <Check className="w-4 h-4 shrink-0 text-primary" />}
                              </>
                            );
                          }}
                          triggerClassName="rounded-xl h-[46px]"
                        />
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-muted/20 p-4 rounded-xl border border-border flex flex-col justify-center shadow-sm">
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Barcode *</label>
                      <button onClick={generateBarcode} className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-full transition-all">
                        <RefreshCw className="w-3 h-3" /> Auto Generate
                      </button>
                    </div>
                    <input type="text" value={formData.sku_barcode} onChange={e => handleInputChange('sku_barcode', e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none font-mono tracking-widest mb-4 shadow-sm text-sm" />
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

            {/* Section 2: Pricing */}
            <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300 space-y-5">
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <Tag className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-emerald-500 uppercase tracking-wider">2. Inventory & Pricing</span>
              </div>

              <div className="flex flex-col gap-4">
                {/* Card 1: Real Product */}
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 space-y-3">
                  {enableRealPaperStock && (
                    <div className="flex items-center justify-between pb-2 border-b border-emerald-500/15">
                      <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Real Product (Estimate / Shop)
                      </span>
                      <span className="text-[10px] font-black bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/20 uppercase tracking-wider">
                        REAL
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                        Purchase Price (₹)
                        {formData.grade_id && <span className="text-indigo-500 ml-1 font-normal normal-case">(grade)</span>}
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-xs">₹</span>
                        <input
                          type="number" step="0.01"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          value={formData.purchase_price}
                          onChange={e => handleInputChange('purchase_price', e.target.value)}
                          className="w-full bg-background border border-border rounded-xl p-2.5 pl-7 text-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                        MRP (₹)
                        {formData.grade_id && <span className="text-indigo-500 ml-1 font-normal normal-case">(grade)</span>}
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 dark:text-emerald-400 font-bold text-xs">₹</span>
                        <input
                          type="number" step="0.01"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          value={formData.base_price}
                          onChange={e => handleInputChange('base_price', e.target.value)}
                          className="w-full bg-background border border-border rounded-xl p-2.5 pl-7 text-emerald-600 dark:text-emerald-400 font-bold focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                        Stock
                      </label>
                      <input
                        type="number" step="0.01"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        value={formData.current_stock}
                        onChange={e => handleInputChange('current_stock', e.target.value)}
                        className="w-full bg-background border border-border rounded-xl p-2.5 text-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                        Low Stock Alert
                      </label>
                      <input
                        type="number" step="0.01"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        value={formData.reorder_level}
                        onChange={e => handleInputChange('reorder_level', e.target.value)}
                        className="w-full bg-background border border-border rounded-xl p-2.5 text-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                        UOM (Unit)
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <select
                            value={formData.uom}
                            onChange={e => handleInputChange('uom', e.target.value)}
                            className="w-full bg-background border border-border rounded-xl p-2.5 pr-8 text-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 focus:outline-none transition-all shadow-sm text-sm font-medium appearance-none cursor-pointer"
                          >
                            {['Pcs', 'Kgs', 'Grams', 'Mtrs', 'Ltrs', 'Box', 'Dozen'].map(u => (
                              <option key={u} value={u} className="bg-background text-foreground py-1">
                                {u}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                        <div className={clsx(
                          "transition-all duration-300 ease-in-out overflow-hidden flex items-center shrink-0",
                          ['Kgs', 'Grams', 'Mtrs', 'Ltrs'].includes(formData.uom)
                            ? "w-20 opacity-100 scale-100 translate-x-0 ml-0"
                            : "w-0 opacity-0 scale-90 translate-x-4 pointer-events-none -ml-2"
                        )}>
                          <input
                            type="number" min="1" step="1"
                            value={formData.domain_attributes?.pcs !== undefined ? formData.domain_attributes.pcs : (formData.domain_attributes?.pcs_stock ?? '')}
                            onChange={e => handleDomainAttrChange('pcs', e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-20 bg-background border border-border rounded-xl p-2.5 text-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 focus:outline-none transition-all shadow-sm no-spinners text-sm font-medium shrink-0"
                            placeholder="Pcs"
                            title="Optional Pcs count"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card 2: Paper Product */}
                {enableRealPaperStock && (
                  <div className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-purple-500/15">
                      <span className="text-xs font-black text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                        Paper Product (GST Ledger)
                      </span>
                      <span className="text-[10px] font-black bg-purple-500/15 text-purple-600 dark:text-purple-400 px-2.5 py-0.5 rounded-full border border-purple-500/20 uppercase tracking-wider">
                        PAPER GST
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                          Paper Purchase (₹)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-500 font-bold text-xs">₹</span>
                          <input
                            type="number" step="0.01"
                            onWheel={e => (e.target as HTMLInputElement).blur()}
                            value={formData.gst_purchase_price}
                            onChange={e => handleInputChange('gst_purchase_price', e.target.value)}
                            className="w-full bg-background border border-border rounded-xl p-2.5 pl-7 text-foreground focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 truncate">
                          Paper MRP (₹)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-500 font-bold text-xs">₹</span>
                          <input
                            type="number" step="0.01"
                            onWheel={e => (e.target as HTMLInputElement).blur()}
                            value={formData.domain_attributes?.paper_mrp ?? ''}
                            onChange={e => handleDomainAttrChange('paper_mrp', e.target.value)}
                            placeholder={formData.base_price ? `= ${formData.base_price}` : 'MRP'}
                            className="w-full bg-background border border-border rounded-xl p-2.5 pl-7 text-foreground font-bold text-purple-600 dark:text-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                          Paper Stock (GST)
                        </label>
                        <input
                          type="number" step="0.01"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          value={formData.gst_purchase_quantity}
                          onChange={e => handleInputChange('gst_purchase_quantity', e.target.value)}
                          className="w-full bg-background border border-border rounded-xl p-2.5 text-foreground font-bold text-purple-600 dark:text-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {activePricingTiers.length > 0 && (
                <div className="mt-5 pt-4 border-t border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-500">
                      <Layers className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-violet-500 uppercase tracking-wider">Tier Prices</span>
                    <span className="text-[10px] text-muted-foreground font-normal normal-case">(blank = use MRP)</span>
                  </div>
                  <div className="flex gap-4 flex-wrap">
                    {activePricingTiers.map(tier => (
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
                            placeholder={formData.base_price != null && formData.base_price !== '' ? `= ${formData.base_price}` : 'MRP'}
                            className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm pl-8"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Section 3: Discount & Offers */}
            <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                  <Tag className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-blue-500 uppercase tracking-wider">3. Discount & Offers</span>
              </div>
              <div className="grid grid-cols-2 gap-6">
                {/* Discount Block */}
                <div className="space-y-3 bg-muted/10 p-4 rounded-xl border border-border">
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
                        className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm"
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
                        className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Offer Block */}
                <div className="space-y-3 bg-muted/10 p-4 rounded-xl border border-border">
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
                      className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Section 4: Stock */}
            <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500">
                  <Package className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-orange-500 uppercase tracking-wider">4. Taxes & Config</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Tax Category</label>
                  <div
                    onClick={() => handleInputChange('is_gst_applicable', !formData.is_gst_applicable)}
                    onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); handleInputChange('is_gst_applicable', !formData.is_gst_applicable); } }}
                    data-focusable-checkbox
                    tabIndex={-1}
                    className={clsx(
                      'flex items-center justify-center gap-1.5 border-2 rounded-xl py-3 px-2.5 transition-all duration-200 cursor-pointer active:scale-[0.98] h-[46px]',
                      formData.is_gst_applicable
                        ? 'bg-sky-500/10 border-sky-500/40 text-sky-600 dark:text-sky-400 shadow-sm'
                        : 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400'
                    )}
                  >
                    <input
                      type="checkbox"
                      id="gst"
                      checked={formData.is_gst_applicable}
                      onChange={e => handleInputChange('is_gst_applicable', e.target.checked)}
                      className={clsx(
                        'w-3.5 h-3.5 rounded pointer-events-none',
                        formData.is_gst_applicable ? 'accent-sky-500' : 'accent-amber-500'
                      )}
                    />
                    <label htmlFor="gst" className={clsx(
                      'font-bold text-xs cursor-pointer select-none',
                      formData.is_gst_applicable ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'
                    )}>
                      {formData.is_gst_applicable ? 'GST Product' : 'Estimate Product'}
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">HSN / SAC Code</label>
                  <input type="text" value={formData.hsn_sac_code} onChange={e => handleInputChange('hsn_sac_code', e.target.value)} disabled={!formData.is_gst_applicable} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none disabled:opacity-50 transition-all shadow-sm text-sm h-[46px]" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Tax Rate %</label>
                  <Select
                    value={String(formData.tax_rate_percent)}
                    onChange={v => handleInputChange('tax_rate_percent', parseFloat(v))}
                    disabled={!formData.is_gst_applicable}
                    options={[0, 5, 12, 18, 28].map(r => ({ value: String(r), label: r + '%' }))}
                    triggerClassName="rounded-xl h-[46px]"
                  />
                </div>
              </div>
            </section>

            {/* Section 4: Domain Attributes */}
            {shopDomain !== 'GENERAL' && (
              <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
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
              <section className="rounded-[28px] overflow-hidden shadow-sm border border-purple-500/20" style={{background: 'linear-gradient(135deg, var(--card) 0%, color-mix(in srgb, var(--card) 96%, #a855f7) 100%)'}}>
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
                        formData.show_gst_purchase ? 'bg-purple-500' : 'bg-muted/60 border border-border'
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

                    <div className="grid grid-cols-2 gap-4">
                      {/* Auto-fill toggle */}
                      <div
                        onClick={() => handleInputChange('gst_same_as_current', !formData.gst_same_as_current)}
                        className={clsx(
                          'flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer select-none transition-all duration-200',
                          formData.gst_same_as_current
                            ? 'bg-purple-500/10 border-purple-500/30 shadow-sm'
                            : 'bg-muted/10 border-border hover:bg-muted/20 hover:border-border'
                        )}
                      >
                        <div className={clsx(
                          'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-200',
                          formData.gst_same_as_current ? 'bg-purple-500 border-purple-500' : 'border-border bg-background'
                        )}>
                          {formData.gst_same_as_current && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={clsx('text-sm font-bold', formData.gst_same_as_current ? 'text-purple-600 dark:text-purple-400' : 'text-foreground')}>Same as Current Product</span>
                          <p className="text-xs text-muted-foreground mt-0.5">Auto-fills price &amp; quantity</p>
                        </div>
                      </div>

                      {/* Stock Type toggle */}
                      {enableRealPaperStock && (
                        <div
                          onClick={() => handleInputChange('gst_purchase_is_dummy', !formData.gst_purchase_is_dummy)}
                          className={clsx(
                            'flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer select-none transition-all duration-200',
                            formData.gst_purchase_is_dummy
                              ? 'bg-amber-500/10 border-amber-500/30 shadow-sm'
                              : 'bg-emerald-500/10 border-emerald-500/30 shadow-sm'
                          )}
                        >
                          <div className={clsx(
                            'w-5 h-5 rounded-md border border-border flex items-center justify-center shrink-0 transition-all duration-200',
                            formData.gst_purchase_is_dummy ? 'bg-amber-500 border-amber-500' : 'bg-emerald-500 border-emerald-500'
                          )}>
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-bold text-foreground">Stock Type: {formData.gst_purchase_is_dummy ? 'Paper' : 'Real'}</span>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formData.gst_purchase_is_dummy ? 'Paper stock only (tax record)' : 'Adds to physical stock'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Purchase Price & Quantity */}
                    <div className="rounded-xl border border-border overflow-hidden">
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
                      <div className="rounded-xl border border-border overflow-hidden">
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
                                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
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
                      <div className="rounded-xl border border-border overflow-hidden">
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
            

            {/* Action row */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-xl p-0.5 px-2 shadow-sm">
                  <span className="text-muted-foreground text-sm font-bold">Qty{['Kgs', 'Grams', 'Mtrs', 'Ltrs'].includes(formData.uom) ? ` (${formData.domain_attributes?.pcs ? 'Pcs' : formData.uom})` : ''}:</span>
                  <input 
                    type="number" 
                    min="1" 
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    value={printQuantity} 
                    onChange={e => setPrintQuantity(e.target.value === '' ? '' : e.target.value)} 
                    className="w-10 h-7 bg-transparent text-foreground focus:outline-none text-center font-black text-sm no-spinners" 
                  />
                </div>
                <label className="flex items-center gap-1.5 bg-muted/50 border border-border rounded-xl px-3 py-1.5 cursor-pointer hover:bg-muted transition-colors select-none shadow-sm">
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
                <button onClick={printBarcode} className="flex items-center gap-1.5 px-3.5 py-2 bg-muted hover:bg-muted/80 border border-border text-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm">
                  <Printer className="w-3.5 h-3.5" />
                  Print Label
                </button>
                <button onClick={() => handleSave()} data-enter-submit disabled={loading} className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm">
                  <Save className="w-3.5 h-3.5" />
                  {loading ? 'Saving...' : view === 'edit' ? 'Update Product' : 'Add to Inventory'}
                </button>
              </div>
            </div>
          </div>
        </div>
  );
};
