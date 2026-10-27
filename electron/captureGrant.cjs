/**
 * Desktop permission for session pictures.
 *
 * "session" asks the first time a stream is opened and is not written to disk.
 * "permanent" reuses a saved camera allow and screen source, so later writing
 * sessions do not ask again. "off" denies the device.
 */

function mode(value) {
  return value === 'permanent' || value === 'session' ? value : 'off';
}

function normalizeCaptureGrant(value) {
  const record = value && typeof value === 'object' ? value : {};
  return { camera: mode(record.camera), screen: mode(record.screen) };
}

function emptyCaptureGrantFile() {
  return { camera: false, screenSourceId: '' };
}

function readStoredGrant(file) {
  const camera = Boolean(file && file.camera === true);
  const screenSourceId = file && typeof file.screenSourceId === 'string' ? file.screenSourceId : '';
  return { camera, screenSourceId };
}

/**
 * Keep a device the writer already allowed in this app run when they switch
 * that device to permanent. Session grants still clear the file.
 */
function promoteRememberedGrant(grant, file, memory) {
  const next = nextCaptureGrantFile(grant, file);
  const remembered = memory && typeof memory === 'object' ? memory : {};
  return {
    camera: next.camera || (grant.camera === 'permanent' && remembered.camera === true),
    screenSourceId:
      next.screenSourceId ||
      (grant.screen === 'permanent' && typeof remembered.screenSourceId === 'string' ? remembered.screenSourceId : ''),
  };
}

/** Drop remembered devices that are no longer permanent. */
function nextCaptureGrantFile(grant, file) {
  const stored = readStoredGrant(file);
  return {
    camera: grant.camera === 'permanent' ? stored.camera : false,
    screenSourceId: grant.screen === 'permanent' ? stored.screenSourceId : '',
  };
}

/** deny, allow without a dialog, or ask once for this stream. */
function decideCameraAccess(grant, file) {
  if (!grant || grant.camera === 'off') return 'deny';
  if (grant.camera === 'permanent' && file && file.camera === true) return 'allow';
  return 'ask';
}

function rememberCameraAllow(grant, file) {
  const stored = nextCaptureGrantFile(grant, file);
  if (grant.camera !== 'permanent') return stored;
  return { camera: true, screenSourceId: stored.screenSourceId };
}

/**
 * Reuse the remembered screen when this grant is permanent and that source
 * is still available. Otherwise ask. Session grants always ask for a new stream.
 */
function decideScreenSource(grant, file, sources) {
  if (!grant || grant.screen === 'off') return { action: 'deny' };
  const stored = readStoredGrant(file);
  if (grant.screen === 'permanent' && stored.screenSourceId) {
    const match = (Array.isArray(sources) ? sources : []).find((source) => source && source.id === stored.screenSourceId);
    if (match) return { action: 'reuse', source: match };
  }
  return { action: 'ask' };
}

function rememberScreenSource(grant, file, sourceId) {
  const stored = nextCaptureGrantFile(grant, file);
  if (grant.screen !== 'permanent' || typeof sourceId !== 'string' || !sourceId) return stored;
  return { camera: stored.camera, screenSourceId: sourceId };
}

module.exports = {
  decideCameraAccess,
  decideScreenSource,
  emptyCaptureGrantFile,
  nextCaptureGrantFile,
  normalizeCaptureGrant,
  promoteRememberedGrant,
  rememberCameraAllow,
  rememberScreenSource,
};
