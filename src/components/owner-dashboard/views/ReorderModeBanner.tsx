import { GripVertical, RotateCcw, Check } from 'lucide-react';
import type { OwnerDashboardState } from '../hooks/useOwnerDashboardState';

export interface ReorderModeBannerProps {
  setIsEditMode: (editing: boolean) => void;
  od: OwnerDashboardState;
}

/** Banner shown while the dashboard is in reorder (edit) mode, with save / reset controls. */
export function ReorderModeBanner({
  setIsEditMode, od,
}: ReorderModeBannerProps) {
  const { setShowCustomizeModal, setShowRestoreDialog } = od;
  return (
    <div className="mb-6 p-4 rounded-2xl bg-primary/10 border border-primary/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary text-primary-foreground shadow-xs">
          <GripVertical className="w-4 h-4" />
        </div>
        <div>
          <div className="text-xs font-bold text-foreground flex items-center gap-2">
            <span>Card Reorder Mode is Active</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary/20 text-primary font-black uppercase tracking-wider">
              Live
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Drag cards directly or use the ◀ ▶ buttons on each card to shift their position. Order is automatically saved.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setShowCustomizeModal(true)}
          className="px-3 py-1.5 text-xs font-bold bg-card hover:bg-muted border border-border rounded-xl text-foreground cursor-pointer shadow-xs transition-colors"
        >
          Open List View
        </button>
        <button
          onClick={() => setShowRestoreDialog(true)}
          className="px-3 py-1.5 text-xs font-bold bg-card hover:bg-muted border border-border rounded-xl text-muted-foreground hover:text-foreground cursor-pointer shadow-xs transition-colors"
          title="Reset to factory default sequence (Billing first, Cashier second...)"
        >
          <RotateCcw className="w-3.5 h-3.5 inline mr-1" />
          Reset
        </button>
        <button
          onClick={() => setIsEditMode(false)}
          className="px-4 py-1.5 text-xs font-bold bg-primary text-primary-foreground rounded-xl shadow-xs hover:opacity-95 cursor-pointer transition-opacity"
        >
          <Check className="w-3.5 h-3.5 inline mr-1" />
          Done
        </button>
      </div>
    </div>
  );
}
