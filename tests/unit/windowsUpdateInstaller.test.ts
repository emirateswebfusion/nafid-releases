import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: fixture.spawn }));
import { launchWindowsUpdate } from '../../electron/services/windowsUpdateInstaller';
let directory: string;
let file: string;
const content = Buffer.from('synthetic installer; never executed');
const sha512 = createHash('sha512').update(content).digest('base64');
let child: EventEmitter & { unref: ReturnType<typeof vi.fn> };
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'nafid-updater-test-'));
  file = path.join(directory, 'Nafid-Setup.exe'); await writeFile(file, content);
  child = Object.assign(new EventEmitter(), { unref: vi.fn() });
  fixture.spawn.mockReset().mockReturnValue(child);
});
afterEach(async () => {
  if (!directory.startsWith(path.join(tmpdir(), 'nafid-updater-test-'))) throw new Error('Unexpected test path');
  await rm(directory, { recursive: true, force: true });
});
it('validates the complete file then awaits OS process creation, with visible progress and relaunch flags', async () => {
  const pending = launchWindowsUpdate({ file, sha512 });
  let completed = false; void pending.then(() => { completed = true; });
  await vi.waitFor(() => expect(fixture.spawn).toHaveBeenCalledOnce());
  expect(completed).toBe(false);
  expect(fixture.spawn).toHaveBeenCalledWith(file, ['--updated', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: false });
  child.emit('spawn'); expect(await pending).toEqual({ success: true }); expect(child.unref).toHaveBeenCalledOnce();
});
it.each(['UNKNOWN', 'EACCES', 'ENOENT'])('handles asynchronous %s launch failure without discarding a verified download', async code => {
  const pending = launchWindowsUpdate({ file, sha512 });
  await vi.waitFor(() => expect(fixture.spawn).toHaveBeenCalledOnce());
  child.emit('error', Object.assign(new Error('spawn ' + code), { code }));
  expect(await pending).toMatchObject({ success: false, installerReady: true, error: expect.stringContaining('download is saved') });
  expect(child.unref).not.toHaveBeenCalled();
});
it('never executes a changed or truncated installer', async () => {
  await writeFile(file, 'changed after download');
  expect(await launchWindowsUpdate({ file, sha512 })).toMatchObject({ success: false, installerReady: false, error: expect.stringContaining('verification') });
  expect(fixture.spawn).not.toHaveBeenCalled();
});
it('reports byte-based verification progress and completes it only after checksum validation', async () => {
  const progress: number[] = [];
  const pending = launchWindowsUpdate({ file, sha512 }, (_phase, percent) => { if (percent !== undefined) progress.push(percent); });
  await vi.waitFor(() => expect(fixture.spawn).toHaveBeenCalledOnce());
  expect(progress.at(-1)).toBe(100);
  expect(progress.slice(0, -1).every(value => value >= 0 && value < 100)).toBe(true);
  child.emit('spawn'); await pending;
  progress.length = 0;
  await launchWindowsUpdate({ file, sha512: 'wrong' }, (_phase, percent) => { if (percent !== undefined) progress.push(percent); });
  expect(progress).not.toContain(100);
});
it('requires a missing installer to be downloaded again', async () => {
  expect(await launchWindowsUpdate({ file: path.join(directory, 'missing.exe'), sha512 })).toMatchObject({ success: false, installerReady: false });
  expect(fixture.spawn).not.toHaveBeenCalled();
});
