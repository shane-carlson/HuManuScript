/**
 * Certified Manuscript Registry client.
 *
 * One export freezes one file. The app hashes those exact bytes and a plain-text
 * walk of the open manuscript, then POSTs a certification summary. The manuscript
 * file is not uploaded. The returned HMS- code is kept beside the book.
 *
 * The holder page is a Sidequests path on readywriter.one. `VITE_REGISTRY_BASE_URL`
 * overrides that page (no trailing slash). The holder link is {page}/c/:code.
 *
 * The live registry does not accept POST on that page path. readywriter.one
 * redirects to www without a CORS header, and the www page path answers 405.
 * Registration is POST https://www.readywriter.one/api/registrations, and
 * DELETE is that collection plus the code. Another base still uses
 * {base}/registrations.
 */

import { contentHash, GRAMMAR_CHECK_COMMENT, SPELL_CHECK_COMMENT, type CertificationPoint } from './certification.ts';
import { certificationBannerText, buildCertificationPageModel } from './certificationPage.ts';
import { formatTypingDeviceLabel } from './deviceName.ts';
import type { ManuscriptDocument } from './document.ts';
import { isProseBlock, type ManuscriptBlock } from './types.ts';

export const REGISTRY_NAME = 'Certified Manuscript Registry';

/** Sidequests page on readywriter.one. Override with VITE_REGISTRY_BASE_URL. */
export const DEFAULT_REGISTRY_BASE_URL = 'https://readywriter.one/sidequests/certified-manuscript-registry';

const FORBIDDEN_KEYS = new Set(['text', 'passages', 'data', 'before', 'after', 'dataUrl', 'label']);

export function registryBaseUrl(override?: string | null): string {
  const raw = (override ?? '').trim() || DEFAULT_REGISTRY_BASE_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return DEFAULT_REGISTRY_BASE_URL;
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return DEFAULT_REGISTRY_BASE_URL;
  }
}

export function registryPageUrl(baseUrl: string, code: string): string {
  const base = registryBaseUrl(baseUrl);
  const page = isLiveReadyWriterRegistry(base)
    ? 'https://www.readywriter.one/sidequests/certified-manuscript-registry'
    : base;
  return `${page}/c/${encodeURIComponent(code)}`;
}

/**
 * Live Ready Writer One keeps the holder page under /sidequests and the
 * registration API at the www origin. The apex host only redirects, and that
 * redirect is not a CORS response, so the browser never delivers the POST.
 */
const LIVE_REGISTRY_API = 'https://www.readywriter.one/api/registrations';

export function isLiveReadyWriterRegistry(baseUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(registryBaseUrl(baseUrl));
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (host !== 'readywriter.one' && host !== 'www.readywriter.one') return false;
  return url.pathname.replace(/\/+$/, '') === '/sidequests/certified-manuscript-registry';
}

/** POST this URL. Pass a code for DELETE of that registration. */
export function registryRegistrationsUrl(baseUrl: string, code?: string): string {
  const root = isLiveReadyWriterRegistry(baseUrl) ? LIVE_REGISTRY_API : `${registryBaseUrl(baseUrl)}/registrations`;
  return code ? `${root}/${encodeURIComponent(code)}` : root;
}

/**
 * Plain-text walk of the document model, before export formatting.
 * Unicode NFC. Prose blocks contribute `text`. Any other block contributes a
 * non-empty title. Table cells, image bytes, notes, and the certification page
 * are outside the walk. Blocks are joined with a newline. A non-empty walk
 * ends with a newline. An empty manuscript is the empty string.
 */
export function canonicalManuscriptText(doc: ManuscriptDocument): string {
  const parts: string[] = [];
  for (const block of doc.blocks) {
    parts.push(...canonicalBlockParts(block));
  }
  if (parts.length === 0) return '';
  const joined = parts.join('\n');
  if (joined.length === 0) return '';
  return `${joined}\n`;
}

