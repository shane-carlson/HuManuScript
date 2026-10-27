import assert from 'node:assert/strict';
import { test } from 'node:test';
import { certificationExport, emptyDocument } from './document.ts';
import { TRUST_STATEMENT } from './certification.ts';
import { renderSessionCapturePdf } from './sessionCaptureExport.ts';
import {
  CAMERA_OVERLAY_MARGIN,
  CAPTURE_INTERVAL_MS,
  CAPTURE_PAGE,
  CAPTURES_PER_PAGE,
  COMPOSITE_MAX_HEIGHT,
  COMPOSITE_MAX_WIDTH,
  buildSessionCaptureSchema,
  cameraOverlayRect,
  captureDocumentHeader,
  captureGrantRequest,
  captureSessionComposite,
  cellsFromSchema,
  fitWithin,
  holdConsentedStream,
  nextIntervalDue,
  planCapturePages,
  readSessionCaptureSettings,
  sealsInWindow,
  sessionCaptureConfigured,
  type CaptureGridCell,
  type SealSource,
  type SealWindowMeta,
} from './sessionCapture.ts';

const START = '2026-10-27T12:00:00.000Z';

function session(lastAttemptAt = START) {
  return { startedAt: START, lastAttemptAt };
}

function seal(id: string, updatedAt: string, text = 'hidden passage'): SealSource & { text: string; evidence: string } {
  return {
    id,
    blockId: `block-${id}`,
    contentHash: `hash-${id}`,
    origin: 'keyboard',
    sealedAt: '2026-10-27T11:00:00.000Z',
    updatedAt,
    text,
    evidence: `UNIQUE_EVIDENCE_${id}`,
  };
}

function shot(partial: {
  id: string;
  kind?: 'composite' | 'camera' | 'screenshot';
  windowStart: string;
  windowEnd: string;
  reason?: 'start' | 'interval' | 'end';
}) {
  return {
    id: partial.id,
    sessionId: 'ses-1',
    at: partial.windowEnd,
    reason: partial.reason ?? 'interval',
    kind: partial.kind ?? 'composite',
    windowStart: partial.windowStart,
    windowEnd: partial.windowEnd,
    mime: 'image/jpeg' as const,
    width: 1280,
    height: 720,
    dataUrl: `data:image/jpeg;base64,${partial.id}`,
  };
}

function gridCell(id: string, seals: SealWindowMeta[] = []): CaptureGridCell {
  return {
    compositeId: id,
    reason: 'interval',
    at: START,
    windowStart: START,
    windowEnd: '2026-10-27T12:05:00.000Z',
    seals,
  };
}

test('session pictures stay off unless the setting is boolean true', () => {
  assert.deepEqual(readSessionCaptureSettings(null), { camera: false, screenshot: false, permission: 'session' });
  assert.deepEqual(readSessionCaptureSettings('not json'), { camera: false, screenshot: false, permission: 'session' });
  assert.deepEqual(readSessionCaptureSettings(JSON.stringify({ camera: 1, screenshot: 'yes', permission: 'always' })), {
    camera: false,
    screenshot: false,
    permission: 'session',
  });
  assert.equal(sessionCaptureConfigured({ camera: false, screenshot: false, permission: 'session' }), false);
  const on = readSessionCaptureSettings(JSON.stringify({ camera: true, screenshot: false, permission: 'permanent' }));
  assert.deepEqual(on, { camera: true, screenshot: false, permission: 'permanent' });
  assert.equal(sessionCaptureConfigured(on), true);
  assert.deepEqual(captureGrantRequest(on), { camera: 'permanent', screen: 'off' });
  assert.deepEqual(captureGrantRequest({ camera: true, screenshot: true, permission: 'session' }), {
    camera: 'session',
    screen: 'session',
  });
});

test('the composite stays within a moderate frame and puts the camera in the upper left', () => {
  assert.deepEqual(fitWithin(1920, 1080, COMPOSITE_MAX_WIDTH, COMPOSITE_MAX_HEIGHT), { width: 1280, height: 720 });
  assert.deepEqual(fitWithin(800, 600, COMPOSITE_MAX_WIDTH, COMPOSITE_MAX_HEIGHT), { width: 800, height: 600 });
  const overlay = cameraOverlayRect(1280, 720, 1920, 1080);
  assert.equal(overlay.x, CAMERA_OVERLAY_MARGIN);
  assert.equal(overlay.y, CAMERA_OVERLAY_MARGIN);
  assert.ok(overlay.width <= 240);
  assert.ok(overlay.height <= 135);
  assert.ok(overlay.x + overlay.width < 1280 / 2);
});

