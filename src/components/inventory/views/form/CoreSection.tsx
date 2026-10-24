import React from 'react';
import { PackagePlus, Package, X, Check, Plus, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { Select } from '../../../ui/Select';
import Barcode from 'react-barcode';
import type { Product } from '../../inventoryHelpers';
import type { InventoryFormViewProps } from '../InventoryFormView';

export interface CoreSectionProps {
  categoryContainerRef: React.RefObject<HTMLDivElement | null>;
  categoryGrades: InventoryFormViewProps['categoryGrades'];
  categorySuggestions: string[];
  firstInputRef: React.RefObject<HTMLInputElement | null>;
  formData: InventoryFormViewProps['formData'];
  generateBarcode: () => void;
  grades: InventoryFormViewProps['grades'];
  handleCategoryKeyDown: (e: React.KeyboardEvent) => void;
  handleInputChange: InventoryFormViewProps['handleInputChange'];
  handleNameKeyDown: (e: React.KeyboardEvent) => void;
  isAddingGrade: boolean;
  labelCodeType: string;
  nameContainerRef: React.RefObject<HTMLDivElement | null>;
  nameSuggestions: Product[];
  qrPreviewUrl: string | null;
  selectCategorySuggestion: (cat: string) => void;
  selectedCategoryIndex: number;
  selectedNameIndex: number;
  selectNameSuggestion: (p: Product) => void;
  setIsAddingGrade: (v: boolean) => void;
  setSelectedCategoryIndex: (idx: number) => void;
  setSelectedNameIndex: (idx: number) => void;
  setShowCategorySuggestions: (v: boolean) => void;
  showCategorySuggestions: boolean;
}

/** Product form section 1: name, codes, category, grade, pricing mode and core flags. */
export function CoreSection({
  categoryContainerRef, categoryGrades, categorySuggestions, firstInputRef, formData, generateBarcode, grades,
  handleCategoryKeyDown, handleInputChange, handleNameKeyDown, isAddingGrade, labelCodeType, nameContainerRef,
  nameSuggestions, qrPreviewUrl, selectCategorySuggestion, selectedCategoryIndex, selectedNameIndex,
  selectNameSuggestion, setIsAddingGrade, setSelectedCategoryIndex, setSelectedNameIndex, setShowCategorySuggestions,
  showCategorySuggestions,
}: CoreSectionProps) {
  return (
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
  );
}
