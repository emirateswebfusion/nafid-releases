/** Combine both native Mac builds into one feed; never overwrite one architecture's latest-mac.yml with the other. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const builder = createRequire(require.resolve('electron-builder'));
const yaml = createRequire(builder.resolve('app-builder-lib'))('js-yaml');
const input = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const version = require('../package.json').version;
const files = [];
const reports = [];
let releaseDate;
for (const arch of ['arm64', 'x64']) {
  const directory = path.join(input, `macos-build-${arch}`);
  const report = JSON.parse(fs.readFileSync(path.join(directory, 'verification/mac-release.json'), 'utf8'));
  assert.equal(report.version, version); assert.equal(report.arch, arch); assert.ok(!report.error);
  assert.ok(report.checks.finalDmg && report.checks.publicConfiguration && report.checks.nativeSqliteSerialportAndRenderer && report.checks.packagedAppStartup && report.checks.signatureStructure);
  reports.push(report);
  const metadata = yaml.load(fs.readFileSync(path.join(directory, 'latest-mac.yml'), 'utf8'));
  assert.equal(metadata.version, version);
  releaseDate = releaseDate || metadata.releaseDate;
  for (const file of metadata.files) {
    assert.ok(typeof file.url === 'string' && file.url === path.basename(file.url) && file.url.includes(`-mac-${arch}.`));
    const binary = path.join(directory, file.url);
    assert.equal(crypto.createHash('sha512').update(fs.readFileSync(binary)).digest('base64'), file.sha512);
    assert.equal(fs.statSync(binary).size, file.size);
    files.push(file);
  }
  assert.ok(metadata.files.some(file => file.url.endsWith('.zip')));
}
assert.equal(new Set(files.map(file => file.url)).size, files.length);
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'latest-mac.yml'), yaml.dump({ version, files, path: files[0].url, sha512: files[0].sha512, releaseDate }));
fs.writeFileSync(path.join(output, 'mac-release-verification.json'), JSON.stringify({ version, productionReady: reports.every(report => report.notarized), architectures: reports }, null, 2));
console.log(`Validated ${files.length} Mac update files; notarized production readiness: ${reports.every(report => report.notarized)}`);