test('a capture attempt does not open a device when the setting is off', async () => {
  let opened = 0;
  const off = { camera: false, screenshot: false, permission: 'session' as const };
  const result = await captureSessionComposite(
    () => off,
    async () => {
      opened += 1;
      return null;
    },
  );
  assert.equal(result.image, null);
  assert.equal(opened, 0);

  const on = await captureSessionComposite(
    () => ({ camera: true, screenshot: true, permission: 'permanent' }),
    async () => ({ blob: new Blob(['x']), width: 1280, height: 720, mime: 'image/jpeg' }),
  );
  assert.equal(on.image?.width, 1280);
  assert.equal(opened, 0);
});

test('a granted stream is reused for later pictures and stopped if the setting flips off', async () => {
  let opened = 0;
  let stopped = 0;
  const skipped = await holdConsentedStream({
    allowed: () => false,
    current: null,
    open: async () => {
      opened += 1;
      return { getTracks: () => [{ stop() {} }] };
    },
  });
  assert.equal(skipped, null);
  assert.equal(opened, 0);

  let allowed = true;
  const dropped = await holdConsentedStream({
    allowed: () => allowed,
    current: null,
    open: async () => {
      allowed = false;
      return { getTracks: () => [{ stop() { stopped += 1; } }] };
    },
  });
  assert.equal(dropped, null);
  assert.equal(stopped, 1);

  const stream = { getTracks: () => [{ stop() {}, readyState: 'live' as const }] };
  let opens = 0;
  const first = await holdConsentedStream({
    allowed: () => true,
    current: null,
    open: async () => {
      opens += 1;
      return stream;
    },
  });
  const second = await holdConsentedStream({
    allowed: () => true,
    current: first,
    open: async () => {
      opens += 1;
      return { getTracks: () => [{ stop() {} }] };
    },
  });
  assert.equal(opens, 1);
  assert.equal(second, first);
});

test('interval captures are due every five minutes and not sooner', () => {
  const start = Date.parse(START);
  assert.equal(nextIntervalDue(session(), start + CAPTURE_INTERVAL_MS - 1), null);
  assert.equal(nextIntervalDue(session(), start + CAPTURE_INTERVAL_MS), new Date(start + CAPTURE_INTERVAL_MS).toISOString());
  const afterFirst = new Date(start + CAPTURE_INTERVAL_MS + 1500).toISOString();
  assert.equal(nextIntervalDue(session(afterFirst), start + CAPTURE_INTERVAL_MS * 2 - 1), null);
  assert.equal(
    nextIntervalDue(session(afterFirst), start + CAPTURE_INTERVAL_MS * 2),
    new Date(start + CAPTURE_INTERVAL_MS * 2).toISOString(),
  );
});

test('seal metadata for a window omits passage text and evidence', () => {
  const points = [
    seal('early', '2026-10-27T12:00:00.000Z', 'UNIQUE_PASSAGE_BEFORE'),
    seal('inside', '2026-10-27T12:04:00.000Z', 'UNIQUE_PASSAGE_INSIDE'),
    seal('late', '2026-10-27T12:06:00.000Z', 'UNIQUE_PASSAGE_AFTER'),
  ];
  const seals = sealsInWindow(points, START, '2026-10-27T12:05:00.000Z');
  assert.deepEqual(seals.map((item) => item.id), ['inside']);
  assert.equal('text' in seals[0]!, false);
  assert.equal('evidence' in seals[0]!, false);
  assert.equal(seals[0]!.contentHash, 'hash-inside');
});

test('the certification schema stores one composite and omits separate thumbnails', () => {
  const doc = emptyDocument('ms-1');
  assert.equal('sessionCaptures' in certificationExport(doc, START), false);

  const off = buildSessionCaptureSchema({
    settings: { camera: false, screenshot: false, permission: 'session' },
    manuscriptId: 'ms-1',
    sessions: [{ id: 'ses-1', manuscriptId: 'ms-1', startedAt: START, endedAt: null }],
    thumbnails: [shot({ id: 'pic', windowStart: START, windowEnd: '2026-10-27T12:05:00.000Z' })],
    points: [],
  });
  assert.equal(off, null);
  assert.equal('sessionCaptures' in certificationExport(doc, START, off), false);

  const on = buildSessionCaptureSchema({
    settings: { camera: true, screenshot: true, permission: 'permanent' },
    manuscriptId: 'ms-1',
    sessions: [{ id: 'ses-1', manuscriptId: 'ms-1', startedAt: START, endedAt: null }],
    thumbnails: [
      shot({ id: 'old-cam', kind: 'camera', windowStart: START, windowEnd: '2026-10-27T12:05:00.000Z' }),
      shot({ id: 'old-screen', kind: 'screenshot', windowStart: START, windowEnd: '2026-10-27T12:05:00.000Z' }),
      shot({ id: 'pic', windowStart: START, windowEnd: '2026-10-27T12:05:00.000Z' }),
    ],
    points: [seal('inside', '2026-10-27T12:04:00.000Z', 'UNIQUE_PASSAGE_INSIDE')],
  });
  assert.ok(on);
  assert.equal(on!.camera, true);
  assert.equal(on!.screenshot, true);
  assert.equal(on!.permission, 'permanent');
  assert.equal(on!.composite.maxWidth, COMPOSITE_MAX_WIDTH);
  assert.equal(on!.sessions[0]!.captures.length, 1);
  assert.equal(on!.sessions[0]!.captures[0]!.composite?.fileId, 'pic');
  assert.equal('cameraThumbnail' in on!.sessions[0]!.captures[0]!, false);
  assert.equal('screenshotThumbnail' in on!.sessions[0]!.captures[0]!, false);
  assert.deepEqual(on!.sessions[0]!.captures[0]!.seals.map((item) => item.id), ['inside']);

  const record = certificationExport(doc, START, on);
  assert.equal(record.sessionCaptures, on);
  const json = JSON.stringify(record.sessionCaptures);
  assert.equal(json.includes('UNIQUE_PASSAGE_INSIDE'), false);
  assert.equal(json.includes('UNIQUE_EVIDENCE'), false);
  assert.equal(json.includes('hash-inside'), true);
  assert.equal(json.includes('old-cam'), false);
  assert.equal(json.includes(TRUST_STATEMENT), false);
});

