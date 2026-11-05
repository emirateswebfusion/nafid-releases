import path from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ write: vi.fn(), visible: true, onShow: null as null | (() => void) }));
vi.mock('electron', () => ({ app: { getPath: (name: string) => name === 'userData' ? 'canonical-user-data' : 'different-temp', getVersion: () => 'test-version' } }));
vi.mock('node:fs', () => ({ default: { writeFileSync: fixture.write } }));
vi.mock('electron-log/main', () => ({ default: { info: vi.fn(), warn: vi.fn() } }));
vi.mock('../../electron/services/windowRegistry.js', () => ({ getMainWindow: () => ({ webContents: { id: 1 }, isDestroyed: () => false, isVisible: () => fixture.visible, once: (_event: string, callback: () => void) => { fixture.onShow = callback; } }) }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); fixture.visible = true; fixture.onShow = null; });
it('rejects arbitrary paths, ambiguous tokens and malformed readiness ids', async () => {
  const { updateReadyMarker } = await import('../../electron/services/startupReadyService');
  for (const value of ['../file', '0', '12/other', 'abc', '12345678901']) expect(updateReadyMarker(['--nafid-update-ready=' + value], 'temp')).toBeNull();
  expect(updateReadyMarker(['--nafid-update-ready=1', '--nafid-update-ready=2'], 'temp')).toBeNull();
  expect(updateReadyMarker(['--nafid-update-ready=123'], 'temp')).toBe(path.join('temp', 'nafid-update-123.ready'));
});
it('does not create a marker for an ordinary startup', async () => {
  const { acknowledgeRendererReady } = await import('../../electron/services/startupReadyService');
  expect(acknowledgeRendererReady({ sender: { id: 1 } })).toEqual({ success: true }); expect(fixture.write).not.toHaveBeenCalled();
});
it('waits for an actually visible window and acknowledges only once', async () => {
  const previous = process.argv;
  process.argv = [...previous, '--nafid-update-ready=123'];
  try {
    fixture.visible = false;
    const { acknowledgeRendererReady } = await import('../../electron/services/startupReadyService');
    acknowledgeRendererReady({ sender: { id: 1 } }); expect(fixture.write).not.toHaveBeenCalled();
    fixture.visible = true; fixture.onShow?.(); acknowledgeRendererReady({ sender: { id: 1 } });
    expect(fixture.write).toHaveBeenCalledOnce();
    expect(fixture.write).toHaveBeenCalledWith(path.join('canonical-user-data', 'nafid-update-123.ready'), 'test-version', 'utf8');
  } finally { process.argv = previous; }
});

it('ignores readiness from a secondary window', async () => {
  const previous = process.argv; process.argv = [...previous, '--nafid-update-ready=123'];
  try {
    const { acknowledgeRendererReady } = await import('../../electron/services/startupReadyService');
    expect(acknowledgeRendererReady({ sender: { id: 99 } })).toEqual({ success: false });
    expect(fixture.write).not.toHaveBeenCalled();
  } finally { process.argv = previous; }
});
