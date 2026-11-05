import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const version: string = require('../../package.json').version;
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nafid-mac-metadata-'));
  directories.push(directory);
  for (const arch of ['arm64', 'x64']) {
    const folder = path.join(directory, `macos-build-${arch}`);
    fs.mkdirSync(path.join(folder, 'verification'), { recursive: true });
    const assets = ['dmg', 'zip'].map(extension => {
      const name = `Nafid-${version}-mac-${arch}.${extension}`;
      const bytes = Buffer.from(`${arch} ${extension}`);
      fs.writeFileSync(path.join(folder, name), bytes);
      return { name, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), sha512: crypto.createHash('sha512').update(bytes).digest('base64') };
    });
    const checks = { finalDmg: true, publicConfiguration: true, nativeSqliteSerialportAndRenderer: true, packagedAppStartup: true, signatureStructure: true };
    fs.writeFileSync(path.join(folder, 'verification/mac-release.json'), JSON.stringify({ arch, version, source: 'a'.repeat(40), checks, assets, notarized: false }));
    fs.writeFileSync(path.join(folder, 'latest-mac.yml'), JSON.stringify({ version, releaseDate: '2026-11-05', files: assets.map(asset => ({ url: asset.name, size: asset.size, sha512: asset.sha512 })) }));
  }
  return directory;
}
const merge = (directory: string) => spawnSync(process.execPath, ['scripts/merge-macos-metadata.cjs', directory, path.join(directory, 'combined')], { encoding: 'utf8' });
it('combines both architectures without claiming ad-hoc builds are production ready', () => {
  const directory = fixture();
  expect(merge(directory).status).toBe(0);
  const report = JSON.parse(fs.readFileSync(path.join(directory, 'combined/mac-release-verification.json'), 'utf8')) as { productionReady: boolean; architectures: unknown[] };
  expect(report.productionReady).toBe(false);
  expect(report.architectures).toHaveLength(2);
});
it('rejects architectures built from different source commits', () => {
  const directory = fixture();
  const file = path.join(directory, 'macos-build-x64/verification/mac-release.json');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('a'.repeat(40), 'b'.repeat(40)));
  expect(merge(directory).status).not.toBe(0);
});
it('rejects a modified final DMG even if the updater ZIP remains valid', () => {
  const directory = fixture();
  fs.appendFileSync(path.join(directory, `macos-build-arm64/Nafid-${version}-mac-arm64.dmg`), 'modified');
  expect(merge(directory).status).not.toBe(0);
});
