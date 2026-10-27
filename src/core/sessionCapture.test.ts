import assert from 'node:assert/strict';
import { test } from 'node:test';
import { certificationExport, emptyDocument } from './document.ts';
import { GRAMMAR_CHECK_COMMENT, SPELL_CHECK_COMMENT, TRUST_STATEMENT, type CertificationPoint } from './certification.ts';
import { buildCertificationPageModel } from './certificationPage.ts';
import {
  detailedSealText,
  renderSessionCapturePdf,
  renderSessionCaptureReport,
  sealSummaryText,
  sessionCaptureReportFilename,
} from './sessionCaptureExport.ts';
import {
  CAMERA_OVERLAY_MARGIN,
  CAPTURE_INTERVAL_MS,
  CAPTURE_PAGE,
  CAPTURES_PER_PAGE,
  COMPOSITE_MAX_HEIGHT,
  COMPOSITE_MAX_WIDTH,
  SESSION_CAPTURE_REPORTS,
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
  sessionCaptureReportLeadsWithSummary,
  sessionCaptureReportShowsImages,
  type CaptureGridCell,
  type SealSource,
  type SealWindowMeta,
  type SessionCaptureReportKind,
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
  dataUrl?: string;
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
    dataUrl: partial.dataUrl ?? `data:image/jpeg;base64,${partial.id}`,
  };
}

/** 1×1 JPEG so a report can embed a real picture. */
const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGf/9k=';

