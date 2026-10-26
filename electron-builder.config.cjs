const fs = require('node:fs');
const path = require('node:path');
const { writeAppVersion } = require('./scripts/write-app-version.cjs');

const intel = process.env.HM_MAC_ARCH === 'x64';
const macArch = intel ? 'x64' : 'arm64';
const roundedPng = path.join(__dirname, 'build', 'icon.png');
const icns = path.join(__dirname, 'build', 'icon.icns');

// Same file the renderer reads. A numeric pack build rewrites 0.1.0 as 0.1.<build>.
const appVersion = writeAppVersion();
const releaseBuild = /^[0-9]+$/.test(appVersion.build);
const version = appVersion.version;
const artifactName = `HuManuScript-${version}-\${arch}.\${ext}`;
const dmgTitle = intel ? `HuManuScript ${version} Intel` : `HuManuScript ${version}`;

module.exports = {
  appId: 'net.humanuscript.app',
  productName: 'HuManuScript',
  copyright: 'Copyright © HuManuScript',
  asar: true,
  npmRebuild: false,
  electronLanguages: ['en'],
  // Packaged app version. package.json on disk stays at the 0.1.0 base.
  extraMetadata: {
    version,
  },
  // CFBundleVersion. Unset locally so electron-builder keeps the base version.
  buildVersion: releaseBuild ? version : undefined,
  directories: {
    output: 'release',
    buildResources: 'build',
  },
  files: [
    'package.json',
    'dist/**/*',
    'electron/**/*.cjs',
    'build/app-version.json',
    '!**/node_modules/**',
  ],
  extraResources: fs.existsSync(roundedPng)
    ? [{ from: 'build/icon.png', to: 'humanuscript-icon.png' }]
    : [],
  mac: {
    category: 'public.app-category.productivity',
    icon: fs.existsSync(icns) ? 'build/icon.icns' : 'build/icon.png',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.inherit.plist',
    minimumSystemVersion: '12.0',
    artifactName,
    // zip is what electron-updater installs; dmg is the disk image people open.
    target: [
      { target: 'dmg', arch: [macArch] },
      { target: 'zip', arch: [macArch] },
    ],
    // CFBundleShortVersionString / CFBundleVersion, same string as the in-app label.
    bundleShortVersion: version,
    bundleVersion: releaseBuild ? version : undefined,
    extendInfo: {
      CFBundleDisplayName: 'HuManuScript',
      CFBundleName: 'HuManuScript',
    },
  },
  dmg: {
    title: dmgTitle,
    artifactName,
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },
  // NSIS is the installer electron-updater installs on Windows (latest.yml).
  win: {
    icon: fs.existsSync(roundedPng) ? 'build/icon.png' : undefined,
    artifactName,
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'HuManuScript',
    artifactName,
  },
  // GitHub Releases feed (latest-mac.yml). Uploaded only when the pack publishes.
  publish: {
    provider: 'github',
    owner: 'shane-carlson',
    repo: 'HuManuScript',
    releaseType: 'release',
  },
};
