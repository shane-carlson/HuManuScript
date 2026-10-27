/**
 * Human-authorship certification for a Speak Fiction-style manuscript.
 *
 * A certification point seals the current text of one keyboard or dictation
 * span with a SHA-256 content hash, the input events observed for that span,
 * and the time. Dictation is its own origin: sealed like keyboard, and not
 * counted as keyboard, paste, or other. Paste, drop, and other insertions
 * stay uncertified. A spelling correction or a Harper grammar fix inside a
 * seal is not a new insertion: the span stays keyboard or dictation, and the
 * point records which check was used.
 *
 * Browser events are evidence of how text entered this editor. They are not
 * proof against someone simulating events.
 */

import { getTypingDeviceLabel } from './deviceName.ts';
import type { InlineMark } from './types.ts';
import { normalizeMarks } from './richText.ts';

export type InsertionOrigin = 'keyboard' | 'dictation' | 'paste' | 'drop' | 'other';

/** Origins that receive a SHA-256 certification point. */
export type SealedOrigin = 'keyboard' | 'dictation';

export function isSealedOrigin(origin: InsertionOrigin | null | undefined): origin is SealedOrigin {
  return origin === 'keyboard' || origin === 'dictation';
}

/** The keyboard or dictation span that fully contains [start, end), if there is one. */
export function sealedSpanCovering(spans: ProvenanceSpan[], start: number, end: number): ProvenanceSpan | null {
  return (
    spans.find(
      (span) => span.start <= start && span.end >= end && isSealedOrigin(span.origin) && Boolean(span.certificationId),
    ) ?? null
  );
}

export interface ProvenanceSpan {
  id: string;
  start: number;
  end: number;
  origin: InsertionOrigin;
  certificationId?: string;
  /** Best-effort label when origin is paste (clipboard shape, not a verified app). */
  pasteHint?: string;
}

export interface InputEvidence {
  at: string;
  inputType: string;
  /** Inserted text when the browser provided it. Capped for the record. */
  data: string | null;
  trusted: boolean;
}

export interface CertificationPoint {
  id: string;
  blockId: string;
  spanId: string;
  /** Plain text this point currently seals. */
  text: string;
  /** SHA-256 hex of `text` (UTF-8). */
  contentHash: string;
  sealedAt: string;
  updatedAt: string;
  origin: SealedOrigin;
  evidence: {
    inputTypes: string[];
    eventCount: number;
    events: InputEvidence[];
  };
  /** Earlier hashes when an edit changed more than the edge of the span. */
  priorHashes: string[];
  lineage?: string;
  /** Computer name (Electron) or best-effort platform label (browser); omitted when unknown. */
  typingDevice?: string;
  /**
   * Present only after the writer accepts a Harper suggestion inside this seal.
   * Harper is a local rule checker. This record cannot say a generative model was used.
   */
  grammar?: GrammarUsage;
  /**
   * Present only after the writer accepts a spelling suggestion inside this seal.
   * The suggestion comes from the platform dictionary or the bundled word list.
   */
  spellcheck?: SpellUsage;
}

/** Shown on the seal and the certification page. The wording is fixed. Harper writes this. */
export const GRAMMAR_CHECK_COMMENT = 'Grammar Checked without Generative AI Usage via Harper';

/** Shown on the seal and the certification page. The wording is fixed. */
export const SPELL_CHECK_COMMENT = 'Spell Checked without Generative AI Usage';

export type GrammarDialect = 'American' | 'British' | 'Canadian' | 'Australian' | 'Indian';
export type GrammarSuggestionKind = 'replace' | 'remove' | 'insert-after';

export interface GrammarCheck {
  id: string;
  /** When the writer accepted the suggestion. */
  at: string;
  engine: 'harper';
  engineVersion: string;
  /** Literal false. Harper does not generate prose. */
  generative: false;
  dialect: GrammarDialect;
  lintKind: string;
  message: string;
  suggestion: GrammarSuggestionKind;
  before: string;
  after: string;
  beforeHash: string;
  afterHash: string;
  /**
   * Where `after` sits in this seal's current text.
   * Absent once a later edit touches those letters. The check itself stays.
   */
  range?: { start: number; end: number };
}

export interface GrammarUsage {
  schema: 1;
  used: true;
  engine: 'harper';
  generative: false;
  comment: typeof GRAMMAR_CHECK_COMMENT;
  checks: GrammarCheck[];
}

