import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import React from 'react';
import { Printer } from 'lucide-react';
import Barcode from 'react-barcode';
import clsx from 'clsx';
import { Modal } from '../../ui/Modal';
import { QRCodePreview } from '../inventoryHelpers';
import type { Product } from '../inventoryUtils';

export interface BarcodePrintModalProps {
  printModalProduct: Product | null;
  onClose: () => void;
  labelCodeType: string;
  printPrice: boolean;
  setPrintPrice: (v: boolean) => void;
  printQuantity: number | string;
  setPrintQuantity: (v: number | string) => void;
  printProductLabel: (product: Product) => void;
  grades: import('../hooks/useInventoryState').InventoryState['grades'];
}

export const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({
  printModalProduct,
  onClose,
  labelCodeType,
  printPrice,
  setPrintPrice,
  printQuantity,
  setPrintQuantity,
  printProductLabel,
  grades,
}) => {
  React.useEffect(() => {
    if (!printModalProduct) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [printModalProduct, onClose]);

  if (!printModalProduct) return null;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Print Barcode Label"
      className="max-w-lg"
    >
      <div className="flex flex-col">
        {/* ── Label Preview Card ── */}
        <div className="px-6 pt-6 pb-4">
          <div className="bg-white rounded-2xl border-2 border-dashed border-muted-foreground/25 p-6 flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,0,0,0.02)_10px,rgba(0,0,0,0.02)_20px)]" />
            <div className="relative">
              {labelCodeType === 'qrcode' ? (
                <QRCodePreview barcode={printModalProduct.sku_barcode as string} />
              ) : (
                <Barcode value={printModalProduct.sku_barcode as string} height={50} displayValue={false} margin={0} width={1.8} background="transparent" />
              )}
              <p className="font-bold text-gray-800 text-lg mt-3 tracking-tight">{printModalProduct.name}</p>
              <p className="font-mono text-sm text-gray-500 tracking-wider mt-0.5">{printModalProduct.sku_barcode}</p>
              <div className={clsx(
                "mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold",
                printPrice ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" : "bg-muted text-muted-foreground border border-border"
              )}>
                <span>MRP:</span>
                <span className="text-sm">
                  {getCurrencyPrefix()}{(() => {
                    const g = printModalProduct.grade_id ? grades.find(gr => gr.grade_id === printModalProduct.grade_id) : null;
                    const gr = g ? Number(g.rate) : null;
                    return (gr !== null && printModalProduct.pricing_mode === 'GRADE_RATE' ? gr : Number(printModalProduct.base_price)).toFixed(2);
                  })()}
                </span>
              </div>
              {!printPrice && (
                <div className="mt-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Price Hidden
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Settings ── */}
        <div className="px-6 pb-2 space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-4 items-end">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Number of Labels</label>
              <div className="flex items-center gap-2 bg-background border border-border rounded-xl p-1 pl-3 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
                <span className="text-muted-foreground text-sm font-semibold shrink-0">
                  <Printer className="w-4 h-4 inline -mt-0.5 mr-1.5" />
                  ×
                </span>
                <input
                  type="number"
                  min="1"
                  onWheel={e => (e.target as HTMLInputElement).blur()}
                  value={printQuantity}
                  onChange={e => setPrintQuantity(e.target.value === '' ? '' : e.target.value)}
                  className="w-16 bg-transparent text-foreground focus:outline-none text-center font-bold text-lg no-spinners py-1.5"
                />
              </div>
            </div>
            <label className="flex items-center gap-3 bg-muted/30 border border-border rounded-xl px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors select-none">
              <input
                type="checkbox"
                checked={printPrice}
                onChange={e => setPrintPrice(e.target.checked)}
                className="w-4 h-4 accent-primary rounded cursor-pointer"
              />
              <span className="text-sm font-semibold text-foreground">Show Price</span>
            </label>
          </div>
        </div>

        {/* ── Status & Actions ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border mt-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-xl text-sm font-semibold transition-all cursor-pointer"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => printProductLabel(printModalProduct)}
              className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Print {printQuantity !== '' && Number(printQuantity) > 1 ? `${printQuantity} Labels` : 'Label'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
