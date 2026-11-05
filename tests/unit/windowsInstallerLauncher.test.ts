import { EventEmitter } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ worker: null as unknown as EventEmitter, create: vi.fn() }));
vi.mock('electron', () => ({ app: { isPackaged: false } }));
vi.mock('node:worker_threads', () => ({ Worker: class { constructor(...args: unknown[]) { fixture.create(...args); return fixture.worker; } } }));
import { launchWindowsUpdate } from '../../electron/services/windowsInstallerLauncher';
beforeEach(() => { fixture.worker = new EventEmitter(); fixture.create.mockReset(); });
it('keeps the main event loop live while the worker waits for Windows and reports actual phases', async () => {
  const phases: string[] = [];
  let complete = false;
  const pending = launchWindowsUpdate({ file: 'update.exe', sha512: 'sha' }, phase => phases.push(phase));
  void pending.then(() => { complete = true; });
  await new Promise(resolve => setTimeout(resolve, 10)); expect(complete).toBe(false);
  fixture.worker.emit('message', { phase: 'verifying-installer' }); fixture.worker.emit('message', { phase: 'starting-installer' });
  fixture.worker.emit('message', { result: { success: true } });
  expect(await pending).toEqual({ success: true }); expect(phases).toEqual(['verifying-installer', 'starting-installer']);
});
it('handles a worker failing before result without closing the app or starting another process', async () => {
  const pending = launchWindowsUpdate({ file: 'update.exe', sha512: 'sha' }, () => {});
  fixture.worker.emit('error', new Error('worker failed'));
  expect(await pending).toMatchObject({ success: false, installerReady: true }); expect(fixture.create).toHaveBeenCalledOnce();
});
it('treats an exit without a result as a launch failure', async () => {
  const pending = launchWindowsUpdate({ file: 'update.exe', sha512: 'sha' }, () => {});
  fixture.worker.emit('exit', 0); expect(await pending).toMatchObject({ success: false });
});
