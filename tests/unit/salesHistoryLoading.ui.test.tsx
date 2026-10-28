// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('recharts', () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { ...Object.fromEntries(['ResponsiveContainer', 'CartesianGrid', 'XAxis', 'YAxis', 'Tooltip', 'Area'].map(name => [name, Container])), AreaChart: ({ children }: { children?: ReactNode }) => <svg>{children}</svg> };
});

type Answer = (...args: unknown[]) => unknown;
let answers: Record<string, Answer> = {};
let calls: { name: string; args: unknown[] }[] = [];
(window as unknown as { electronAPI: unknown }).electronAPI = new Proxy({}, {
  get: (_target, name: string) => name.startsWith('on') ? () => () => {} : async (...args: unknown[]) => {
    calls.push({ name, args });
    return answers[name] ? answers[name](...args) : [];
  },
});
vi.stubGlobal('IntersectionObserver', class {
  observe() {}
  disconnect() {}
  unobserve() {}
});

const { useAuthStore } = await import('../../src/store/authStore');
const { SalesHistory } = await import('../../src/components/sales/SalesHistory');
const invoices = Array.from({ length: 30 }, (_, n) => ({
  invoice_id: 'inv-' + n, invoice_number: 'BOS-' + n, tenant_id: 't1', invoice_type: 'BILL_OF_SUPPLY',
  created_at: '2026-10-27T09:00:00.000Z', subtotal: 100, tax_total: 18, grand_total: 118,
  payment_method: 'CASH', item_count: 3,
}));
const totals = { totalSales: 3540, totalSalesBeforeDeductions: 3540, totalInvoices: 5000, totalTax: 540, totalDiscount: 0, avgOrder: 118 };
const callsTo = (name: string) => calls.filter(call => call.name === name);

beforeEach(() => {
  calls = [];
  answers = {
    settingsGet: () => null,
    dbGetInvoices: () => invoices,
    dbGetInvoicesSummary: () => totals,
    dbGetBosConvertibleInvoices: () => invoices.map(inv => ({ invoice_id: inv.invoice_id, convertible: 1 })),
  };
  localStorage.clear();
  useAuthStore.setState({ isAuthenticated: true, tenantId: 't1', role: 'ADMIN', permissions: ['*'] });
});
afterEach(() => cleanup());

describe('Sales History loading', () => {
  it('shows the 30-row first page while the full-history summary is still pending', async () => {
    let finishSummary: (value: typeof totals) => void = () => {};
    answers.dbGetInvoicesSummary = () => new Promise(resolve => { finishSummary = resolve; });
    render(<SalesHistory onClose={() => {}} />);
    try {
      await screen.findByText('BOS-0');
      expect(callsTo('dbGetInvoices')).toHaveLength(1);
      expect(callsTo('dbGetInvoices')[0].args[0]).toMatchObject({ limit: 30, offset: 0 });
      expect(screen.getAllByText(/^BOS-\d+$/)).toHaveLength(30);
    } finally {
      await act(async () => finishSummary(totals));
    }
  });

  it('requests conversion eligibility only for the fetched page, not every shop invoice', async () => {
    render(<SalesHistory onClose={() => {}} />);
    await screen.findByText('BOS-0');
    await waitFor(() => expect(callsTo('dbGetBosConvertibleInvoices').length).toBeGreaterThan(0));
    expect(callsTo('dbGetBosConvertibleInvoices')).toHaveLength(1);
    expect(callsTo('dbGetBosConvertibleInvoices')[0].args).toEqual(['t1', invoices.map(inv => inv.invoice_id)]);
  });

  it('does not fetch invoice details on opening; details remain available on demand', async () => {
    render(<SalesHistory onClose={() => {}} />);
    await screen.findByText('BOS-0');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
    expect(callsTo('dbGetInvoiceItems')).toHaveLength(0);
    expect(callsTo('dbGetAlreadyReturnedQuantities')).toHaveLength(0);
    fireEvent.mouseEnter(screen.getByText('BOS-0').closest('tr')!);
    await waitFor(() => expect(callsTo('dbGetInvoiceItems')).toHaveLength(1));
    expect(callsTo('dbGetAlreadyReturnedQuantities')).toHaveLength(1);
  });

  it('labels the GST-inclusive total and the excluding-GST amount separately', async () => {
    render(<SalesHistory onClose={() => {}} />);
    await screen.findByText('BOS-0');
    expect(screen.getByText('Sales excluding GST')).toBeTruthy();
    expect(screen.getByText('GST Amount')).toBeTruthy();
    expect(screen.getByText('Grand Total including GST')).toBeTruthy();
    const exclusive = screen.getByText('Sales excluding GST').parentElement!;
    expect(exclusive.textContent).toContain('3,000.00');
  });

  it('does not let an old summary overwrite a newer search', async () => {
    let finishOld: (value: typeof totals) => void = () => {};
    answers.dbGetInvoicesSummary = filters => (filters as { search?: string }).search
      ? { ...totals, totalSalesBeforeDeductions: 118, totalTax: 18, totalInvoices: 1 }
      : new Promise(resolve => { finishOld = resolve; });
    render(<SalesHistory onClose={() => {}} />);
    await screen.findByText('BOS-0');
    const input = screen.getByPlaceholderText(/Search/i);
    fireEvent.change(input, { target: { value: 'filtered' } });
    await waitFor(() => expect(callsTo('dbGetInvoicesSummary').length).toBe(2));
    await waitFor(() => expect(screen.getByText('Sales excluding GST').parentElement!.textContent).toContain('100.00'));
    await act(async () => finishOld(totals));
    expect(screen.getByText('Sales excluding GST').parentElement!.textContent).toContain('100.00');
  });

  it('loads only the next page once when load more is triggered twice', async () => {
    let finishPage: (value: typeof invoices) => void = () => {};
    answers.dbGetInvoices = filters => (filters as { offset?: number }).offset
      ? new Promise(resolve => { finishPage = resolve; }) : invoices;
    render(<SalesHistory onClose={() => {}} />);
    await screen.findByText('BOS-0');
    const button = screen.getByRole('button', { name: /Load More Records/ });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(callsTo('dbGetInvoices')).toHaveLength(2);
    expect(callsTo('dbGetInvoices')[1].args[0]).toMatchObject({ limit: 30, offset: 30 });
    await act(async () => finishPage([]));
    expect(callsTo('dbGetInvoicesSummary')).toHaveLength(1);
  });

  it('uses the same explicit GST breakdown in Analytics', async () => {
    render(<SalesHistory onClose={() => {}} />);
    await screen.findByText('BOS-0');
    fireEvent.click(screen.getByRole('button', { name: /Analytics & Graph/ }));
    expect(screen.getByText('Sales excluding GST').parentElement!.textContent).toContain('3,000.00');
    expect(screen.getByText('GST Amount').parentElement!.textContent).toContain('540.00');
    expect(screen.getByText('Grand Total including GST').parentElement!.textContent).toContain('3,540.00');
  });

  it('renders invoice type options including Filing-only when opening dropdown in GST view', async () => {
    render(<SalesHistory onClose={() => {}} />);
    await screen.findByText('BOS-0');
    fireEvent.click(screen.getByTitle('Official Statutory GST Invoices (GST)'));
    const typeSelectTrigger = screen.getByText('All GST Types');
    fireEvent.click(typeSelectTrigger);
    expect(screen.getByText('Filing-only')).toBeDefined();
  });
});
