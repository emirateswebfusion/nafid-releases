const path = require('node:path');
const { spawnSync } = require('node:child_process');
if (process.platform !== 'darwin') throw new Error('Build Mac installers on macOS or use the macOS installer workflow.');
const arch = process.argv[2] || process.arch;
if (!['arm64', 'x64'].includes(arch) || arch !== process.arch) throw new Error('Use a matching native Mac runner for the requested architecture.');
const root = path.resolve(__dirname, '..');
const version = require('electron/package.json').version;
for (const args of [
  [path.join(root, 'node_modules/electron/install.js')],
  [path.join(root, 'node_modules/@electron/rebuild/lib/cli.js'), '--force', '--only', 'better-sqlite3,@serialport/bindings-cpp', '--version', version, '--arch', arch],
]) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
