import { useAuthStore } from '../../../store/authStore';
import { gradesApi } from '../../../data/grades';
import type { Grade } from '../settingsGradesTypes';
import type { SettingsGradesState } from './useSettingsGradesState';

export interface UseSettingsGradesActionsContext {
  sg: SettingsGradesState;
  loadGrades: () => Promise<void>;
}

/** Grade and category CRUD actions for the settings grades screen. */
export function useSettingsGradesActions(ctx: UseSettingsGradesActionsContext) {
  const { loadGrades } = ctx;
  const {
    categoryRenameValue, editForm, grades, gradeToDelete, newForm, selectedCategory, setConfirmDeleteCategory,
    setEditingCategory, setEditingId, setError, setGradeToDelete, setIsAdding, setNewForm, setOperating,
    setSelectedCategory,
  } = ctx.sg;

  const handleAdd = async () => {
    if (!newForm.category.trim()) {
      setError('Please fill in Category. Grade Variant, Purchase, MRP, and Offer are optional.');
      return;
    }
    if (!newForm.grade_name.trim() && grades.some(g => g.category === newForm.category.trim() && !g.grade_name.trim())) {
      setError('This category already has a general grade. Add a named variant instead.');
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
      purchase_price: newForm.purchase_price,
      offer_price: newForm.offer_price
    };
    const res = await gradesApi.addGrade(grade);
    if (res.success) {
      setIsAdding(false);
      setNewForm({ category: '', grade_name: '', rate: 0, purchase_price: 0, offer_price: null });
      await loadGrades();
    } else {
      setError(res.error || 'Failed to add grade');
    }
    setOperating(false);
  };

  const handleUpdate = async (id: string) => {
    if (!editForm.category.trim()) {
      setError('Please fill in Category. Grade Variant, Purchase, MRP, and Offer are optional.');
      return;
    }
    if (!editForm.grade_name.trim() && grades.some(g => g.grade_id !== id && g.category === editForm.category.trim() && !g.grade_name.trim())) {
      setError('This category already has a general grade. Add a named variant instead.');
      return;
    }
    setError(null);
    setOperating(true);
    const res = await gradesApi.updateGrade({
      grade_id: id,
      category: editForm.category.trim(),
      grade_name: editForm.grade_name.trim(),
      rate: editForm.rate,
      purchase_price: editForm.purchase_price,
      offer_price: editForm.offer_price
    });
    if (res.success) {
      setEditingId(null);
      await loadGrades();
    } else {
      setError(res.error || 'Failed to update grade');
    }
    setOperating(false);
  };

  const handleDelete = (grade: Grade) => {
    setGradeToDelete(grade);
  };

  const confirmDeleteGrade = async () => {
    if (!gradeToDelete) return;
    setOperating(true);
    const res = await gradesApi.deleteGrade(gradeToDelete.grade_id);
    if (res.success) {
      setGradeToDelete(null);
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
        gradesApi.updateGrade({
          grade_id: g.grade_id,
          category: newName,
          grade_name: g.grade_name,
          rate: g.rate,
          purchase_price: g.purchase_price || 0,
          offer_price: g.offer_price ?? null
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
      targetGrades.map(g => gradesApi.deleteGrade(g.grade_id))
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

  return { handleAdd, handleUpdate, handleDelete, confirmDeleteGrade, handleRenameCategory, handleDeleteCategory };
}
