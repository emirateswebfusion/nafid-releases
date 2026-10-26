import { Boxes, Plus } from 'lucide-react';
import { RedCrossButton } from '../../ui/RedCrossButton';

export interface ComboManagerHeaderProps {
  handleOpenAdd: () => void;
  isRestricted?: boolean;
  onClose?: () => void;
}

/** Header toolbar: title and the create combo offer button plus optional close button. */
export function ComboManagerHeader({ handleOpenAdd, isRestricted, onClose }: ComboManagerHeaderProps) {
  return (
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-xs">
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 shadow-inner shrink-0">
              <Boxes className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-foreground truncate tracking-tight">
                  Combo Offers & Bundles
                </h1>
              </div>
              <p className="text-xs text-muted-foreground font-medium leading-none mt-1 truncate">
                Bundle products at special discount prices with accurate constituent inventory deduction
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-extrabold rounded-xl transition-all shadow-md shadow-purple-500/20 active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Combo Offer</span>
            </button>
            {!isRestricted && onClose && (
              <RedCrossButton onClick={onClose} title="Close" />
            )}
          </div>
        </div>
      </header>
  );
}
