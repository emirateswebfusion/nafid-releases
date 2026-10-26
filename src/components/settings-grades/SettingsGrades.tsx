import { useMemo } from 'react';
import { FloatToast } from '../ui/FloatToast';
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape';
import { useSettingsGradesState } from './hooks/useSettingsGradesState';
import { useSettingsGradesLoad } from './hooks/useSettingsGradesLoad';
import { useSettingsGradesActions } from './hooks/useSettingsGradesActions';
import { useSettingsGradesForm } from './hooks/useSettingsGradesForm';
import { GradesLoadingState } from './views/GradesLoadingState';
import { SettingsGradesHeader } from './views/SettingsGradesHeader';
import { CategoryFilterPills } from './views/CategoryFilterPills';
import { AllCategoriesDashboard } from './views/AllCategoriesDashboard';
import { CategoryGradesTable } from './views/CategoryGradesTable';
import { AddGradeModal } from './views/AddGradeModal';
import { ConfirmDeleteCategoryModal } from './views/ConfirmDeleteCategoryModal';
import { DeleteGradeModal } from './views/DeleteGradeModal';
import type { Grade } from './settingsGradesTypes';

export function SettingsGrades({ onClose, isRestricted: _isRestricted }: { onClose?: () => void; isRestricted?: boolean }) {
  useCloseOnEscape(onClose);
  const sg = useSettingsGradesState();
  const { grades, loading, error, setError, searchQuery, selectedCategory } = sg;

  const { loadGrades } = useSettingsGradesLoad({ sg });

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

  const { handleAdd, handleUpdate, handleDelete, confirmDeleteGrade, handleRenameCategory, handleDeleteCategory } = useSettingsGradesActions({
    sg, loadGrades,
  });

  const { startEdit, handleOpenAdd, handleFormKeyDown, startCategoryRename } = useSettingsGradesForm({ sg });

  if (loading) {
    return <GradesLoadingState />;
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background animate-in fade-in duration-200 select-none">
      <FloatToast message={error ? { text: typeof error === 'string' ? error : ((error as { message?: string })?.message || JSON.stringify(error)), type: 'error' } : null} onClose={() => setError(null)} />

      {/* Sticky Page Header */}
      <SettingsGradesHeader categories={categories} onClose={onClose} totalGrades={totalGrades} />

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="w-full space-y-6">

      {/* Top scrollable category selection pills - styled like the hardware tabs */}
      <CategoryFilterPills categories={categories} sg={sg} />

      {/* Main Content Areas */}
      {selectedCategory === 'all' ? (
        /* View 1: Unified dashboard when "All Categories" is selected */
        <AllCategoriesDashboard
          avgPurchasePrice={avgPurchasePrice}
          avgRate={avgRate}
          categories={categories}
          groupedGrades={groupedGrades}
          handleOpenAdd={handleOpenAdd}
          handleRenameCategory={handleRenameCategory}
          sg={sg}
          startCategoryRename={startCategoryRename}
          totalGrades={totalGrades}
        />
      ) : (
        /* View 2: Focused category grades table spreadsheets when drill down */
        <CategoryGradesTable
          filteredGrades={filteredGrades}
          handleDelete={handleDelete}
          handleOpenAdd={handleOpenAdd}
          handleUpdate={handleUpdate}
          sg={sg}
          startCategoryRename={startCategoryRename}
          startEdit={startEdit}
        />
      )}

          </div>
        </div>
      </div>

      {/* Add Grade Modal */}
      <AddGradeModal categories={categories} handleAdd={handleAdd} handleFormKeyDown={handleFormKeyDown} sg={sg} />

      {/* Confirm Delete Category Modal */}
      <ConfirmDeleteCategoryModal handleDeleteCategory={handleDeleteCategory} sg={sg} />

      {/* Single Grade Delete Confirmation Modal */}
      <DeleteGradeModal confirmDeleteGrade={confirmDeleteGrade} sg={sg} />
    </div>
  );
}
