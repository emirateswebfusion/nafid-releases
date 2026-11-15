/** Final-artifact acceptance test. Runs ONLY in a disposable GitHub Windows runner. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Never run installed-upgrade tests on a shop computer');
assert.equal(process.env.RUNNER_OS, 'Windows');
const release = path.resolve(process.argv[2] || 'release');
const baseline = path.resolve(process.argv[3]);
const version = require('../../package.json').version;
const exe = `Nafid-Setup-${version}.exe`;
const evidence = path.join(release, 'verification');
fs.mkdirSync(evidence, { recursive: true });
const report = { version, source: process.env.GITHUB_SHA, checks: {}, timings: {}, requests: [] };
if (process.env.DIAGNOSTIC_ARTIFACT_RUN) report.diagnosticArtifactRun = process.env.DIAGNOSTIC_ARTIFACT_RUN;
const userData = path.join(process.env.APPDATA, 'Nafid');
assert.ok(!fs.existsSync(userData), 'Runner profile must have no existing Nafid data');
const install = path.join(os.tmpdir(), 'nafid-installed-upgrade');
const installedExe = path.join(install, 'Nafid.exe');
const logFile = path.join(userData, 'logs/main.log');
const marker = path.join(userData, 'upgrade-preservation-sentinel.txt');
const log = () => fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
const hash = (file, algorithm = 'sha256', encoding = 'hex') => crypto.createHash(algorithm).update(fs.readFileSync(file)).digest(encoding);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, label, timeout = 150000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await read(); if (value) return value; await delay(250); }
  throw new Error(`Timed out: ${label}`);
}
function command(file, args, env = process.env) {
  const result = spawnSync(file, args, { encoding: 'utf8', timeout: 180000, env, windowsHide: true });
  if (result.status !== 0) throw new Error(`${path.basename(file)} failed (${result.status}): ${result.error || result.stderr || result.stdout}`);
  return result.stdout;
}

class Inspector {
  constructor(ws) {
    this.ws = ws; this.next = 1; this.pending = new Map();
    ws.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      if (!data.id) return;
      const pending = this.pending.get(data.id); this.pending.delete(data.id);
      if (pending) { clearTimeout(pending.timer); data.error ? pending.reject(new Error(data.error.message)) : pending.resolve(data.result); }
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.next++;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Inspector timeout: ${method}`)); }, 150000);
      this.pending.set(id, { resolve, reject, timer }); this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async renderer(expression) {
    assert.ok(this.rendererClient, 'Renderer debugger must be connected');
    return this.rendererClient.evaluate(expression);
  }
  closeMain() { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Inspector closed')); } this.pending.clear(); this.ws.close(); }
  close() { this.closeMain(); if (this.rendererClient) this.rendererClient.closeMain(); }
}
async function openInstalled() {
  const child = spawn(installedExe, ['--inspect=127.0.0.1:9238', '--remote-debugging-port=9228'], { stdio: 'ignore', windowsHide: false });
  child.on('error', error => console.error(error));
  const target = await until(async () => { try { return (await (await fetch('http://127.0.0.1:9238/json/list')).json())[0]; } catch { return false; } }, 'main inspector');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  const cdp = new Inspector(ws);
  await until(async () => { try { return await cdp.evaluate("process.mainModule.require('electron').BrowserWindow.getAllWindows().some(w=>w.isVisible() && !w.webContents.isLoading())"); } catch { return false; } }, 'visible installed app');
  const page = await until(async () => { try { return (await (await fetch('http://127.0.0.1:9228/json/list')).json()).find(item => item.type === 'page'); } catch { return false; } }, 'renderer debugger');
  const rendererWs = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { rendererWs.addEventListener('open', resolve, { once: true }); rendererWs.addEventListener('error', reject, { once: true }); });
  cdp.rendererClient = new Inspector(rendererWs);
  return { child, cdp };
}
async function closeInstalled(cdp) {
  // Schedule quit so the debugger can return before the process goes away.
  await cdp.evaluate("setTimeout(()=>process.mainModule.require('electron').app.quit(),100); true");
  cdp.close();
  await until(() => {
    const result = spawnSync('pwsh.exe', ['-NoProfile', '-Command', '(Get-Process Nafid -ErrorAction SilentlyContinue).Count'], { encoding: 'utf8', windowsHide: true });
    return Number(result.stdout.trim()) === 0;
  }, 'installed app exit');
}
async function waitInstalledReady(label, offset, started) {
  await until(() => log().slice(offset).includes('[Startup] Visible renderer ready; installer notified.'), `${label}: visible renderer acknowledgment`);
  report.timings[label] = Date.now() - started;
  assert.ok(log().slice(offset).includes(`[Main] App version: ${version}`));
  assert.equal(fs.readFileSync(marker, 'utf8'), 'preserve-me');
  // The acknowledgment occurs only after a visible main window and two renderer frames.
  await until(() => {
    const result = spawnSync('pwsh.exe', ['-NoProfile', '-Command', `(Get-Process -ErrorAction SilentlyContinue | Where-Object {$_.ProcessName -like 'Nafid-Setup-*'}).Count`], { encoding: 'utf8', windowsHide: true });
    return Number(result.stdout.trim()) === 0;
  }, `${label}: installer exits after acknowledgment`);
  report.checks[label] = true;
}

let server;
let diagnosticCdp;
(async () => {
  // Extract the final EXE, rather than trusting only win-unpacked.
  const extracted = path.join(evidence, 'extracted');
  command('7z', ['x', '-y', path.join(release, exe), `-o${extracted}`]);
  const payloadDir = path.join(extracted, '$PLUGINSDIR');
  const payload = fs.readdirSync(payloadDir).find(file => /^app-.*\.7z$/.test(file));
  assert.ok(payload, 'Installer payload exists');
  const unpack = path.join(evidence, 'payload');
  command('7z', ['x', '-y', path.join(payloadDir, payload), `-o${unpack}`]);
  for (const file of ['app.asar', 'app.env', 'app-update.yml', 'app.asar.unpacked/dist-electron/services/windowsInstallerWorker.js', 'app.asar.unpacked/dist-electron/services/windowsUpdateInstaller.js', 'app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node']) {
    assert.equal(hash(path.join(unpack, 'resources', file)), hash(path.join(release, 'win-unpacked/resources', file)), `Final EXE matches unpacked ${file}`);
  }
  const runtime = Object.fromEntries(fs.readFileSync(path.join(unpack, 'resources/app.env'), 'utf8').trim().split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
  const { RUNTIME_ENV_KEYS, validateProductionCloudEnv } = require('../../scripts/runtime-env.cjs');
  // Validate against the canonical allow-list without exposing runtime values or credentials.
  for (const key of Object.keys(runtime)) assert.ok(RUNTIME_ENV_KEYS.includes(key), `Allowed runtime key ${key}`);
  for (const key of ['VITE_CLOUD_API', 'VENDORA_CLOUD_API']) { const url = new URL(runtime[key]); assert.equal(url.protocol, 'https:'); assert.ok(!/localhost|example|127\.0\.0\.1/.test(url.hostname)); }
  assert.equal(runtime.VITE_CLOUD_API, runtime.VENDORA_CLOUD_API);
  validateProductionCloudEnv(runtime);
  assert.equal(runtime.UPDATES_REPO_URL, 'https://github.com/emirateswebfusion/nafid-releases');
  const updater = fs.readFileSync(path.join(unpack, 'resources/app-update.yml'), 'utf8');
  assert.match(updater, /owner: emirateswebfusion/); assert.match(updater, /repo: nafid-releases/); assert.doesNotMatch(updater, /token:/i);
  const latest = fs.readFileSync(path.join(release, 'latest.yml'), 'utf8');
  assert.ok(latest.includes(`version: ${version}`)); assert.ok(latest.includes(exe)); assert.ok(latest.includes(hash(path.join(release, exe), 'sha512', 'base64')));
  report.sha256 = hash(path.join(release, exe)); report.checks.finalArtifact = true;
  const nativeScript = path.join(evidence, 'native.cjs');
  fs.writeFileSync(nativeScript, `const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'); const p=${JSON.stringify(path.join(unpack, 'resources'))}; const Database=require(p+'/app.asar/node_modules/better-sqlite3'); const db=new Database(':memory:');assert.equal(db.prepare('SELECT 42 AS result').get().result,42);db.close();assert.equal(require(p+'/app.asar/package.json').version,${JSON.stringify(version)});const assets=p+'/app.asar/dist/assets';assert.ok(fs.readdirSync(assets).filter(f=>f.endsWith('.js')).some(f=>fs.readFileSync(path.join(assets,f),'utf8').includes(${JSON.stringify(runtime.VITE_CLOUD_API)})),'Renderer must contain the approved production backend');console.log('packaged-native-version-and-endpoint-ok');`);
  command(path.join(unpack, 'Nafid.exe'), [nativeScript], { ...process.env, ELECTRON_RUN_AS_NODE: '1' });
  report.checks.packagedNative = true;
  report.signature = command('pwsh.exe', ['-NoProfile', '-Command', `(Get-AuthenticodeSignature -LiteralPath '${path.join(release, exe).replaceAll("'", "''")}').Status`]).trim();

  // Genuine installed v2.2.41 -> candidate, using a local generic feed with the exact final assets.
  assert.equal(hash(baseline), 'b69f0b4633d4e2cd30369f12ceb9d849270e88f5f67112b1bdee2e5f46d63c84');
  command(baseline, ['/S', `/D=${install}`]);
  let { cdp } = await openInstalled();
  assert.equal(await cdp.evaluate("process.mainModule.require('electron').app.getVersion()"), '2.2.41');
  fs.writeFileSync(marker, 'preserve-me');
  await cdp.renderer("window.electronAPI.settingsSet({tenant_id:'upgrade-test',key:'upgrade-sentinel',value:'preserve-db-setting'})");
  // Seed a purely local fixture session: no cloud account, credentials or network authentication.
  const offline = await cdp.renderer("window.electronAPI.authSaveOfflineSession({tenant_id:'upgrade-test',user_id:'upgrade-test-owner',role:'ADMIN',user_name:'Upgrade test',shop_name:'Disposable test shop',permissions:['*']})");
  assert.equal(offline.success, true);
  server = http.createServer((req, res) => {
    const file = path.basename(decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (![exe, `${exe}.blockmap`, 'latest.yml'].includes(file)) { res.writeHead(404); res.end(); return; }
    report.requests.push(file);
    const target = path.join(release, file); res.writeHead(200, { 'Content-Length': fs.statSync(target).size }); fs.createReadStream(target).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await cdp.evaluate(`process.mainModule.require('electron-updater').autoUpdater.setFeedURL({provider:'generic',url:'http://127.0.0.1:${server.address().port}/'}); true`);
  await cdp.evaluate("process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].reload(); true");
  await until(async () => { try { return await cdp.renderer("document.body.innerText.includes('Upgrade test')"); } catch { return false; } }, 'fixture session restored');
  await cdp.renderer("window.electronAPI.appCheckForUpdates()");
  await until(async () => /Update Ready/i.test(await cdp.renderer('document.body.innerText')), 'downloaded update banner');
  assert.ok(report.requests.includes('latest.yml') && report.requests.includes(exe));
  const offset = log().length; const started = Date.now();
  diagnosticCdp = cdp;
  await cdp.evaluate("(()=>{const req=process.mainModule.require.bind(process.mainModule);const p=req('node:fs/promises');const stat=p.stat;p.stat=async(...a)=>{console.log('[Acceptance] stat requested');const r=await stat(...a);console.log('[Acceptance] stat complete');return r;};const fs=req('node:fs');const read=fs.createReadStream;fs.createReadStream=(...a)=>{console.log('[Acceptance] read requested');const r=read(...a);for(const e of ['open','end','close','error'])r.once(e,()=>console.log('[Acceptance] read '+e));return r;};const cp=req('node:child_process');const spawn=cp.spawn;cp.spawn=(...a)=>{console.log('[Acceptance] spawn requested');const r=spawn(...a);console.log('[Acceptance] spawn returned');for(const e of ['spawn','error','exit'])r.once(e,()=>console.log('[Acceptance] child '+e));return r;};const m=req('./services/windowsUpdateInstaller.js');const launch=m.launchWindowsUpdate;m.launchWindowsUpdate=async(...a)=>{console.log('[Acceptance] baseline installer launch requested');const r=await launch(...a);console.log('[Acceptance] baseline installer result',r);return r;};return true;})()");
  // Drive the button through Chromium, without evaluating an async filesystem call under Node's inspector.
  cdp.closeMain();
  // Read the first painted frame in the same request, before the old process can exit.
  assert.match(await cdp.renderer("(async()=>{const b=[...document.querySelectorAll('button')].find(x=>/Update →/.test(x.textContent)); if(!b)throw Error('Update button missing'); b.click(); await new Promise(requestAnimationFrame); return document.body.innerText;})()"), /Preparing update/);
  let upgradeLabel = 'installedUpgrade';
  try {
    await until(() => log().slice(offset).includes('Windows accepted the installer; quitting for update.'), 'baseline installer accepted', 45000);
  } catch (error) {
    const trace = log().slice(offset);
    // Characterize the already-shipped legacy checksum stall. Never recover after a process was started.
    assert.ok(trace.includes('[Acceptance] read open') && !trace.includes('[Acceptance] spawn requested'), 'Only the known pre-spawn legacy checksum stall may use manual recovery');
    report.legacyAutoUpdate = { version: '2.2.41', result: 'checksum stream stalled before process creation', evidence: trace, recovery: 'Close Nafid normally and run the full installer once' };
    console.log('Legacy v2.2.41 checksum stall reproduced; validating documented full-installer recovery.');
    cdp.close(); diagnosticCdp = null;
    await closeWindowNormally();
    assert.ok(!log().slice(offset).includes('[Acceptance] spawn requested'), 'Legacy launcher must not have created a late installer');
    const recovery = spawn(path.join(release, exe), ['--updated', '--force-run', `/D=${install}`], { stdio: 'ignore', windowsHide: false });
    recovery.on('error', failure => console.error(failure));
    upgradeLabel = 'manualRecoveryUpgrade';
  }
  cdp.close();
  diagnosticCdp = null;
  await waitInstalledReady(upgradeLabel, offset, started);

  // Exercise the new worker and continuous installer handoff with the exact installed candidate.
  ({ cdp } = await openAfterClosingCandidate());
  assert.equal(await cdp.evaluate("process.mainModule.require('electron').app.getVersion()"), version);
  assert.equal(await cdp.renderer("window.electronAPI.settingsGet({tenant_id:'upgrade-test',key:'upgrade-sentinel'})"), 'preserve-db-setting');
  await until(async () => /Upgrade test/.test(await cdp.renderer('document.body.innerText')), 'candidate offline session restored');
  await cdp.evaluate(`process.mainModule.require('electron-updater').autoUpdater.setFeedURL({provider:'generic',url:'http://127.0.0.1:${server.address().port}/'}); true`);
  await until(async () => (await cdp.renderer('window.electronAPI.appCheckForUpdates()')).error !== 'Check already in progress', 'candidate automatic check complete');
  // A verified but non-executable fixture must fail safely in the actual packaged worker.
  await cdp.renderer("window.verificationSamples=[];window.electronAPI.onUpdateVerificationProgress(p=>window.verificationSamples.push(p.percent)); true");
  const rejected = path.join(os.tmpdir(), 'nafid-invalid-installer.exe');
  fs.writeFileSync(rejected, 'This is a deliberately invalid executable used only by the acceptance test.');
  await cdp.evaluate(`process.mainModule.require('electron-updater').autoUpdater.emit('update-downloaded',{version:${JSON.stringify(version)},downloadedFile:${JSON.stringify(rejected)},files:[{url:'nafid-invalid-installer.exe',sha512:${JSON.stringify(hash(rejected, 'sha512', 'base64'))}}]}); true`);
  await until(async () => /Update Ready/i.test(await cdp.renderer('document.body.innerText')), 'failure fixture ready');
  await cdp.renderer("[...document.querySelectorAll('button')].find(x=>/Update →/.test(x.textContent)).click(); true");
  await until(async () => /Retry installation/i.test(await cdp.renderer('document.body.innerText')), 'failed launch preserves retry');
  assert.match(await cdp.renderer("document.querySelector('[role=alert]').textContent"), /update is already downloaded/i);
  assert.equal(await cdp.evaluate("process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].isVisible()"), true);
  const measured = await cdp.renderer('window.verificationSamples');
  assert.ok(measured.length > 0 && measured.includes(100));
  assert.ok(measured.every(value => Number.isFinite(value) && value >= 0 && value <= 100));
  report.checks.measuredVerificationEvents = true;
  report.checks.failedLaunchRetainsAppAndDownload = true;
  const sha512 = hash(path.join(release, exe), 'sha512', 'base64');
  await cdp.evaluate(`process.mainModule.require('electron-updater').autoUpdater.emit('update-downloaded',{version:${JSON.stringify(version)},downloadedFile:${JSON.stringify(path.join(release, exe))},files:[{url:${JSON.stringify(exe)},sha512:${JSON.stringify(sha512)}}]}); true`);
  await until(async () => /Update Ready/i.test(await cdp.renderer('document.body.innerText')), 'candidate update ready');
  const nextOffset = log().length; const nextStarted = Date.now();
  assert.match(await cdp.renderer("(async()=>{const b=[...document.querySelectorAll('button')].find(x=>/Update →|Retry installation/.test(x.textContent));b.click();b.click();await new Promise(requestAnimationFrame);return document.body.innerText;})()"), /Preparing update/);
  cdp.close();
  await waitInstalledReady('candidateWorkerHandoff', nextOffset, nextStarted);
  assert.equal((log().slice(nextOffset).match(/Windows accepted the installer; quitting for update/g) || []).length, 1);
  ({ cdp } = await openAfterClosingCandidate());
  assert.equal(await cdp.renderer("window.electronAPI.settingsGet({tenant_id:'upgrade-test',key:'upgrade-sentinel'})"), 'preserve-db-setting');
  await closeInstalled(cdp);
  report.checks.dataPreserved = true;
  console.log(JSON.stringify(report, null, 2));
})().catch(async error => {
  report.error = error.stack; console.error(error); process.exitCode = 1;
  if (diagnosticCdp) {
    try { report.rendererAtFailure = await Promise.race([diagnosticCdp.renderer('document.body.innerText'), delay(5000).then(() => 'renderer diagnostic timed out')]); } catch (detail) { report.rendererAtFailure = String(detail); }
    diagnosticCdp.close();
  }
  try { report.processesAtFailure = command('pwsh.exe', ['-NoProfile', '-Command', "Get-Process | Where-Object {$_.ProcessName -like '*Nafid*'} | Select-Object ProcessName,Id,MainWindowTitle | ConvertTo-Json -Compress"]); } catch { /* Original failure retained. */ }
  report.mainLogTail = log().slice(-6000);
  console.error(JSON.stringify(report, null, 2));
}).finally(() => {
  if (server) server.close(); fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  if (fs.existsSync(logFile)) fs.copyFileSync(logFile, path.join(evidence, 'main.log'));
  process.exit(process.exitCode || 0);
});

async function openAfterClosingCandidate() {
  await closeWindowNormally();
  return openInstalled();
}
async function closeWindowNormally() {
  // The automatically relaunched candidate has no debugger. Close its main window normally, then reopen it.
  // The guarded disposable runner owns every Nafid process; avoid short-path/long-path mismatches.
  command('pwsh.exe', ['-NoProfile', '-Command', 'Get-Process Nafid -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowHandle -ne 0} | ForEach-Object {$_.CloseMainWindow() | Out-Null}']);
  await until(() => {
    const result = spawnSync('pwsh.exe', ['-NoProfile', '-Command', '(Get-Process Nafid -ErrorAction SilentlyContinue).Count'], { encoding: 'utf8', windowsHide: true });
    return Number(result.stdout.trim()) === 0;
  }, 'candidate closes normally');
}
