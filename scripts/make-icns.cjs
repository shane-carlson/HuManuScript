#!/usr/bin/env node
/** Build build/icon.icns from build/icon.png (macOS only; uses iconutil). */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

if (process.platform !== 'darwin') {
  console.error('make-icns requires macOS (iconutil). electron-builder can use build/icon.png otherwise.');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const src = path.join(root, 'build', 'icon.png');
const iconset = path.join(root, 'build', 'icon.iconset');
const icns = path.join(root, 'build', 'icon.icns');

const sizes = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png'],
];

fs.rmSync(iconset, { recursive: true, force: true });
fs.mkdirSync(iconset, { recursive: true });

for (const [px, name] of sizes) {
  const out = path.join(iconset, name);
  const r = spawnSync('sips', ['-z', String(px), String(px), src, '--out', out], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const r2 = spawnSync('iconutil', ['-c', 'icns', iconset, '-o', icns], { stdio: 'inherit' });
if (r2.status !== 0) process.exit(r2.status ?? 1);
console.log(`Wrote ${icns}`);
