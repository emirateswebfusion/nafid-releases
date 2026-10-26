import { useState } from 'react';
import { type Grade, type GradeForm } from '../settingsGradesTypes';

/**
 * State of the settings grades screen: the grade rows, loading / operating flags, the add and edit forms, search and
 * category filter, inline category rename, and delete confirmations.
 */
export function useSettingsGradesState() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [operating, setOperating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<GradeForm>({ category: '', grade_name: '', rate: 0, purchase_price: 0, offer_price: null as number | null });
  const [newForm, setNewForm] = useState<GradeForm>({ category: '', grade_name: '', rate: 0, purchase_price: 0, offer_price: null as number | null });
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [categoryRenameValue, setCategoryRenameValue] = useState('');
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<string | null>(null);
  const [gradeToDelete, setGradeToDelete] = useState<Grade | null>(null);

  return {
    grades, setGrades, loading, setLoading, operating, setOperating, editingId, setEditingId, editForm, setEditForm,
    newForm, setNewForm, isAdding, setIsAdding, error, setError, searchQuery, setSearchQuery, selectedCategory,
    setSelectedCategory, editingCategory, setEditingCategory, categoryRenameValue, setCategoryRenameValue,
    confirmDeleteCategory, setConfirmDeleteCategory, gradeToDelete, setGradeToDelete,
  };
}

export type SettingsGradesState = ReturnType<typeof useSettingsGradesState>;
