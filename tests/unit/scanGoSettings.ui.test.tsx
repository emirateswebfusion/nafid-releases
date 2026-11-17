// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ScanGoSettings } from '../../src/components/settings/ScanGoSettings';
import { SettingsSaveSession } from '../../src/components/settings/settingsSaveSession';
import { SettingsSaveContext } from '../../src/components/settings/hooks/useSettingsSectionSave';
const cloud = vi.hoisted(() => ({ getConfig: vi.fn(), setEnabled: vi.fn() }));
vi.mock('../../src/data/cloud/scanGo', () => ({ scanGoCloud: cloud }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('keeps the switch as a draft and retains it after a failed main save for retry', async () => {
  cloud.getConfig.mockResolvedValue({ enabled: false, code: null, qr_payload: null, qr_svg: null });
  const session = new SettingsSaveSession();
  render(<SettingsSaveContext.Provider value={{ session, changed: () => {} }}><ScanGoSettings /></SettingsSaveContext.Provider>);
  const checkbox = screen.getByRole('checkbox');
  await waitFor(() => expect((checkbox as HTMLInputElement).disabled).toBe(false));
  fireEvent.click(checkbox);
  expect(cloud.setEnabled).not.toHaveBeenCalled();
  expect(session.dirty).toBe(true);
  cloud.setEnabled.mockRejectedValueOnce(new Error('Offline'));
  await act(async () => { await expect(session.save()).rejects.toThrow('Offline'); });
  expect(session.dirty).toBe(true);
  expect((checkbox as HTMLInputElement).checked).toBe(true);
  cloud.setEnabled.mockResolvedValueOnce({ enabled: true, code: 'shop', qr_payload: 'qr', qr_svg: '<svg />' });
  await act(async () => { await session.save(); });
  expect(session.dirty).toBe(false);
  expect(cloud.setEnabled).toHaveBeenLastCalledWith(true);
  expect(screen.getByAltText('Shop Scan & Go QR code')).toBeDefined();
});
