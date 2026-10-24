import { RefreshCw, ShoppingBag } from 'lucide-react';
import type { ComboOffer } from '../comboTypes';
import type { ComboManagerState } from '../hooks/useComboManagerState';
import { ComboGrid } from './ComboGrid';
import { ComboTable } from './ComboTable';

export interface ComboListViewProps {
  copyBarcodeToClipboard: (barcode: string) => void;
  filteredCombos: ComboOffer[];
  handleDeleteCombo: (combo: ComboOffer) => void;
  handleOpenAdd: () => void;
  handleOpenEdit: (combo: ComboOffer) => void;
  handleToggleActive: (combo: ComboOffer) => Promise<void>;
  cm: ComboManagerState;
}

/** Combo presentation: loading spinner, empty state, and the grid / table layouts. */
export function ComboListView({
  copyBarcodeToClipboard, filteredCombos, handleDeleteCombo, handleOpenAdd, handleOpenEdit, handleToggleActive, cm,
}: ComboListViewProps) {
  const { loading, viewLayout } = cm;
  return (
    <>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-purple-600" />
            <p className="text-xs font-bold uppercase tracking-wider">Loading Combo Offers...</p>
          </div>
        ) : filteredCombos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-border rounded-3xl bg-card p-8 space-y-4">
            <div className="p-4 rounded-2xl bg-purple-500/10 text-purple-600">
              <ShoppingBag className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-foreground">No Combo Offers Found</h3>
              <p className="text-xs text-muted-foreground max-w-md mt-1">
                Bundle two or more products together at a special price or offer BOGO deals. Each constituent product will automatically deduct from inventory upon sale.
              </p>
            </div>
            <button
              onClick={handleOpenAdd}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-extrabold rounded-xl transition-all shadow-md shadow-purple-500/20 cursor-pointer"
            >
              Create Your First Combo Offer
            </button>
          </div>
        ) : viewLayout === 'grid' ? (
        <ComboGrid
          cm={cm} copyBarcodeToClipboard={copyBarcodeToClipboard} filteredCombos={filteredCombos}
          handleDeleteCombo={handleDeleteCombo} handleOpenEdit={handleOpenEdit} handleToggleActive={handleToggleActive}
        />
        ) : (
          /* Table Layout View */
          <ComboTable
            filteredCombos={filteredCombos} handleDeleteCombo={handleDeleteCombo} handleOpenEdit={handleOpenEdit}
            handleToggleActive={handleToggleActive}
          />
        )}
    </>
  );
}
