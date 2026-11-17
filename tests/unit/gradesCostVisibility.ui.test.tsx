// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AllCategoriesDashboard } from '../../src/components/settings-grades/views/AllCategoriesDashboard';
import { CategoryGradesTable } from '../../src/components/settings-grades/views/CategoryGradesTable';
import type { SettingsGradesState } from '../../src/components/settings-grades/hooks/useSettingsGradesState';
import type { Grade } from '../../src/components/settings-grades/settingsGradesTypes';
import { useAuthStore } from '../../src/store/authStore';

const initialAuth = useAuthStore.getState();
afterEach(() => { cleanup(); useAuthStore.setState(initialAuth); });

const grade = { grade_id: 'g1', category: 'Steel', grade_name: 'Thook', purchase_price: 350, rate: 750, offer_price: null } as unknown as Grade;
const sg = (editingId: string | null = null) => ({
  categoryRenameValue: '', editingCategory: null, operating: false, searchQuery: '', selectedCategory: 'Steel',
  editForm: { category: 'Steel', grade_name: 'Thook', rate: 750, purchase_price: 350, offer_price: null }, editingId,
  setCategoryRenameValue: vi.fn(), setConfirmDeleteCategory: vi.fn(), setEditingCategory: vi.fn(), setSearchQuery: vi.fn(),
  setSelectedCategory: vi.fn(), setEditForm: vi.fn(),
}) as unknown as SettingsGradesState;

const renderDashboard = () => render(
  <AllCategoriesDashboard avgPurchasePrice={350} avgRate={750} categories={['Steel']} groupedGrades={{ Steel: [grade] }}
    handleOpenAdd={vi.fn()} handleRenameCategory={vi.fn()} sg={sg()} startCategoryRename={vi.fn()} totalGrades={1} />,
);
const renderTable = (editingId: string | null) => render(
  <CategoryGradesTable filteredGrades={[grade]} handleDelete={vi.fn()} handleOpenAdd={vi.fn()} handleUpdate={vi.fn()}
    sg={sg(editingId)} startCategoryRename={vi.fn()} startEdit={vi.fn()} />,
);

it('hides grade purchase prices from staff without cost rights', () => {
  useAuthStore.setState({ role: 'STAFF', permissions: ['products.view'], restrictedPage: null });
  renderDashboard();
  expect(document.body.textContent).not.toMatch(/350/);
  expect(document.body.textContent).toMatch(/750/);
  cleanup();
  renderTable(null);
  expect(document.body.textContent).not.toMatch(/350/);
  cleanup();
  renderTable('g1');
  expect(screen.getByTitle(/not allowed you to see purchase cost/).textContent).toBe('Hidden');
  expect(screen.queryByDisplayValue('350')).toBeNull();
});

it('shows grade purchase prices to staff granted products.view_cost and to admins', () => {
  for (const auth of [{ role: 'STAFF', permissions: ['products.view', 'products.view_cost'] }, { role: 'ADMIN', permissions: [] }]) {
    useAuthStore.setState({ ...auth, restrictedPage: null });
    renderDashboard();
    expect(document.body.textContent).toMatch(/350/);
    cleanup();
    renderTable('g1');
    expect(screen.getByDisplayValue('350')).toBeTruthy();
    cleanup();
  }
});
