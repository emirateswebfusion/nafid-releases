import { useState } from 'react';
import { RotateCcw, AlertTriangle, ShoppingCart, Banknote, Package, Globe, Megaphone, X, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import { useDashboardCardsStore } from '../store/dashboardCardsStore';
import { useFeatureFlagsStore, cashierPageTitle } from '../featureFlags';

interface RestoreDefaultCardsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RestoreDefaultCardsDialog({
  isOpen,
  onClose,
  onSuccess,
}: RestoreDefaultCardsDialogProps) {
  const { tenantId, userId, role } = useAuthStore();
  const { resetToDefault } = useDashboardCardsStore();
  const { flags: featureFlags } = useFeatureFlagsStore();
  const [isResetting, setIsResetting] = useState(false);

  if (!isOpen) return null;

  const cashierTitle = cashierPageTitle(featureFlags);

  const defaultSequencePreview = [
    { num: 1, title: 'Billing', shortcut: 'F1', icon: ShoppingCart, color: 'text-emerald-500 bg-emerald-500/10' },
    { num: 2, title: cashierTitle, icon: Banknote, color: 'text-yellow-500 bg-yellow-500/10' },
    { num: 3, title: 'Inventory Manager', icon: Package, color: 'text-cyan-500 bg-cyan-500/10' },
    { num: 4, title: 'E-Commerce Portal', icon: Globe, color: 'text-emerald-500 bg-emerald-500/10' },
    { num: 5, title: 'Advertisements', icon: Megaphone, color: 'text-amber-500 bg-amber-500/10' },
  ];

  const handleConfirm = async () => {
    setIsResetting(true);
    try {
      await resetToDefault(tenantId, userId, role);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to reset dashboard card order', err);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-sm select-none animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md bg-card border border-border shadow-2xl rounded-3xl p-6 flex flex-col space-y-4 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Close Button */}
        {!isResetting && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Header with Warning Icon */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border border-amber-500/20 bg-amber-500/10 text-amber-500 shadow-sm">
            <RotateCcw className="w-6 h-6 animate-in spin-in-180 duration-300" />
          </div>

          <div className="flex-1 min-w-0 pr-6">
            <h3 className="text-base font-bold text-foreground tracking-tight leading-snug">
              Restore Default Sequence
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1">
              Are you sure you want to reset your POS dashboard cards? Your custom card arrangement will be reverted to the factory default sequence.
            </p>
          </div>
        </div>

        {/* Visual Preview Box */}
        <div className="bg-muted/40 border border-border/80 rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground">
            <span>Restored Layout Preview:</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono font-semibold">
              Default Order
            </span>
          </div>

          <div className="space-y-1.5 pt-1">
            {defaultSequencePreview.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.num}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl bg-card border border-border/60 text-xs"
                >
                  <span className="text-[11px] font-mono font-bold text-muted-foreground w-4 text-center">
                    #{item.num}
                  </span>
                  <div className={clsx('p-1 rounded-lg shrink-0', item.color)}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-semibold text-foreground truncate flex-1">
                    {item.title}
                  </span>
                  {item.shortcut && (
                    <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.2 rounded border border-border">
                      {item.shortcut}
                    </span>
                  )}
                </div>
              );
            })}
            <div className="text-[10px] text-center text-muted-foreground/70 italic pt-1">
              + remaining modules restored in factory sequence
            </div>
          </div>
        </div>

        {/* Warning Note */}
        <div className="flex items-center gap-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>This will instantly update your dashboard and saved profile preferences.</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
          <button
            type="button"
            disabled={isResetting}
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
          >
            Keep Custom Layout
          </button>

          <button
            type="button"
            disabled={isResetting}
            onClick={handleConfirm}
            className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl font-bold text-xs bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
          >
            {isResetting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Restoring...</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore Defaults</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

