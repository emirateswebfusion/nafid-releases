import type React from 'react';
import type { Grade } from '../settingsGradesTypes';
import type { SettingsGradesState } from './useSettingsGradesState';

export interface UseSettingsGradesFormContext {
  sg: SettingsGradesState;
}

/** Inline edit / add form actions and keyboard navigation for the settings grades screen. */
export function useSettingsGradesForm(ctx: UseSettingsGradesFormContext) {
  const {
    selectedCategory, setCategoryRenameValue, setEditingCategory, setEditForm, setEditingId, setError, setIsAdding,
    setNewForm,
  } = ctx.sg;

  const startEdit = (grade: Grade) => {
    setEditingId(grade.grade_id);
    setEditForm({ category: grade.category, grade_name: grade.grade_name, rate: grade.rate, purchase_price: grade.purchase_price || 0, offer_price: grade.offer_price ?? null });
  };

  const handleOpenAdd = () => {
    setNewForm({
      category: selectedCategory !== 'all' ? selectedCategory : '',
      grade_name: '',
      rate: 0,
      purchase_price: 0,
      offer_price: null
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
      const nextEl = focusable[idx + 1];
      nextEl?.focus();
      if (nextEl?.hasAttribute('data-select-trigger')) setTimeout(() => nextEl.click(), 0);
    } else if (idx >= 0) {
      (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-enter-submit]')?.click();
    }
  };

  const startCategoryRename = (cat: string) => {
    setEditingCategory(cat);
    setCategoryRenameValue(cat);
  };

  return { startEdit, handleOpenAdd, handleFormKeyDown, startCategoryRename };
}
