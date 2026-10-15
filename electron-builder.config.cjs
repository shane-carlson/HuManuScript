const fs = require('node:fs');
const path = require('node:path');

const intel = process.env.HM_MAC_ARCH === 'x64';
const macArch = intel ? 'x64' : 'arm64';
const roundedPng = path.join(__dirname, 'build', 'icon.png');
const icns = path.join(__dirname, 'build', 'icon.icns');

module.exports = {
  appId: 'net.humanuscript.app',
  productName: 'HuManuScript',
  copyright: 'Copyright © HuManuScript',
  asar: true,
  npmRebuild: false,
  electronLanguages: ['en'],
  directories: {
    output: 'release',
    buildResources: 'build',
  },
  files: ['package.json', 'dist/**/*', 'electron/**/*.cjs', '!**/node_modules/**'],
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
    artifactName: 'HuManuScript-${version}-${arch}.${ext}',
    target: [{ target: 'dmg', arch: [macArch] }],
    extendInfo: {
      CFBundleDisplayName: 'HuManuScript',
      CFBundleName: 'HuManuScript',
    },
  },
  dmg: {
    title: intel ? 'HuManuScript ${version} Intel' : 'HuManuScript ${version}',
    artifactName: 'HuManuScript-${version}-${arch}.${ext}',
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },
};