export interface SpellCheck {
  id: string;
  /** When the writer accepted the suggestion. */
  at: string;
  /** Literal false. The suggestion is a dictionary replacement, not generated prose. */
  generative: false;
  before: string;
  after: string;
  beforeHash: string;
  afterHash: string;
  /**
   * Where `after` sits in this seal's current text.
   * Absent once a later edit touches those letters. The check itself stays.
   */
  range?: { start: number; end: number };
}

export interface SpellUsage {
  schema: 1;
  used: true;
  generative: false;
  comment: typeof SPELL_CHECK_COMMENT;
  checks: SpellCheck[];
}

const GRAMMAR_DIALECTS = new Set<GrammarDialect>(['American', 'British', 'Canadian', 'Australian', 'Indian']);
const GRAMMAR_SUGGESTIONS = new Set<GrammarSuggestionKind>(['replace', 'remove', 'insert-after']);

/** Keep a saved grammar record only when it still matches this seal. */
export function readGrammarUsage(value: unknown): GrammarUsage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const usage = value as GrammarUsage;
  if (usage.schema !== 1 || usage.used !== true || usage.engine !== 'harper' || usage.generative !== false) return undefined;
  if (usage.comment !== GRAMMAR_CHECK_COMMENT || !Array.isArray(usage.checks)) return undefined;
  const checks: GrammarCheck[] = [];
  for (const item of usage.checks) {
    if (!item || typeof item !== 'object') return undefined;
    const check = item as GrammarCheck;
    if (
      typeof check.id !== 'string' ||
      typeof check.at !== 'string' ||
      check.engine !== 'harper' ||
      typeof check.engineVersion !== 'string' ||
      check.generative !== false ||
      !GRAMMAR_DIALECTS.has(check.dialect) ||
      !GRAMMAR_SUGGESTIONS.has(check.suggestion) ||
      typeof check.lintKind !== 'string' ||
      typeof check.message !== 'string' ||
      typeof check.before !== 'string' ||
      typeof check.after !== 'string' ||
      typeof check.beforeHash !== 'string' ||
      typeof check.afterHash !== 'string'
    ) {
      return undefined;
    }
    const next: GrammarCheck = {
      id: check.id,
      at: check.at,
      engine: 'harper',
      engineVersion: check.engineVersion,
      generative: false,
      dialect: check.dialect,
      lintKind: check.lintKind,
      message: check.message,
      suggestion: check.suggestion,
      before: check.before,
      after: check.after,
      beforeHash: check.beforeHash,
      afterHash: check.afterHash,
    };
    if (check.range) {
      if (typeof check.range.start !== 'number' || typeof check.range.end !== 'number') return undefined;
      next.range = { start: check.range.start, end: check.range.end };
    }
    checks.push(next);
  }
  return {
    schema: 1,
    used: true,
    engine: 'harper',
    generative: false,
    comment: GRAMMAR_CHECK_COMMENT,
    checks,
  };
}

/** Keep a saved spellcheck record only when it still matches this seal. */
export function readSpellUsage(value: unknown): SpellUsage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const usage = value as SpellUsage;
  if (usage.schema !== 1 || usage.used !== true || usage.generative !== false) return undefined;
  if (usage.comment !== SPELL_CHECK_COMMENT || !Array.isArray(usage.checks)) return undefined;
  const checks: SpellCheck[] = [];
  for (const item of usage.checks) {
    if (!item || typeof item !== 'object') return undefined;
    const check = item as SpellCheck;
    if (
      typeof check.id !== 'string' ||
      typeof check.at !== 'string' ||
      check.generative !== false ||
      typeof check.before !== 'string' ||
      typeof check.after !== 'string' ||
      typeof check.beforeHash !== 'string' ||
      typeof check.afterHash !== 'string'
    ) {
      return undefined;
    }
    const next: SpellCheck = {
      id: check.id,
      at: check.at,
      generative: false,
      before: check.before,
      after: check.after,
      beforeHash: check.beforeHash,
      afterHash: check.afterHash,
    };
    if (check.range) {
      if (typeof check.range.start !== 'number' || typeof check.range.end !== 'number') return undefined;
      next.range = { start: check.range.start, end: check.range.end };
    }
    checks.push(next);
  }
  return {
    schema: 1,
    used: true,
    generative: false,
    comment: SPELL_CHECK_COMMENT,
    checks,
  };
}

