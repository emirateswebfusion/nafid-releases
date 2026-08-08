require('dotenv').config();

const repoUrl = process.env.GITHUB_REPO_URL || '';
let repository = {};

if (repoUrl) {
  const parts = repoUrl.replace('https://github.com/', '').split('/');
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
  appId: 'com.vendora.pos',
  productName: 'Vendora',
  copyright: 'Copyright © 2026 Vendora',
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
