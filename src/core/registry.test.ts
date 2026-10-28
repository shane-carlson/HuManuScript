import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GRAMMAR_CHECK_COMMENT, SPELL_CHECK_COMMENT, type CertificationPoint } from './certification.ts';
import { emptyDocument, type ManuscriptDocument } from './document.ts';
import { addRegistryReceipt, createBook, removeRegistryReceipt } from './library.ts';
import {
  assertRegistrationOmitsManuscript,
  buildRegistrationBody,
  canonicalManuscriptText,
  canonicalTextDigest,
  DEFAULT_REGISTRY_BASE_URL,
  deleteRegistration,
  findForbiddenKey,
  isRegistryCode,
  readRegistryReceipts,
  REGISTRY_NAME,
  registryBaseUrl,
  registryCheckUrl,
  registryCodeUrl,
  registryPageUrl,
  exportWritesRegistryInstructions,
  registeredMessage,
  sha256Hex,
  sha256Utf8,
  submitRegistration,
  unregisteredMessage,
  type RegistrationBody,
} from './registry.ts';
import type { ManuscriptBlock } from './types.ts';
import { sequenceIds } from './uid.ts';

const CODE = 'HMS-7K4Q-M2NP-9CWF-R8KD-3T8W-QMVR-AB';
const PASSAGE = 'UNIQUE_SEAL_TEXT_harbor_light_passage';
const EVENT_DATA = 'UNIQUE_EVENT_DATA_harbor_light';
const BEFORE = 'UNIQUE_BEFORE_harbor_light';
const AFTER = 'UNIQUE_AFTER_harbor_light';
const MESSAGE = 'UNIQUE_GRAMMAR_MESSAGE_harbor_light';
const CELL = 'UNIQUE_TABLE_CELL_harbor_light';
const ALT = 'UNIQUE_IMAGE_ALT_harbor_light';

function block(partial: Pick<ManuscriptBlock, 'id' | 'type'> & Partial<ManuscriptBlock>): ManuscriptBlock {
  return { title: '', text: '', marks: [], ...partial };
}

function seal(partial: Partial<CertificationPoint> & Pick<CertificationPoint, 'id' | 'text' | 'origin'>): CertificationPoint {
  return {
    blockId: 'block-1',
    spanId: 'span-1',
    contentHash: 'abc',
    sealedAt: '2026-10-18T16:01:02.000Z',
    updatedAt: '2026-10-18T16:11:40.000Z',
    evidence: {
      inputTypes: ['insertText', 'deleteContentBackward'],
      eventCount: 2,
      events: [{ at: '2026-10-18T16:01:02.000Z', inputType: 'insertText', data: EVENT_DATA, trusted: true }],
    },
    priorHashes: ['prior-hash-one'],
    typingDevice: 'writers-mac.local',
    inputSource: { kind: partial.origin === 'dictation' ? 'microphone' : 'keyboard', name: 'Keychron K2' },
    keyboardPace: {
      keystrokes: 12,
      firstAt: '2026-10-18T16:01:02.000Z',
      lastAt: '2026-10-18T16:11:40.000Z',
    },
    ...partial,
  };
}

