import { Tags } from 'lucide-react';
import { RedCrossButton } from '../../ui/RedCrossButton';

export interface SettingsGradesHeaderProps {
  categories: string[];
  onClose?: () => void;
  totalGrades: number;
}

/** Sticky page header with the category / grade counts and close button. */
export function SettingsGradesHeader({ categories, onClose, totalGrades }: SettingsGradesHeaderProps) {
  return (
    <header className="shrink-0 z-10 border-b border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-4 px-5 py-3 select-none">
        <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
          <Tags className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-foreground truncate">Categories &amp; Grades</h1>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          </div>
          <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
            {categories.length} categories &middot; {totalGrades} grades configured
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onClose && (
            <RedCrossButton onClick={onClose} title="Close" />
          )}
        </div>
      </div>
    </header>
  );
}
