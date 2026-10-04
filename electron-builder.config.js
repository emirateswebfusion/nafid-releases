require('dotenv').config();
if (!process.env.GH_TOKEN) {
  require('dotenv').config({ path: '.env.production' });
}
process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
process.env.CSC_LINK = "";
process.env.WIN_CSC_LINK = "";

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


const repoUrl = process.env.GITHUB_REPO_URL || '';
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
  directories: {
    output: 'dist/release',
    buildResources: 'build'
  },
  files: [
    'dist',
    'dist-electron',
    'package.json'
  ],
  extraResources: [
    '.env.production'
  ],
  mac: {
    icon: 'build/icon.png',
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64']
      }
    ],
    artifactName: '${productName}-${version}-mac.${ext}',
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
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Nafid',
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
    installerHeaderIcon: 'build/icon.ico',
    runAfterFinish: true,
  },
  publish: repoUrl ? [
    {
      provider: 'github',
      owner: repository.owner,
      repo: repository.repo,
      private: true,
      releaseType: 'release'
    }
  ] : null
};
