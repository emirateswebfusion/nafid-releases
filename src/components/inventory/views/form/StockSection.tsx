import { Package } from 'lucide-react';
import clsx from 'clsx';
import { Select } from '../../../ui/Select';
import type { InventoryFormViewProps } from '../InventoryFormView';

export interface StockSectionProps {
  formData: InventoryFormViewProps['formData'];
  handleInputChange: InventoryFormViewProps['handleInputChange'];
}

/** Product form section 4: opening stock, unit and stock alerts. */
export function StockSection({
  formData, handleInputChange,
}: StockSectionProps) {
  return (
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
  );
}
