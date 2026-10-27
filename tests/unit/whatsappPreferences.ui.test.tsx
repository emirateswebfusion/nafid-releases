// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WhatsAppPreferencesTab } from '../../src/components/whatsapp/views/WhatsAppPreferencesTab';
import { useWhatsAppSettingsState } from '../../src/components/whatsapp/hooks/useWhatsAppSettingsState';
const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), parties: vi.fn() }));
vi.mock('../../src/data/settings', () => ({ getSetting: mocks.get, setSetting: mocks.set }));
vi.mock('../../src/data/parties', () => ({ listParties: mocks.parties }));
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks(); mocks.get.mockResolvedValue(null); mocks.set.mockResolvedValue(undefined);
  mocks.parties.mockResolvedValue([{ party_type: 'SUPPLIER' }, { party_type: 'OTHER', custom_category: 'Workshop' }]);
});

function Tab({ alerts = true, onAutoSend = () => {} }: { alerts?: boolean; onAutoSend?: (v: boolean) => void }) {
  const wa = useWhatsAppSettingsState();
  return <WhatsAppPreferencesTab tenantId="shop" wa={{ ...wa, ledgerAlertsEnabled: alerts }} shopName="Shop" autoSendEnabled={false}
    onAutoSendChange={onAutoSend} handleTabSelect={() => {}} handleToggleIncludeShopName={async () => {}} handleToggleLedgerAlerts={async () => {}} />;
}

it('shows data-driven types and persists selected bill formats', async () => {
  render(<Tab />);
  const thermal = await screen.findByLabelText('Thermal receipt PDF');
  await waitFor(() => expect(thermal.hasAttribute('disabled')).toBe(false));
  await screen.findByLabelText('Workshop');
  expect(screen.queryByLabelText('STAFF')).toBeNull();
  fireEvent.click(thermal);
  await waitFor(() => expect(mocks.set).toHaveBeenCalledWith({ tenant_id: 'shop', key: 'whatsapp_bill_formats', value: ['text', 'a4', 'thermal'] }));
});
it('persists a restricted party selection and discovers new categories on reopening', async () => {
  const view = render(<Tab />);
  const supplier = await screen.findByLabelText('SUPPLIER');
  await waitFor(() => expect(supplier.hasAttribute('disabled')).toBe(false));
  fireEvent.click(supplier);
  await waitFor(() => expect(mocks.set).toHaveBeenCalledWith({ tenant_id: 'shop', key: 'ledger_whatsapp_party_types', value: ['Workshop'] }));
  view.unmount();
  mocks.parties.mockResolvedValue([{ party_type: 'OTHER', custom_category: 'New trade' }]);
  render(<Tab />);
  expect(await screen.findByLabelText('New trade')).toBeTruthy();
});
it('keeps the last bill format selected and shows save failures', async () => {
  mocks.get.mockImplementation(async ({ key }: { key: string }) => key === 'whatsapp_bill_formats' ? ['text'] : null);
  render(<Tab />);
  await screen.findByLabelText('Workshop');
  await waitFor(() => expect(screen.getByLabelText('Text message').hasAttribute('disabled')).toBe(false));
  fireEvent.click(screen.getByLabelText('Text message'));
  expect(mocks.set).not.toHaveBeenCalled();
  mocks.set.mockRejectedValue(new Error('Save failed'));
  fireEvent.click(screen.getByLabelText('A4 PDF'));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not save: Save failed');
  expect((screen.getByLabelText('A4 PDF') as HTMLInputElement).checked).toBe(false);
});
it('locks recipient types while ledger alerts are off and toggles auto-send', async () => {
  const onAutoSend = vi.fn();
  render(<Tab alerts={false} onAutoSend={onAutoSend} />);
  await waitFor(() => expect(screen.getByLabelText('A4 PDF').hasAttribute('disabled')).toBe(false));
  expect(screen.getByLabelText('Workshop').hasAttribute('disabled')).toBe(true);
  expect((screen.getByLabelText('Include Shop Name in Message') as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText('Auto-send WhatsApp Bill on Checkout'));
  expect(onAutoSend).toHaveBeenCalledWith(true);
});
