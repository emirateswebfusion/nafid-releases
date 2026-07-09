import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Trash2, Edit2, Check, X, Loader2, Search,
  Folder, Layers, TrendingUp, Tag, ChevronDown, ChevronRight,
  FolderOpen, PanelLeftClose, PanelLeft
} from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Badge } from './ui/Badge';
import { useAuthStore } from '../store/authStore';

interface Grade {
  grade_id: string;
  tenant_id: string;
  category: string;
  grade_name: string;
  rate: number;
}

export function SettingsGrades() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [operating, setOperating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ category: '', grade_name: '', rate: 0 });
  const [newForm, setNewForm] = useState({ category: '', grade_name: '', rate: 0 });
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [categoryRenameValue, setCategoryRenameValue] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const expandAll = () => setExpandedCategories(new Set(categories));
  const collapseAll = () => setExpandedCategories(new Set());

  useEffect(() => {
    if (selectedCategory === 'all') {
      setExpandedCategories(prev => {
        if (prev.size === 0) return new Set(categories);
        return prev;
      });
    }
  }, [categories, selectedCategory]);

  const handleAdd = async () => {
    if (!newForm.category.trim() || !newForm.grade_name.trim() || newForm.rate <= 0) {
      setError('Please fill in all fields (ensure Category, Grade, and Rate > 0).');
      return;
    }
    setError(null);
    setOperating(true);
    const { tenantId } = useAuthStore.getState();
    const grade = {
      grade_id: crypto.randomUUID(),
      tenant_id: tenantId,
      category: newForm.category.trim(),
      grade_name: newForm.grade_name.trim(),
      rate: newForm.rate
    };
    const res = await window.electronAPI.dbAddGrade(grade);
    if (res.success) {
      setIsAdding(false);
      setNewForm({ category: '', grade_name: '', rate: 0 });
      await loadGrades();
    } else {
      setError(res.error || 'Failed to add grade');
    }
    setOperating(false);
  };

  const handleUpdate = async (id: string) => {
    if (!editForm.category.trim() || !editForm.grade_name.trim() || editForm.rate <= 0) {
      setError('Please fill in all fields (ensure Category, Grade, and Rate > 0).');
      return;
    }
    setError(null);
    setOperating(true);
    const res = await window.electronAPI.dbUpdateGrade({
      grade_id: id,
      category: editForm.category.trim(),
      grade_name: editForm.grade_name.trim(),
      rate: editForm.rate
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
          rate: g.rate
        })
      )
    );
    const failed = results.filter(r => !r.success);
    if (failed.length === 0) {
      setEditingCategory(null);
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
    setEditForm({ category: grade.category, grade_name: grade.grade_name, rate: grade.rate });
  };

  const handleOpenAdd = () => {
    setNewForm({
      category: selectedCategory !== 'all' ? selectedCategory : '',
      grade_name: '',
      rate: 0
    });
    setIsAdding(true);
    setError(null);
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
      <div className="flex flex-col items-center justify-center p-16 gap-4 text-muted-foreground">
        <div className="relative">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-primary/30 animate-ping" />
          </div>
        </div>
        <span className="text-sm font-medium">Loading grades & categories...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {error && (
        <div className="p-3.5 bg-destructive/10 text-destructive text-sm rounded-xl border border-destructive/20 flex items-center justify-between gap-2 animate-in slide-in-from-top-1 duration-200 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="p-1 hover:bg-destructive/20 rounded-lg transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border/80 p-4 rounded-2xl flex items-center gap-4 hover:border-primary/20 hover:shadow-sm transition-all duration-200 group">
          <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl group-hover:scale-105 transition-transform">
            <Folder className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight">{categories.length}</p>
            <p className="text-xs text-muted-foreground font-semibold">Categories</p>
          </div>
        </div>
        <div className="bg-card border border-border/80 p-4 rounded-2xl flex items-center gap-4 hover:border-primary/20 hover:shadow-sm transition-all duration-200 group">
          <div className="p-3 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-xl group-hover:scale-105 transition-transform">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight">{totalGrades}</p>
            <p className="text-xs text-muted-foreground font-semibold">Grades Configured</p>
          </div>
        </div>
        <div className="bg-card border border-border/80 p-4 rounded-2xl flex items-center gap-4 hover:border-primary/20 hover:shadow-sm transition-all duration-200 group">
          <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl group-hover:scale-105 transition-transform">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight">₹{avgRate.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground font-semibold">Average Base Rate</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Category Sidebar */}
        <div className={`${sidebarCollapsed ? 'lg:col-span-1' : 'lg:col-span-3'} transition-all duration-300`}>
          <div className="flex items-center justify-between px-1 mb-2.5">
            <h3 className={`text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
              <Folder className="w-3.5 h-3.5" /> Categories
            </h3>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors hidden lg:block"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <PanelLeft className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="bg-card border border-border/80 rounded-2xl overflow-hidden divide-y divide-border/60">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`w-full text-left px-4 py-3 flex items-center justify-between text-sm transition-all duration-200 ${
                selectedCategory === 'all'
                  ? 'bg-primary/5 text-primary font-semibold border-l-[3px] border-primary'
                  : 'hover:bg-muted/50 text-foreground border-l-[3px] border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Layers className="w-4 h-4 shrink-0" />
                <span className={`truncate ${sidebarCollapsed ? 'lg:hidden' : ''}`}>All Categories</span>
              </div>
              <Badge variant={selectedCategory === 'all' ? 'default' : 'secondary'} className="shrink-0 text-[10px] px-1.5 py-0">
                {grades.length}
              </Badge>
            </button>

            {categories.map((cat, index) => {
              const count = grades.filter(g => g.category === cat).length;
              const colorClass = categoryColor(index);
              const isRenaming = editingCategory === cat;
              const isActive = selectedCategory === cat;
              return (
                <div key={cat}>
                  <div className="group/cat relative">
                    {isRenaming ? (
                      <div className="px-3 py-2.5 flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-1.5 bg-background border border-primary/40 rounded-lg px-2 py-1">
                          <Folder className="w-3.5 h-3.5 text-primary shrink-0" />
                          <input
                            value={categoryRenameValue}
                            onChange={e => setCategoryRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleRenameCategory(cat);
                              if (e.key === 'Escape') setEditingCategory(null);
                            }}
                            className="flex-1 text-sm bg-transparent outline-none min-w-0"
                            autoFocus
                          />
                        </div>
                        <button
                          onClick={() => handleRenameCategory(cat)}
                          disabled={operating}
                          className="p-1 bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingCategory(null)}
                          className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => setSelectedCategory(cat)}
                          className={`w-full text-left px-4 py-3 flex items-center justify-between text-sm transition-all duration-200 ${
                            isActive
                              ? 'bg-primary/5 text-primary font-semibold border-l-[3px] border-primary'
                              : 'hover:bg-muted/50 text-foreground border-l-[3px] border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className={`p-1 rounded-md ${isActive ? colorClass : 'bg-muted text-muted-foreground'}`}>
                              <Folder className="w-3.5 h-3.5" />
                            </div>
                            <span className={`truncate ${sidebarCollapsed ? 'lg:hidden' : ''}`}>{cat}</span>
                          </div>
                          <Badge
                            variant={isActive ? 'default' : 'secondary'}
                            className={`shrink-0 text-[10px] px-1.5 py-0 ${sidebarCollapsed ? 'lg:hidden' : ''}`}
                          >
                            {count}
                          </Badge>
                        </button>
                        <div className={`absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/cat:opacity-100 transition-opacity ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                          <div className="flex items-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); startCategoryRename(cat); }}
                              className="p-1 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
                              title="Rename category"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteCategory(cat); }}
                              className="p-1 hover:bg-destructive/10 rounded-md text-muted-foreground hover:text-destructive transition-colors"
                              title="Delete category"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {categories.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                <FolderOpen className="w-6 h-6 mx-auto mb-2 text-muted-foreground/40" />
                No categories configured.
              </div>
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div className={`${sidebarCollapsed ? 'lg:col-span-11' : 'lg:col-span-9'} transition-all duration-300 space-y-4`}>
          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-card border border-border/80 p-3.5 rounded-2xl">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/80" />
              <input
                type="text"
                placeholder="Search grades or categories..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/70"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {selectedCategory === 'all' && categories.length > 1 && (
                <div className="hidden sm:flex items-center gap-1">
                  <button
                    onClick={expandAll}
                    className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                  >
                    Expand All
                  </button>
                  <button
                    onClick={collapseAll}
                    className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                  >
                    Collapse All
                  </button>
                </div>
              )}
              <Button
                size="sm"
                onClick={handleOpenAdd}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl shadow-sm font-semibold animate-in fade-in"
              >
                <Plus className="w-4 h-4" /> Add Grade
              </Button>
            </div>
          </div>

          {/* Grouped View (All Categories mode) */}
          {selectedCategory === 'all' ? (
            <div className="space-y-4">
              {Object.entries(groupedGrades).length === 0 ? (
                <div className="text-center py-16 text-muted-foreground bg-muted/10 rounded-2xl border border-dashed border-border/85 flex flex-col items-center justify-center gap-3">
                  <div className="p-4 bg-muted/20 rounded-full">
                    <Layers className="w-10 h-10 text-muted-foreground/40 stroke-[1.5]" />
                  </div>
                  <p className="text-sm font-medium">
                    {searchQuery ? 'No grades match your search.' : 'No grades configured yet.'}
                  </p>
                  <p className="text-xs text-muted-foreground/80 max-w-xs text-center">
                    {searchQuery
                      ? 'Try adjusting your search terms or filters.'
                      : 'Start by adding categories and their associated grades with base pricing.'}
                  </p>
                  {!searchQuery && (
                    <Button
                      size="sm"
                      onClick={handleOpenAdd}
                      variant="outline"
                      className="mt-2 rounded-xl"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Your First Grade
                    </Button>
                  )}
                </div>
              ) : (
                Object.entries(groupedGrades).map(([category, categoryGrades], index) => {
                  const isExpanded = expandedCategories.has(category);
                  const colorClass = categoryColor(index);
                  const totalRate = categoryGrades.reduce((s, g) => s + g.rate, 0);
                  const avgCatRate = totalRate / categoryGrades.length;
                  return (
                    <div
                      key={category}
                      className="bg-card border border-border/80 rounded-2xl overflow-hidden hover:border-border transition-all duration-200"
                    >
                      {/* Category Group Header */}
                      <button
                        onClick={() => toggleCategory(category)}
                        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors group/gh"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-2 rounded-xl ${colorClass} transition-transform group-hover/gh:scale-105`}>
                            <Folder className="w-4 h-4" />
                          </div>
                          <div className="text-left min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-foreground">{category}</span>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-semibold">
                                {categoryGrades.length} grade{categoryGrades.length !== 1 ? 's' : ''}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Avg rate: <span className="font-semibold font-mono">₹{avgCatRate.toFixed(2)}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div
                            onClick={(e) => { e.stopPropagation(); startCategoryRename(category); }}
                            className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground opacity-0 group-hover/gh:opacity-100 transition-all"
                            title="Rename category"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </div>
                          <div
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteCategory(category); }}
                            className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive opacity-0 group-hover/gh:opacity-100 transition-all"
                            title="Delete category"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </div>
                          <div className={`p-1.5 rounded-lg transition-colors ${
                            isExpanded ? 'bg-muted text-foreground' : 'text-muted-foreground'
                          }`}>
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 transition-transform duration-200" />
                            ) : (
                              <ChevronRight className="w-4 h-4 transition-transform duration-200" />
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Collapsible Grade Rows */}
                      <div
                        className={`transition-all duration-300 overflow-hidden ${
                          isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                        }`}
                      >
                        <div className="border-t border-border/60">
                          <div className="hidden sm:grid grid-cols-12 gap-3 px-5 py-2 bg-muted/20 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                            <div className="col-span-5">Grade Name</div>
                            <div className="col-span-3">Rate (₹/kg)</div>
                            <div className="col-span-4 text-right">Actions</div>
                          </div>
                          {categoryGrades.map((grade) => {
                            const isEditing = editingId === grade.grade_id;
                            return (
                              <div
                                key={grade.grade_id}
                                className={`border-b border-border/40 last:border-b-0 transition-all duration-200 ${
                                  isEditing ? 'bg-primary/[0.02]' : 'hover:bg-muted/20'
                                }`}
                              >
                                {isEditing ? (
                                  <div className="px-5 py-3 space-y-3">
                                    <div className="flex items-center justify-between pb-2 border-b border-border/40">
                                      <span className="text-[10px] font-bold text-primary flex items-center gap-1">
                                        <Edit2 className="w-3 h-3" /> Editing
                                      </span>
                                      <span className="text-[9px] text-muted-foreground font-mono">
                                        ID: {grade.grade_id.slice(0, 8)}...
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                      <div>
                                        <label className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                                          Category
                                        </label>
                                        <input
                                          value={editForm.category}
                                          onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                                          className="w-full px-3 h-9 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                                          Grade Name
                                        </label>
                                        <input
                                          value={editForm.grade_name}
                                          onChange={e => setEditForm({ ...editForm, grade_name: e.target.value })}
                                          className="w-full px-3 h-9 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                                          Rate (₹)
                                        </label>
                                        <div className="relative">
                                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">₹</span>
                                          <input
                                            type="number"
                                            value={editForm.rate || ''}
                                            onChange={e => setEditForm({ ...editForm, rate: parseFloat(e.target.value) || 0 })}
                                            className="w-full pl-7 pr-3 h-9 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
                                      <button
                                        onClick={() => setEditingId(null)}
                                        className="px-3 py-1.5 hover:bg-muted text-xs font-semibold rounded-lg text-muted-foreground transition-colors"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={() => handleUpdate(grade.grade_id)}
                                        disabled={operating}
                                        className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1.5 disabled:opacity-60"
                                      >
                                        {operating ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <Check className="w-3.5 h-3.5" />
                                        )}
                                        Save
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="px-5 py-3 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                      <div className="p-1.5 bg-muted/40 rounded-lg border border-border/40 shrink-0">
                                        <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                                      </div>
                                      <div className="min-w-0">
                                        <span className="text-sm font-medium text-foreground">{grade.grade_name}</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4 shrink-0">
                                      <div className="text-right min-w-[80px]">
                                        <span className="text-sm font-bold text-primary font-mono">₹{grade.rate.toFixed(2)}</span>
                                      </div>
                                      <div className="flex items-center gap-0.5 border-l border-border/60 pl-3">
                                        <button
                                          onClick={() => startEdit(grade)}
                                          className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-all"
                                          title="Edit"
                                        >
                                          <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => handleDelete(grade.grade_id)}
                                          disabled={operating}
                                          className="p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-all"
                                          title="Delete"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* Specific Category View */
            <div className="space-y-3">
              {/* Category Header Card */}
              {selectedCategory !== 'all' && (
                <div className="bg-card border border-border/80 rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
                        <Folder className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground">{selectedCategory}</h4>
                        <p className="text-xs text-muted-foreground">
                          {filteredGrades.length} grade{filteredGrades.length !== 1 ? 's' : ''}
                          {filteredGrades.length > 0 && (
                            <> · Avg rate: <span className="font-mono font-semibold">₹{(filteredGrades.reduce((s, g) => s + g.rate, 0) / filteredGrades.length).toFixed(2)}</span></>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => startCategoryRename(selectedCategory)}
                        className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                        title="Rename category"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteCategory(selectedCategory)}
                        className="p-2 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete category"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Grade Table */}
              {filteredGrades.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground bg-muted/10 rounded-2xl border border-dashed border-border/85 flex flex-col items-center justify-center gap-3">
                  <div className="p-4 bg-muted/20 rounded-full">
                    <Tag className="w-10 h-10 text-muted-foreground/40 stroke-[1.5]" />
                  </div>
                  <p className="text-sm font-medium">
                    {searchQuery ? 'No grades match your search.' : 'No grades in this category.'}
                  </p>
                  <p className="text-xs text-muted-foreground/80 max-w-xs text-center">
                    {searchQuery
                      ? 'Try adjusting your search terms.'
                      : 'Add grades with base pricing for this category.'}
                  </p>
                  {!searchQuery && (
                    <Button
                      size="sm"
                      onClick={handleOpenAdd}
                      variant="outline"
                      className="mt-2 rounded-xl"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Grade
                    </Button>
                  )}
                </div>
              ) : (
                <div className="bg-card border border-border/80 rounded-2xl overflow-hidden">
                  <div className="hidden sm:grid grid-cols-12 gap-3 px-5 py-3 bg-muted/30 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 border-b border-border/60">
                    <div className="col-span-5">Grade Name</div>
                    <div className="col-span-3">Rate (₹/kg)</div>
                    <div className="col-span-4 text-right">Actions</div>
                  </div>
                  {filteredGrades.map((grade) => {
                    const isEditing = editingId === grade.grade_id;
                    return (
                      <div
                        key={grade.grade_id}
                        className={`border-b border-border/40 last:border-b-0 transition-all duration-200 ${
                          isEditing ? 'bg-primary/[0.02]' : 'hover:bg-muted/20'
                        }`}
                      >
                        {isEditing ? (
                          /* Inline Editing Form */
                          <div className="px-5 py-3 space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-border/40">
                              <span className="text-[10px] font-bold text-primary flex items-center gap-1">
                                <Edit2 className="w-3 h-3" /> Editing Grade
                              </span>
                              <span className="text-[9px] text-muted-foreground font-mono">
                                ID: {grade.grade_id.slice(0, 8)}...
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                                  Grade Name
                                </label>
                                <input
                                  value={editForm.grade_name}
                                  onChange={e => setEditForm({ ...editForm, grade_name: e.target.value })}
                                  className="w-full px-3 h-9 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                                  Rate (₹)
                                </label>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">₹</span>
                                  <input
                                    type="number"
                                    value={editForm.rate || ''}
                                    onChange={e => setEditForm({ ...editForm, rate: parseFloat(e.target.value) || 0 })}
                                    className="w-full pl-7 pr-3 h-9 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
                              <button
                                onClick={() => setEditingId(null)}
                                className="px-3 py-1.5 hover:bg-muted text-xs font-semibold rounded-lg text-muted-foreground transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleUpdate(grade.grade_id)}
                                disabled={operating}
                                className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1.5 disabled:opacity-60"
                              >
                                {operating ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Grade Row */
                          <div className="px-5 py-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="p-1.5 bg-muted/40 rounded-lg border border-border/40 shrink-0">
                                <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                              </div>
                              <span className="text-sm font-medium text-foreground">{grade.grade_name}</span>
                            </div>
                            <div className="flex items-center gap-4 shrink-0">
                              <div className="text-right min-w-[80px]">
                                <span className="text-sm font-bold text-primary font-mono">₹{grade.rate.toFixed(2)}</span>
                              </div>
                              <div className="flex items-center gap-0.5 border-l border-border/60 pl-3">
                                <button
                                  onClick={() => startEdit(grade)}
                                  className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-all"
                                  title="Edit"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDelete(grade.grade_id)}
                                  disabled={operating}
                                  className="p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-all"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
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

      {/* Add Grade Modal */}
      <Modal
        isOpen={isAdding}
        onClose={() => !operating && setIsAdding(false)}
        title={
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-primary" />
            <span>Create New Category & Grade</span>
          </div>
        }
        className="max-w-lg"
      >
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground">
            Define a product category, its grade variant, and set the base pricing rate.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1">
                <Folder className="w-3.5 h-3.5 text-muted-foreground" /> Category Name
              </label>
              <input
                placeholder="e.g. Steel, Brass, Copper"
                value={newForm.category}
                onChange={e => setNewForm({ ...newForm, category: e.target.value })}
                className="w-full px-3.5 h-10 text-sm bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/60"
              />
              {categories.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5">Quick Select Category</p>
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((cat, index) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setNewForm({ ...newForm, category: cat })}
                        className={`px-2.5 py-1 text-[10px] rounded-lg transition-all border font-semibold ${
                          newForm.category === cat
                            ? 'bg-primary/10 text-primary border-primary/20 ring-1 ring-primary/20'
                            : 'bg-muted hover:bg-primary/5 hover:text-primary text-muted-foreground border-border/40'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <Folder className="w-2.5 h-2.5" />
                          {cat}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-muted-foreground" /> Grade Variant
              </label>
              <input
                placeholder="e.g. Grade A, Scrap, Heavy"
                value={newForm.grade_name}
                onChange={e => setNewForm({ ...newForm, grade_name: e.target.value })}
                className="w-full px-3.5 h-10 text-sm bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/60"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Specify the quality, purity, or thickness name.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" /> Base Rate (Per Kg)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground/80">₹</span>
                <input
                  type="number"
                  placeholder="0.00"
                  value={newForm.rate || ''}
                  onChange={e => setNewForm({ ...newForm, rate: parseFloat(e.target.value) || 0 })}
                  className="w-full pl-8 pr-3 h-10 text-sm bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/60 font-mono"
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Enter the base buying/selling rate per kilogram.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-4 border-t border-border mt-4">
            <button
              type="button"
              onClick={() => !operating && setIsAdding(false)}
              disabled={operating}
              className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted rounded-xl transition-all duration-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={operating}
              className="px-4 rounded-xl shadow-md font-semibold flex items-center gap-1.5"
            >
              {operating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Save Configuration
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm Delete Category Modal */}
      <Modal
        isOpen={confirmDeleteCategory !== null}
        onClose={() => !operating && setConfirmDeleteCategory(null)}
        title={
          <div className="flex items-center gap-2 text-destructive">
            <Trash2 className="w-5 h-5" />
            <span>Delete Category</span>
          </div>
        }
        className="max-w-sm"
      >
        <div className="space-y-4">
          <div className="p-4 bg-destructive/5 rounded-xl border border-destructive/10">
            <p className="text-sm text-foreground font-medium">
              Are you sure you want to delete <span className="font-bold">"{confirmDeleteCategory}"</span>?
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              This will permanently delete all{' '}
              <span className="font-bold text-destructive">
                {grades.filter(g => g.category === confirmDeleteCategory).length} grade(s)
              </span>{' '}
              in this category. This action cannot be undone.
            </p>
          </div>
          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setConfirmDeleteCategory(null)}
              disabled={operating}
              className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted rounded-xl transition-all duration-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => confirmDeleteCategory && handleDeleteCategory(confirmDeleteCategory)}
              disabled={operating}
              className="px-4 rounded-xl shadow-md font-semibold flex items-center gap-1.5"
            >
              {operating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Delete All {grades.filter(g => g.category === confirmDeleteCategory).length} Grades
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
