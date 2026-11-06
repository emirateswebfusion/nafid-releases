// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('../../src/data/settings', () => ({ getSetting: mocks.get, setSetting: mocks.set }));
const { FilingOnlySettings } = await import('../../src/components/settings/FilingOnlySettings');

import { SettingsSaveContext } from '../../src/components/settings/hooks/useSettingsSectionSave';
import { SettingsSaveSession } from '../../src/components/settings/settingsSaveSession';
let session: SettingsSaveSession;
const changed = () => {};
afterEach(cleanup);
beforeEach(() => { session = new SettingsSaveSession(); mocks.get.mockReset().mockResolvedValue(null); mocks.set.mockReset().mockResolvedValue(undefined); });

const box = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe('revenue & filing-only settings', () => {
  it('keeps filing-only options locked until filing-only bills are enabled, then saves every key', async () => {
    render(<SettingsSaveContext.Provider value={{ session, changed }}><FilingOnlySettings tenantId="t" /></SettingsSaveContext.Provider>);
    await waitFor(() => expect(box('Exclude new B2B bills from revenue').disabled).toBe(false));
    expect(box('Reduce stock').disabled).toBe(true);

    fireEvent.click(box('Enable Filing-only bill'));
    expect(box('Reduce stock').disabled).toBe(false);
    fireEvent.click(box('Reduce stock'));
    fireEvent.click(box('Exclude new B2C bills from revenue'));
    fireEvent.click(box('Total Revenue (Net Realized Cash)'));

    await act(async () => { await session.save().catch(() => undefined); });
    await waitFor(() => expect(mocks.set).toHaveBeenCalledWith({ tenant_id: 't', key: 'filing_only_mode', value: { enabled: true, reduceStock: true, countInRevenue: false, showB2bInSalesCategory: true, showB2cInSalesCategory: true } }));
    expect(mocks.set).toHaveBeenCalledWith({ tenant_id: 't', key: 'exclude_b2b_from_revenue', value: false });
    expect(mocks.set).toHaveBeenCalledWith({ tenant_id: 't', key: 'exclude_b2c_from_revenue', value: true });
    expect(mocks.set).toHaveBeenCalledWith({ tenant_id: 't', key: 'dashboard_sales_metric', value: 'NET_REVENUE' });
  });

  it('restores saved values and reports a failed save', async () => {
    mocks.get.mockImplementation(({ key }: { key: string }) => Promise.resolve(key === 'filing_only_mode' ? { enabled: true, countInRevenue: true } : key === 'exclude_b2b_from_revenue' ? true : key === 'dashboard_sales_metric' ? 'NET_REVENUE' : null));
    mocks.set.mockRejectedValue(new Error('down'));
    render(<SettingsSaveContext.Provider value={{ session, changed }}><FilingOnlySettings tenantId="t" /></SettingsSaveContext.Provider>);
    await waitFor(() => expect(box('Include in revenue').checked).toBe(true));
    expect(box('Exclude new B2B bills from revenue').checked).toBe(true);
    expect(box('Exclude new B2C bills from revenue').checked).toBe(false);
    expect(box('Total Revenue (Net Realized Cash)').checked).toBe(true);
    fireEvent.click(box('Exclude new B2B bills from revenue'));
    await act(async () => { await session.save().catch(() => undefined); });
    await screen.findByText('Unable to save billing settings');
  });

  it('restores stringified and numeric booleans and saves through the Settings session', async () => {
    mocks.get.mockImplementation(({ key }: { key: string }) => Promise.resolve(
      key === 'filing_only_mode' ? JSON.stringify({ enabled: 'true', reduceStock: '1', countInRevenue: 1 })
      : key === 'exclude_b2b_from_revenue' ? 'true'
      : key === 'exclude_b2c_from_revenue' ? '1'
      : null
    ));
    render(<SettingsSaveContext.Provider value={{ session, changed }}><FilingOnlySettings tenantId="t" /></SettingsSaveContext.Provider>);
    await waitFor(() => expect(box('Exclude new B2B bills from revenue').checked).toBe(true));
    expect(box('Exclude new B2C bills from revenue').checked).toBe(true);
    expect(box('Enable Filing-only bill').checked).toBe(true);
    expect(box('Reduce stock').checked).toBe(true);
    expect(box('Include in revenue').checked).toBe(true);

    // Toggle one option to make dirty
    fireEvent.click(box('Exclude new B2B bills from revenue'));
    expect(box('Exclude new B2B bills from revenue').checked).toBe(false);

    // Trigger the awaited session used by Settings header Save Changes
    await act(async () => { await session.save().catch(() => undefined); });
    await waitFor(() => expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ key: 'exclude_b2b_from_revenue', value: false })));
  });
});
