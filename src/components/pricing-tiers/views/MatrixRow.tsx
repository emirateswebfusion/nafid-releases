import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import React from 'react';
import { X, Save } from 'lucide-react';
import clsx from 'clsx';
import type { MatrixRowProps } from '../pricingTiersTypes';

// ── MEMOIZED MATRIX ROW FOR 60FPS TYPING & ZERO LAG ───────────────────
export const MatrixRow = React.memo(({
  index,
  product,
  matrixTiers,
  rowPrices,
  initPrices,
  operating,
  onPriceChange,
  onSaveRow
}: MatrixRowProps) => {
  const pId = product.product_id;
  const isModified = matrixTiers.some(t => (rowPrices[t.pricing_tier_id] ?? '') !== (initPrices[t.pricing_tier_id] ?? ''));

  return (
    <div
      className={clsx(
        'flex items-center gap-4 px-6 py-2.5 border-b border-border/50 hover:bg-muted/30 transition-colors',
        isModified && 'bg-amber-500/5'
      )}
    >
      {/* Sl. No. */}
      <div className="w-12 text-center text-xs font-bold text-muted-foreground shrink-0">
        {index + 1}
      </div>

      {/* Product Info - Full View with Text Wrap */}
      <div className="flex-1 min-w-[240px] sm:min-w-[280px]">
        <p
          className="text-sm font-bold text-foreground leading-snug whitespace-normal break-words cursor-text select-text"
          title={product.name}
        >
          {product.name}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {product.sku_barcode && (
            <span
              className="text-[10px] font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border/40 shrink-0"
              title={`Barcode: ${product.sku_barcode}`}
            >
              {product.sku_barcode}
            </span>
          )}
          {product.category && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 shrink-0"
              title={`Category: ${product.category}`}
            >
              {product.category}
            </span>
          )}
        </div>
      </div>

      {/* Base MRP */}
      <div className="w-28 text-center text-xs font-black text-muted-foreground shrink-0">
        {getCurrencyPrefix()}{Number(product.base_price || 0).toFixed(2)}
      </div>

      {/* Tier Price Inputs */}
      {matrixTiers.map(t => {
        const val = rowPrices[t.pricing_tier_id] ?? '';
        const isCustom = val !== '' && !isNaN(Number(val));
        return (
          <div key={t.pricing_tier_id} className="w-36 shrink-0">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">{getCurrencyPrefix()}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={val}
                onChange={e => onPriceChange(pId, t.pricing_tier_id, e.target.value)}
                onWheel={e => (e.target as HTMLInputElement).blur()}
                placeholder={Number(product.base_price || 0).toFixed(2)}
                className={clsx(
                  'w-full pl-7 pr-6 py-2 text-xs font-bold bg-background border rounded-xl focus:outline-none focus:ring-2 no-spinners text-right',
                  isCustom
                    ? 'border-primary text-foreground bg-primary/5 focus:ring-primary/10'
                    : 'border-border text-muted-foreground focus:border-primary focus:ring-primary/10'
                )}
              />
              {isCustom && (
                <button
                  type="button"
                  onClick={() => onPriceChange(pId, t.pricing_tier_id, '')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Save Row */}
      <div className="w-14 flex justify-center shrink-0">
        <button
          onClick={() => onSaveRow(pId)}
          disabled={operating || !isModified}
          title={isModified ? 'Save row' : 'No changes'}
          className={clsx(
            'p-2 rounded-lg cursor-pointer inline-flex items-center justify-center',
            isModified
              ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-90'
              : 'bg-muted text-muted-foreground/30 cursor-not-allowed'
          )}
        >
          <Save className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  if (prevProps.index !== nextProps.index) return false;
  if (prevProps.product !== nextProps.product) return false;
  if (prevProps.matrixTiers !== nextProps.matrixTiers) return false;
  if (prevProps.operating !== nextProps.operating) return false;
  if (prevProps.rowPrices !== nextProps.rowPrices) return false;
  if (prevProps.initPrices !== nextProps.initPrices) return false;
  return true;
});