function canonicalBlockParts(block: ManuscriptBlock): string[] {
  if (isProseBlock(block.type)) return [block.text.normalize('NFC')];
  const title = block.title.normalize('NFC');
  // Same decision as the certification word count: a whitespace-only title is absent.
  return title.trim().length > 0 ? [title] : [];
}

export async function sha256Hex(bytes: BufferSource): Promise<string> {
  const view = ArrayBuffer.isView(bytes)
    ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', view.slice());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Utf8(text: string): Promise<{ sha256: string; utf8Bytes: number }> {
  const encoded = new TextEncoder().encode(text);
  return { sha256: await sha256Hex(encoded), utf8Bytes: encoded.byteLength };
}

export interface RegistryReceipt {
  code: string;
  receivedAt: string;
  deleteToken: string;
  filename: string;
  byteLength: number;
  fileSha256: string;
  canonicalSha256: string;
  format: string;
  exportedAt: string;
}

export interface RegistrationSeal {
  id: string;
  origin: 'keyboard' | 'dictation';
  sealedAt: string;
  updatedAt: string;
  charLength: number;
  inputSource: { kind: 'keyboard' | 'microphone'; name?: string };
  keyboardPace?: { keystrokes: number; firstAt: string; lastAt: string };
  priorHashCount: number;
  eventCount: number;
  inputTypes: string[];
  typingDevice?: string;
  grammar?: { used: true; engine: 'harper'; generative: false };
  spellcheck?: { used: true; generative: false };
}

export interface DetailedReportSeal extends RegistrationSeal {
  blockId: string;
  spanId: string;
  lineage?: string;
  spellcheck?: {
    used: true;
    generative: false;
    comment: typeof SPELL_CHECK_COMMENT;
    checks: { id: string; at: string }[];
  };
  grammar?: {
    used: true;
    engine: 'harper';
    generative: false;
    comment: typeof GRAMMAR_CHECK_COMMENT;
    checks: {
      id: string;
      at: string;
      engine: 'harper';
      engineVersion: string;
      dialect: string;
      lintKind: string;
      suggestion: string;
    }[];
  };
}

export interface DetailedCertificationReport {
  kind: 'detailed-certification-report';
  name: 'Detailed certification report';
  recordVersion: 1;
  manuscriptId: string;
  exportedAt: string;
  seals: DetailedReportSeal[];
}

export interface RegistrationBody {
  product: 'HuManuScript';
  recordVersion: 1;
  appVersion: string;
  manuscriptId: string;
  title: string;
  seriesLabel?: string;
  exportedAt: string;
  trust: string;
  totals: {
    keyboardSealed: number;
    dictationSealed: number;
    paste: number;
    drop: number;
    other: number;
    totalWords: number;
  };
  structure: {
    chapters: number;
    scenes: number;
    sections: number;
    paragraphs: number;
    certificationPoints: number;
  };
  checks: {
    spellChecks: number;
    grammarChecks: number;
    spellComment?: typeof SPELL_CHECK_COMMENT;
    grammarComment?: typeof GRAMMAR_CHECK_COMMENT;
  };
  moves: { count: number; earliestAt?: string; latestAt?: string };
  file: { filename: string; byteLength: number; sha256: string };
  canonicalText: { sha256: string; utf8Bytes: number };
  includeDeviceNames: boolean;
  seals: RegistrationSeal[];
  /**
   * Plain text of the detailed certification report. The live registry stores
   * this string as the downloadable report. A JSON object under any other name
   * is refused.
   */
  report?: string;
}

export function registeredMessage(includedDetailedReport: boolean): string {
  const report = includedDetailedReport
    ? 'The detailed certification report was included. The manuscript text was not uploaded.'
    : 'The summary and the two checksums were registered.';
  return `Registered with the ${REGISTRY_NAME}. Send this code with the file. The code is not inside the file. ${report} The download is the same file that was hashed.`;
}

export function unregisteredMessage(): string {
  return `This file was not registered with the ${REGISTRY_NAME}. The download is still your export.`;
}

export function removedMessage(): string {
  return `That code was removed from the ${REGISTRY_NAME}.`;
}

