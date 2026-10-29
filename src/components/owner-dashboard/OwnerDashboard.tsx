import { useRef } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { useFeatureFlagsStore } from '../../config/featureFlags';
import { hasPermission } from '../../utils/security/permissions';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { DigitalClock } from './DigitalClock';
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
            {(isSyncing || syncComplete) && syncProgress ? (
                <div className="px-6 py-2.5 border-t border-border bg-card relative z-0">
                    <div className="flex items-center gap-3 mb-1.5">
                        <span className="text-xs font-medium text-foreground/80 shrink-0">
                            {syncComplete ? 'Sync Complete' : syncProgress.label}
                        </span>
                        <div className="flex-1 bg-primary/10 rounded-full h-2 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ease-out ${syncComplete ? 'bg-emerald-500' : 'bg-primary'}`}
                                style={{ width: `${syncComplete ? 100 : syncProgress.percent}%` }}
                            />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                            {syncComplete ? '100%' : `${syncProgress.percent}%`}
                        </span>
                    </div>
                    {!syncComplete && shuffledQuotes.length > 0 && (
                        <div className="text-center">
                            <p className="text-[11px] text-muted-foreground/70 italic leading-relaxed">
                                &ldquo;{QUOTES[shuffledQuotes[quoteIndex]]?.text ?? QUOTES[quoteIndex].text}&rdquo;
                            </p>
                            <p className="text-[10px] text-muted-foreground/50">
                                — {QUOTES[shuffledQuotes[quoteIndex]]?.author ?? QUOTES[quoteIndex].author}
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="px-8 py-3.5 border-t border-border bg-muted/30 relative z-0">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${isLastSyncRecent ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            <span>Last sync: <span className="font-medium text-foreground/70">{displayTime}</span></span>
                        </div>
                        <DigitalClock variant="footer" />
                    </div>
                </div>
            )}
        </div>
    );
}
