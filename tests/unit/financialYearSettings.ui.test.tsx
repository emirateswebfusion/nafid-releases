// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinancialYearSettings } from '../../src/components/settings/FinancialYearSettings';
import { FinancialYearDropup } from '../../src/components/owner-dashboard/FinancialYearDropup';
import { SettingsSaveContext } from '../../src/components/settings/hooks/useSettingsSectionSave';
import { SettingsSaveSession } from '../../src/components/settings/settingsSaveSession';

let session: SettingsSaveSession;
const changed = vi.fn();

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  role: 'ADMIN',
}));

vi.mock('../../src/data/settings', () => ({
  settingsApi: {
    get: mocks.get,
    set: mocks.set,
  },
}));

vi.mock('../../src/data/client', () => ({
  hasBridge: () => true,
  isDesktopRuntime: () => true,
}));

vi.mock('../../src/store/authStore', () => ({
  useAuthStore: (selector?: (state: { tenantId: string; role: string }) => unknown) => {
    const state = { tenantId: 'test-tenant', role: mocks.role };
    return selector ? selector(state) : state;
  },
}));

afterEach(cleanup);

beforeEach(() => {
  session = new SettingsSaveSession();
  changed.mockReset();
  mocks.get.mockReset().mockResolvedValue(null);
  mocks.set.mockReset().mockResolvedValue(undefined);
  mocks.role = 'ADMIN';
});

describe('FinancialYearSettings UI component', () => {
  it('renders active financial year and rollover card', async () => {
    render(<FinancialYearSettings tenantId="test-tenant" terminalCode="POS1" />);

    expect(screen.getByText('Active Financial Year')).toBeTruthy();
    expect(screen.getByText('Year-End Closing Wizard')).toBeTruthy();
    expect(screen.getByText('Start New Financial Year')).toBeTruthy();
  });

  it('opens custom confirmation modal when Start New Financial Year is clicked', async () => {
    render(<FinancialYearSettings tenantId="test-tenant" terminalCode="POS1" />);

    const startBtn = screen.getByText('Start New Financial Year');
    fireEvent.click(startBtn);

    // Modal should be visible
    expect(screen.getByText('Year-End transition & counter reset')).toBeTruthy();
    expect(screen.getByText('Confirm & Start New FY')).toBeTruthy();
    expect(screen.getByText('New Invoice Series Prefix')).toBeTruthy();
  });

  it('saves new year configuration and resets counter to 1 when confirmed', async () => {
    render(<FinancialYearSettings tenantId="test-tenant" terminalCode="POS1" />);

    fireEvent.click(screen.getByText('Start New Financial Year'));

    const confirmBtn = screen.getByText('Confirm & Start New FY');
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      expect(mocks.set).toHaveBeenCalled();
    });

    // Check that invoice_counter_config was set with counter 1
    const counterCall = mocks.set.mock.calls.find(call => call[0].key === 'invoice_counter_config');
    expect(counterCall).toBeTruthy();
    const parsed = JSON.parse(counterCall[0].value);
    expect(parsed.counter).toBe(1);
  });

  it('keeps toggles in draft until session.save() is executed', async () => {
    render(
      <SettingsSaveContext.Provider value={{ session, changed }}>
        <FinancialYearSettings tenantId="test-tenant" terminalCode="POS1" />
      </SettingsSaveContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('Year-End Closing Wizard')).toBeTruthy();
    });

    // Toggle prior years lock checkbox
    const checkbox = screen.getByLabelText('Auto-lock prior years');
    fireEvent.click(checkbox);

    // Should NOT have saved immediately (draft convention)
    expect(mocks.set).not.toHaveBeenCalled();

    // Now execute session.save() like the Settings header button
    await act(async () => {
      await session.save();
    });

    // Now it should be saved
    expect(mocks.set).toHaveBeenCalled();
    const configCall = mocks.set.mock.calls.find(call => call[0].key === 'financial_years_config');
    expect(configCall).toBeTruthy();
    const parsed = JSON.parse(configCall[0].value);
    expect(parsed.lockPriorYears).toBe(false);
  });

});

describe('FinancialYearDropup UI component', () => {
  it('renders badge and opens drop-up on click', async () => {
    render(<FinancialYearDropup />);

    // Click the badge button
    const btn = screen.getByRole('button');
    fireEvent.click(btn);

    // Popover content
    expect(screen.getByText('Financial Year')).toBeTruthy();
    expect(screen.getByText('View Financial Report')).toBeTruthy();
    expect(screen.getByText('Manage in Settings')).toBeTruthy();
  });
});