/** Drop a check note that does not match the fixed wording. The seal itself stays. */
export function sanitizePointChecks(point: CertificationPoint): CertificationPoint {
  let next = point;
  if (point.grammar != null) {
    const grammar = readGrammarUsage(point.grammar);
    if (!grammar) {
      next = { ...next };
      delete next.grammar;
    } else {
      next = { ...next, grammar };
    }
  }
  if (point.spellcheck != null) {
    const spellcheck = readSpellUsage(next.spellcheck);
    if (!spellcheck) {
      next = { ...next };
      delete next.spellcheck;
    } else {
      next = { ...next, spellcheck };
    }
  }
  return next;
}

export interface MoveRecord {
  id: string;
  at: string;
  blockIds: string[];
  fromIndex: number;
  toIndex: number;
  label: string;
}

export const TRUST_STATEMENT =
  'Browser keystroke, dictation, paste, and drop events are evidence of how text entered this editor. They are not proof against someone simulating those events. A certification point is a SHA-256 hash of the current keyboard-typed or dictated span plus the input events observed with it. It is not a cryptographic authorship certificate, and it does not prove the writer was unaided outside this page.';

export const MAX_EVIDENCE_EVENTS = 40;
export const MAX_PRIOR_HASHES = 12;
const MAX_EVENT_DATA = 240;

/**
 * A trusted insertText of this many characters is one keystroke.
 * A longer trusted insertText is the platform dictation path (not a paste, drop, or keystroke).
 */
export const MAX_KEYBOARD_INSERT_CHARS = 1;
/** Inter-key interval below this is not treated as human typing for sealing. */
export const MIN_HUMAN_KEY_INTERVAL_MS = 6;

export type InputClass =
  | { kind: 'insert'; origin: InsertionOrigin }
  | { kind: 'delete' }
  | { kind: 'split' }
  | { kind: 'ignore' }
  /** Spelling replacement. Not paste, drop, or other. */
  | { kind: 'spellcheck' };

export function classifyInputType(inputType: string | undefined, trusted: boolean): InputClass {
  return classifyInsertion({ inputType, trusted, data: null, sinceLastMs: null });
}

export function classifyInsertion(args: {
  inputType: string | undefined;
  trusted: boolean;
  data: string | null;
  sinceLastMs: number | null;
}): InputClass {
  const kindName = args.inputType ?? '';
  if (kindName === 'insertCompositionText' || kindName === 'deleteCompositionText') {
    return { kind: 'ignore' };
  }
  if (kindName === 'insertParagraph' || kindName === 'insertLineBreak') return { kind: 'split' };
  if (kindName.startsWith('delete') || kindName === 'deleteByCut' || kindName === 'deleteByDrag') {
    return { kind: 'delete' };
  }
  if (kindName.startsWith('history') || kindName.startsWith('format')) return { kind: 'ignore' };
  if (!kindName.startsWith('insert')) return { kind: 'ignore' };

  if (kindName === 'insertFromDictation') return { kind: 'insert', origin: 'dictation' };

  if (kindName === 'insertText' || (!kindName && typeof args.data === 'string')) {
    if (!args.trusted) return { kind: 'insert', origin: 'other' };
    const len = args.data?.length ?? 0;
    // Platform dictation often arrives as one multi-character insertText, not insertFromDictation.
    if (len > MAX_KEYBOARD_INSERT_CHARS) return { kind: 'insert', origin: 'dictation' };
    if (args.sinceLastMs != null && args.sinceLastMs < MIN_HUMAN_KEY_INTERVAL_MS) {
      return { kind: 'insert', origin: 'other' };
    }
    return { kind: 'insert', origin: 'keyboard' };
  }
  if (
    kindName === 'insertFromPaste' ||
    kindName === 'insertFromPasteAsQuotation' ||
    kindName === 'insertFromYank'
  ) {
    return { kind: 'insert', origin: 'paste' };
  }
  if (kindName === 'insertFromDrop') return { kind: 'insert', origin: 'drop' };
  // The platform dictionary's replacement. Not a paste, drop, or other insertion.
  if (kindName === 'insertReplacementText') return { kind: 'spellcheck' };
  return { kind: 'insert', origin: 'other' };
}