function sample(): ManuscriptDocument {
  const doc = emptyDocument('ms_harbor');
  doc.title = 'Harbor Light';
  doc.blocks = [
    block({ id: 'ch', type: 'chapter', title: 'The Pier' }),
    block({ id: 'p1', type: 'paragraph', text: PASSAGE }),
    block({ id: 'q', type: 'blockquote', text: 'A quoted line of the walk.' }),
    block({ id: 'empty', type: 'paragraph', text: '' }),
    block({ id: 'scene', type: 'scene', title: '   ' }),
    block({ id: 'section', type: 'section', title: '' }),
    block({ id: 'table', type: 'table', title: 'Tide table', tableRows: [[CELL, 'other']] }),
    block({ id: 'image', type: 'image', title: '', imageAlt: ALT, imageSrc: 'data:image/png;base64,AAAA' }),
    block({ id: 'note-title', type: 'divider', title: 'e\u0301' }),
  ];
  doc.points = [
    seal({
      id: 'seal-typed',
      text: PASSAGE,
      origin: 'keyboard',
      spellcheck: {
        schema: 1,
        used: true,
        generative: false,
        comment: SPELL_CHECK_COMMENT,
        checks: [
          {
            id: 'spell-1',
            at: '2026-10-19T12:00:00.000Z',
            generative: false,
            before: BEFORE,
            after: AFTER,
            beforeHash: 'b',
            afterHash: 'a',
          },
        ],
      },
      grammar: {
        schema: 1,
        used: true,
        generative: false,
        comment: GRAMMAR_CHECK_COMMENT,
        checks: [
          {
            id: 'grammar-1',
            at: '2026-10-19T12:04:00.000Z',
            engine: 'harper',
            engineVersion: 'harper-1',
            generative: false,
            dialect: 'American',
            lintKind: 'Agreement',
            message: MESSAGE,
            suggestion: 'replace',
            before: BEFORE,
            after: AFTER,
            beforeHash: 'b',
            afterHash: 'a',
          },
        ],
      },
      lineage: `Split from certification seal-old. The remnant stayed keyboard-typed; this hash covers only this piece.`,
    }),
    seal({
      id: 'seal-spoken',
      text: 'Spoken words that stay on the machine.',
      origin: 'dictation',
      blockId: 'q',
      inputSource: { kind: 'microphone', name: 'Blue Yeti' },
      typingDevice: 'Studio Mac',
    }),
  ];
  doc.moves = [
    { id: 'm1', at: '2026-10-27T11:40:02.000Z', blockIds: ['p1'], fromIndex: 2, toIndex: 1, label: 'The Pier opens the chapter' },
    { id: 'm2', at: '2026-10-20T18:02:11.000Z', blockIds: ['ch'], fromIndex: 0, toIndex: 1, label: PASSAGE },
  ];
  return doc;
}

function json(body: unknown): string {
  return JSON.stringify(body);
}

test('canonical walk is NFC prose and non-empty titles, without tables, images, or notes', () => {
  const text = canonicalManuscriptText(sample());
  assert.equal(
    text,
    ['The Pier', PASSAGE, 'A quoted line of the walk.', '', 'Tide table', '\u00e9'].join('\n') + '\n',
  );
  assert.equal(text.includes(CELL), false);
  assert.equal(text.includes(ALT), false);
  assert.equal(text.includes('base64'), false);
  assert.equal(canonicalManuscriptText(emptyDocument('ms_empty')), '');
});

test('canonical digest matches a UTF-8 SHA-256 and an empty manuscript hashes the empty string', async () => {
  const walk = canonicalManuscriptText(sample());
  const direct = await sha256Utf8(walk);
  const via = await canonicalTextDigest(sample());
  assert.deepEqual(via, direct);
  assert.equal(via.sha256, await sha256Hex(new TextEncoder().encode(walk)));
  const empty = await canonicalTextDigest(emptyDocument('ms_empty'));
  assert.equal(empty.utf8Bytes, 0);
  assert.equal(empty.sha256, await sha256Hex(new Uint8Array()));
});

test('file checksum is the exact bytes, lowercase hex', async () => {
  const bytes = new TextEncoder().encode('same-bytes');
  assert.equal(await sha256Hex(bytes), await sha256Hex(bytes.slice()));
  assert.equal((await sha256Hex(bytes)).length, 64);
});

