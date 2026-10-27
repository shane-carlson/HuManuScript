import assert from 'node:assert/strict';
import { test } from 'node:test';
import { certificationExport, emptyDocument } from './document.ts';
import { TRUST_STATEMENT } from './certification.ts';
import { renderSessionCapturePdf } from './sessionCaptureExport.ts';
import {
  CAPTURE_INTERVAL_MS,
  CAPTURE_PAGE,
  buildSessionCaptureSchema,
  captureDocumentHeader,
  captureEnabledStills,
  cellsFromSchema,
  emptyCaptureRowsPerPage,
  grabConsentedStill,
  nextIntervalDue,
  planCapturePages,
  readSessionCaptureSettings,
  sealsInWindow,
  sessionCaptureConfigured,
  thumbnailSize,
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

function thumb(partial: {
  id: string;
  kind: 'camera' | 'screenshot';
  windowStart: string;
  windowEnd: string;
  reason?: 'start' | 'interval' | 'end';
}) {
  return {
    id: partial.id,
    sessionId: 'ses-1',
    at: partial.windowEnd,
    reason: partial.reason ?? 'interval',
    kind: partial.kind,
    windowStart: partial.windowStart,
    windowEnd: partial.windowEnd,
    mime: 'image/jpeg' as const,
    width: 160,
    height: 90,
    dataUrl: `data:image/jpeg;base64,${partial.id}`,
  };
}

function gridCell(id: string, seals: SealWindowMeta[] = []): CaptureGridCell {
  return {
    thumbnailId: id,
    kind: 'camera',
    reason: 'interval',
    at: START,
    windowStart: START,
    windowEnd: '2026-10-27T12:05:00.000Z',
    seals,
  };
}

test('session pictures stay off unless the setting is boolean true', () => {
  assert.deepEqual(readSessionCaptureSettings(null), { camera: false, screenshot: false });
  assert.deepEqual(readSessionCaptureSettings('not json'), { camera: false, screenshot: false });
  assert.deepEqual(readSessionCaptureSettings(JSON.stringify({ camera: 1, screenshot: 'yes' })), {
    camera: false,
    screenshot: false,
  });
  assert.equal(sessionCaptureConfigured({ camera: false, screenshot: false }), false);
  const on = readSessionCaptureSettings(JSON.stringify({ camera: true, screenshot: false }));
  assert.deepEqual(on, { camera: true, screenshot: false });
  assert.equal(sessionCaptureConfigured(on), true);
});

test('thumbnails stay small and are not enlarged', () => {
  assert.deepEqual(thumbnailSize(1920, 1080), { width: 240, height: 135 });
  assert.deepEqual(thumbnailSize(80, 60), { width: 80, height: 60 });
});

test('a capture attempt does not open the camera or the screen when the setting is off', async () => {
  let opened = 0;
  const result = await captureEnabledStills(
    () => ({ camera: false, screenshot: false }),
    {
      camera: async () => {
        opened += 1;
        return null;
      },
      screenshot: async () => {
        opened += 1;
        return null;
      },
    },
  );
  assert.equal(result.stills.length, 0);
  assert.equal(opened, 0);

  const onlyCamera = await captureEnabledStills(
    () => ({ camera: true, screenshot: false }),
    {
      camera: async () => ({ blob: new Blob(['x']), width: 8, height: 8, mime: 'image/jpeg' }),
      screenshot: async () => {
        opened += 1;
        return null;
      },
    },
  );
  assert.equal(onlyCamera.stills.length, 1);
  assert.equal(onlyCamera.stills[0]?.kind, 'camera');
  assert.equal(opened, 0);
});

test('grabConsentedStill does not open a device when the setting is off, and stops the stream if it flips off', async () => {
  let opened = 0;
  let stopped = 0;
  const skipped = await grabConsentedStill({
    allowed: () => false,
    open: async () => {
      opened += 1;
      return { getTracks: () => [{ stop() {} }] };
    },
    draw: async () => ({ blob: new Blob(), width: 1, height: 1, mime: 'image/jpeg' }),
  });
  assert.equal(skipped, null);
  assert.equal(opened, 0);

  let allowed = true;
  const dropped = await grabConsentedStill({
    allowed: () => allowed,
    open: async () => {
      allowed = false;
      return { getTracks: () => [{ stop() { stopped += 1; } }] };
    },
    draw: async () => {
      throw new Error('should not draw');
    },
  });
  assert.equal(dropped, null);
  assert.equal(stopped, 1);
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

test('the certification schema omits thumbnails until pictures or screenshots are on', () => {
  const doc = emptyDocument('ms-1');
  assert.equal('sessionCaptures' in certificationExport(doc, START), false);

  const off = buildSessionCaptureSchema({
    settings: { camera: false, screenshot: false },
    manuscriptId: 'ms-1',
    sessions: [{ id: 'ses-1', manuscriptId: 'ms-1', startedAt: START, endedAt: null }],
    thumbnails: [thumb({ id: 'cam', kind: 'camera', windowStart: START, windowEnd: '2026-10-27T12:05:00.000Z' })],
    points: [],
  });
  assert.equal(off, null);
  assert.equal('sessionCaptures' in certificationExport(doc, START, off), false);

  const on = buildSessionCaptureSchema({
    settings: { camera: true, screenshot: false },
    manuscriptId: 'ms-1',
    sessions: [{ id: 'ses-1', manuscriptId: 'ms-1', startedAt: START, endedAt: null }],
    thumbnails: [
      thumb({ id: 'cam', kind: 'camera', windowStart: START, windowEnd: '2026-10-27T12:05:00.000Z' }),
      thumb({ id: 'screen', kind: 'screenshot', windowStart: START, windowEnd: '2026-10-27T12:05:00.000Z' }),
    ],
    points: [seal('inside', '2026-10-27T12:04:00.000Z', 'UNIQUE_PASSAGE_INSIDE')],
  });
  assert.ok(on);
  assert.equal(on!.camera, true);
  assert.equal(on!.screenshot, false);
  assert.equal(on!.sessions[0]!.captures.length, 1);
  assert.ok(on!.sessions[0]!.captures[0]!.cameraThumbnail);
  assert.equal(on!.sessions[0]!.captures[0]!.screenshotThumbnail, undefined);
  assert.deepEqual(on!.sessions[0]!.captures[0]!.seals.map((item) => item.id), ['inside']);

  const record = certificationExport(doc, START, on);
  assert.equal(record.sessionCaptures, on);
  const json = JSON.stringify(record.sessionCaptures);
  assert.equal(json.includes('UNIQUE_PASSAGE_INSIDE'), false);
  assert.equal(json.includes('UNIQUE_EVIDENCE'), false);
  assert.equal(json.includes('hash-inside'), true);
  assert.equal(json.includes(TRUST_STATEMENT), false);
});

test('export pages fit four thumbnails across and only as many rows as the page holds', () => {
  const perPage = emptyCaptureRowsPerPage();
  assert.equal(CAPTURE_PAGE.columns, 4);
  assert.ok(perPage >= 1);
  const cells = Array.from({ length: perPage * 4 + 4 }, (_, index) => gridCell(`t-${index}`));
  const pages = planCapturePages(cells);
  const firstThumbRows = pages[0]!.rows.filter((row) => row.type === 'thumbs');
  assert.equal(firstThumbRows.length, perPage);
  for (const row of firstThumbRows) {
    assert.equal(row.type === 'thumbs' && row.cells.length, 4);
  }
  assert.ok(pages.length > 1);
  const secondThumbRows = pages[1]!.rows.filter((row) => row.type === 'thumbs');
  assert.equal(secondThumbRows.length, 1);
  assert.equal(secondThumbRows[0]!.cells.length, 4);

  const remainder = planCapturePages(Array.from({ length: 5 }, (_, index) => gridCell(`r-${index}`)));
  const thumbRows = remainder.flatMap((page) => page.rows.filter((row) => row.type === 'thumbs'));
  assert.deepEqual(
    thumbRows.map((row) => row.cells.length),
    [4, 1],
  );
});

test('every seal in the window is placed once, and the header is not the full certification summary', () => {
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
  const thumbs = pages.flatMap((page) => page.rows.filter((row) => row.type === 'thumbs').flatMap((row) => row.cells));
  assert.deepEqual(thumbs.map((cell) => cell.thumbnailId), ['a', 'b', 'c', 'd']);
  const drawn = pages.flatMap((page) =>
    page.rows
      .filter((row) => row.type === 'seals')
      .flatMap((row) => row.cells.map((cell) => cell.seal?.id).filter((id): id is string => Boolean(id))),
  );
  assert.deepEqual(drawn.filter((id) => id.startsWith('a-')).length, 12);
  assert.deepEqual(drawn.filter((id) => id.startsWith('b-')).length, 2);
  assert.deepEqual(drawn.filter((id) => id.startsWith('d-')).length, 1);
  assert.equal(new Set(drawn).size, drawn.length);

  const header = captureDocumentHeader('The Lantern Book', 'ms-9').join('\n');
  assert.equal(header.includes(TRUST_STATEMENT), false);
  assert.equal(header.includes('eventCount'), false);
  assert.equal(header.includes('The Lantern Book'), true);
});

test('the session capture PDF is its own document', () => {
  const schema = buildSessionCaptureSchema({
    settings: { camera: true, screenshot: true },
    manuscriptId: 'ms-1',
    sessions: [{ id: 'ses-1', manuscriptId: 'ms-1', startedAt: START, endedAt: '2026-10-27T12:10:00.000Z' }],
    thumbnails: [
      thumb({ id: 'cam', kind: 'camera', windowStart: START, windowEnd: '2026-10-27T12:05:00.000Z', reason: 'start' }),
      thumb({ id: 'screen', kind: 'screenshot', windowStart: START, windowEnd: '2026-10-27T12:05:00.000Z', reason: 'start' }),
    ],
    points: [seal('inside', '2026-10-27T12:04:00.000Z')],
  });
  assert.ok(schema);
  assert.equal(cellsFromSchema(schema!).length, 2);
  const bytes = renderSessionCapturePdf({ title: 'The Lantern Book', manuscriptId: 'ms-1', schema: schema! });
  assert.equal(String.fromCharCode(...bytes.slice(0, 5)), '%PDF-');
  const empty = buildSessionCaptureSchema({
    settings: { camera: true, screenshot: false },
    manuscriptId: 'ms-1',
    sessions: [],
    thumbnails: [],
    points: [],
  });
  const emptyBytes = renderSessionCapturePdf({ title: 'The Lantern Book', manuscriptId: 'ms-1', schema: empty! });
  assert.equal(String.fromCharCode(...emptyBytes.slice(0, 5)), '%PDF-');
});
