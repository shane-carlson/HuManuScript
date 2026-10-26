/**
 * Bundles electron-updater for the packaged Mac app.
 * The pack excludes node_modules, so the main process loads this one file.
 */
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const outfile = path.join(root, 'electron', 'autoUpdate.bundle.cjs');

esbuild.buildSync({
  entryPoints: [path.join(root, 'electron', 'autoUpdateRuntime.cjs')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron'],
  outfile,
  legalComments: 'none',
  logLevel: 'warning',
});

console.log(`Bundled auto-update to ${path.relative(root, outfile)}`);
