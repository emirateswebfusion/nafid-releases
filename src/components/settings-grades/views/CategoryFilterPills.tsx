import { Folder, Layers } from 'lucide-react';
import clsx from 'clsx';
import type { SettingsGradesState } from '../hooks/useSettingsGradesState';

export interface CategoryFilterPillsProps {
  categories: string[];
  sg: SettingsGradesState;
}

/** Top scrollable category selection pills, styled like the hardware tabs. */
export function CategoryFilterPills({ categories, sg }: CategoryFilterPillsProps) {
  const { grades, selectedCategory, setSelectedCategory } = sg;
  return (
    <>
      {categories.length > 0 && (
        <div className="flex gap-1.5 p-1.5 bg-muted/50 dark:bg-muted/20 border border-border rounded-2xl overflow-x-auto scrollbar-none w-full max-w-fit shadow-inner mx-auto mb-2 select-none">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={clsx(
              "flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0",
              selectedCategory === 'all'
                ? "bg-background shadow-md shadow-foreground/[0.03] text-primary border-border/40 font-extrabold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Layers className="w-4 h-4 shrink-0 text-current" />
            <span>All Categories ({grades.length})</span>
          </button>
          {categories.map((cat, _index) => {
            const isTabActive = selectedCategory === cat;
            const count = grades.filter(g => g.category === cat).length;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={clsx(
                  "flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0",
                  isTabActive
                    ? "bg-background shadow-md shadow-foreground/[0.03] text-primary border-border/40 font-extrabold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Folder className="w-4 h-4 shrink-0 text-current opacity-70" />
                <span>{cat} ({count})</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
