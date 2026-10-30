import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import type React from 'react';
import { Plus, Percent, Search, Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import { Modal } from '../../ui/Modal';
import { getEffectiveOfferPrice, type Product } from '../comboTypes';
import type { ComboManagerState } from '../hooks/useComboManagerState';

export interface ComboFormModalProps {
  calcOfferPriceTotal: () => number;
  comboPriceNum: number;
  handleAddProductToCombo: (product: Product) => void;
  handleGenerateBarcode: () => void;
  handleSaveCombo: (e: React.FormEvent) => Promise<void>;
  handleUpdateItemQty: (productId: string, quantity: number) => void;
  productSearchRef: React.RefObject<HTMLInputElement | null>;
  savingsAmount: number;
  savingsPct: number;
  standaloneTotal: number;
  cm: ComboManagerState;
}

/** Create / edit combo offer modal: form fields, product search and selection, pricing and savings calculator. */
export function ComboFormModal({
  calcOfferPriceTotal, comboPriceNum, handleAddProductToCombo, handleGenerateBarcode, handleSaveCombo,
  handleUpdateItemQty, productSearchRef, savingsAmount, savingsPct, standaloneTotal, cm,
}: ComboFormModalProps) {
  const {
    showFormModal, setShowFormModal, editingCombo, formData, setFormData, productResults, productSearch,
    setProductSearch, selectedItems, saving,
  } = cm;
  return (
        <Modal
          isOpen={showFormModal}
          onClose={() => setShowFormModal(false)}
          title={editingCombo ? 'Edit Combo Offer' : 'Create New Combo Offer'}
          closeButton={
            <button
              type="button"
              onClick={() => setShowFormModal(false)}
              className="p-2 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center shadow-xs"
              title="Close"
            >
              <X className="w-4 h-4 text-destructive" />
            </button>
          }
        >
          <form onSubmit={handleSaveCombo} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  Combo Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Breakfast Special Combo"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1 flex items-center justify-between">
                  <span>Combo Barcode / SKU</span>
                  <button
                    type="button"
                    onClick={handleGenerateBarcode}
                    className="text-[10px] text-purple-600 hover:text-purple-700 dark:text-purple-400 font-extrabold cursor-pointer"
                  >
                    Auto Generate
                  </button>
                </label>
                <input
                  type="text"
                  placeholder="e.g. CMB-10001"
                  value={formData.sku_barcode}
                  onChange={(e) => setFormData({ ...formData, sku_barcode: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                Offer Tagline / Description
              </label>
              <input
                type="text"
                placeholder="e.g. Buy 2 Tea Powders & Get 1 Sugar Free!"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
              />
            </div>

            {/* Product Selector */}
            <div className="border border-border/80 rounded-2xl p-4 bg-muted/30 space-y-3">
              <label className="block text-xs font-bold text-foreground">
                Bundled Products List *
              </label>

              {/* Product Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />
                <input
                  ref={productSearchRef}
                  type="text"
                  placeholder="Search and select products to add to this combo..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-xl text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                />

                {/* Dropdown Results */}
                {productResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto divide-y divide-border">
                    {productResults.map((prod) => {
                      const effOffer = getEffectiveOfferPrice(prod);
                      const hasOffer = effOffer > 0 && effOffer < prod.base_price;

                      return (
                        <div
                          key={prod.product_id}
                          onClick={() => handleAddProductToCombo(prod)}
                          className="p-2.5 hover:bg-purple-500/10 cursor-pointer flex items-center justify-between text-xs transition-colors"
                        >
                          <div>
                            <span className="font-bold text-foreground">{prod.name}</span>
                            <span className="text-muted-foreground ml-2 font-mono text-[10px]">{prod.sku_barcode || prod.item_code}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground text-[10px]">Stock: {prod.current_stock}</span>
                            <div className="flex items-center gap-1.5 text-[11px]">
                              {hasOffer ? (
                                <>
                                  <span className="text-muted-foreground/60 line-through">MRP: {getCurrencyPrefix()}{prod.base_price}</span>
                                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">Offer: {getCurrencyPrefix()}{effOffer}</span>
                                </>
                              ) : (
                                <span className="font-bold text-foreground">MRP: {getCurrencyPrefix()}{prod.base_price}</span>
                              )}
                            </div>
                            <Plus className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selected Products Table */}
              {selectedItems.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground italic bg-card rounded-xl border border-border">
                  No products added yet. Search above to add items to this combo bundle.
                </div>
              ) : (
                <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                  {selectedItems.map((item) => {
                    const hasOffer = item.offer_price && item.offer_price > 0 && item.offer_price < (item.product_price || 0);
                    const effectiveLinePrice = hasOffer ? item.offer_price! : (item.product_price || 0);

                    return (
                      <div key={item.product_id} className="p-2.5 flex items-center justify-between text-xs">
                        <div className="flex-1 pr-2">
                          <div className="font-bold text-foreground">{item.product_name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-2">
                            <span>Unit MRP: <span className={clsx(hasOffer && "line-through opacity-70")}>{getCurrencyPrefix()}{item.product_price || 0}</span></span>
                            {hasOffer && (
                              <span className="font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                Offer Price: {getCurrencyPrefix()}{item.offer_price}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex items-center space-x-1.5 bg-muted/60 rounded-lg p-1 border border-border/60">
                            <span className="text-[10px] font-bold text-muted-foreground px-1">Qty:</span>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => handleUpdateItemQty(item.product_id, parseInt(e.target.value) || 0)}
                              className="w-14 px-1.5 py-0.5 bg-background border border-border rounded text-center text-xs font-black text-foreground"
                            />
                          </div>

                          <div className="w-24 text-right">
                            <div className="font-extrabold text-foreground">
                              {getCurrencyPrefix()}{(effectiveLinePrice * item.quantity).toFixed(2)}
                            </div>
                            {hasOffer && (
                              <div className="text-[9px] text-muted-foreground line-through">
                                {getCurrencyPrefix()}{((item.product_price || 0) * item.quantity).toFixed(2)}
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(item.product_id, 0)}
                            className="text-destructive hover:bg-destructive/10 p-1.5 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Combo Pricing & Real-time Savings Calculator */}
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-purple-700 dark:text-purple-300 mb-1">
                    Special Combo Selling Price ({getCurrencyPrefix()}) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 150.00"
                    value={formData.combo_price}
                    onChange={(e) => setFormData({ ...formData, combo_price: e.target.value })}
                    className="w-48 px-3 py-2 bg-background border border-purple-500/40 rounded-xl text-lg font-black text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="text-right">
                  <div className="text-xs text-muted-foreground font-semibold">Regular Items MRP Total:</div>
                  <div className="text-base font-bold text-muted-foreground line-through">
                    {getCurrencyPrefix()}{standaloneTotal.toFixed(2)}
                  </div>
                  {calcOfferPriceTotal() < standaloneTotal && (
                    <div className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                      Product Offer Total: {getCurrencyPrefix()}{calcOfferPriceTotal().toFixed(2)}
                    </div>
                  )}
                </div>
              </div>

              {standaloneTotal > 0 && comboPriceNum > 0 && (
                <div className="flex items-center justify-between border-t border-purple-500/20 pt-2 text-xs">
                  <span className="font-bold text-purple-600 dark:text-purple-300 flex items-center gap-1">
                    <Percent className="w-3.5 h-3.5" />
                    Customer Savings:
                  </span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400">
                    {getCurrencyPrefix()}{savingsAmount.toFixed(2)} ({savingsPct}% OFF)
                  </span>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-extrabold rounded-xl transition shadow-md shadow-purple-500/20 cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingCombo ? 'Update Combo Offer' : 'Save Combo Offer'}
              </button>
            </div>
          </form>
        </Modal>
  );
}
