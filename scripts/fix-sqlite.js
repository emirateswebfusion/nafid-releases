/**
 * Downloads the Electron-specific prebuilt binary for better-sqlite3
 * and installs it into the pnpm module path.
 * Target: Electron 42.4.1 → ABI/module version 146
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ASSET_NAME = 'better-sqlite3-v12.11.1-electron-v146-win32-x64.tar.gz';
const DOWNLOAD_URL = `https://github.com/WiseLibs/better-sqlite3/releases/download/v12.11.1/${ASSET_NAME}`;

const SQLITE_PNPM = path.join(__dirname, '..', 'node_modules', '.pnpm',
  'better-sqlite3@12.11.1', 'node_modules', 'better-sqlite3');
const SQLITE_DIRECT = path.join(__dirname, '..', 'node_modules', 'better-sqlite3');

const RELEASE_DIR_PNPM = path.join(SQLITE_PNPM, 'build', 'Release');
const RELEASE_DIR_DIRECT = path.join(SQLITE_DIRECT, 'build', 'Release');

const TMP = path.join(require('os').tmpdir(), ASSET_NAME);

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    function get(targetUrl) {
      https.get(targetUrl, { headers: { 'User-Agent': 'node' } }, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) {
          file.close();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve());
        });
      }).on('error', err => {
        file.close();
        reject(err);
      });
    }
    get(url);
  });
}

function extractTarGz(tarGzPath, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  execSync(`tar -xzf "${tarGzPath}" -C "${outDir}"`, { stdio: 'pipe' });
}

async function main() {
  console.log('📦 Downloading better-sqlite3 Electron v146 (win32-x64) prebuilt binary...');
  console.log(`   URL: ${DOWNLOAD_URL}`);
  
  await download(DOWNLOAD_URL, TMP);
  console.log(`✅ Downloaded to ${TMP}`);

  const extractDir = path.join(require('os').tmpdir(), 'bsqlite3-extract');
  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });

  extractTarGz(TMP, extractDir);
  console.log('✅ Extracted archive');

  // Find the .node file
  function findNode(dir) {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) {
        const found = findNode(full);
        if (found) return found;
      } else if (f.endsWith('.node')) {
        return full;
      }
    }
    return null;
  }

  const nodeFile = findNode(extractDir);
  if (!nodeFile) throw new Error('Could not find .node file in extracted archive');
  console.log(`✅ Found binary: ${nodeFile}`);

  function copyWithRetry(src, dest, retries = 5, delay = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        fs.copyFileSync(src, dest);
        return true;
      } catch (e) {
        if (i === retries - 1) throw e;
        console.warn(`⚠️  Copy failed (attempt ${i + 1}/${retries}): ${e.message}. Retrying in ${delay}ms...`);
        const start = Date.now();
        while (Date.now() - start < delay) {}
      }
    }
    return false;
  }

  // Install into pnpm path
  if (fs.existsSync(RELEASE_DIR_PNPM)) {
    fs.mkdirSync(RELEASE_DIR_PNPM, { recursive: true });
    const dest = path.join(RELEASE_DIR_PNPM, 'better_sqlite3.node');
    copyWithRetry(nodeFile, dest);
    console.log(`✅ Installed to pnpm path: ${dest}`);
  } else {
    console.warn(`⚠️  pnpm path not found: ${RELEASE_DIR_PNPM}`);
  }

  // Install into direct node_modules path if it exists  
  if (fs.existsSync(RELEASE_DIR_DIRECT)) {
    fs.mkdirSync(RELEASE_DIR_DIRECT, { recursive: true });
    const dest = path.join(RELEASE_DIR_DIRECT, 'better_sqlite3.node');
    copyWithRetry(nodeFile, dest);
    console.log(`✅ Installed to direct path: ${dest}`);
  }

  // Cleanup
  try {
    if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
  } catch (e) {
    // ignore cleanup errors
  }

  console.log('\n🎉 better-sqlite3 Electron binary installed successfully!');
  console.log('   Module version: 146 (Electron 42.4.1)');
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
