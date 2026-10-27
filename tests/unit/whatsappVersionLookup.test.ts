import { afterEach, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ app: { getPath: () => '' }, BrowserWindow: { getAllWindows: () => [] }, ipcMain: { handle: vi.fn(), once: vi.fn() } }));
vi.mock('../../electron/hardware/receiptHtml.js', () => ({ buildReceiptHtml: vi.fn() }));
import { resolveWhatsAppVersion } from '../../electron/whatsapp/whatsappService';
afterEach(() => vi.useRealTimers());
it('uses the looked-up WhatsApp Web version when GitHub answers', async () => {
  await expect(resolveWhatsAppVersion(async () => ({ version: [2, 3000, 1] }))).resolves.toEqual([2, 3000, 1]);
});
it('falls back to the bundled version when the lookup fails', async () => {
  await expect(resolveWhatsAppVersion(() => Promise.reject(new Error('blocked')))).resolves.toBeUndefined();
});
it('stops waiting for a stalled lookup so the QR can still be generated', async () => {
  vi.useFakeTimers();
  const result = resolveWhatsAppVersion(() => new Promise(() => {}));
  await vi.advanceTimersByTimeAsync(8000);
  await expect(result).resolves.toBeUndefined();
});
