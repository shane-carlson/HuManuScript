const assert = require('node:assert/strict');
const test = require('node:test');
const {
  decideCameraAccess,
  decideScreenSource,
  emptyCaptureGrantFile,
  nextCaptureGrantFile,
  normalizeCaptureGrant,
  promoteRememberedGrant,
  rememberCameraAllow,
  rememberScreenSource,
} = require('./captureGrant.cjs');

test('a capture grant is off unless it is session or permanent', () => {
  assert.deepEqual(normalizeCaptureGrant(null), { camera: 'off', screen: 'off' });
  assert.deepEqual(normalizeCaptureGrant({ camera: 'yes', screen: true }), { camera: 'off', screen: 'off' });
  assert.deepEqual(normalizeCaptureGrant({ camera: 'permanent', screen: 'session' }), {
    camera: 'permanent',
    screen: 'session',
  });
});

test('permanent camera is reused and a session grant is not saved', () => {
  const empty = emptyCaptureGrantFile();
  assert.equal(decideCameraAccess({ camera: 'off', screen: 'off' }, empty), 'deny');
  assert.equal(decideCameraAccess({ camera: 'session', screen: 'off' }, { camera: true, screenSourceId: 'screen:1' }), 'ask');
  assert.equal(decideCameraAccess({ camera: 'permanent', screen: 'off' }, empty), 'ask');
  assert.equal(decideCameraAccess({ camera: 'permanent', screen: 'off' }, { camera: true, screenSourceId: '' }), 'allow');

  const remembered = rememberCameraAllow({ camera: 'permanent', screen: 'permanent' }, empty);
  assert.deepEqual(remembered, { camera: true, screenSourceId: '' });
  const forgotten = nextCaptureGrantFile({ camera: 'session', screen: 'session' }, remembered);
  assert.deepEqual(forgotten, empty);
});

test('a permanent screen source is reused until it disappears', () => {
  const sources = [
    { id: 'screen:0:0', name: 'Desk' },
    { id: 'window:9:0', name: 'Notes' },
  ];
  const saved = { camera: true, screenSourceId: 'screen:0:0' };
  const reused = decideScreenSource({ camera: 'permanent', screen: 'permanent' }, saved, sources);
  assert.equal(reused.action, 'reuse');
  assert.equal(reused.source.id, 'screen:0:0');

  const missing = decideScreenSource({ camera: 'permanent', screen: 'permanent' }, saved, [{ id: 'screen:1:0' }]);
  assert.equal(missing.action, 'ask');

  const session = decideScreenSource({ camera: 'session', screen: 'session' }, saved, sources);
  assert.equal(session.action, 'ask');

  const off = decideScreenSource({ camera: 'permanent', screen: 'off' }, saved, sources);
  assert.equal(off.action, 'deny');

  const stored = rememberScreenSource({ camera: 'permanent', screen: 'permanent' }, { camera: true, screenSourceId: '' }, 'screen:0:0');
  assert.deepEqual(stored, saved);
  const dropped = rememberScreenSource({ camera: 'session', screen: 'session' }, stored, 'screen:0:0');
  assert.deepEqual(dropped, emptyCaptureGrantFile());

  const promoted = promoteRememberedGrant(
    { camera: 'permanent', screen: 'permanent' },
    emptyCaptureGrantFile(),
    { camera: true, screenSourceId: 'screen:0:0' },
  );
  assert.deepEqual(promoted, saved);
  const cleared = promoteRememberedGrant(
    { camera: 'session', screen: 'session' },
    saved,
    { camera: true, screenSourceId: 'screen:0:0' },
  );
  assert.deepEqual(cleared, emptyCaptureGrantFile());
});
