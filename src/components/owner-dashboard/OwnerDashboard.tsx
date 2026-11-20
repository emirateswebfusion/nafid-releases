import { useRef } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { useFeatureFlagsStore } from '../../config/featureFlags';
import { hasPermission } from '../../utils/security/permissions';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { SyncStatusFooter } from './views/SyncStatusFooter';
import { useDashboardCardsStore } from '../../store/dashboardCardsStore';
import { DashboardCardCustomizer } from './DashboardCardCustomizer';
import { RestoreDefaultCardsDialog } from './RestoreDefaultCardsDialog';
import { Modal } from '../ui/Modal';
import { type OwnerDashboardProps } from './ownerDashboardTypes';
import { useOwnerDashboardState } from './hooks/useOwnerDashboardState';
import { useOwnerDashboardEffects } from './hooks/useOwnerDashboardEffects';
import { useDashboardCards } from './hooks/useDashboardCards';
import { useDashboardCardOrdering } from './hooks/useDashboardCardOrdering';
import { DashboardCardGrid } from './views/DashboardCardGrid';
import { ReorderModeBanner } from './views/ReorderModeBanner';
import { DashboardHeader } from './views/DashboardHeader';
import { TaskBridgeFeedbackFAB } from '../taskbridge/TaskBridgeFeedbackModal';

export function OwnerDashboard({ isSyncing, syncProgress, syncComplete, shuffledQuotes, quoteIndex, QUOTES }: OwnerDashboardProps) {
    const { shopName, userName, lastSyncTime, setLastSyncTime, tenantId, userId, role, permissions, isCloudSyncPaused } = useAuthStore();
    const { theme, toggleTheme } = useThemeStore();
    const od = useOwnerDashboardState();
    const {
        displayTime, enableScrap, showCustomizeModal, setShowCustomizeModal, showRestoreDialog, setShowRestoreDialog,
    } = od;
    const { flags: featureFlags, loadFlags } = useFeatureFlagsStore();
    const menuRef = useRef<HTMLDivElement>(null);

    const {
        cardOrder,
        loadCardOrder,
        setCardOrder,
        isEditMode,
        setIsEditMode
    } = useDashboardCardsStore();

    useOwnerDashboardEffects({
        od, lastSyncTime, loadCardOrder, loadFlags, menuRef, role, setLastSyncTime, tenantId, userId,
    });

    useKeyboardShortcuts({
        'F1': () => {
            window.dispatchEvent(new CustomEvent('open-billing-page'));
        }
    });

    const { visibleCards, visibleCardIds } = useDashboardCards({
        cardOrder, enableScrap, featureFlags, permissions, role,
    });

    const { handleShiftCard, handleDashboardCardDragStart, handleDashboardCardDragOver, handleDashboardCardDragEnd, handleDashboardCardDrop } = useDashboardCardOrdering({
        od, cardOrder, role, setCardOrder, tenantId, userId, visibleCardIds,
    });

    // eslint-disable-next-line react-hooks/purity -- Date.now() is checked at render time to preserve the existing two-minute sync indicator.
    const isLastSyncRecent = Boolean(lastSyncTime && Date.now() - lastSyncTime < 120000);

    const canOpenSettings = hasPermission({ role, permissions }, 'settings.view');
    return (
        <div className="fixed inset-0 z-40 flex flex-col bg-background">
            {/* ═══════════════════════════════════════════════════
                HEADER
            ═══════════════════════════════════════════════════ */}
            <DashboardHeader
                canOpenSettings={canOpenSettings} isCloudSyncPaused={isCloudSyncPaused} isEditMode={isEditMode}
                isSyncing={isSyncing} menuRef={menuRef} role={role} setIsEditMode={setIsEditMode} shopName={shopName}
                theme={theme} toggleTheme={toggleTheme} userName={userName} od={od}
            />

            {/* Grid Content */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 md:p-6 pb-20 md:pb-6">
                {/* Reorder Mode Banner */}
                {isEditMode && (
                    <ReorderModeBanner
                        setIsEditMode={setIsEditMode} od={od}
                    />
                )}

                <DashboardCardGrid
                    handleDashboardCardDragEnd={handleDashboardCardDragEnd}
                    handleDashboardCardDragOver={handleDashboardCardDragOver}
                    handleDashboardCardDragStart={handleDashboardCardDragStart}
                    handleDashboardCardDrop={handleDashboardCardDrop} handleShiftCard={handleShiftCard}
                    isEditMode={isEditMode} visibleCards={visibleCards} od={od}
                />
            </div>

            {/* Customize Cards List Modal */}
            <Modal
                isOpen={showCustomizeModal}
                onClose={() => setShowCustomizeModal(false)}
                title="Customize Dashboard Cards"
                className="max-w-2xl"
            >
                <DashboardCardCustomizer
                    onClose={() => setShowCustomizeModal(false)}
                    allowedCardIds={visibleCardIds}
                />
            </Modal>

            {/* Custom Restore Defaults Confirmation Dialog */}
            <RestoreDefaultCardsDialog
                isOpen={showRestoreDialog}
                onClose={() => setShowRestoreDialog(false)}
            />

            {/* Footer — sync progress bar when syncing, last sync status when idle */}
            <SyncStatusFooter isSyncing={isSyncing} syncProgress={syncProgress} syncComplete={syncComplete}
                shuffledQuotes={shuffledQuotes} quoteIndex={quoteIndex} QUOTES={QUOTES}
                displayTime={displayTime} isLastSyncRecent={isLastSyncRecent} />
            <TaskBridgeFeedbackFAB />
        </div>
    );
}
