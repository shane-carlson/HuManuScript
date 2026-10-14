/**
 * Human-authorship certification for a Speak Fiction-style manuscript.
 *
 * A certification point seals the current text of one keyboard-origin span
 * with a SHA-256 content hash, the input events observed for that span, and
 * the time. Paste, drop, and other insertions stay uncertified.
 *
 * Browser events are evidence of how text entered this editor. They are not
 * proof against someone simulating events.
 */

import type { InlineMark } from './types.ts';
import { normalizeMarks } from './richText.ts';

export type InsertionOrigin = 'keyboard' | 'paste' | 'drop' | 'other';

export interface ProvenanceSpan {
  id: string;
  start: number;
  end: number;
  origin: InsertionOrigin;
  certificationId?: string;
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
  origin: 'keyboard';
  evidence: {
    inputTypes: string[];
    eventCount: number;
    events: InputEvidence[];
  };
  /** Earlier hashes when an edit changed more than the edge of the span. */
  priorHashes: string[];
  lineage?: string;
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
  'Browser keystroke, paste, and drop events are evidence of how text entered this editor. They are not proof against someone simulating those events. A certification point is a SHA-256 hash of the current keyboard-typed span plus the input events observed with it. It is not a cryptographic authorship certificate, and it does not prove the writer was unaided outside this page.';

export const MAX_EVIDENCE_EVENTS = 40;
export const MAX_PRIOR_HASHES = 12;
const MAX_EVENT_DATA = 240;

export function classifyInputType(
  inputType: string | undefined,
  trusted: boolean,
):
  | { kind: 'insert'; origin: InsertionOrigin }
  | { kind: 'delete' }
  | { kind: 'split' }
  | { kind: 'ignore' } {
  const kindName = inputType ?? '';
  if (kindName === 'insertCompositionText' || kindName === 'deleteCompositionText') {
    return { kind: 'ignore' };
  }
  if (kindName === 'insertParagraph' || kindName === 'insertLineBreak') return { kind: 'split' };
  if (kindName.startsWith('delete') || kindName === 'deleteByCut' || kindName === 'deleteByDrag') {
    return { kind: 'delete' };
  }
  if (kindName.startsWith('history') || kindName.startsWith('format')) return { kind: 'ignore' };
  if (!kindName.startsWith('insert')) return { kind: 'ignore' };

  if (kindName === 'insertText') {
    return { kind: 'insert', origin: trusted ? 'keyboard' : 'other' };
  }
  if (
    kindName === 'insertFromPaste' ||
    kindName === 'insertFromPasteAsQuotation' ||
    kindName === 'insertFromYank'
  ) {
    return { kind: 'insert', origin: 'paste' };
  }
  if (kindName === 'insertFromDrop') return { kind: 'insert', origin: 'drop' };
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
  if (a.origin !== 'keyboard') return true;
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
 * Keyboard text merges into a neighboring keyboard seal; paste never does.
 */
export function applyTextChange(args: {
  text: string;
  spans: ProvenanceSpan[];
  marks: InlineMark[];
  start: number;
  end: number;
  insert: string;
  origin: InsertionOrigin | null;
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
    rewritten.push({ id: args.newId(), start, end: start + insertLen, origin: args.origin });
  }

  rewritten.sort((a, b) => a.start - b.start || a.end - b.end);
  const spans = normalizeSpans(nextText, rewritten, args.newId);
  const regionEnd = start + insertLen;
  const evidenceSpanIds =
    insertLen > 0
      ? spans.filter((s) => s.origin === 'keyboard' && s.start < regionEnd && s.end > start).map((s) => s.id)
      : spans.filter((s) => s.origin === 'keyboard' && (s.end === start || s.start === start)).map((s) => s.id);

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

export async function syncBlockPoints(args: {
  blockId: string;
  text: string;
  spans: ProvenanceSpan[];
  points: CertificationPoint[];
  evidence?: { spanIds: string[]; event: InputEvidence } | null;
  now: string;
  newId: () => string;
}): Promise<{ spans: ProvenanceSpan[]; points: CertificationPoint[] }> {
  const spans = normalizeSpans(args.text, args.spans, args.newId).map((s) => ({ ...s }));
  const pool = new Map(args.points.map((p) => [p.id, p]));
  const usedCert = new Set<string>();
  const kept: CertificationPoint[] = [];
  const evidenceIds = new Set(args.evidence?.spanIds ?? []);
  const event = args.evidence ? clipEvidence(args.evidence.event) : null;

  for (const span of spans) {
    if (span.origin !== 'keyboard') {
      delete span.certificationId;
      continue;
    }
    const slice = args.text.slice(span.start, span.end);
    const hash = await contentHash(slice);
    const source = span.certificationId ? pool.get(span.certificationId) : undefined;
    const foreign = Boolean(source && source.blockId !== args.blockId);
    let point = source && !foreign ? source : undefined;
    let lineage = point?.lineage;
    if (source && (foreign || usedCert.has(source.id))) {
      const id = args.newId();
      lineage = foreign
        ? `Split from certification ${source.id} when the passage moved to another block. The remnant stayed keyboard-typed.`
        : `Split from certification ${source.id}. The remnant stayed keyboard-typed; this hash covers only this piece.`;
      point = {
        ...source,
        id,
        blockId: args.blockId,
        spanId: span.id,
        text: slice,
        contentHash: hash,
        updatedAt: args.now,
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
        origin: 'keyboard',
        evidence: { inputTypes: [], eventCount: 0, events: [] },
        priorHashes: [],
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
    usedCert.add(point.id);
    kept.push(point);
  }

  const others = args.points.filter((p) => p.blockId !== args.blockId);
  return { spans, points: [...others, ...kept] };
}

export function countOriginWords(text: string, spans: ProvenanceSpan[]): { certified: number; uncertified: number } {
  const certifiedSet = new Set<number>();
  for (const span of spans) {
    if (span.origin !== 'keyboard' || !span.certificationId) continue;
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