export function removeFailedMessage(): string {
  return `The ${REGISTRY_NAME} could not be reached, so this code is still registered.`;
}

function publicInputSource(
  point: CertificationPoint,
  includeDeviceNames: boolean,
): RegistrationSeal['inputSource'] {
  const kind = point.inputSource?.kind ?? (point.origin === 'dictation' ? 'microphone' : 'keyboard');
  const source: RegistrationSeal['inputSource'] = { kind };
  if (includeDeviceNames) {
    const name = point.inputSource?.name?.trim();
    if (name) source.name = name;
  }
  return source;
}

function publicSeal(point: CertificationPoint, includeDeviceNames: boolean, liveDevice?: string | null): RegistrationSeal {
  const seal: RegistrationSeal = {
    id: point.id,
    origin: point.origin,
    sealedAt: point.sealedAt,
    updatedAt: point.updatedAt,
    charLength: point.text.length,
    inputSource: publicInputSource(point, includeDeviceNames),
    priorHashCount: point.priorHashes.length,
    eventCount: point.evidence?.eventCount ?? 0,
    inputTypes: [...(point.evidence?.inputTypes ?? [])],
  };
  if (point.origin === 'keyboard' && point.keyboardPace) {
    seal.keyboardPace = {
      keystrokes: point.keyboardPace.keystrokes,
      firstAt: point.keyboardPace.firstAt,
      lastAt: point.keyboardPace.lastAt,
    };
  }
  if (includeDeviceNames && point.typingDevice?.trim()) {
    const label = formatTypingDeviceLabel(point.typingDevice, liveDevice);
    if (label) seal.typingDevice = label;
  }
  if (point.grammar?.used) seal.grammar = { used: true, engine: 'harper', generative: false };
  if (point.spellcheck?.used) seal.spellcheck = { used: true, generative: false };
  return seal;
}

function detailedSeal(point: CertificationPoint, includeDeviceNames: boolean, liveDevice?: string | null): DetailedReportSeal {
  const { spellcheck: shortSpellcheck, grammar: shortGrammar, ...base } = publicSeal(point, includeDeviceNames, liveDevice);
  void shortSpellcheck;
  void shortGrammar;
  const seal: DetailedReportSeal = {
    ...base,
    blockId: point.blockId,
    spanId: point.spanId,
  };
  if (point.lineage?.startsWith('Split from certification ')) seal.lineage = point.lineage;
  if (point.spellcheck?.used) {
    seal.spellcheck = {
      used: true,
      generative: false,
      comment: SPELL_CHECK_COMMENT,
      checks: point.spellcheck.checks.map((check) => ({ id: check.id, at: check.at })),
    };
  }
  if (point.grammar?.used) {
    seal.grammar = {
      used: true,
      engine: 'harper',
      generative: false,
      comment: GRAMMAR_CHECK_COMMENT,
      checks: point.grammar.checks.map((check) => ({
        id: check.id,
        at: check.at,
        engine: 'harper',
        engineVersion: check.engineVersion,
        dialect: check.dialect,
        lintKind: check.lintKind,
        suggestion: check.suggestion,
      })),
    };
  }
  return seal;
}

/**
 * The detailed certification report, generated from the manuscript already open.
 * Session pictures, passage text, evidence payloads, and spelling or grammar
 * wording stay on the machine.
 */
export function buildDetailedCertificationReport(
  doc: ManuscriptDocument,
  exportedAt: string,
  includeDeviceNames: boolean,
  liveDevice?: string | null,
): DetailedCertificationReport {
  return {
    kind: 'detailed-certification-report',
    name: 'Detailed certification report',
    recordVersion: 1,
    manuscriptId: doc.manuscriptId,
    exportedAt,
    seals: doc.points.map((point) => detailedSeal(point, includeDeviceNames, liveDevice)),
  };
}

