/** Run only on disposable macOS CI profiles; never against a shop installation. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.platform, 'darwin');
const release = path.resolve(process.argv[2]);
const arch = process.argv[3];
assert.equal(process.arch, arch, 'Use a native runner for each Mac architecture');
const version = require('../../package.json').version;
const signed = process.env.MAC_SIGNED_RELEASE === 'true';
const bundle = path.join(release, arch === 'arm64' ? 'mac-arm64' : 'mac', 'Nafid.app');
const resources = path.join(bundle, 'Contents/Resources');
const binary = path.join(bundle, 'Contents/MacOS/Nafid');
const evidence = path.join(release, 'verification');
fs.mkdirSync(evidence, { recursive: true });
const report = { version, arch, source: process.env.GITHUB_SHA, checks: {}, notarized: false, signing: signed ? 'Developer ID required' : 'ad-hoc test build', assets: [] };
const userData = path.join(os.homedir(), 'Library/Application Support/Nafid');
assert.ok(!fs.existsSync(userData), 'Disposable runner must have no existing Nafid data');
const hash = (file, algorithm = 'sha256', encoding = 'hex') => crypto.createHash(algorithm).update(fs.readFileSync(file)).digest(encoding);
function command(file, args, env = process.env) {
  const result = spawnSync(file, args, { env, encoding: 'utf8', timeout: 120000 });
  if (result.status !== 0) throw new Error(`${path.basename(file)} failed: ${result.error || result.stderr || result.stdout}`);
  return result.stdout;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, timeout = 90000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (check()) return; await sleep(250); }
  throw new Error(`Timed out: ${label}`);
}
let child;
let mount;
(async () => {
  const dmg = path.join(release, `Nafid-${version}-mac-${arch}.dmg`);
  const zip = path.join(release, `Nafid-${version}-mac-${arch}.zip`);
  for (const file of [dmg, zip]) {
    assert.ok(fs.statSync(file).size > 0);
    report.assets.push({ name: path.basename(file), size: fs.statSync(file).size, sha256: hash(file), sha512: hash(file, 'sha512', 'base64') });
  }
  const metadata = fs.readFileSync(path.join(release, 'latest-mac.yml'), 'utf8');
  assert.ok(metadata.includes(`version: ${version}`));
  assert.ok(metadata.includes(path.basename(zip)) && metadata.includes(hash(zip, 'sha512', 'base64')));
  command('hdiutil', ['verify', dmg]);
  mount = fs.mkdtempSync(path.join(os.tmpdir(), 'nafid-dmg-'));
  command('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, dmg]);
  const mounted = path.join(mount, 'Nafid.app/Contents/Resources');
  for (const file of ['app.asar', 'app.env', 'app-update.yml']) assert.equal(hash(path.join(mounted, file)), hash(path.join(resources, file)), `DMG payload matches ${file}`);
  command('hdiutil', ['detach', mount]); mount = null;
  report.checks.finalDmg = true;
  const { RUNTIME_ENV_KEYS, validateProductionCloudEnv } = require('../../scripts/runtime-env.cjs');
  const env = Object.fromEntries(fs.readFileSync(path.join(resources, 'app.env'), 'utf8').trim().split(/\r?\n/).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
  for (const key of Object.keys(env)) assert.ok(RUNTIME_ENV_KEYS.includes(key));
  for (const key of ['VITE_CLOUD_API', 'VENDORA_CLOUD_API']) { const url = new URL(env[key]); assert.equal(url.protocol, 'https:'); assert.ok(!/localhost|example|127\.0\.0\.1/.test(url.hostname)); }
  assert.equal(env.VITE_CLOUD_API, env.VENDORA_CLOUD_API);
  validateProductionCloudEnv(env);
  assert.equal(env.UPDATES_REPO_URL, 'https://github.com/emirateswebfusion/nafid-releases');
  assert.match(fs.readFileSync(path.join(resources, 'app-update.yml'), 'utf8'), /repo: nafid-releases/);
  report.checks.publicConfiguration = true;
  const smoke = path.join(evidence, 'native.cjs');
  fs.writeFileSync(smoke, `const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const p=${JSON.stringify(resources)};const Database=require(p+'/app.asar/node_modules/better-sqlite3');const db=new Database(':memory:');assert.equal(db.prepare('SELECT 42 AS result').get().result,42);db.close();assert.equal(typeof require(p+'/app.asar/node_modules/serialport').SerialPort,'function');assert.equal(require(p+'/app.asar/package.json').version,${JSON.stringify(version)});const a=p+'/app.asar/dist/assets';assert.ok(fs.readdirSync(a).filter(f=>f.endsWith('.js')).some(f=>fs.readFileSync(path.join(a,f),'utf8').includes(${JSON.stringify(env.VITE_CLOUD_API)})));`);
  command(binary, [smoke], { ...process.env, ELECTRON_RUN_AS_NODE: '1' });
  report.checks.nativeSqliteSerialportAndRenderer = true;
  command('codesign', ['--verify', '--deep', '--strict', bundle]);
  report.checks.signatureStructure = true;
  if (signed) {
    command('xcrun', ['stapler', 'validate', bundle]);
    command('spctl', ['--assess', '--type', 'execute', '--verbose=2', bundle]);
    command('xcrun', ['stapler', 'validate', dmg]);
    report.notarized = true;
  }
  const ready = path.join(userData, `nafid-update-${process.pid}.ready`);
  const started = Date.now();
  const launchEnv = { ...process.env }; delete launchEnv.ELECTRON_RUN_AS_NODE;
  child = spawn(binary, [`--nafid-update-ready=${process.pid}`], { stdio: 'ignore', env: launchEnv });
  child.on('error', error => console.error(error));
  await until(() => fs.existsSync(ready), 'visible initial app renderer');
  assert.equal(fs.readFileSync(ready, 'utf8'), version);
  report.checks.packagedAppStartup = true;
  report.startupMilliseconds = Date.now() - started;
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { report.error = error.stack; console.error(error); process.exitCode = 1; }).finally(async () => {
  if (child && child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(10000)]); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }
  if (mount) { try { command('hdiutil', ['detach', mount]); } catch { /* Preserve original failure. */ } }
  fs.writeFileSync(path.join(evidence, 'mac-release.json'), JSON.stringify(report, null, 2));
  const log = path.join(userData, 'logs/main.log');
  if (fs.existsSync(log)) fs.copyFileSync(log, path.join(evidence, 'main.log'));
});
