// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { WhatsAppDeviceTab } from '../../src/components/whatsapp/views/WhatsAppDeviceTab';
import { useWhatsAppSettingsState } from '../../src/components/whatsapp/hooks/useWhatsAppSettingsState';
afterEach(cleanup);
function Device({ qr = null, status = 'connecting' }: { qr?: string | null; status?: 'connecting' | 'syncing' | 'disconnected' }) {
  const wa = useWhatsAppSettingsState();
  return <WhatsAppDeviceTab wa={{ ...wa, status, qrCode: qr }} handleConnect={async () => {}} handleTabSelect={() => {}} />;
}
it('shows connection progress without flashing the disconnected setup', () => {
  render(<Device />);
  expect(screen.getByRole('status').textContent).toContain('Connecting to WhatsApp');
  expect(screen.queryByText('Link Your WhatsApp Number')).toBeNull();
});
it('allows hiding and restoring a QR without reconnecting', () => {
  render(<Device qr="data:image/png;base64,test" />);
  fireEvent.click(screen.getByText('Close QR Code'));
  expect(screen.queryByAltText('WhatsApp QR Code')).toBeNull();
  fireEvent.click(screen.getByText('Show QR Code'));
  expect(screen.getByAltText('WhatsApp QR Code')).toBeTruthy();
});