export function clipEvidence(event: InputEvidence): InputEvidence {
  if (event.data == null || event.data.length <= MAX_EVENT_DATA) return event;
  return { ...event, data: `${event.data.slice(0, MAX_EVENT_DATA)}…` };
}

export async function contentHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function canMerge(a: ProvenanceSpan, b: ProvenanceSpan): boolean {
  if (a.origin !== b.origin) return false;
  if (!isSealedOrigin(a.origin)) return true;
  if (!a.certificationId || !b.certificationId) return true;
  return a.certificationId === b.certificationId;
}

export function mergeAdjacent(spans: ProvenanceSpan[]): ProvenanceSpan[] {
  const out: ProvenanceSpan[] = [];
  for (const span of spans) {
    const prev = out[out.length - 1];
    if (prev && prev.end === span.start && canMerge(prev, span)) {
      prev.end = span.end;
      if (!prev.certificationId && span.certificationId) prev.certificationId = span.certificationId;
      continue;
    }
    out.push({ ...span });
  }
  return out;
}

/** Fill gaps with uncertified `other` spans. Unknown text is never treated as keyboard. */
export function normalizeSpans(
  text: string,
  spans: ProvenanceSpan[],
  newId: () => string,
): ProvenanceSpan[] {
  if (!text) return [];
  const sorted = spans
    .map((s) => ({
      ...s,
      start: Math.max(0, Math.min(s.start, text.length)),
      end: Math.max(0, Math.min(s.end, text.length)),
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: ProvenanceSpan[] = [];
  let cursor = 0;
  for (const span of sorted) {
    if (span.start > cursor) {
      out.push({ id: newId(), start: cursor, end: span.start, origin: 'other' });
    }
    const start = Math.max(span.start, cursor);
    if (span.end > start) {
      out.push({ ...span, start });
      cursor = span.end;
    }
  }
  if (cursor < text.length) out.push({ id: newId(), start: cursor, end: text.length, origin: 'other' });
  return mergeAdjacent(out);
}

export function shiftMarks(
  marks: InlineMark[] | undefined,
  start: number,
  end: number,
  insertLen: number,
  nextLength: number,
): InlineMark[] {
  const delta = insertLen - (end - start);
  const next: InlineMark[] = [];
  for (const mark of marks ?? []) {
    if (mark.end <= start) {
      next.push(mark);
      continue;
    }
    if (mark.start >= end) {
      next.push({ ...mark, start: mark.start + delta, end: mark.end + delta });
      continue;
    }
    const coversInsert = insertLen > 0 && mark.start <= start && mark.end >= end;
    if (mark.start < start) next.push({ ...mark, end: start });
    if (coversInsert) next.push({ ...mark, start, end: start + insertLen });
    if (mark.end > end) next.push({ ...mark, start: start + insertLen, end: mark.end + delta });
  }
  if (insertLen > 0 && start === end) {
    for (const mark of marks ?? []) {
      if (mark.end === start && mark.start < start) {
        next.push({ ...mark, start, end: start + insertLen });
      }
    }
  }
  return normalizeMarks(next, nextLength);
}

export interface TextChange {
  text: string;
  spans: ProvenanceSpan[];
  marks: InlineMark[];
  /** Keyboard spans whose sealed text changed and should receive the evidence event. */
  evidenceSpanIds: string[];
}

/**
 * Replace [start, end) with `insert`.
 * `origin` is null for a pure deletion.
 * Keyboard text merges into a neighboring keyboard seal, and dictation into a
 * neighboring dictation seal. Paste never merges into a seal.
 */
export function applyTextChange(args: {
  text: string;
  spans: ProvenanceSpan[];
  marks: InlineMark[];
  start: number;
  end: number;
  insert: string;
  origin: InsertionOrigin | null;
  pasteHint?: string;
  newId: () => string;
}): TextChange {
  const text = args.text ?? '';
  const start = Math.max(0, Math.min(args.start, text.length));
  const end = Math.max(start, Math.min(args.end, text.length));
  const insert = args.insert ?? '';
  if (start === end && insert === '') {
    return {
      text,
      spans: normalizeSpans(text, args.spans, args.newId),
      marks: normalizeMarks(args.marks, text.length),
      evidenceSpanIds: [],
    };
  }

  const nextText = text.slice(0, start) + insert + text.slice(end);
  const insertLen = insert.length;
  const delta = insertLen - (end - start);
  const rewritten: ProvenanceSpan[] = [];

  for (const span of normalizeSpans(text, args.spans, args.newId)) {
    if (span.end <= start) {
      rewritten.push(span);
      continue;
    }
    if (span.start >= end) {
      rewritten.push({ ...span, start: span.start + delta, end: span.end + delta });
      continue;
    }
    const keptLeft = span.start < start;
    if (keptLeft) rewritten.push({ ...span, end: start });
    if (span.end > end) {
      const rightStart = start + insertLen;
      const rightEnd = span.end + delta;
      if (rightEnd > rightStart) {
        rewritten.push(
          keptLeft
            ? { ...span, id: args.newId(), start: rightStart, end: rightEnd }
            : { ...span, start: rightStart, end: rightEnd },
        );
      }
    }
  }

  if (insertLen > 0 && args.origin) {
    rewritten.push({
      id: args.newId(),
      start,
      end: start + insertLen,
      origin: args.origin,
      ...(args.origin === 'paste' && args.pasteHint ? { pasteHint: args.pasteHint } : {}),
    });
  }

  rewritten.sort((a, b) => a.start - b.start || a.end - b.end);
  const spans = normalizeSpans(nextText, rewritten, args.newId);
  const regionEnd = start + insertLen;
  const evidenceSpanIds =
    insertLen > 0
      ? spans.filter((s) => isSealedOrigin(s.origin) && s.start < regionEnd && s.end > start).map((s) => s.id)
      : spans.filter((s) => isSealedOrigin(s.origin) && (s.end === start || s.start === start)).map((s) => s.id);

  return {
    text: nextText,
    spans,
    marks: shiftMarks(args.marks, start, end, insertLen, nextText.length),
    evidenceSpanIds,
  };
}

export function splitSpans(
  spans: ProvenanceSpan[],
  offset: number,
  textLength: number,
  newId: () => string,
): { left: ProvenanceSpan[]; right: ProvenanceSpan[] } {
  const at = Math.max(0, Math.min(Math.floor(offset), textLength));
  const left: ProvenanceSpan[] = [];
  const right: ProvenanceSpan[] = [];
  for (const span of spans) {
    if (span.end <= span.start) continue;
    if (span.end <= at) {
      left.push(span);
      continue;
    }
    if (span.start >= at) {
      right.push({ ...span, start: span.start - at, end: span.end - at });
      continue;
    }
    left.push({ ...span, end: at });
    right.push({ ...span, id: newId(), start: 0, end: span.end - at });
  }
  return {
    left: normalizeSpans('x'.repeat(at), left, newId),
    right: normalizeSpans('x'.repeat(Math.max(0, textLength - at)), right, newId),
  };
}

/** Move a slice of text inside one string without changing origin or certification ids. */
export function relocateRange(args: {
  text: string;
  spans: ProvenanceSpan[];
  marks: InlineMark[];
  fromStart: number;
  fromEnd: number;
  dropAt: number;
  newId: () => string;
}): TextChange | null {
  const text = args.text ?? '';
  const fromStart = Math.max(0, Math.min(args.fromStart, text.length));
  const fromEnd = Math.max(fromStart, Math.min(args.fromEnd, text.length));
  const dropAt = Math.max(0, Math.min(args.dropAt, text.length));
  if (fromEnd === fromStart) return null;
  if (dropAt >= fromStart && dropAt <= fromEnd) return null;

  const moving = text.slice(fromStart, fromEnd);
  const spans = normalizeSpans(text, args.spans, args.newId);
  const carried: ProvenanceSpan[] = [];
  for (const span of spans) {
    const a = Math.max(span.start, fromStart);
    const b = Math.min(span.end, fromEnd);
    if (b > a) {
      carried.push({ ...span, id: span.start >= fromStart && span.end <= fromEnd ? span.id : args.newId(), start: a, end: b });
    }
  }

  const carriedMarks: InlineMark[] = [];
  for (const mark of args.marks) {
    const a = Math.max(mark.start, fromStart);
    const b = Math.min(mark.end, fromEnd);
    if (b > a) carriedMarks.push({ ...mark, start: a - fromStart, end: b - fromStart });
  }

  const removed = applyTextChange({
    text,
    spans,
    marks: args.marks,
    start: fromStart,
    end: fromEnd,
    insert: '',
    origin: null,
    newId: args.newId,
  });
  const insertAt = dropAt > fromEnd ? dropAt - (fromEnd - fromStart) : dropAt;
  const base = removed.text;
  const nextText = base.slice(0, insertAt) + moving + base.slice(insertAt);
  const shifted: ProvenanceSpan[] = [];
  for (const span of removed.spans) {
    if (span.end <= insertAt) shifted.push(span);
    else if (span.start >= insertAt) {
      shifted.push({ ...span, start: span.start + moving.length, end: span.end + moving.length });
    } else {
      shifted.push({ ...span, end: insertAt });
      shifted.push({ ...span, id: args.newId(), start: insertAt + moving.length, end: span.end + moving.length });
    }
  }
  let cursor = insertAt;
  for (const piece of carried) {
    const len = piece.end - piece.start;
    shifted.push({ ...piece, start: cursor, end: cursor + len });
    cursor += len;
  }
  const nextSpans = normalizeSpans(nextText, shifted, args.newId);
  const placedMarks = [
    ...shiftMarks(removed.marks, insertAt, insertAt, moving.length, nextText.length),
    ...carriedMarks.map((mark) => ({ ...mark, start: mark.start + insertAt, end: mark.end + insertAt })),
  ];
  return {
    text: nextText,
    spans: nextSpans,
    marks: normalizeMarks(placedMarks, nextText.length),
    evidenceSpanIds: [],
  };
}

function edgeEdit(previous: string, next: string): boolean {
  if (!previous || !next) return false;
  return next.startsWith(previous) || previous.startsWith(next) || next.endsWith(previous) || previous.endsWith(next);
}

interface RangedCheck {
  after: string;
  range?: { start: number; end: number };
}

function withoutRange<T extends RangedCheck>(check: T): T {
  if (!check.range) return check;
  const next = { ...check };
  delete next.range;
  return next;
}

/** Move a check with the letters it describes. A check the edit overwrites loses its range. */
export function retargetRangedChecks<T extends RangedCheck>(args: {
  checks: T[];
  oldSealText: string;
  newSealText: string;
  newSpanStart: number;
  textEdit?: { start: number; end: number; insertLength: number };
}): T[] {
  if (args.oldSealText === args.newSealText) return args.checks;
  const textEdit = args.textEdit;
  return args.checks.map((check) => {
    if (!check.range || !textEdit) return withoutRange(check);
    const next = mapCheckRange({
      range: check.range,
      newSpanStart: args.newSpanStart,
      newSealText: args.newSealText,
      textEdit,
    });
    if (!next || args.newSealText.slice(next.start, next.end) !== check.after) return withoutRange(check);
    return { ...check, range: next };
  });
}

function mapCheckRange(args: {
  range: { start: number; end: number };
  newSpanStart: number;
  newSealText: string;
  textEdit: { start: number; end: number; insertLength: number };
}): { start: number; end: number } | null {
  const { textEdit } = args;
  const removed = textEdit.end - textEdit.start;
  const delta = textEdit.insertLength - removed;
  const newEditStart = textEdit.start;
  const newEditEnd = textEdit.start + textEdit.insertLength;
  const newSpanEnd = args.newSpanStart + args.newSealText.length;
  let oldSpanStart: number;
  if (newSpanEnd <= newEditStart) oldSpanStart = args.newSpanStart;
  else if (args.newSpanStart >= newEditEnd) oldSpanStart = args.newSpanStart - delta;
  else if (args.newSpanStart <= newEditStart) oldSpanStart = args.newSpanStart;
  else oldSpanStart = textEdit.start;

  const mapPoint = (offsetInOldSeal: number): number | null => {
    const pos = oldSpanStart + offsetInOldSeal;
    if (pos < textEdit.start) return pos;
    if (pos >= textEdit.end) return pos + delta;
    return null;
  };
  const mappedStart = mapPoint(args.range.start);
  const mappedEnd = mapPoint(args.range.end);
  if (mappedStart == null || mappedEnd == null) return null;
  const start = mappedStart - args.newSpanStart;
  const end = mappedEnd - args.newSpanStart;
  if (start < 0 || end < start || end > args.newSealText.length) return null;
  return { start, end };
}

/**
 * Replace [start, end) without assigning a new origin.
 * The letters stay in the span that already covers them.
 * Returns null when the range is not inside a single span, so a seal is never split into paste, drop, or other.
 */
export function revisePreservingOrigin(args: {
  text: string;
  spans: ProvenanceSpan[];
  marks: InlineMark[];
  start: number;
  end: number;
  insert: string;
  newId: () => string;
}): (TextChange & { hostSpanId: string; certificationId?: string }) | null {
  const text = args.text ?? '';
  const start = Math.max(0, Math.min(args.start, text.length));
  const end = Math.max(start, Math.min(args.end, text.length));
  const insert = args.insert ?? '';
  if (insert.includes('\n') || insert.includes('\r')) return null;
  if (start === end && insert === '') return null;
  const spans = normalizeSpans(text, args.spans, args.newId);
  const host = spans.find((span) => span.start <= start && span.end >= end && span.end > span.start);
  if (!host) return null;
  const overlapsAnother = spans.some((span) => span.id !== host.id && span.end > start && span.start < end);
  if (overlapsAnother) return null;

  const nextText = text.slice(0, start) + insert + text.slice(end);
  const delta = insert.length - (end - start);
  const nextSpans = spans.map((span) => {
    if (span.id === host.id) return { ...span, end: span.end + delta };
    if (span.end <= start) return { ...span };
    if (span.start >= end) return { ...span, start: span.start + delta, end: span.end + delta };
    return { ...span };
  });
  const normalized = normalizeSpans(nextText, nextSpans, args.newId);
  const kept = normalized.find((span) => span.id === host.id);
  return {
    text: nextText,
    spans: normalized,
    marks: shiftMarks(args.marks, start, end, insert.length, nextText.length),
    evidenceSpanIds: [],
    hostSpanId: kept?.id ?? host.id,
    ...(isSealedOrigin(host.origin) && host.certificationId ? { certificationId: host.certificationId } : {}),
  };
}

export async function syncBlockPoints(args: {
  blockId: string;
  text: string;
  spans: ProvenanceSpan[];
  points: CertificationPoint[];
  evidence?: { spanIds: string[]; event: InputEvidence } | null;
  now: string;
  newId: () => string;
  typingDevice?: string | null;
  /** Block coordinates of the edit that produced `text`, so check notes move with the letters. */
  textEdit?: { start: number; end: number; insertLength: number };
}): Promise<{ spans: ProvenanceSpan[]; points: CertificationPoint[] }> {
  const typingDevice = args.typingDevice ?? (await getTypingDeviceLabel());
  const spans = normalizeSpans(args.text, args.spans, args.newId).map((s) => ({ ...s }));
  const pool = new Map(args.points.map((p) => [p.id, p]));
  const usedCert = new Set<string>();
  const kept: CertificationPoint[] = [];
  const evidenceIds = new Set(args.evidence?.spanIds ?? []);
  const event = args.evidence ? clipEvidence(args.evidence.event) : null;

  for (const span of spans) {
    if (!isSealedOrigin(span.origin)) {
      delete span.certificationId;
      continue;
    }
    const sealedOrigin = span.origin;
    const stayed = sealedOrigin === 'dictation' ? 'dictated' : 'keyboard-typed';
    const slice = args.text.slice(span.start, span.end);
    const hash = await contentHash(slice);
    const source = span.certificationId ? pool.get(span.certificationId) : undefined;
    const previousSealText = source?.text;
    const foreign = Boolean(source && source.blockId !== args.blockId);
    let point = source && !foreign && source.origin === sealedOrigin ? source : undefined;
    let lineage = point?.lineage;
    if (source && source.origin === sealedOrigin && (foreign || usedCert.has(source.id))) {
      const id = args.newId();
      lineage = foreign
        ? `Split from certification ${source.id} when the passage moved to another block. The remnant stayed ${stayed}.`
        : `Split from certification ${source.id}. The remnant stayed ${stayed}; this hash covers only this piece.`;
      point = {
        ...source,
        id,
        blockId: args.blockId,
        spanId: span.id,
        text: slice,
        contentHash: hash,
        updatedAt: args.now,
        origin: sealedOrigin,
        priorHashes:
          source.contentHash === hash
            ? source.priorHashes
            : [...source.priorHashes, source.contentHash].slice(-MAX_PRIOR_HASHES),
        lineage,
        evidence: {
          inputTypes: [...source.evidence.inputTypes],
          eventCount: source.evidence.eventCount,
          events: source.evidence.events.map((e) => ({ ...e })),
        },
        typingDevice: source.typingDevice,
      };
      span.certificationId = id;
    } else if (!point) {
      const id = args.newId();
      point = {
        id,
        blockId: args.blockId,
        spanId: span.id,
        text: slice,
        contentHash: hash,
        sealedAt: args.now,
        updatedAt: args.now,
        origin: sealedOrigin,
        evidence: { inputTypes: [], eventCount: 0, events: [] },
        priorHashes: [],
        typingDevice: typingDevice ?? undefined,
      };
      span.certificationId = id;
    } else {
      const prior =
        point.text === slice || edgeEdit(point.text, slice)
          ? point.priorHashes
          : [...point.priorHashes, point.contentHash].slice(-MAX_PRIOR_HASHES);
      point = {
        ...point,
        spanId: span.id,
        text: slice,
        contentHash: hash,
        updatedAt: point.text === slice && point.contentHash === hash ? point.updatedAt : args.now,
        priorHashes: point.contentHash === hash ? point.priorHashes : prior,
        lineage,
      };
      span.certificationId = point.id;
    }
    if (event && evidenceIds.has(span.id)) {
      const inputTypes = point.evidence.inputTypes.includes(event.inputType)
        ? point.evidence.inputTypes
        : [...point.evidence.inputTypes, event.inputType];
      point = {
        ...point,
        updatedAt: args.now,
        evidence: {
          inputTypes,
          eventCount: point.evidence.eventCount + 1,
          events: [...point.evidence.events, event].slice(-MAX_EVIDENCE_EVENTS),
        },
      };
    }
    if (previousSealText != null && previousSealText !== slice) {
      if (point.grammar) {
        point = {
          ...point,
          grammar: {
            ...point.grammar,
            checks: retargetRangedChecks({
              checks: point.grammar.checks,
              oldSealText: previousSealText,
              newSealText: slice,
              newSpanStart: span.start,
              textEdit: args.textEdit,
            }),
          },
        };
      }
      if (point.spellcheck) {
        point = {
          ...point,
          spellcheck: {
            ...point.spellcheck,
            checks: retargetRangedChecks({
              checks: point.spellcheck.checks,
              oldSealText: previousSealText,
              newSealText: slice,
              newSpanStart: span.start,
              textEdit: args.textEdit,
            }),
          },
        };
      }
    }
    usedCert.add(point.id);
    kept.push(point);
  }

  const others = args.points.filter((p) => p.blockId !== args.blockId);
  return { spans, points: [...others, ...kept] };
}

/**
 * After JSON/localStorage load, drop keyboard and dictation seals that do not match stored hashes or text.
 * Does not upgrade unknown text to a sealed origin.
 */
export async function stripInvalidKeyboardSeals(args: {
  text: string;
  spans: ProvenanceSpan[];
  points: CertificationPoint[];
  newId: () => string;
}): Promise<ProvenanceSpan[]> {
  const byId = new Map(args.points.map((p) => [p.id, p]));
  const spans = normalizeSpans(args.text, args.spans, args.newId).map((span) => ({ ...span }));
  for (const span of spans) {
    if (!isSealedOrigin(span.origin) || !span.certificationId) {
      if (!isSealedOrigin(span.origin)) delete span.certificationId;
      continue;
    }
    const slice = args.text.slice(span.start, span.end);
    const point = byId.get(span.certificationId);
    if (!point || point.origin !== span.origin || point.text !== slice) {
      span.origin = 'other';
      delete span.certificationId;
      continue;
    }
    const hash = await contentHash(slice);
    if (point.contentHash !== hash) {
      span.origin = 'other';
      delete span.certificationId;
    }
  }
  return spans;
}

export function countOriginWords(text: string, spans: ProvenanceSpan[]): { certified: number; uncertified: number } {
  const certifiedSet = new Set<number>();
  for (const span of spans) {
    if (!isSealedOrigin(span.origin) || !span.certificationId) continue;
    for (let i = span.start; i < span.end; i++) certifiedSet.add(i);
  }
  let certified = 0;
  let uncertified = 0;
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const certifiedWord = certifiedSet.has(match.index);
    if (certifiedWord) certified += 1;
    else uncertified += 1;
  }
  return { certified, uncertified };
}
