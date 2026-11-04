import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export interface DownloadedWindowsInstaller { file: string; sha512: string }
export type InstallerLaunchResult = { success: true } | { success: false; error: string; installerReady: boolean };

/** Wait for Windows to accept the installer before allowing the POS to quit. Never elevate or bypass OS policy. */
export async function launchWindowsUpdate(installer: DownloadedWindowsInstaller): Promise<InstallerLaunchResult> {
  let verified = false;
  try {
    if (!path.isAbsolute(installer.file) || path.extname(installer.file).toLowerCase() !== '.exe' || !installer.sha512) {
      throw new Error('The downloaded installer metadata is incomplete. Check for updates again.');
    }
    if (!(await stat(installer.file)).isFile()) throw new Error('The downloaded installer is missing. Check for updates again.');
    const hash = createHash('sha512');
    for await (const chunk of createReadStream(installer.file)) hash.update(chunk);
    if (hash.digest('base64') !== installer.sha512) throw new Error('The downloaded installer failed verification. Download the update again.');
    verified = true;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(installer.file, ['--updated', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: false });
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(); });
    });
    return { success: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown installer error';
    return { success: false, installerReady: verified, error: verified
      ? `Windows could not start the update installer. Nafid is still open and your download is saved. Retry installation or contact support. (${detail})`
      : detail };
  }
}
