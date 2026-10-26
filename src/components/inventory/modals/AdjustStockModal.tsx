import React from 'react';
import { Plus, Minus, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { Modal } from '../../ui/Modal';
import type { Product } from '../inventoryHelpers';

export interface AdjustStockModalProps {
  adjustModal: { product: Product; mode: 'add' | 'reduce' } | null;
  setAdjustModal: React.Dispatch<React.SetStateAction<{ product: Product; mode: 'add' | 'reduce' } | null>>;
  adjustAmount: string;
  setAdjustAmount: (v: string) => void;
  adjustPcs: string;
  setAdjustPcs: (v: string) => void;
  adjustCurrentPcs: number;
  confirmAdjustStock: () => void;
  adjustingStockId: string | null;
}

export const AdjustStockModal: React.FC<AdjustStockModalProps> = ({
  adjustModal,
  setAdjustModal,
  adjustAmount,
  setAdjustAmount,
  adjustPcs,
  setAdjustPcs,
  adjustCurrentPcs,
  confirmAdjustStock,
  adjustingStockId,
}) => {
  if (!adjustModal) return null;

  return (
    <Modal
      isOpen={true}
      onClose={() => setAdjustModal(null)}
      title="Adjust Stock"
      className="max-w-md"
      closeButton={null}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-foreground truncate">{adjustModal.product.name}</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
              {adjustModal.product.sku_barcode || adjustModal.product.item_code}
            </p>
          </div>
          <div className="shrink-0 text-right bg-muted/40 border border-border rounded-xl px-3 py-1.5">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Current Stock</p>
            <p className="text-sm font-black text-foreground">
              {Number(adjustModal.product.current_stock).toFixed(['Kgs', 'Grams', 'Mtrs', 'Ltrs'].includes(adjustModal.product.uom ?? '') ? 3 : 0)} {adjustModal.product.uom}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 bg-muted/40 border border-border rounded-xl p-1">
          <button
            onClick={() => setAdjustModal({ ...adjustModal, mode: 'add' })}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer',
              adjustModal.mode === 'add'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background'
            )}
          >
            + Add
          </button>
          <button
            onClick={() => setAdjustModal({ ...adjustModal, mode: 'reduce' })}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer',
              adjustModal.mode === 'reduce'
                ? 'bg-red-500 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background'
            )}
          >
            − Reduce
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                {adjustModal.product.uom}
              </label>
              <input
                autoFocus
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                onWheel={e => (e.target as HTMLInputElement).blur()}
                value={adjustAmount}
                onChange={e => setAdjustAmount(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmAdjustStock(); } }}
                placeholder={`0.000`}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-lg font-black text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all no-spinners"
              />
              <p className="text-[10px] text-muted-foreground/70 font-semibold mt-1">
                Current: {Number(adjustModal.product.current_stock).toFixed(3)} {adjustModal.product.uom}
              </p>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                Pcs
              </label>
              <input
                type="number"
                min="0"
                step="1"
                onWheel={e => (e.target as HTMLInputElement).blur()}
                value={adjustPcs}
                onChange={e => setAdjustPcs(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmAdjustStock(); } }}
                placeholder="0"
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-lg font-black text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all no-spinners"
              />
              <p className="text-[10px] text-muted-foreground/70 font-semibold mt-1">
                Current: {adjustCurrentPcs} Pcs
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2 font-semibold">
            {(() => {
              const kgAmt = parseFloat(adjustAmount);
              const pcsAmt = parseFloat(adjustPcs);
              const hasKg = !isNaN(kgAmt) && kgAmt > 0;
              const hasPcs = !isNaN(pcsAmt) && pcsAmt > 0;
              if (!hasKg && !hasPcs) return 'Enter an amount in weight or pcs to see the new stock';
              const sign = adjustModal.mode === 'add' ? 1 : -1;
              const newKg = hasKg ? Number(adjustModal.product.current_stock) + sign * kgAmt : Number(adjustModal.product.current_stock);
              const newPcs = hasPcs ? adjustCurrentPcs + sign * pcsAmt : adjustCurrentPcs;
              if (newKg < 0 || newPcs < 0) return 'Resulting stock would be negative';
              return `New stock: ${newKg.toFixed(3)} ${adjustModal.product.uom}${hasPcs ? ` • ${newPcs} Pcs` : ''}`;
            })()}
          </p>
        </div>

        <div className="flex items-center justify-end border-t border-border mt-1 pt-4">
          <button
            onClick={confirmAdjustStock}
            disabled={adjustingStockId === adjustModal.product.product_id}
            className={clsx(
              'px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50',
              adjustModal.mode === 'add'
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                : 'bg-red-500 hover:bg-red-600 text-white'
            )}
          >
            {adjustingStockId === adjustModal.product.product_id ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              adjustModal.mode === 'add' ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />
            )}
            {adjustModal.mode === 'add' ? 'Add' : 'Reduce'} Stock
          </button>
        </div>
      </div>
    </Modal>
  );
};
