import { getCurrencyPrefix, getCurrencyDecimals } from '../../../utils/localization/storeProfile';
import {
  Check, ChevronRight, Edit3, Folder, Layers, Plus, Search, Trash, TrendingUp, X,
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../../ui/Button';
import type { SettingsGradesState } from '../hooks/useSettingsGradesState';
import { categoryColor, type Grade } from '../settingsGradesTypes';
import { useBillingPermissions } from '../../../hooks/useBillingPermissions';

export interface AllCategoriesDashboardProps {
  avgPurchasePrice: number;
  avgRate: number;
  categories: string[];
  groupedGrades: Record<string, Grade[]>;
  handleOpenAdd: () => void;
  handleRenameCategory: (oldCategory: string) => Promise<void>;
  sg: SettingsGradesState;
  startCategoryRename: (cat: string) => void;
  totalGrades: number;
}

/** Unified dashboard when "All Categories" is selected: stats, search, and category cards. */
export function AllCategoriesDashboard({
  avgPurchasePrice, avgRate, categories, groupedGrades, handleOpenAdd, handleRenameCategory, sg,
  startCategoryRename, totalGrades,
}: AllCategoriesDashboardProps) {
  const { canViewCost } = useBillingPermissions();
  const cost = (value: number, digits: number) => (canViewCost ? `${getCurrencyPrefix()}${value.toFixed(digits)}` : '•••');
  const {
    categoryRenameValue, editingCategory, operating, searchQuery, setCategoryRenameValue, setConfirmDeleteCategory,
    setEditingCategory, setSearchQuery, setSelectedCategory,
  } = sg;
  return (
    <div className="space-y-6">
      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
        <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
          <div className="p-3.5 bg-gradient-to-br from-blue-500/10 to-blue-500/5 text-blue-600 dark:text-blue-400 rounded-2xl group-hover:scale-105 transition-transform shadow-inner">
            <Folder className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-black tracking-tight text-foreground font-mono">{categories.length}</p>
            <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider">Categories</p>
          </div>
        </div>
        <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
          <div className="p-3.5 bg-gradient-to-br from-purple-500/10 to-purple-500/5 text-purple-600 dark:text-purple-400 rounded-2xl group-hover:scale-105 transition-transform shadow-inner">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-black tracking-tight text-foreground font-mono">{totalGrades}</p>
            <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider">Grades Configured</p>
          </div>
        </div>
        <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
          <div className="p-3.5 bg-gradient-to-br from-amber-500/10 to-amber-500/5 text-amber-600 dark:text-amber-400 rounded-2xl group-hover:scale-105 transition-transform shadow-inner">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-black tracking-tight text-foreground font-mono">{cost(avgPurchasePrice, getCurrencyDecimals())}</p>
            <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider">Average Purchase Price</p>
          </div>
        </div>
        <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
          <div className="p-3.5 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 rounded-2xl group-hover:scale-105 transition-transform shadow-inner">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-black tracking-tight text-foreground font-mono">{getCurrencyPrefix()}{avgRate.toFixed(getCurrencyDecimals())}</p>
            <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider">Average Base MRP</p>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card border border-border p-4 rounded-[28px] shadow-sm">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/45" />
          <input
            type="text"
            placeholder="Search grades or categories..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-8 py-2.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-semibold text-foreground"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-1 hover:bg-muted rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <Button
          size="sm"
          onClick={handleOpenAdd}
          className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl shadow-sm font-bold active:scale-95 transition-all py-2.5 px-5 cursor-pointer shrink-0"
        >
          <Plus className="w-4.5 h-4.5 shrink-0" /> Add New Grade
        </Button>
      </div>

      {/* Dashboard Category Cards Grid */}
      {Object.entries(groupedGrades).length === 0 ? (
        <div className="text-center py-20 text-muted-foreground bg-muted/20 rounded-[28px] border border-dashed border-border flex flex-col items-center justify-center gap-4 p-6">
          <div className="p-4.5 bg-muted/30 rounded-2xl shadow-inner">
            <Layers className="w-10 h-10 text-muted-foreground/30 stroke-[1.5]" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">
              {searchQuery ? 'No grades match your search.' : 'No categories configured yet.'}
            </p>
            <p className="text-xs text-muted-foreground/70 max-w-xs mx-auto mt-1 leading-relaxed">
              {searchQuery
                ? 'Try adjusting your search terms or filters.'
                : 'Create and organize grades under categories to manage standard base rates.'}
            </p>
          </div>
          {!searchQuery && (
            <Button
              size="sm"
              onClick={handleOpenAdd}
              variant="outline"
              className="mt-1 rounded-xl shadow-sm font-bold py-2 px-4 cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-1 shrink-0" /> Create Your First Grade
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {Object.entries(groupedGrades).map(([category, categoryGrades], index) => {
            const colorClass = categoryColor(index);
            const avgCatRate = categoryGrades.reduce((sum, g) => sum + g.rate, 0) / categoryGrades.length;
            const avgCatPurchasePrice = categoryGrades.reduce((sum, g) => sum + (g.purchase_price || 0), 0) / categoryGrades.length;
            const isRenaming = editingCategory === category;
            return (
              <div
                key={category}
                className="bg-card border border-border rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 flex flex-col justify-between group relative"
              >
                {/* Header Row */}
                <div className="flex items-start justify-between gap-3 mb-5">
                  {isRenaming ? (
                    <div className="flex items-center gap-2 w-full select-none">
                      <div className="flex-1 flex items-center gap-1.5 bg-background/50 border border-primary/30 rounded-xl px-2.5 py-1.5">
                        <Folder className="w-3.5 h-3.5 text-primary shrink-0" />
                        <input
                          value={categoryRenameValue}
                          onChange={e => setCategoryRenameValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRenameCategory(category);
                            if (e.key === 'Escape') setEditingCategory(null);
                          }}
                          className="flex-1 text-xs bg-transparent outline-none min-w-0 font-bold text-foreground"
                          autoFocus
                        />
                      </div>
                      <button
                        onClick={() => handleRenameCategory(category)}
                        disabled={operating}
                        className="p-2 bg-primary/15 text-primary rounded-xl hover:bg-primary hover:text-primary-foreground transition-all cursor-pointer shrink-0"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingCategory(null)}
                        className="p-2 text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-all cursor-pointer shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={clsx('p-2.5 rounded-2xl shadow-inner shrink-0', colorClass)}>
                          <Folder className="w-4.5 h-4.5" />
                        </div>
                        <div className="leading-tight">
                          <h4 className="font-extrabold text-foreground text-sm truncate">{category}</h4>
                          <p className="text-[9px] text-muted-foreground/60 font-black uppercase tracking-widest mt-0.5 select-none">
                            {categoryGrades.length} Grade{categoryGrades.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-card rounded-lg border border-border p-0.5 shrink-0 shadow-sm">
                        <button
                          onClick={() => startCategoryRename(category)}
                          className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          title="Rename Category"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteCategory(category)}
                          className="p-1.5 hover:bg-destructive/15 rounded-md text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                          title="Delete Category"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Quick Grades Preview */}
                <div className="space-y-2 border-t border-b border-border/30 py-3.5 my-1.5 flex-1">
                  {categoryGrades.slice(0, 3).map((g) => (
                    <div key={g.grade_id} className="flex justify-between items-center text-[11px] font-semibold text-muted-foreground/90">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-border shrink-0" />
                        <span className="truncate text-foreground/80">{g.grade_name || '(General)'}</span>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground font-semibold">
                        P: <span className="text-foreground/90 font-extrabold">{cost(g.purchase_price || 0, 1)}</span> | M: <span className="text-primary font-extrabold">{getCurrencyPrefix()}{g.rate.toFixed(1)}</span>
                        {g.offer_price ? <> | O: <span className="text-emerald-500 font-extrabold">{getCurrencyPrefix()}{g.offer_price.toFixed(1)}</span></> : null}
                      </span>
                    </div>
                  ))}
                  {categoryGrades.length > 3 && (
                    <p className="text-[10px] text-muted-foreground/50 italic text-left pl-3">
                      + {categoryGrades.length - 3} more grade(s)
                    </p>
                  )}
                </div>

                {/* Bottom Action Footer */}
                <div className="flex items-center justify-between mt-4 select-none">
                  <div className="leading-tight text-left">
                    <span className="text-[9px] text-muted-foreground/75 font-bold uppercase tracking-wider block">Avg Price (P / M)</span>
                    <span className="text-xs font-extrabold text-foreground font-mono">
                      {cost(avgCatPurchasePrice, 1)} / {getCurrencyPrefix()}{avgCatRate.toFixed(1)}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedCategory(category)}
                    className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-foreground bg-primary/10 hover:bg-primary border border-primary/20 hover:border-primary py-2 px-3.5 rounded-xl cursor-pointer transition-all duration-200"
                  >
                    <span>Manage Grades</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
