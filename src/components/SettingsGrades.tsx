import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Trash, Edit2, Check, X, Loader2, Search,
  Folder, Layers, TrendingUp, Tag, ChevronDown, ChevronRight,
  FolderOpen, ArrowLeft, ArrowUpRight, Edit3, Tags
} from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Badge } from './ui/Badge';
import { useAuthStore } from '../store/authStore';
import clsx from 'clsx';

interface Grade {
  grade_id: string;
  tenant_id: string;
  category: string;
  grade_name: string;
  rate: number;
  purchase_price?: number;
}

export function SettingsGrades({ onClose, isRestricted }: { onClose?: () => void; isRestricted?: boolean }) {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [operating, setOperating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ category: '', grade_name: '', rate: 0, purchase_price: 0 });
  const [newForm, setNewForm] = useState({ category: '', grade_name: '', rate: 0, purchase_price: 0 });
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [categoryRenameValue, setCategoryRenameValue] = useState('');
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<string | null>(null);

  useEffect(() => {
    loadGrades();
  }, []);

  const loadGrades = async () => {
    if (window.electronAPI) {
      setLoading(true);
      const { tenantId } = useAuthStore.getState();
      const res = await window.electronAPI.dbGetGrades(tenantId || '');
      if (Array.isArray(res)) {
        setGrades(res);
      }
      setLoading(false);
    }
  };

  const categories = useMemo(() =>
    Array.from(new Set(grades.map(g => g.category))).sort(),
    [grades]
  );

  const totalGrades = grades.length;
  const avgRate = totalGrades > 0
    ? grades.reduce((sum, g) => sum + g.rate, 0) / totalGrades
    : 0;
  const avgPurchasePrice = totalGrades > 0
    ? grades.reduce((sum, g) => sum + (g.purchase_price || 0), 0) / totalGrades
    : 0;

  const filteredGrades = useMemo(() =>
    grades.filter(g => {
      const matchesCategory = selectedCategory === 'all' || g.category === selectedCategory;
      const matchesSearch =
        g.grade_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    }),
    [grades, selectedCategory, searchQuery]
  );

  const groupedGrades = useMemo(() => {
    const groups: Record<string, Grade[]> = {};
    filteredGrades.forEach(g => {
      if (!groups[g.category]) groups[g.category] = [];
      groups[g.category].push(g);
    });
    return groups;
  }, [filteredGrades]);

  const handleAdd = async () => {
    if (!newForm.category.trim() || !newForm.grade_name.trim() || newForm.rate <= 0 || newForm.purchase_price <= 0) {
      setError('Please fill in all fields (ensure Category, Grade, MRP > 0, and Purchase Price > 0).');
      return;
    }
    setError(null);
    setOperating(true);
    const { tenantId } = useAuthStore.getState();
    const grade = {
      grade_id: crypto.randomUUID(),
      tenant_id: tenantId || '',
      category: newForm.category.trim(),
      grade_name: newForm.grade_name.trim(),
      rate: newForm.rate,
      purchase_price: newForm.purchase_price
    };
    const res = await window.electronAPI.dbAddGrade(grade);
    if (res.success) {
      setIsAdding(false);
      setNewForm({ category: '', grade_name: '', rate: 0, purchase_price: 0 });
      await loadGrades();
    } else {
      setError(res.error || 'Failed to add grade');
    }
    setOperating(false);
  };

  const handleUpdate = async (id: string) => {
    if (!editForm.category.trim() || !editForm.grade_name.trim() || editForm.rate <= 0 || editForm.purchase_price <= 0) {
      setError('Please fill in all fields (ensure Category, Grade, MRP > 0, and Purchase Price > 0).');
      return;
    }
    setError(null);
    setOperating(true);
    const res = await window.electronAPI.dbUpdateGrade({
      grade_id: id,
      category: editForm.category.trim(),
      grade_name: editForm.grade_name.trim(),
      rate: editForm.rate,
      purchase_price: editForm.purchase_price
    });
    if (res.success) {
      setEditingId(null);
      await loadGrades();
    } else {
      setError(res.error || 'Failed to update grade');
    }
    setOperating(false);
  };

  const handleDelete = async (id: string) => {
    setOperating(true);
    const res = await window.electronAPI.dbDeleteGrade(id);
    if (res.success) {
      await loadGrades();
    } else {
      setError(res.error || 'Failed to delete grade');
    }
    setOperating(false);
  };

  const handleRenameCategory = async (oldCategory: string) => {
    const newName = categoryRenameValue.trim();
    if (!newName || newName === oldCategory) {
      setEditingCategory(null);
      return;
    }
    setError(null);
    setOperating(true);
    const targetGrades = grades.filter(g => g.category === oldCategory);
    const results = await Promise.all(
      targetGrades.map(g =>
        window.electronAPI.dbUpdateGrade({
          grade_id: g.grade_id,
          category: newName,
          grade_name: g.grade_name,
          rate: g.rate,
          purchase_price: g.purchase_price || 0
        })
      )
    );
    const failed = results.filter(r => !r.success);
    if (failed.length === 0) {
      setEditingCategory(null);
      if (selectedCategory === oldCategory) {
        setSelectedCategory(newName);
      }
      await loadGrades();
    } else {
      setError(`Failed to rename ${failed.length} grade(s). Check for duplicate names.`);
    }
    setOperating(false);
  };

  const handleDeleteCategory = async (category: string) => {
    setOperating(true);
    setConfirmDeleteCategory(null);
    const targetGrades = grades.filter(g => g.category === category);
    const results = await Promise.all(
      targetGrades.map(g => window.electronAPI.dbDeleteGrade(g.grade_id))
    );
    const failed = results.filter(r => !r.success);
    if (failed.length === 0) {
      if (selectedCategory === category) setSelectedCategory('all');
      await loadGrades();
    } else {
      setError(`Failed to delete ${failed.length} grade(s).`);
    }
    setOperating(false);
  };

  const startEdit = (grade: Grade) => {
    setEditingId(grade.grade_id);
    setEditForm({ category: grade.category, grade_name: grade.grade_name, rate: grade.rate, purchase_price: grade.purchase_price || 0 });
  };

  const handleOpenAdd = () => {
    setNewForm({
      category: selectedCategory !== 'all' ? selectedCategory : '',
      grade_name: '',
      rate: 0,
      purchase_price: 0
    });
    setIsAdding(true);
    setError(null);
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter') return;
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;
    e.preventDefault();
    const container = target.closest('[data-enter-nav]');
    if (!container) return;
    const focusable = container.querySelectorAll<HTMLElement>('[data-select-trigger]:not([disabled]), input:not([type="checkbox"]):not([type="radio"]):not([disabled]), select:not([disabled]), textarea:not([disabled])');
    const idx = Array.from(focusable).indexOf(target as HTMLInputElement);
    if (idx >= 0 && idx < focusable.length - 1) {
      focusable[idx + 1]?.focus();
    } else if (idx >= 0) {
      (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-enter-submit]')?.click();
    }
  };

  const startCategoryRename = (cat: string) => {
    setEditingCategory(cat);
    setCategoryRenameValue(cat);
  };

  const categoryColor = (index: number) => {
    const colors = [
      'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/30',
      'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200/50 dark:border-purple-800/30',
      'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/30',
      'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/30',
      'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200/50 dark:border-rose-800/30',
      'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-200/50 dark:border-cyan-800/30',
      'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200/50 dark:border-orange-800/30',
      'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-200/50 dark:border-teal-800/30',
    ];
    return colors[index % colors.length];
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-background animate-in fade-in duration-200">
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <div className="relative">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-primary/30 animate-ping" />
              </div>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/75 animate-pulse">Loading categories...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background animate-in fade-in duration-200 select-none">
      {error && (
        <div className="p-4 bg-destructive/10 text-destructive text-xs rounded-2xl border border-destructive/20 flex items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse shrink-0" />
            <span className="font-bold">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="p-1 hover:bg-destructive/20 rounded-lg transition-colors shrink-0 cursor-pointer">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>
      )}

      {/* Sticky Page Header */}
      <header className="shrink-0 z-10 border-b border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 px-5 py-3">
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
              <button
                onClick={onClose}
                className="p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4 text-destructive" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="max-w-6xl mx-auto space-y-6">

      {/* Top scrollable category selection pills - styled like the hardware tabs */}
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
          {categories.map((cat, index) => {
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

      {/* Main Content Areas */}
      {selectedCategory === 'all' ? (
        /* View 1: Unified dashboard when "All Categories" is selected */
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
                <p className="text-2xl font-black tracking-tight text-foreground font-mono">?{avgPurchasePrice.toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider">Average Purchase Price</p>
              </div>
            </div>
            <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
              <div className="p-3.5 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 rounded-2xl group-hover:scale-105 transition-transform shadow-inner">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-black tracking-tight text-foreground font-mono">?{avgRate.toFixed(2)}</p>
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
                            <span className="truncate text-foreground/80">{g.grade_name}</span>
                          </div>
                          <span className="font-mono text-[10px] text-muted-foreground font-semibold">
                            P: <span className="text-foreground/90 font-extrabold">?{(g.purchase_price || 0).toFixed(1)}</span> | M: <span className="text-primary font-extrabold">?{g.rate.toFixed(1)}</span>
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
                          ?{avgCatPurchasePrice.toFixed(1)} / ?{avgCatRate.toFixed(1)}
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
      ) : (
        /* View 2: Focused category grades table spreadsheets when drill down */
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
                        � Avg Purchase: <span className="font-mono font-bold text-foreground/80">?{(filteredGrades.reduce((s, g) => s + (g.purchase_price || 0), 0) / filteredGrades.length).toFixed(2)}</span>
                        {' '}
                        � Avg MRP: <span className="font-mono font-bold text-foreground/80">?{(filteredGrades.reduce((s, g) => s + g.rate, 0) / filteredGrades.length).toFixed(2)}</span>
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
                <div className="col-span-5">Grade Name</div>
                <div className="col-span-3">Purchase Price (?/kg)</div>
                <div className="col-span-2.5">MRP (?/kg)</div>
                <div className="col-span-1.5 text-right">Actions</div>
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
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="space-y-1.5">
                            <label className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                              Grade Name
                            </label>
                            <input
                              value={editForm.grade_name}
                              onChange={e => setEditForm({ ...editForm, grade_name: e.target.value })}
                              className="w-full px-3.5 h-9.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all font-bold text-foreground"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                              Purchase Price (?)
                            </label>
                            <div className="relative">
                              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold">?</span>
                              <input
                                type="number"
                                value={editForm.purchase_price || ''}
                                onChange={e => setEditForm({ ...editForm, purchase_price: parseFloat(e.target.value) || 0 })}
                                className="w-full pl-7 pr-3 h-9.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all font-mono font-bold text-foreground"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <label className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                              MRP (?)
                            </label>
                            <div className="relative">
                              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold">?</span>
                              <input
                                type="number"
                                value={editForm.rate || ''}
                                onChange={e => setEditForm({ ...editForm, rate: parseFloat(e.target.value) || 0 })}
                                className="w-full pl-7 pr-3 h-9.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all font-mono font-bold text-foreground"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2.5 pt-3 border-t border-border/40">
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-4 py-2 hover:bg-muted text-xs font-bold rounded-xl text-muted-foreground hover:text-foreground transition-all border border-transparent hover:border-border/50 cursor-pointer"
                          >
                            Cancel
                          </button>
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
                        <div className="col-span-5 flex items-center gap-3.5 min-w-0">
                          <div className="p-2 bg-muted/40 dark:bg-muted/10 rounded-xl border border-border shrink-0 shadow-inner">
                            <Tag className="w-3.5 h-3.5 text-muted-foreground/75" />
                          </div>
                          <span className="text-xs font-bold text-foreground truncate">{grade.grade_name}</span>
                        </div>
                        <div className="col-span-3 font-mono font-bold text-foreground/80 text-xs">
                          ?{(grade.purchase_price || 0).toFixed(2)}
                        </div>
                        <div className="col-span-2.5 font-mono font-extrabold text-primary text-xs">
                          ?{grade.rate.toFixed(2)}
                        </div>
                        <div className="col-span-1.5 flex items-center justify-end gap-1.5 border-l border-border/60 pl-3">
                          <button
                            onClick={() => startEdit(grade)}
                            className="p-2 hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl transition-all cursor-pointer"
                            title="Edit Grade"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(grade.grade_id)}
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
      )}

          </div>
        </div>
      </div>

      {/* Add Grade Modal */}
      <Modal
        isOpen={isAdding}
        onClose={() => !operating && setIsAdding(false)}
        closeButton={null}
        title={
          <div className="flex items-center gap-2 select-none">
            <Tag className="w-5 h-5 text-primary" />
            <span className="font-black text-sm uppercase tracking-widest text-foreground">New Category &amp; Grade</span>
          </div>
        }
        className="max-w-xl"
      >
        <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300" onKeyDown={handleFormKeyDown}>
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border" data-enter-nav>
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Tag className="w-4 h-4" />
            </div>
            <span className="text-xs font-black text-primary uppercase tracking-wider">Category Details</span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Category name
              </label>
              <input
                placeholder="e.g. Steel, Brass, Copper"
                value={newForm.category}
                onChange={e => setNewForm({ ...newForm, category: e.target.value })}
                className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm"
              />
              {categories.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setNewForm({ ...newForm, category: cat })}
                      className={clsx(
                        'px-3 py-1.5 text-xs font-bold rounded-xl border transition-all duration-200 cursor-pointer',
                        newForm.category === cat
                          ? 'bg-primary/10 text-primary border-primary/20'
                          : 'bg-muted/50 hover:bg-primary/5 hover:text-primary text-muted-foreground border-border/40'
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Grade variant
                </label>
                <input
                  placeholder="e.g. Grade A, Scrap"
                  value={newForm.grade_name}
                  onChange={e => setNewForm({ ...newForm, grade_name: e.target.value })}
                  className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Purchase
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">?</span>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={newForm.purchase_price || ''}
                      onChange={e => setNewForm({ ...newForm, purchase_price: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-background border border-border rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm no-spinners font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    MRP
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">?</span>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={newForm.rate || ''}
                      onChange={e => setNewForm({ ...newForm, rate: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-background border border-border rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm no-spinners font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={() => !operating && setIsAdding(false)}
            disabled={operating}
            className="flex items-center gap-1.5 px-4 py-2 bg-muted hover:bg-muted/80 border border-border text-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={operating}
            className="flex items-center gap-1.5 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm"
          >
            {operating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Save Grade
          </button>
        </div>
      </Modal>

      {/* Confirm Delete Category Modal */}
      <Modal
        isOpen={confirmDeleteCategory !== null}
        onClose={() => !operating && setConfirmDeleteCategory(null)}
        closeButton={null}
        title={
          <div className="flex items-center gap-2 text-destructive select-none">
            <Trash className="w-5 h-5" />
            <span className="font-black text-sm uppercase tracking-widest">Delete Category</span>
          </div>
        }
        className="max-w-sm"
      >
        <div className="space-y-4">
          <div className="p-4 bg-destructive/[0.03] rounded-2xl border border-destructive/20 text-xs leading-relaxed text-muted-foreground">
            <p className="text-sm text-foreground font-bold leading-normal">
              Are you sure you want to delete <span className="font-black text-destructive">"{confirmDeleteCategory}"</span>?
            </p>
            <p className="mt-2 text-muted-foreground/80 font-medium">
              This will permanently delete all{' '}
              <span className="font-black text-destructive">
                {grades.filter(g => g.category === confirmDeleteCategory).length} grade(s)
              </span>{' '}
              associated with this category. This action cannot be undone.
            </p>
          </div>
          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setConfirmDeleteCategory(null)}
              disabled={operating}
              className="px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted rounded-xl transition-all duration-200 disabled:opacity-50 border border-transparent hover:border-border/40 cursor-pointer"
            >
              Cancel
            </button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => confirmDeleteCategory && handleDeleteCategory(confirmDeleteCategory)}
              disabled={operating}
              className="px-5 rounded-xl shadow-md font-bold flex items-center gap-1.5 py-2.5 cursor-pointer"
            >
              {operating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash className="w-4 h-4" />
              )}
              Delete Grades
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

