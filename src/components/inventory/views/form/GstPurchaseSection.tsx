import { localizeTaxText, getCurrencyDecimals } from '../../../../utils/localization/storeProfile';
import { getCurrencyPrefix } from '../../../../utils/localization/storeProfile';
import { Receipt, FileText, Building2, Plus } from 'lucide-react';
import { CurrencyIcon } from '../../../ui/CurrencyIcon';
import clsx from 'clsx';
import type { InventoryFormViewProps } from '../InventoryFormView';

export interface GstPurchaseSectionProps {
  enableRealPaperStock: boolean;
  filteredSuppliers: InventoryFormViewProps['filteredSuppliers'];
  formData: InventoryFormViewProps['formData'];
  handleCreateSupplier: () => void;
  handleInputChange: InventoryFormViewProps['handleInputChange'];
  newSupplierAddress: string;
  newSupplierName: string;
  newSupplierPhone: string;
  setFormData: InventoryFormViewProps['setFormData'];
  setNewSupplierAddress: (v: string) => void;
  setNewSupplierName: (v: string) => void;
  setNewSupplierPhone: (v: string) => void;
  setShowSupplierCreate: (v: boolean) => void;
  setSupplierSearch: (v: string) => void;
  showSupplierCreate: boolean;
  suppliers: InventoryFormViewProps['suppliers'];
  supplierSearch: string;
}

/** Product form section 5 (add mode only): GST purchase details with supplier selection or quick create. */
export function GstPurchaseSection({
  enableRealPaperStock, filteredSuppliers, formData, handleCreateSupplier, handleInputChange, newSupplierAddress,
  newSupplierName, newSupplierPhone, setFormData, setNewSupplierAddress, setNewSupplierName, setNewSupplierPhone,
  setShowSupplierCreate, setSupplierSearch, showSupplierCreate, suppliers, supplierSearch,
}: GstPurchaseSectionProps) {
  return (
    <section className="rounded-[28px] overflow-hidden shadow-sm border border-purple-500/20" style={{background: 'linear-gradient(135deg, var(--card) 0%, color-mix(in srgb, var(--card) 96%, #a855f7) 100%)'}}>
      {/* Section Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-purple-500/15" style={{background: 'linear-gradient(90deg, color-mix(in srgb, #a855f7 12%, transparent), color-mix(in srgb, #a855f7 4%, transparent))'}}>
        <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-purple-500/15 text-purple-500 shrink-0">
          <Receipt className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-black text-purple-500 uppercase tracking-widest">5. {localizeTaxText("GST")} Purchase Entry</span>
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
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">Enable this to log the supplier bill, purchase price, and quantity into your {localizeTaxText("GST")} purchase ledger for ITC (Input Tax Credit) tracking.</p>
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
              <CurrencyIcon className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-black text-muted-foreground uppercase tracking-wider">Purchase Figures</span>
            </div>
            <div className="grid grid-cols-2 gap-0 divide-x divide-border/50">
              <div className="p-4">
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Purchase Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm select-none">{getCurrencyPrefix()}</span>
                  <input
                    type="number" step="any"
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
                    type="number" step="any"
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
                            {s.balance_type === 'PAYABLE' && (s.balance ?? 0) > 0 && (
                              <span className="text-xs text-red-500 ml-auto font-bold">{getCurrencyPrefix()}{Number(s.balance).toFixed(getCurrencyDecimals())}</span>
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
              This purchase entry will be recorded in your <span className="font-bold text-foreground">{localizeTaxText("GST")} Purchase Ledger</span> and may be used for <span className="font-bold text-foreground">Input Tax Credit (ITC)</span> reconciliation.
            </p>
          </div>

        </div>
      )}
    </section>
  );
}