test('registration body is the summary and checksums, and the manuscript stays out', async () => {
  const doc = sample();
  const canonical = await canonicalTextDigest(doc);
  const body = await buildRegistrationBody({
    doc,
    appVersion: '0.1.41',
    exportedAt: '2026-10-28T15:04:00.000Z',
    title: 'Harbor Light',
    seriesLabel: null,
    filename: 'Harbor-Light.docx',
    byteLength: 184233,
    fileSha256: 'a'.repeat(64),
    canonicalSha256: canonical.sha256,
    canonicalUtf8Bytes: canonical.utf8Bytes,
    includeDeviceNames: false,
    includeDetailedReport: false,
  });
  assert.equal(body.product, 'HuManuScript');
  assert.equal(body.recordVersion, 1);
  assert.equal(body.appVersion, '0.1.41');
  assert.equal(body.title, 'Harbor Light');
  assert.equal('seriesLabel' in body, false);
  assert.equal(body.trust.includes('not a cryptographic authorship certificate') || body.trust.length > 40, true);
  assert.equal(body.includeDeviceNames, false);
  assert.equal(body.file.filename, 'Harbor-Light.docx');
  assert.equal(body.file.byteLength, 184233);
  assert.equal(body.canonicalText.sha256, canonical.sha256);
  assert.equal(body.moves.count, 2);
  assert.equal(body.moves.earliestAt, '2026-10-20T18:02:11.000Z');
  assert.equal(body.moves.latestAt, '2026-10-27T11:40:02.000Z');
  assert.equal(body.checks.spellChecks, 1);
  assert.equal(body.checks.grammarChecks, 1);
  assert.equal(body.checks.spellComment, SPELL_CHECK_COMMENT);
  assert.equal(body.checks.grammarComment, GRAMMAR_CHECK_COMMENT);
  assert.equal(body.seals.length, 2);
  assert.equal(body.seals[0]!.charLength, PASSAGE.length);
  assert.deepEqual(body.seals[0]!.inputSource, { kind: 'keyboard' });
  assert.equal(body.seals[0]!.typingDevice, undefined);
  assert.equal(body.seals[0]!.keyboardPace?.keystrokes, 12);
  assert.deepEqual(body.seals[0]!.grammar, { used: true, engine: 'harper', generative: false });
  assert.deepEqual(body.seals[0]!.spellcheck, { used: true, generative: false });
  assert.equal(body.seals[1]!.keyboardPace, undefined);
  assert.deepEqual(body.seals[1]!.inputSource, { kind: 'microphone' });
  assert.equal(body.detailedReport, undefined);
  assert.equal(findForbiddenKey(body), null);
  const encoded = json(body);
  for (const secret of [PASSAGE, EVENT_DATA, BEFORE, AFTER, MESSAGE, CELL, ALT, 'The Pier opens the chapter']) {
    assert.equal(encoded.includes(secret), false, secret);
  }
  assert.equal(encoded.includes('prior-hash-one'), false);
  assert.equal(encoded.includes('contentHash'), false);
});

test('a cleared title is omitted and a series label is sent only for a series book', async () => {
  const doc = sample();
  const canonical = await canonicalTextDigest(doc);
  const shared = {
    doc,
    appVersion: '0.1.0',
    exportedAt: '2026-10-28T15:04:00.000Z',
    filename: 'harbor.txt',
    byteLength: 4,
    fileSha256: 'b'.repeat(64),
    canonicalSha256: canonical.sha256,
    canonicalUtf8Bytes: canonical.utf8Bytes,
    includeDeviceNames: false,
    includeDetailedReport: false,
  };
  const cleared = await buildRegistrationBody({ ...shared, title: '   ', seriesLabel: '  ' });
  assert.equal('title' in cleared, false);
  assert.equal('seriesLabel' in cleared, false);
  const series = await buildRegistrationBody({ ...shared, title: 'Harbor Light', seriesLabel: 'Book 2 of Harbor Saga' });
  assert.equal(series.seriesLabel, 'Book 2 of Harbor Saga');
});

test('device names are sent only when the author includes them', async () => {
  const doc = sample();
  const canonical = await canonicalTextDigest(doc);
  const body = await buildRegistrationBody({
    doc,
    appVersion: '0.1.41',
    exportedAt: '2026-10-28T15:04:00.000Z',
    title: 'Harbor Light',
    seriesLabel: null,
    filename: 'Harbor-Light.docx',
    byteLength: 10,
    fileSha256: 'c'.repeat(64),
    canonicalSha256: canonical.sha256,
    canonicalUtf8Bytes: canonical.utf8Bytes,
    includeDeviceNames: true,
    includeDetailedReport: false,
    liveDevice: 'live-host',
  });
  assert.equal(body.includeDeviceNames, true);
  assert.equal(body.seals[0]!.typingDevice, 'writers-mac.local');
  assert.deepEqual(body.seals[0]!.inputSource, { kind: 'keyboard', name: 'Keychron K2' });
  assert.equal(body.seals[1]!.typingDevice, 'Studio Mac');
  assert.deepEqual(body.seals[1]!.inputSource, { kind: 'microphone', name: 'Blue Yeti' });
});

