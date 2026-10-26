import assert from 'node:assert/strict';
import test from 'node:test';
import { windowsPathFromFileUrlPathname } from './harperWindowsPath.ts';

test('a Windows file URL pathname keeps a single drive letter', () => {
  assert.equal(
    windowsPathFromFileUrlPathname('/D:/a/HuManuScript/HuManuScript/node_modules/harper.js/dist/harper_wasm_bg.wasm'),
    'D:\\a\\HuManuScript\\HuManuScript\\node_modules\\harper.js\\dist\\harper_wasm_bg.wasm',
  );
  assert.equal(windowsPathFromFileUrlPathname('/usr/lib/harper.wasm'), null);
  assert.equal(windowsPathFromFileUrlPathname('D:\\a\\harper.wasm'), null);
});
