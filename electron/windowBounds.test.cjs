const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  boundsForLaunch,
  keepSizeOnScreen,
  readWindowState,
  stateFromWindow,
  windowStatePath,
  writeWindowState,
} = require('./windowBounds.cjs');

test('window bounds round-trip in the user data file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-bounds-'));
  const file = windowStatePath(dir);
  writeWindowState(fs, file, { x: 40, y: 80, width: 1440, height: 900, maximized: false, minimized: false });
  assert.equal(path.basename(file), 'window-bounds.json');
  assert.deepEqual(readWindowState(fs, file), {
    x: 40,
    y: 80,
    width: 1440,
    height: 900,
    maximized: false,
    minimized: false,
  });
});

test('a maximized or minimized window remembers its restored size, not the default', () => {
  const maximized = stateFromWindow({
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    normalBounds: { x: 120, y: 60, width: 1100, height: 720 },
    maximized: true,
    minimized: false,
  });
  assert.equal(maximized.maximized, true);
  assert.equal(maximized.minimized, false);
  assert.equal(maximized.width, 1100);
  assert.equal(maximized.height, 720);
  assert.equal(maximized.x, 120);

  const minimized = stateFromWindow({
    bounds: { x: 10, y: 10, width: 1280, height: 860 },
    normalBounds: { x: 200, y: 100, width: 1000, height: 700 },
    maximized: false,
    minimized: true,
  });
  assert.equal(minimized.minimized, true);
  assert.equal(minimized.width, 1000);
  assert.equal(minimized.height, 700);
});

test('an off-screen window is moved back without changing its size', () => {
  const saved = { x: -4000, y: -3000, width: 1500, height: 940, maximized: false, minimized: false };
  const displays = [{ x: 0, y: 0, width: 1440, height: 900 }];
  const placed = keepSizeOnScreen(saved, displays);
  assert.equal(placed.width, 1500);
  assert.equal(placed.height, 940);
  assert.equal(placed.x, 16);
  assert.equal(placed.y, 16);
  const launch = boundsForLaunch(saved, { width: 1280, height: 860 }, displays);
  assert.equal(launch.width, 1500);
  assert.equal(launch.height, 940);
  assert.notEqual(launch.width, 1280);
});

test('a missing bounds file is the only time the default size is used', () => {
  const launch = boundsForLaunch(null, { width: 1280, height: 860 }, []);
  assert.equal(launch.width, 1280);
  assert.equal(launch.height, 860);
  assert.equal(readWindowState(fs, path.join(os.tmpdir(), 'hm-no-such-bounds.json')), null);
});
