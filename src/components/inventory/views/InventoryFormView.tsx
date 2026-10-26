import React from 'react';
import { Package, Printer, Save } from 'lucide-react';
import { useCartStore } from '../../../store/cartStore';
import { DomainField, type Product } from '../inventoryHelpers';
import { GstPurchaseSection } from './form/GstPurchaseSection';
import { StockSection } from './form/StockSection';
import { DiscountSection } from './form/DiscountSection';
import { PricingSection } from './form/PricingSection';
import { CoreSection } from './form/CoreSection';

export interface InventoryFormViewProps {
  view: 'list' | 'add' | 'edit';
  loading: boolean;
  handleFormKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  firstInputRef: React.RefObject<HTMLInputElement | null>;
  formData: import('../hooks/useInventoryState').InventoryState['formData'];
  handleInputChange: (field: string, value: unknown) => void;
  handleDomainAttrChange: (field: string, value: unknown) => void;
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
  categoryGrades: import('../hooks/useInventoryState').InventoryState['grades'];
  isAddingGrade: boolean;
  setIsAddingGrade: (v: boolean) => void;
  grades: import('../hooks/useInventoryState').InventoryState['grades'];
  handleDiscountPercentChange: (v: string) => void;
  handleDiscountFlatChange: (v: string) => void;
  handleOfferPriceChange: (v: string) => void;
  activePricingTiers: import('../hooks/useInventoryState').InventoryState['pricingTiers'];
  tierPrices: Record<string, string>;
  setTierPrices: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  enableRealPaperStock: boolean;
  showSupplierCreate: boolean;
  setShowSupplierCreate: (v: boolean) => void;
  supplierSearch: string;
  setSupplierSearch: (v: string) => void;
  suppliers: import('../hooks/useInventoryState').InventoryState['suppliers'];
  filteredSuppliers: import('../hooks/useInventoryState').InventoryState['suppliers'];
  newSupplierName: string;
  setNewSupplierName: (v: string) => void;
  newSupplierPhone: string;
  setNewSupplierPhone: (v: string) => void;
  newSupplierAddress: string;
  setNewSupplierAddress: (v: string) => void;
  handleCreateSupplier: () => void;
  setFormData: React.Dispatch<React.SetStateAction<import('../hooks/useInventoryState').InventoryState['formData']>>;
  labelCodeType: string;
  qrPreviewUrl: string | null;
  printQuantity: number | string;
  setPrintQuantity: import('../hooks/useInventoryState').InventoryState['setPrintQuantity'];
  printPrice: boolean;
  setPrintPrice: (v: boolean) => void;
  printBarcode: () => void;
  handleSave: () => void;
  setView: import('../hooks/useInventoryState').InventoryState['setView'];
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
  const shopDomain = useCartStore((state) => state.shopDomain);
  return (
        <div className="flex flex-col flex-1 min-h-0 bg-background" onKeyDown={handleFormKeyDown}>
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 max-w-full mx-auto w-full" data-enter-nav>

            {/* Section 1: Core */}
            <CoreSection
              categoryContainerRef={categoryContainerRef} categoryGrades={categoryGrades}
              categorySuggestions={categorySuggestions} firstInputRef={firstInputRef} formData={formData}
              generateBarcode={generateBarcode} grades={grades} handleCategoryKeyDown={handleCategoryKeyDown}
              handleInputChange={handleInputChange} handleNameKeyDown={handleNameKeyDown} isAddingGrade={isAddingGrade}
              labelCodeType={labelCodeType} nameContainerRef={nameContainerRef} nameSuggestions={nameSuggestions}
              qrPreviewUrl={qrPreviewUrl} selectCategorySuggestion={selectCategorySuggestion}
              selectedCategoryIndex={selectedCategoryIndex} selectedNameIndex={selectedNameIndex}
              selectNameSuggestion={selectNameSuggestion} setIsAddingGrade={setIsAddingGrade}
              setSelectedCategoryIndex={setSelectedCategoryIndex} setSelectedNameIndex={setSelectedNameIndex}
              setShowCategorySuggestions={setShowCategorySuggestions} showCategorySuggestions={showCategorySuggestions}
            />

            {/* Section 2: Pricing */}
            <PricingSection
              activePricingTiers={activePricingTiers} enableRealPaperStock={enableRealPaperStock} formData={formData}
              handleDomainAttrChange={handleDomainAttrChange} handleInputChange={handleInputChange}
              setTierPrices={setTierPrices} tierPrices={tierPrices}
            />

            {/* Section 3: Discount & Offers */}
            <DiscountSection
              formData={formData} handleDiscountFlatChange={handleDiscountFlatChange}
              handleDiscountPercentChange={handleDiscountPercentChange} handleOfferPriceChange={handleOfferPriceChange}
            />

            {/* Section 4: Stock */}
            <StockSection
              formData={formData} handleInputChange={handleInputChange}
            />

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
              <GstPurchaseSection
                enableRealPaperStock={enableRealPaperStock} filteredSuppliers={filteredSuppliers} formData={formData}
                handleCreateSupplier={handleCreateSupplier} handleInputChange={handleInputChange}
                newSupplierAddress={newSupplierAddress} newSupplierName={newSupplierName}
                newSupplierPhone={newSupplierPhone} setFormData={setFormData}
                setNewSupplierAddress={setNewSupplierAddress} setNewSupplierName={setNewSupplierName}
                setNewSupplierPhone={setNewSupplierPhone} setShowSupplierCreate={setShowSupplierCreate}
                setSupplierSearch={setSupplierSearch} showSupplierCreate={showSupplierCreate} suppliers={suppliers}
                supplierSearch={supplierSearch}
              />
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
