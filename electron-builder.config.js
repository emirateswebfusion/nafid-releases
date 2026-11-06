require('dotenv').config();
if (!process.env.GH_TOKEN) {
  require('dotenv').config({ path: '.env.production' });
}
// Preserve configured signing credentials. Windows may refuse unsigned installers.
// CI/build machines supply CSC_LINK / WIN_CSC_LINK or their configured signing provider.

// Point rcedit to the already-extracted winCodeSign cache so electron-builder
// never tries to re-download/re-extract the 7z (which fails on Windows without
// Developer Mode due to macOS symlinks inside the archive).
const os = require('os');
const path = require('path');
const rceditCache = path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign', '913682375');
const fs = require('fs');
if (fs.existsSync(rceditCache)) {
  process.env.ELECTRON_BUILDER_RCEDIT_PATH = rceditCache;
}


const { writeRuntimeEnv, validateProductionCloudEnv } = require('./scripts/runtime-env.cjs');

// Installers and update metadata are published to a PUBLIC releases-only repo (UPDATES_REPO_URL), so installed
// apps update without any token. GH_TOKEN stays on the build machine and is used only to upload the release.
// Release settings come from .env.production (never the dev .env, which points at localhost); a build machine
// without that file (CI) provides them as environment variables.
const productionEnvFile = path.join(__dirname, '.env.production');
const releaseEnv = fs.existsSync(productionEnvFile) ? require('dotenv').parse(fs.readFileSync(productionEnvFile)) : process.env;
const repoUrl = releaseEnv.UPDATES_REPO_URL || process.env.UPDATES_REPO_URL || '';
const runtimeEnvFile = path.join(__dirname, 'release', 'runtime', 'app.env');
validateProductionCloudEnv(releaseEnv);
writeRuntimeEnv(releaseEnv, runtimeEnvFile);

const legacyParts = (releaseEnv.LEGACY_PRIVATE_REPO_URL || process.env.LEGACY_PRIVATE_REPO_URL || '').replace(/^https?:\/\/[^\/]+\//, '').split('/');
const legacyPublish = legacyParts.length >= 2 && legacyParts[0] ? [{ provider: 'github', owner: legacyParts[0], repo: legacyParts[1], private: true, releaseType: 'release' }] : [];
let repository = {};

if (repoUrl) {
  const parts = repoUrl.replace(/^https?:\/\/[^\/]+\//, '').split('/');
  if (parts.length >= 2) {
    repository = {
      owner: parts[0],
      repo: parts[1]
    };
  }
}

/**
 * @type {import('electron-builder').Configuration}
 * @see https://www.electron.build/configuration/configuration
 */
module.exports = {
  appId: 'com.nafid',
  productName: 'Nafid',
  copyright: 'Copyright © 2026 Emirates WebFusion',
  npmRebuild: false,
  asarUnpack: ['dist-electron/services/windowsInstallerWorker.js', 'dist-electron/services/windowsUpdateInstaller.js'],
  directories: {
    output: 'release',
    buildResources: 'build'
  },
  files: [
    'dist',
    'dist-electron',
    'package.json'
  ],
  extraResources: [
    { from: runtimeEnvFile, to: 'app.env' }
  ],
  mac: {
    icon: 'build/icon.png',
    // CI builds natively on each architecture. ZIP is required by electron-updater on macOS.
    target: ['dmg', 'zip'],
    artifactName: '${productName}-${version}-mac-${arch}.${ext}',
    category: 'public.app-category.business',
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    hardenedRuntime: true,
    gatekeeperAssess: false
  },
  win: {
    icon: 'build/icon.ico',
    target: [
      {
        target: 'nsis',
        arch: ['x64']
      }
    ],
    artifactName: '${productName}-Setup-${version}.${ext}'
  },
  nsis: {
    oneClick: true,
    include: 'build/installer.nsh',
    perMachine: false,
    allowElevation: true,
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Nafid',
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
    installerHeaderIcon: 'build/icon.ico',
    runAfterFinish: true,
    installerLanguages: ['en'],
    license: 'build/license.txt',
    differentialPackage: true,
  },
  // First entry = the feed installed apps read (public, no token). LEGACY_PRIVATE_REPO_URL (optional, transition only)
  // also uploads the release to the old private repo so installs from before this change can still find it; remove
  // it once every terminal runs a version from the public feed.
  publish: repoUrl ? [
    {
      provider: 'github',
      owner: repository.owner,
      repo: repository.repo,
      private: false,
      releaseType: 'release'
    },
    // Skip the legacy entry when it names the same repo (publishing twice fails with 422 "already exists").
    ...legacyPublish.filter((p) => p.owner !== repository.owner || p.repo !== repository.repo)
  ] : null
};