function detailedPoint(id: string): CertificationPoint {
  return {
    id,
    blockId: `block-${id}`,
    spanId: `span-${id}`,
    text: `UNIQUE_PASSAGE_${id}`,
    contentHash: `hash-${id}`,
    sealedAt: '2026-10-27T11:00:00.000Z',
    updatedAt: '2026-10-27T12:04:00.000Z',
    origin: 'keyboard',
    evidence: {
      inputTypes: ['insertText'],
      eventCount: 1,
      events: [
        {
          at: '2026-10-27T12:04:00.000Z',
          inputType: 'insertText',
          data: `UNIQUE_EVIDENCE_${id}`,
          trusted: true,
        },
      ],
    },
    priorHashes: [`prior-${id}`],
    lineage: `UNIQUE_LINEAGE_${id}`,
    typingDevice: 'Studio Mac',
    spellcheck: {
      schema: 1,
      used: true,
      generative: false,
      comment: SPELL_CHECK_COMMENT,
      checks: [
        {
          id: 'sp1',
          at: START,
          generative: false,
          before: 'teh',
          after: 'the',
          beforeHash: 'a',
          afterHash: 'b',
        },
      ],
    },
    grammar: {
      schema: 1,
      used: true,
      engine: 'harper',
      generative: false,
      comment: GRAMMAR_CHECK_COMMENT,
      checks: [
        {
          id: 'g1',
          at: START,
          engine: 'harper',
          engineVersion: '1',
          generative: false,
          dialect: 'American',
          lintKind: 'agreement',
          message: 'msg',
          suggestion: 'replace',
          before: 'was',
          after: 'were',
          beforeHash: 'a',
          afterHash: 'b',
        },
      ],
    },
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

test('stored pictures can be reported after the setting is off, without passage text in the schema', () => {
  const point = detailedPoint('inside');
  const off = buildSessionCaptureSchema({
    settings: { camera: false, screenshot: false, permission: 'session' },
    manuscriptId: 'ms-1',
    sessions: [{ id: 'ses-1', manuscriptId: 'ms-1', startedAt: START, endedAt: null }],
    thumbnails: [shot({ id: 'pic', windowStart: START, windowEnd: '2026-10-27T12:05:00.000Z' })],
    points: [point],
  });
  assert.equal(off, null);

  const stored = buildSessionCaptureSchema({
    settings: { camera: false, screenshot: false, permission: 'session' },
    includeStored: true,
    manuscriptId: 'ms-1',
    sessions: [{ id: 'ses-1', manuscriptId: 'ms-1', startedAt: START, endedAt: null }],
    thumbnails: [shot({ id: 'pic', windowStart: START, windowEnd: '2026-10-27T12:05:00.000Z' })],
    points: [point],
  });
  assert.ok(stored);
  assert.equal(stored!.camera, false);
  assert.equal(stored!.sessions[0]!.captures[0]!.composite?.fileId, 'pic');
  assert.equal(stored!.sessions[0]!.captures[0]!.seals[0]?.contentHash, 'hash-inside');
  const json = JSON.stringify(stored);
  assert.equal(json.includes('UNIQUE_PASSAGE_inside'), false);
  assert.equal(json.includes('UNIQUE_EVIDENCE_inside'), false);
  assert.equal(json.includes('prior-inside'), false);
});

test('the three reports share a timeline and differ by pictures and certification fields', () => {
  assert.deepEqual(
    SESSION_CAPTURE_REPORTS.map((option) => option.kind),
    ['detailed', 'summary', 'seals'],
  );
  assert.equal(sessionCaptureReportLeadsWithSummary('detailed'), true);
  assert.equal(sessionCaptureReportLeadsWithSummary('summary'), false);
  assert.equal(sessionCaptureReportShowsImages('detailed'), true);
  assert.equal(sessionCaptureReportShowsImages('summary'), true);
  assert.equal(sessionCaptureReportShowsImages('seals'), false);

  const point = detailedPoint('inside');
  const meta: SealWindowMeta = {
    id: point.id,
    blockId: point.blockId,
    contentHash: point.contentHash,
    origin: point.origin,
    sealedAt: point.sealedAt,
    updatedAt: point.updatedAt,
  };
  const summaryLines = sealSummaryText(meta).join('\n');
  const detailedLines = detailedSealText(point).join('\n');
  assert.ok(detailedLines.length > summaryLines.length);
  assert.equal(summaryLines.includes('UNIQUE_PASSAGE_inside'), false);
  assert.equal(summaryLines.includes('UNIQUE_EVIDENCE_inside'), false);
  assert.equal(summaryLines.includes('Studio Mac'), false);
  assert.equal(summaryLines.includes('prior-inside'), false);
  assert.equal(summaryLines.includes('block-inside'), false);
  assert.equal(summaryLines.includes(SPELL_CHECK_COMMENT), false);
  assert.equal(summaryLines.includes('hash-inside'), true);
  assert.equal(detailedLines.includes('UNIQUE_PASSAGE_inside'), true);
  assert.equal(detailedLines.includes('UNIQUE_EVIDENCE_inside'), true);
  assert.equal(detailedLines.includes('Studio Mac'), true);
  assert.equal(detailedLines.includes('prior-inside'), true);
  assert.equal(detailedLines.includes('block-inside'), true);
  assert.equal(detailedLines.includes('span-inside'), true);
  assert.equal(detailedLines.includes(SPELL_CHECK_COMMENT), true);
  assert.equal(detailedLines.includes(GRAMMAR_CHECK_COMMENT), true);
  assert.equal(detailedLines.includes('hash-inside'), true);

  assert.equal(sessionCaptureReportFilename('The Lantern Book', 'detailed'), 'the-lantern-book-certification-report.pdf');
  assert.equal(sessionCaptureReportFilename('The Lantern Book', 'summary'), 'the-lantern-book-capture-summary.pdf');
  assert.equal(sessionCaptureReportFilename('The Lantern Book', 'seals'), 'the-lantern-book-seal-summaries.pdf');

  const schema = buildSessionCaptureSchema({
    settings: { camera: true, screenshot: true, permission: 'session' },
    manuscriptId: 'ms-1',
    sessions: [{ id: 'ses-1', manuscriptId: 'ms-1', startedAt: START, endedAt: '2026-10-27T12:10:00.000Z' }],
    thumbnails: [
      shot({
        id: 'pic',
        windowStart: START,
        windowEnd: '2026-10-27T12:05:00.000Z',
        reason: 'start',
        dataUrl: TINY_JPEG,
      }),
    ],
    points: [point],
  });
  assert.ok(schema);
  const summary = buildCertificationPageModel(emptyDocument('ms-1'), START, { bookTitle: 'The Lantern Book' });
  const rendered = (kind: SessionCaptureReportKind) => {
    const bytes = renderSessionCaptureReport({
      kind,
      title: 'The Lantern Book',
      manuscriptId: 'ms-1',
      schema: schema!,
      points: [point],
      summary,
    });
    assert.equal(String.fromCharCode(...bytes.slice(0, 5)), '%PDF-');
    return new TextDecoder('latin1').decode(bytes);
  };

  const detailed = rendered('detailed');
  const highLevel = rendered('summary');
  const sealsOnly = rendered('seals');

  assert.ok(detailed.indexOf('HuManuScript certification summary') >= 0);
  assert.ok(detailed.indexOf('HuManuScript certification summary') < detailed.indexOf('UNIQUE_PASSAGE_inside'));
  assert.equal(detailed.includes('UNIQUE_EVIDENCE_inside'), true);
  assert.equal(detailed.includes('DCTDecode'), true);

  assert.equal(highLevel.includes('HuManuScript certification summary'), false);
  assert.equal(highLevel.includes('High-level summary'), true);
  assert.equal(highLevel.includes('UNIQUE_PASSAGE_inside'), false);
  assert.equal(highLevel.includes('UNIQUE_EVIDENCE_inside'), false);
  assert.equal(highLevel.includes('hash-inside'), true);
  assert.equal(highLevel.includes('DCTDecode'), true);
  assert.ok(highLevel.length < detailed.length);

  assert.equal(sealsOnly.includes('Seal summaries'), true);
  assert.equal(sealsOnly.includes('UNIQUE_PASSAGE_inside'), false);
  assert.equal(sealsOnly.includes('UNIQUE_EVIDENCE_inside'), false);
  assert.equal(sealsOnly.includes('hash-inside'), true);
  assert.equal(sealsOnly.includes('DCTDecode'), false);
  assert.ok(sealsOnly.length < highLevel.length);
});