test('the detailed report is generated from the manuscript and still omits the prose', async () => {
  const doc = sample();
  const canonical = await canonicalTextDigest(doc);
  const skipped = await buildRegistrationBody({
    doc,
    appVersion: '0.1.41',
    exportedAt: '2026-10-28T15:04:00.000Z',
    title: 'Harbor Light',
    seriesLabel: null,
    filename: 'Harbor-Light.pdf',
    byteLength: 20,
    fileSha256: 'd'.repeat(64),
    canonicalSha256: canonical.sha256,
    canonicalUtf8Bytes: canonical.utf8Bytes,
    includeDeviceNames: false,
    includeDetailedReport: false,
  });
  assert.equal(skipped.detailedReport, undefined);

  const body = await buildRegistrationBody({
    doc,
    appVersion: '0.1.41',
    exportedAt: '2026-10-28T15:04:00.000Z',
    title: 'Harbor Light',
    seriesLabel: null,
    filename: 'Harbor-Light.pdf',
    byteLength: 20,
    fileSha256: 'd'.repeat(64),
    canonicalSha256: canonical.sha256,
    canonicalUtf8Bytes: canonical.utf8Bytes,
    includeDeviceNames: true,
    includeDetailedReport: true,
  });
  const report = body.detailedReport!;
  assert.equal(report.name, 'Detailed certification report');
  assert.equal(report.kind, 'detailed-certification-report');
  assert.equal(report.seals[0]!.blockId, 'block-1');
  assert.equal(report.seals[0]!.spanId, 'span-1');
  assert.equal(report.seals[0]!.lineage?.startsWith('Split from certification '), true);
  assert.equal(report.seals[0]!.spellcheck?.checks[0]!.at, '2026-10-19T12:00:00.000Z');
  assert.equal(report.seals[0]!.grammar?.checks[0]!.lintKind, 'Agreement');
  assert.equal(report.seals[0]!.grammar?.engine, 'harper');
  assert.equal(report.seals[0]!.typingDevice, 'writers-mac.local');
  const encoded = json(body);
  for (const secret of [PASSAGE, EVENT_DATA, BEFORE, AFTER, MESSAGE, CELL, ALT]) {
    assert.equal(encoded.includes(secret), false, secret);
  }
  assert.equal(findForbiddenKey(body), null);
  assert.equal(encoded.includes('"data"'), false);
  assert.equal(encoded.includes('dataUrl'), false);
});

test('a body that names a forbidden field is refused before it can be sent', () => {
  const doc = emptyDocument('ms_harbor');
  const bad = { product: 'HuManuScript', seals: [{ text: PASSAGE }] };
  assert.equal(findForbiddenKey(bad), '$.seals[0].text');
  assert.throws(() => assertRegistrationOmitsManuscript(bad, doc), /manuscript/);
});

test('registry base URL defaults to the Sidequests page and can be overridden', () => {
  assert.equal(registryBaseUrl(null), DEFAULT_REGISTRY_BASE_URL);
  assert.equal(registryBaseUrl('https://readywriter.one/sidequests/certified-manuscript-registry/'), DEFAULT_REGISTRY_BASE_URL);
  assert.equal(registryBaseUrl('http://127.0.0.1:8741/registry'), 'http://127.0.0.1:8741/registry');
  assert.equal(registryBaseUrl('not a url'), DEFAULT_REGISTRY_BASE_URL);
  assert.equal(registryPageUrl(DEFAULT_REGISTRY_BASE_URL, CODE), `${DEFAULT_REGISTRY_BASE_URL}/c/${CODE}`);
  assert.equal(registryCheckUrl(null), 'https://www.readywriter.one/sidequests/certified-manuscript-registry');
  assert.equal(registryCheckUrl('http://127.0.0.1:8741/registry'), 'http://127.0.0.1:8741/registry');
  assert.equal(
    registryCodeUrl(null, CODE),
    `https://www.readywriter.one/sidequests/certified-manuscript-registry/c/${CODE}`,
  );
  assert.equal(REGISTRY_NAME, 'Certified Manuscript Registry');
  assert.equal(exportWritesRegistryInstructions('docx'), true);
  assert.equal(exportWritesRegistryInstructions('pdf'), true);
  assert.equal(exportWritesRegistryInstructions('epub'), false);
  assert.equal(exportWritesRegistryInstructions('print'), false);
});