test('export pages show two composites across and three down', () => {
  assert.equal(CAPTURE_PAGE.columns, 2);
  assert.equal(CAPTURE_PAGE.rows, 3);
  assert.equal(CAPTURES_PER_PAGE, 6);
  const cells = Array.from({ length: 7 }, (_, index) => gridCell(`t-${index}`));
  const pages = planCapturePages(cells);
  assert.equal(pages.length, 2);
  assert.equal(pages[0]!.cells.length, 6);
  assert.equal(pages[1]!.cells.length, 1);
  assert.deepEqual(
    pages[0]!.cells.map((cell) => [cell.column, cell.row]),
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
      [1, 2],
    ],
  );
  assert.deepEqual([pages[1]!.cells[0]!.column, pages[1]!.cells[0]!.row], [0, 0]);
});

test('certification details stay under their composite, and the header is not the full certification summary', () => {
  const meta = (id: string): SealWindowMeta => ({
    id,
    blockId: `block-${id}`,
    contentHash: `hash-${id}`,
    origin: 'keyboard',
    sealedAt: START,
    updatedAt: '2026-10-27T12:04:00.000Z',
  });
  const sealsA = Array.from({ length: 12 }, (_, index) => meta(`a-${index}`));
  const sealsB = Array.from({ length: 2 }, (_, index) => meta(`b-${index}`));
  const sealsD = [meta('d-0')];
  const cells = [gridCell('a', sealsA), gridCell('b', sealsB), gridCell('c'), gridCell('d', sealsD)];
  const pages = planCapturePages(cells);
  const placed = pages.flatMap((page) => page.cells);
  assert.deepEqual(placed.map((cell) => cell.compositeId), ['a', 'b', 'c', 'd']);
  assert.equal(placed[0]!.seals.length, 12);
  assert.equal(placed[1]!.seals.length, 2);
  assert.equal(placed[2]!.seals.length, 0);
  assert.equal(placed[3]!.seals.length, 1);
  assert.equal(pages.length, 1);

  const header = captureDocumentHeader('The Lantern Book', 'ms-9').join('\n');
  assert.equal(header.includes(TRUST_STATEMENT), false);
  assert.equal(header.includes('eventCount'), false);
  assert.equal(header.includes('The Lantern Book'), true);
});

test('the session capture PDF is its own document', () => {
  const schema = buildSessionCaptureSchema({
    settings: { camera: true, screenshot: true, permission: 'session' },
    manuscriptId: 'ms-1',
    sessions: [{ id: 'ses-1', manuscriptId: 'ms-1', startedAt: START, endedAt: '2026-10-27T12:10:00.000Z' }],
    thumbnails: [
      shot({ id: 'pic', windowStart: START, windowEnd: '2026-10-27T12:05:00.000Z', reason: 'start' }),
    ],
    points: [seal('inside', '2026-10-27T12:04:00.000Z')],
  });
  assert.ok(schema);
  assert.equal(cellsFromSchema(schema!).length, 1);
  assert.equal(cellsFromSchema(schema!)[0]!.seals[0]?.contentHash, 'hash-inside');
  const bytes = renderSessionCapturePdf({ title: 'The Lantern Book', manuscriptId: 'ms-1', schema: schema! });
  assert.equal(String.fromCharCode(...bytes.slice(0, 5)), '%PDF-');
  const empty = buildSessionCaptureSchema({
    settings: { camera: true, screenshot: false, permission: 'session' },
    manuscriptId: 'ms-1',
    sessions: [],
    thumbnails: [],
    points: [],
  });
  const emptyBytes = renderSessionCapturePdf({ title: 'The Lantern Book', manuscriptId: 'ms-1', schema: empty! });
  assert.equal(String.fromCharCode(...emptyBytes.slice(0, 5)), '%PDF-');
});
