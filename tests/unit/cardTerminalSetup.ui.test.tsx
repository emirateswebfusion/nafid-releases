// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), status: vi.fn(), setting: vi.fn() }));
vi.mock('../../src/store/authStore', () => ({ useAuthStore: (select: (s: { tenantId: string }) => unknown) => select({ tenantId: 'shop' }) }));
vi.mock('../../src/data/settings', () => ({ setSetting: mocks.setting }));
vi.mock('../../src/data/cardTerminal', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/data/cardTerminal')>(), hasCardTerminal: () => true,
  cardTerminalApi: { getStatus: mocks.status, listPorts: async () => [], listTransactions: async () => [], listUnresolved: async () => [] },
}));
import { CardTerminalSettings } from '../../src/components/settings/tabs/CardTerminalSettings';
import { SettingsSaveContext } from '../../src/components/settings/hooks/useSettingsSectionSave';
import { SettingsSaveSession } from '../../src/components/settings/settingsSaveSession';
let session: SettingsSaveSession;
const changed = () => {};
beforeEach(() => {
  session = new SettingsSaveSession();
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([{ provider: 'NETWORK', environment: 'TEST', endpoint: 'https://bank.example', credentialsSaved: true }]);
  mocks.save.mockResolvedValue({ success: true, message: 'Provider settings saved. Connector pending.' });
  mocks.status.mockResolvedValue({ config: { enabled: false, provider: 'NETWORK', connection: { type: 'SERIAL', path: 'COM3', baudRate: 9600 }, timeoutSeconds: 120, allowManualFallback: true }, providers: ['NETWORK'], busy: false });
  mocks.setting.mockResolvedValue(undefined);
});
afterEach(cleanup);
it('shop saves its identifiers while automatic charging remains disabled', async () => {
  render(<SettingsSaveContext.Provider value={{ session, changed }}><CardTerminalSettings /></SettingsSaveContext.Provider>);
  await screen.findByText(/Setup pending/);
  expect(screen.queryByText(/Training terminal/)).toBeNull();
  expect(screen.queryByText('Send card amounts to the card terminal at checkout')).toBeNull();
  fireEvent.change(screen.getByLabelText('Merchant ID'), { target: { value: 'MID-10' } });
  fireEvent.change(screen.getByLabelText('Terminal ID'), { target: { value: 'TID-20' } });
  expect(mocks.setting).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Save', exact: true })).toBeNull();
  await act(async () => session.save());
  await waitFor(() => expect(mocks.setting).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 'shop', value: expect.objectContaining({ enabled: false, merchantId: 'MID-10', terminalId: 'TID-20' }) })));
});