test('POST sends the summary and keeps the code, and a dead registry does not throw', async () => {
  const doc = sample();
  const canonical = await canonicalTextDigest(doc);
  const body = await buildRegistrationBody({
    doc,
    appVersion: '0.1.41',
    exportedAt: '2026-10-28T15:04:00.000Z',
    title: 'Harbor Light',
    seriesLabel: null,
    filename: 'Harbor-Light.docx',
    byteLength: 8,
    fileSha256: 'e'.repeat(64),
    canonicalSha256: canonical.sha256,
    canonicalUtf8Bytes: canonical.utf8Bytes,
    includeDeviceNames: false,
    includeDetailedReport: true,
  });
  const seen: { url: string; body: RegistrationBody; credentials?: RequestCredentials }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    seen.push({
      url: String(input),
      body: JSON.parse(String(init?.body)) as RegistrationBody,
      credentials: init?.credentials,
    });
    return new Response(
      JSON.stringify({ code: CODE, receivedAt: '2026-10-28T15:04:05.000Z', deleteToken: 'token-token-token-token' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  const result = await submitRegistration({
    baseUrl: 'http://127.0.0.1:8741/registry',
    body,
    format: 'docx',
    fetchImpl,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.url, 'http://127.0.0.1:8741/registry/registrations');
  assert.equal(seen[0]!.credentials, 'omit');
  assert.equal(seen[0]!.body.detailedReport?.name, 'Detailed certification report');
  assert.equal(json(seen[0]!.body).includes(PASSAGE), false);
  assert.equal(result.receipt.code, CODE);
  assert.equal(result.receipt.deleteToken, 'token-token-token-token');
  assert.equal(result.receipt.fileSha256, 'e'.repeat(64));
  assert.equal(result.pageUrl, `http://127.0.0.1:8741/registry/c/${CODE}`);
  assert.match(registeredMessage(true, true), /Certified Manuscript Registry/);
  assert.match(registeredMessage(true, true), /manuscript text was not uploaded/);
  assert.match(registeredMessage(true, true), /certification summary in this file/);
  assert.match(registeredMessage(false, true), /summary and the two checksums/);
  assert.match(registeredMessage(false, false), /EPUB and Format for Print/);
  assert.match(unregisteredMessage(), /not registered/);

  const down: typeof fetch = async () => {
    throw new Error('offline');
  };
  const missed = await submitRegistration({ baseUrl: DEFAULT_REGISTRY_BASE_URL, body, format: 'docx', fetchImpl: down });
  assert.deepEqual(missed, { ok: false });
});

test('delete sends the token in the body and not in the URL', async () => {
  let url = '';
  let payload = '';
  const fetchImpl: typeof fetch = async (input, init) => {
    url = String(input);
    payload = String(init?.body);
    return new Response(null, { status: 204 });
  };
  const removed = await deleteRegistration({
    baseUrl: DEFAULT_REGISTRY_BASE_URL,
    code: CODE,
    deleteToken: 'token-token-token-token',
    fetchImpl,
  });
  assert.equal(removed, true);
  assert.equal(url, `${DEFAULT_REGISTRY_BASE_URL}/registrations/${CODE}`);
  assert.equal(url.includes('token-token'), false);
  assert.deepEqual(JSON.parse(payload), { deleteToken: 'token-token-token-token' });
  assert.equal(isRegistryCode(CODE), true);
  assert.equal(isRegistryCode('HMS-short'), false);
});

test('the code is stored beside the book and is not part of the manuscript', () => {
  const ids = sequenceIds('id');
  let library = createBook({ version: 2, activeBookId: 'x', series: [], books: [] }, ids(), 'Harbor');
  const bookId = library.activeBookId;
  const document = library.books[0]!.document;
  library = addRegistryReceipt(library, bookId, {
    code: CODE,
    receivedAt: '2026-10-28T15:04:05.000Z',
    deleteToken: 'token-token-token-token',
    filename: 'Harbor-Light.docx',
    byteLength: 8,
    fileSha256: 'e'.repeat(64),
    canonicalSha256: 'f'.repeat(64),
    format: 'docx',
    exportedAt: '2026-10-28T15:04:00.000Z',
  });
  const book = library.books[0]!;
  assert.equal(book.registryReceipts?.[0]?.code, CODE);
  assert.equal(book.document, document);
  assert.equal(json(book.document).includes(CODE), false);
  assert.equal(json(book.document).includes('token-token'), false);
  const roundTrip = readRegistryReceipts(book.registryReceipts);
  assert.equal(roundTrip[0]?.code, CODE);
  assert.equal(readRegistryReceipts([{ code: 'nope' }]).length, 0);
  library = removeRegistryReceipt(library, bookId, CODE);
  assert.equal(library.books[0]!.registryReceipts, undefined);
});
