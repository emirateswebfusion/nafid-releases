// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StockCategoryBreakdown } from '../../src/components/stock-report/views/StockCategoryBreakdown';
import type { StockReportState } from '../../src/components/stock-report/hooks/useStockReportState';
import type { StockCategoryStat } from '../../src/components/stock-report/stockReportTypes';

afterEach(cleanup);

const sr = { loading: false } as unknown as StockReportState;
const stats: StockCategoryStat[] = [{ name: 'Cement', stock: 10, purchase: 4321, mrp: 6000, selling: 5500, pct: 100, count: 2 }];

it('hides per-category purchase totals without cost rights', () => {
  render(<StockCategoryBreakdown sr={sr} categoryStats={stats} maxPct={100} canViewCost={false} />);
  expect(screen.getByText(/Purchase:/).textContent).toBe('Purchase: •••');
  expect(screen.queryByText(/4,321/)).toBeNull();
  expect(screen.getByText(/5,500/)).toBeTruthy();
});

it('shows per-category purchase totals with cost rights', () => {
  render(<StockCategoryBreakdown sr={sr} categoryStats={stats} maxPct={100} canViewCost />);
  expect(screen.getByText(/Purchase:/).textContent).toMatch(/4,321/);
});
