import { useRef, useMemo } from 'react';
import { useAuthStore } from '../../store/authStore';
import clsx from 'clsx';
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape';
import { useComboManagerState } from './hooks/useComboManagerState';
import { useComboLoadEffects } from './hooks/useComboLoadEffects';
import { useComboActions } from './hooks/useComboActions';
import { ComboManagerHeader } from './views/ComboManagerHeader';
import { ComboStatusToast } from './views/ComboStatusToast';
import { ComboMetrics } from './views/ComboMetrics';
import { ComboToolbar } from './views/ComboToolbar';
import { ComboListView } from './views/ComboListView';
import { ComboFormModal } from './views/ComboFormModal';
import { DeleteComboDialog } from './views/DeleteComboDialog';

export function ComboManager({ onClose, isRestricted }: { onClose?: () => void; isRestricted?: boolean }) {
  useCloseOnEscape(onClose);
  const { tenantId } = useAuthStore();

  const cm = useComboManagerState();
  const { combos, activeFilter, formData, selectedItems, showFormModal } = cm;
  const productSearchRef = useRef<HTMLInputElement>(null);

  const { loadCombos } = useComboLoadEffects({ cm, tenantId });

  const {
    handleOpenAdd, handleOpenEdit, handleGenerateBarcode, handleAddProductToCombo, handleUpdateItemQty,
    handleSaveCombo, handleToggleActive, handleDeleteCombo, confirmDeleteCombo, copyBarcodeToClipboard,
  } = useComboActions({ cm, loadCombos, productSearchRef, tenantId });

  // Calculate market MRP total
  const calcStandaloneTotal = () => {
    return selectedItems.reduce((acc, item) => acc + (Number(item.product_price || 0) * item.quantity), 0);
  };

  // Calculate effective offer price total
  const calcOfferPriceTotal = () => {
    return selectedItems.reduce((acc, item) => acc + (Number(item.offer_price || item.product_price || 0) * item.quantity), 0);
  };

  // Filtered combos based on tab & search
  const filteredCombos = useMemo(() => {
    return combos.filter(c => {
      if (activeFilter === 'ACTIVE' && !c.is_active) return false;
      if (activeFilter === 'INACTIVE' && c.is_active) return false;
      return true;
    });
  }, [combos, activeFilter]);

  // KPI Metrics
  const metrics = useMemo(() => {
    const total = combos.length;
    const active = combos.filter(c => c.is_active).length;
    const inactive = total - active;
    const totalItems = combos.reduce((acc, c) => acc + (c.items?.length || 0), 0);
    return { total, active, inactive, totalItems };
  }, [combos]);

  const standaloneTotal = calcStandaloneTotal();
  const comboPriceNum = parseFloat(formData.combo_price) || 0;
  const savingsAmount = Math.max(0, standaloneTotal - comboPriceNum);
  const savingsPct = standaloneTotal > 0 ? Math.round((savingsAmount / standaloneTotal) * 100) : 0;

  return (
    <div className={clsx(
      "flex flex-col h-full w-full bg-background text-foreground overflow-hidden font-sans select-none animate-in fade-in duration-200",
      !isRestricted && "fixed inset-0 z-50"
    )}>
      
      {/* ═══════════════════════════════════════════════════
          HEADER TOOLBAR
      ═══════════════════════════════════════════════════ */}
      <ComboManagerHeader handleOpenAdd={handleOpenAdd} isRestricted={isRestricted} onClose={onClose} />

      {/* Floating Status Toast */}
      <ComboStatusToast cm={cm} />

      {/* ═══════════════════════════════════════════════════
          MAIN CONTENT BODY
      ═══════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto w-full px-4 sm:px-6 py-6 space-y-6">

        {/* KPI Summary Banner Cards */}
        <ComboMetrics metrics={metrics} />

        {/* Action Controls & Search Toolbar */}
        <ComboToolbar cm={cm} />

        {/* ═══════════════════════════════════════════════════
            COMBOS PRESENTATION (GRID / TABLE)
        ═══════════════════════════════════════════════════ */}
        <ComboListView
          cm={cm} copyBarcodeToClipboard={copyBarcodeToClipboard} filteredCombos={filteredCombos}
          handleDeleteCombo={handleDeleteCombo} handleOpenAdd={handleOpenAdd} handleOpenEdit={handleOpenEdit}
          handleToggleActive={handleToggleActive}
        />
      </div>

      {/* ═══════════════════════════════════════════════════
          CREATE / EDIT FORM MODAL
      ═══════════════════════════════════════════════════ */}
      {showFormModal && (
        <ComboFormModal
          calcOfferPriceTotal={calcOfferPriceTotal} comboPriceNum={comboPriceNum}
          handleAddProductToCombo={handleAddProductToCombo} handleGenerateBarcode={handleGenerateBarcode}
          handleSaveCombo={handleSaveCombo} handleUpdateItemQty={handleUpdateItemQty}
          productSearchRef={productSearchRef} savingsAmount={savingsAmount} savingsPct={savingsPct}
          standaloneTotal={standaloneTotal} cm={cm}
        />
      )}

      {/* Delete Combo Confirmation Modal */}
      <DeleteComboDialog cm={cm} confirmDeleteCombo={confirmDeleteCombo} />
    </div>
  );
}
