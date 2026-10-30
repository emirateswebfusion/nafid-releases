import { describe, expect, it, vi } from 'vitest';
import { prepareReceiptLayout } from '../../electron/hardware/receiptLayout';

describe('last check before sending a physical receipt', () => {
  it('accepts a measured receipt whose text fits', async () => {
    const executeJavaScript = vi.fn(async () => ({ height: 900, overflow: 0 }));
    await expect(prepareReceiptLayout({ webContents: { executeJavaScript } })).resolves.toBeUndefined();
    expect(executeJavaScript).toHaveBeenCalledOnce();
  });
  it.each([undefined, null, 0, {}, { height: 0, overflow: 0 }, { height: Infinity, overflow: 0 },
    { height: 900, overflow: 1 }, { height: 900 }, { height: '900', overflow: 0 }])(
    'rejects an unprepared or overflowing receipt: %j', async result => {
      await expect(prepareReceiptLayout({ webContents: { executeJavaScript: async () => result } })).rejects.toThrow('could not fit');
    });
  it('propagates renderer failures instead of reporting a printable receipt', async () => {
    await expect(prepareReceiptLayout({ webContents: { executeJavaScript: async () => { throw new Error('renderer unavailable'); } } })).rejects.toThrow('renderer unavailable');
  });
});
