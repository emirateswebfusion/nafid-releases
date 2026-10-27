// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CashRegisterSettings } from '../../src/components/settings/tabs/CashRegisterSettings';
import { ReturnCashRegisterNote } from '../../src/components/returns/ReturnCashRegisterNote';

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), role: 'ADMIN' }));
vi.mock('../../src/data/settings', () => ({ getSetting: mocks.get, setSetting: mocks.set }));
vi.mock('../../src/store/authStore', () => ({ useAuthStore: (selector: (state: { tenantId: string; role: string }) => unknown) => selector({ tenantId: 't', role: mocks.role }) }));
vi.mock('../../src/components/ui/Select', () => ({ Select: ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{value: string; label: string}> }) => <select aria-label="Ledger date option" value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> }));

afterEach(cleanup);
beforeEach(() => { mocks.get.mockReset().mockResolvedValue(null); mocks.set.mockReset().mockResolvedValue(undefined); mocks.role = 'ADMIN'; });

describe('cash register settings controls', () => {
  it('loads defaults and saves owner-selected exclusions and payment methods', async () => {
    render(<CashRegisterSettings />);
    const save = screen.getByRole('button', { name: 'Save cash register options' });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByLabelText('Include cash received from scrap sales in Cash In'));
    fireEvent.click(screen.getByLabelText('Deduct cash return refunds from the cash register'));
    fireEvent.change(screen.getByLabelText('Ledger date option'), { target: { value: 'today' } });
    fireEvent.click(screen.getByLabelText('UPI'));
    fireEvent.click(save);
    await screen.findByText(/Cash register options saved/);
    expect(mocks.set).toHaveBeenCalledWith({ tenant_id: 't', key: 'cash_register_include_scrap_sales', value: false });
    expect(mocks.set).toHaveBeenCalledWith({ tenant_id: 't', key: 'cash_register_deduct_returns', value: false });
    expect(mocks.set).toHaveBeenCalledWith({ tenant_id: 't', key: 'cash_register_ledger_mode', value: 'today' });
    expect(mocks.set).toHaveBeenCalledWith({ tenant_id: 't', key: 'cash_register_payment_methods', value: ['UPI'] });
  });
  it('restores saved options and keeps staff controls disabled', async () => {
    mocks.role = 'STAFF';
    mocks.get.mockImplementation(({ key }: { key: string }) => Promise.resolve(key === 'cash_register_payment_methods' ? ['CARD'] : key === 'cash_register_ledger_mode' ? 'off' : false));
    render(<CashRegisterSettings />);
    await waitFor(() => expect((screen.getByLabelText('CARD') as HTMLInputElement).checked).toBe(true));
    expect((screen.getByLabelText('Deduct cash return refunds from the cash register') as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole('button', { name: 'Save cash register options' }).closest('fieldset')?.disabled).toBe(true);
  });
  it('shows a save failure instead of claiming success', async () => {
    mocks.set.mockRejectedValue(new Error('failed'));
    render(<CashRegisterSettings />);
    const save = screen.getByRole('button', { name: 'Save cash register options' });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(save);
    await screen.findByText(/Could not save all cash register options/);
  });
});

describe('return history cash setting', () => {
  it.each([true, false])('explains the register effect with deductions %s', async enabled => {
    mocks.get.mockResolvedValue(enabled);
    render(<ReturnCashRegisterNote tenantId="t" />);
    await screen.findByText(enabled ? /Cash refunds are deducted/ : /Cash refunds are excluded/);
  });
});