/** Plain text the holder can read. The manuscript wording stays out of it. */
export function formatDetailedCertificationReport(report: DetailedCertificationReport): string {
  const lines = [report.name, `Manuscript id: ${report.manuscriptId}`, `Exported: ${report.exportedAt}`, ''];
  if (report.seals.length === 0) lines.push('No sealed passages were included.');
  report.seals.forEach((seal, index) => {
    lines.push(`Seal ${index + 1}`, `Id: ${seal.id}`, `Origin: ${seal.origin}`, `Input: ${seal.inputSource.kind}`);
    if (seal.inputSource.name) lines.push(`Input source: ${seal.inputSource.name}`);
    if (seal.typingDevice) lines.push(`Computer: ${seal.typingDevice}`);
    lines.push(
      `Sealed: ${seal.sealedAt}`,
      `Updated: ${seal.updatedAt}`,
      `Characters: ${seal.charLength}`,
      `Earlier hashes: ${seal.priorHashCount}`,
      `Input events: ${seal.eventCount}`,
    );
    if (seal.inputTypes.length > 0) lines.push(`Input types: ${seal.inputTypes.join(', ')}`);
    if (seal.keyboardPace) {
      lines.push(
        `Typing: ${seal.keyboardPace.keystrokes} keystrokes from ${seal.keyboardPace.firstAt} to ${seal.keyboardPace.lastAt}`,
      );
    }
    if (seal.lineage) lines.push(`Lineage: ${seal.lineage}`);
    lines.push(`Block: ${seal.blockId}`, `Span: ${seal.spanId}`);
    if (seal.spellcheck) {
      lines.push(`Spell check: ${seal.spellcheck.comment}`);
      for (const check of seal.spellcheck.checks) lines.push(`Spell check at ${check.at}`);
    }
    if (seal.grammar) {
      lines.push(`Grammar check: ${seal.grammar.comment}`);
      for (const check of seal.grammar.checks) {
        lines.push(
          `Grammar check at ${check.at} with ${check.engine} ${check.engineVersion}, ${check.dialect}, ${check.lintKind}, suggestion ${check.suggestion}`,
        );
      }
    }
    lines.push('');
  });
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

function moveSpan(doc: ManuscriptDocument): RegistrationBody['moves'] {
  const times = doc.moves
    .map((move) => move.at)
    .filter((at) => Number.isFinite(Date.parse(at)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const moves: RegistrationBody['moves'] = { count: doc.moves.length };
  if (times.length > 0) {
    moves.earliestAt = times[0];
    moves.latestAt = times[times.length - 1];
  }
  return moves;
}

export async function buildRegistrationBody(args: {
  doc: ManuscriptDocument;
  appVersion: string;
  exportedAt: string;
  title: string;
  seriesLabel?: string | null;
  filename: string;
  byteLength: number;
  fileSha256: string;
  canonicalSha256: string;
  canonicalUtf8Bytes: number;
  includeDeviceNames: boolean;
  includeDetailedReport: boolean;
  liveDevice?: string | null;
}): Promise<RegistrationBody> {
  const model = buildCertificationPageModel(args.doc, args.exportedAt, {
    bookTitle: args.title,
    seriesLabel: args.seriesLabel,
  }, args.liveDevice);
  const title = args.title.trim();
  const seriesLabel = args.seriesLabel?.trim() || '';
  const checks: RegistrationBody['checks'] = {
    spellChecks: model.spellChecks,
    grammarChecks: model.grammarChecks,
  };
  if (model.spellChecks > 0) checks.spellComment = SPELL_CHECK_COMMENT;
  if (model.grammarChecks > 0) checks.grammarComment = GRAMMAR_CHECK_COMMENT;
  const body: RegistrationBody = {
    product: 'HuManuScript',
    recordVersion: 1,
    appVersion: args.appVersion,
    manuscriptId: args.doc.manuscriptId,
    ...(seriesLabel ? { seriesLabel } : {}),
    title,
    exportedAt: args.exportedAt,
    trust: certificationBannerText(),
    totals: {
      keyboardSealed: model.totals.keyboardSealed,
      dictationSealed: model.totals.dictationSealed,
      paste: model.totals.paste,
      drop: model.totals.drop,
      other: model.totals.other,
      totalWords: model.totals.totalWords,
    },
    structure: {
      chapters: model.chapters,
      scenes: model.scenes,
      sections: model.sections,
      paragraphs: model.paragraphs,
      certificationPoints: model.certificationPoints,
    },
    checks,
    moves: moveSpan(args.doc),
    file: {
      filename: args.filename,
      byteLength: args.byteLength,
      sha256: args.fileSha256,
    },
    canonicalText: {
      sha256: args.canonicalSha256,
      utf8Bytes: args.canonicalUtf8Bytes,
    },
    includeDeviceNames: args.includeDeviceNames,
    seals: args.doc.points.map((point) => publicSeal(point, args.includeDeviceNames, args.liveDevice)),
    ...(args.includeDetailedReport
      ? {
          report: formatDetailedCertificationReport(
            buildDetailedCertificationReport(args.doc, args.exportedAt, args.includeDeviceNames, args.liveDevice),
          ),
        }
      : {}),
  };
  assertRegistrationOmitsManuscript(body, args.doc);
  return body;
}

export function findForbiddenKey(value: unknown, path = '$'): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenKey(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) return `${path}.${key}`;
    const found = findForbiddenKey(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function manuscriptSecrets(doc: ManuscriptDocument): string[] {
  const secrets = new Set<string>();
  const add = (value: string | null | undefined) => {
    const text = value ?? '';
    if (text.length > 0) secrets.add(text);
  };
  for (const block of doc.blocks) {
    add(block.text);
    for (const row of block.tableRows ?? []) {
      for (const cell of row) add(cell);
    }
    add(block.imageAlt);
  }
  for (const point of doc.points) {
    add(point.text);
    for (const event of point.evidence?.events ?? []) add(event.data);
    for (const check of point.spellcheck?.checks ?? []) {
      add(check.before);
      add(check.after);
    }
    for (const check of point.grammar?.checks ?? []) {
      add(check.before);
      add(check.after);
      add(check.message);
    }
  }
  return [...secrets];
}

/** Refuse a body that would upload the manuscript. The working title is the one exception. */
export function assertRegistrationOmitsManuscript(body: unknown, doc: ManuscriptDocument): void {
  const forbidden = findForbiddenKey(body);
  if (forbidden) {
    throw new Error(`The ${REGISTRY_NAME} request included a field that can carry the manuscript (${forbidden}).`);
  }
  const secrets = manuscriptSecrets(doc).filter((secret) => secret.length >= 1);
  const walk = (value: unknown, path: string) => {
    if (typeof value === 'string') {
      if (path === '$.title' || path === '$.seriesLabel') return;
      for (const secret of secrets) {
        // Short seals can equal an origin or a product name. A passage long enough
        // to be the manuscript is the leak this check refuses.
        if (secret.length >= 16 && value.includes(secret)) {
          throw new Error(`The ${REGISTRY_NAME} request would include manuscript text.`);
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
    }
  };
  walk(body, '$');
}

const CODE_PATTERN = /^HMS(?:-[0-9A-HJKMNP-TV-Z]{4}){6}-[0-9A-HJKMNP-TV-Z]{2}$/;

export function isRegistryCode(value: unknown): value is string {
  return typeof value === 'string' && CODE_PATTERN.test(value);
}

function isRegistrationResponse(value: unknown): value is { code: string; receivedAt: string; deleteToken: string } {
  if (!value || typeof value !== 'object') return false;
  const record = value as { code?: unknown; receivedAt?: unknown; deleteToken?: unknown };
  return (
    isRegistryCode(record.code) &&
    typeof record.receivedAt === 'string' &&
    Number.isFinite(Date.parse(record.receivedAt)) &&
    typeof record.deleteToken === 'string' &&
    record.deleteToken.length >= 16 &&
    !/\s/.test(record.deleteToken)
  );
}

export type RegistrationResult =
  | {
      ok: true;
      receipt: RegistryReceipt;
      pageUrl: string;
      includedDetailedReport: boolean;
    }
  | { ok: false };

export async function submitRegistration(args: {
  baseUrl: string;
  body: RegistrationBody;
  format: string;
  fetchImpl?: typeof fetch;
}): Promise<RegistrationResult> {
  assertRegistrationOmitsManuscript(args.body, emptySecretsDoc(args.body.manuscriptId));
  const fetchImpl = args.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(registryRegistrationsUrl(args.baseUrl), {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(args.body),
      credentials: 'omit',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { ok: false };
    const payload: unknown = await response.json();
    if (!isRegistrationResponse(payload)) return { ok: false };
    const receipt: RegistryReceipt = {
      code: payload.code,
      receivedAt: payload.receivedAt,
      deleteToken: payload.deleteToken,
      filename: args.body.file.filename,
      byteLength: args.body.file.byteLength,
      fileSha256: args.body.file.sha256,
      canonicalSha256: args.body.canonicalText.sha256,
      format: args.format,
      exportedAt: args.body.exportedAt,
    };
    return {
      ok: true,
      receipt,
      pageUrl: registryPageUrl(args.baseUrl, payload.code),
      includedDetailedReport: args.body.report != null,
    };
  } catch {
    return { ok: false };
  }
}

/**
 * The POST guard already ran against the real manuscript. This second check
 * only looks for forbidden keys, so the network call does not need the prose.
 */
function emptySecretsDoc(manuscriptId: string): ManuscriptDocument {
  return {
    version: 1,
    manuscriptId,
    title: '',
    blocks: [],
    provenance: {},
    points: [],
    moves: [],
  };
}

export async function deleteRegistration(args: {
  baseUrl: string;
  code: string;
  deleteToken: string;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  const fetchImpl = args.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(registryRegistrationsUrl(args.baseUrl, args.code), {
      method: 'DELETE',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        // The live registry names this header in its CORS allow list.
        'x-delete-token': args.deleteToken,
      },
      body: JSON.stringify({ deleteToken: args.deleteToken }),
      credentials: 'omit',
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function readRegistryReceipts(value: unknown): RegistryReceipt[] {
  if (!Array.isArray(value)) return [];
  const receipts: RegistryReceipt[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const receipt = item as RegistryReceipt;
    if (!isRegistryCode(receipt.code)) continue;
    if (typeof receipt.receivedAt !== 'string' || !Number.isFinite(Date.parse(receipt.receivedAt))) continue;
    if (typeof receipt.deleteToken !== 'string' || receipt.deleteToken.length < 16 || /\s/.test(receipt.deleteToken)) continue;
    if (typeof receipt.filename !== 'string' || receipt.filename.length === 0) continue;
    if (typeof receipt.byteLength !== 'number' || !Number.isInteger(receipt.byteLength) || receipt.byteLength < 0) continue;
    if (typeof receipt.fileSha256 !== 'string' || !SHA256_PATTERN.test(receipt.fileSha256)) continue;
    if (typeof receipt.canonicalSha256 !== 'string' || !SHA256_PATTERN.test(receipt.canonicalSha256)) continue;
    if (typeof receipt.format !== 'string' || receipt.format.length === 0) continue;
    if (typeof receipt.exportedAt !== 'string' || !Number.isFinite(Date.parse(receipt.exportedAt))) continue;
    receipts.push({
      code: receipt.code,
      receivedAt: receipt.receivedAt,
      deleteToken: receipt.deleteToken,
      filename: receipt.filename,
      byteLength: receipt.byteLength,
      fileSha256: receipt.fileSha256,
      canonicalSha256: receipt.canonicalSha256,
      format: receipt.format,
      exportedAt: receipt.exportedAt,
    });
  }
  return receipts;
}

/** SHA-256 of a string, matching a seal's content hash. Exported for tests of the canonical walk. */
export async function canonicalTextDigest(doc: ManuscriptDocument): Promise<{ sha256: string; utf8Bytes: number }> {
  const text = canonicalManuscriptText(doc);
  const digest = await contentHash(text);
  return { sha256: digest, utf8Bytes: new TextEncoder().encode(text).byteLength };
}
