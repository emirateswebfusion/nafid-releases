import { getCurrencyPrefix, getCurrencyDecimals } from '../../../utils/localization/storeProfile';
import {
  ArrowLeft, Check, Edit2, Edit3, Loader2, Plus, Search, Tag, Trash, X,
} from 'lucide-react';
import clsx from 'clsx';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import type { SettingsGradesState } from '../hooks/useSettingsGradesState';
import type { Grade } from '../settingsGradesTypes';
import { useBillingPermissions } from '../../../hooks/useBillingPermissions';

export interface CategoryGradesTableProps {
  filteredGrades: Grade[];
  handleDelete: (grade: Grade) => void;
  handleOpenAdd: () => void;
  handleUpdate: (id: string) => Promise<void>;
  sg: SettingsGradesState;
  startCategoryRename: (cat: string) => void;
  startEdit: (grade: Grade) => void;
}

/** Focused category grades table (spreadsheet) shown after drilling into a category. */
export function CategoryGradesTable({
  filteredGrades, handleDelete, handleOpenAdd, handleUpdate, sg, startCategoryRename, startEdit,
}: CategoryGradesTableProps) {
  const { canViewCost } = useBillingPermissions();
  const cost = (value: number) => (canViewCost ? `${getCurrencyPrefix()}${value.toFixed(getCurrencyDecimals())}` : '•••');
  const {
    editForm, editingId, operating, searchQuery, selectedCategory, setConfirmDeleteCategory, setEditForm,
    setSearchQuery, setSelectedCategory,
  } = sg;
  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
      {/* Top Category Context Header */}
      <div className="bg-card border border-border rounded-[28px] p-5 shadow-sm select-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <button
              onClick={() => setSelectedCategory('all')}
              className="p-2.5 hover:bg-muted rounded-2xl text-muted-foreground hover:text-foreground transition-all border border-border hover:border-border cursor-pointer shrink-0"
              title="Back to all categories"
            >
              <ArrowLeft className="w-4.5 h-4.5" />
            </button>
            <div className="leading-tight text-left">
              <div className="flex items-center gap-2">
                <h4 className="font-extrabold text-foreground text-sm">{selectedCategory}</h4>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-bold shrink-0">
                  Category
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {filteredGrades.length} grade{filteredGrades.length !== 1 ? 's' : ''}
                {filteredGrades.length > 0 && (
                  <>
                    {' '}
                    {getCurrencyPrefix()} Avg Purchase: <span className="font-mono font-bold text-foreground/80">{cost(filteredGrades.reduce((s, g) => s + (g.purchase_price || 0), 0) / filteredGrades.length)}</span>
                    {' '}
                    {getCurrencyPrefix()} Avg MRP: <span className="font-mono font-bold text-foreground/80">{getCurrencyPrefix()}{(filteredGrades.reduce((s, g) => s + g.rate, 0) / filteredGrades.length).toFixed(getCurrencyDecimals())}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              onClick={() => startCategoryRename(selectedCategory)}
              className="p-2 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-all cursor-pointer border border-transparent hover:border-border/40"
              title="Rename Category"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setConfirmDeleteCategory(selectedCategory)}
              className="p-2 hover:bg-destructive/15 rounded-xl text-muted-foreground hover:text-destructive transition-all cursor-pointer border border-transparent hover:border-border/40"
              title="Delete Category"
            >
              <Trash className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Action Row */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card border border-border p-4 rounded-[28px] shadow-sm">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/45" />
          <input
            type="text"
            placeholder={`Search grades in ${selectedCategory}...`}
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
          <Plus className="w-4.5 h-4.5 shrink-0" /> Add Grade to {selectedCategory}
        </Button>
      </div>

      {/* Grades Table Spreadsheets Container */}
      {filteredGrades.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground bg-muted/20 rounded-[28px] border border-dashed border-border flex flex-col items-center justify-center gap-4 p-6">
          <div className="p-4.5 bg-muted/30 rounded-2xl shadow-inner">
            <Tag className="w-10 h-10 text-muted-foreground/30 stroke-[1.5]" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">
              {searchQuery ? 'No grades match your search.' : 'No grades in this category.'}
            </p>
            <p className="text-xs text-muted-foreground/70 max-w-xs mx-auto mt-1 leading-relaxed">
              {searchQuery
                ? 'Try adjusting your query term or clear search.'
                : 'Set up pricing grades to establish distinct base rates under this category.'}
            </p>
          </div>
          {!searchQuery && (
            <Button
              size="sm"
              onClick={handleOpenAdd}
              variant="outline"
              className="mt-1 rounded-xl shadow-sm font-bold py-2 px-4 cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-1.5 shrink-0" /> Add Your First Grade
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-[28px] overflow-hidden shadow-sm">
          <div className="hidden sm:grid grid-cols-12 gap-3 px-6 py-3 bg-muted/20 dark:bg-muted/10 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 border-b border-border select-none">
            <div className="col-span-4">Grade Name</div>
            <div className="col-span-2">Purchase Price ({getCurrencyPrefix()}/kg)</div>
            <div className="col-span-2">MRP ({getCurrencyPrefix()}/kg)</div>
            <div className="col-span-2">Offer ({getCurrencyPrefix()}/kg)</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>
          {filteredGrades.map((grade) => {
            const isEditing = editingId === grade.grade_id;
            return (
              <div
                key={grade.grade_id}
                className={clsx(
                  'border-b border-border last:border-b-0 transition-all duration-200',
                  isEditing ? 'bg-primary/[0.03]' : 'hover:bg-muted/10'
                )}
              >
                {isEditing ? (
                  /* Inline Editing View */
                  <div className="px-6 py-4 space-y-4 bg-muted/20 dark:bg-muted/10 select-none">
                    <div className="flex items-center justify-between pb-2 border-b border-border">
                      <span className="text-[10px] font-black text-primary flex items-center gap-1.5 uppercase tracking-wider">
                        <Edit2 className="w-3.5 h-3.5" /> Editing Grade
                      </span>
                      <span className="text-[9px] text-muted-foreground/60 font-mono font-semibold">
                        ID: {grade.grade_id.slice(0, 8)}...
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          Grade Name (optional)
                        </label>
                        <input
                          value={editForm.grade_name}
                          onChange={e => setEditForm({ ...editForm, grade_name: e.target.value })}
                          className="w-full px-3.5 h-9.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all font-bold text-foreground"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          Purchase Price ({getCurrencyPrefix()})
                        </label>
                        {!canViewCost ? (
                          <div className="w-full px-3.5 h-9.5 text-xs bg-muted/40 border border-border rounded-xl text-muted-foreground flex items-center" title="Hidden: the owner has not allowed you to see purchase cost">Hidden</div>
                        ) : (
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold">{getCurrencyPrefix()}</span>
                          <input
                            type="number"
                            value={editForm.purchase_price || ''}
                            onChange={e => setEditForm({ ...editForm, purchase_price: parseFloat(e.target.value) || 0 })}
                            className="w-full pl-7 pr-3 h-9.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all font-mono font-bold text-foreground"
                          />
                        </div>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          MRP ({getCurrencyPrefix()})
                        </label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold">{getCurrencyPrefix()}</span>
                          <input
                            type="number"
                            value={editForm.rate || ''}
                            onChange={e => setEditForm({ ...editForm, rate: parseFloat(e.target.value) || 0 })}
                            className="w-full pl-7 pr-3 h-9.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all font-mono font-bold text-foreground"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          Offer ({getCurrencyPrefix()})
                        </label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold">{getCurrencyPrefix()}</span>
                          <input
                            type="number"
                             value={editForm.offer_price || ''}
                            onChange={e => setEditForm({ ...editForm, offer_price: e.target.value === '' ? null : (parseFloat(e.target.value) || 0) })}
                            className="w-full pl-7 pr-3 h-9.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all font-mono font-bold text-foreground"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2.5 pt-3 border-t border-border">
                      <button
                        onClick={() => handleUpdate(grade.grade_id)}
                        disabled={operating}
                        className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:bg-primary/95 transition-all flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                      >
                        {operating ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        Save Changes
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Standard Row View */
                  <div className="px-6 py-4 grid grid-cols-12 items-center gap-3">
                    <div className="col-span-4 flex items-center gap-3.5 min-w-0">
                      <div className="p-2 bg-muted/40 dark:bg-muted/10 rounded-xl border border-border shrink-0 shadow-inner">
                        <Tag className="w-3.5 h-3.5 text-muted-foreground/75" />
                      </div>
                      <span className="text-xs font-bold text-foreground truncate">{grade.grade_name || '(General)'}</span>
                    </div>
                    <div className="col-span-2 font-mono font-bold text-foreground/80 text-xs">
                      {cost(grade.purchase_price || 0)}
                    </div>
                    <div className="col-span-2 font-mono font-extrabold text-primary text-xs">
                      {getCurrencyPrefix()}{grade.rate.toFixed(getCurrencyDecimals())}
                    </div>
                    <div className="col-span-2 font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                      {(grade.offer_price ?? 0) > 0 ? `${getCurrencyPrefix()}${(grade.offer_price ?? 0).toFixed(getCurrencyDecimals())}` : '-'}
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-1.5 border-l border-border/60 pl-3">
                      <button
                        onClick={() => startEdit(grade)}
                        className="p-2 hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl transition-all cursor-pointer"
                        title="Edit Grade"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(grade)}
                        disabled={operating}
                        className="p-2 hover:bg-destructive/15 text-muted-foreground hover:text-destructive rounded-xl transition-all cursor-pointer"
                        title="Delete Grade"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
