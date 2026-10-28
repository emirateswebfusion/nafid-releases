// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('../../src/data/settings', () => ({ getSetting: mocks.get, setSetting: mocks.set }));
const { FilingOnlySettings } = await import('../../src/components/settings/FilingOnlySettings');

afterEach(cleanup);
beforeEach(() => { mocks.get.mockReset().mockResolvedValue(null); mocks.set.mockReset().mockResolvedValue(undefined); });

const box = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe('revenue & filing-only settings', () => {
  it('keeps filing-only options locked until filing-only bills are enabled, then saves every key', async () => {
    render(<FilingOnlySettings tenantId="t" />);
    await waitFor(() => expect(box('Exclude new B2B bills from revenue').disabled).toBe(false));
    expect(box('Reduce stock').disabled).toBe(true);

    fireEvent.click(box('Enable Filing-only bill'));
    expect(box('Reduce stock').disabled).toBe(false);
    fireEvent.click(box('Reduce stock'));
    fireEvent.click(box('Exclude new B2C bills from revenue'));
    fireEvent.click(box('Total Revenue (Net Realized Cash)'));
    expect(screen.getByText('You have unsaved changes on this page.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save revenue settings' }));
    await screen.findByText('Saved');
    expect(mocks.set).toHaveBeenCalledWith({ tenant_id: 't', key: 'filing_only_mode', value: { enabled: true, reduceStock: true, countInRevenue: false, showB2bInSalesCategory: true } });
    expect(mocks.set).toHaveBeenCalledWith({ tenant_id: 't', key: 'exclude_b2b_from_revenue', value: false });
    expect(mocks.set).toHaveBeenCalledWith({ tenant_id: 't', key: 'exclude_b2c_from_revenue', value: true });
    expect(mocks.set).toHaveBeenCalledWith({ tenant_id: 't', key: 'dashboard_sales_metric', value: 'NET_REVENUE' });
  });

  it('restores saved values and reports a failed save', async () => {
    mocks.get.mockImplementation(({ key }: { key: string }) => Promise.resolve(key === 'filing_only_mode' ? { enabled: true, countInRevenue: true } : key === 'exclude_b2b_from_revenue' ? true : key === 'dashboard_sales_metric' ? 'NET_REVENUE' : null));
    mocks.set.mockRejectedValue(new Error('down'));
    render(<FilingOnlySettings tenantId="t" />);
    await waitFor(() => expect(box('Include in revenue').checked).toBe(true));
    expect(box('Exclude new B2B bills from revenue').checked).toBe(true);
    expect(box('Exclude new B2C bills from revenue').checked).toBe(false);
    expect(box('Total Revenue (Net Realized Cash)').checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Save revenue settings' }));
    await screen.findByText('Unable to save billing settings');
  });
});
