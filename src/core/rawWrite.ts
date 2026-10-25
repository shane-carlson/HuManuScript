/**
 * Raw write turns the manuscript into one page of text.
 * Typing lands in that page. A highlight can later become a chapter, scene,
 * section, paragraph, or block quote, and can take bold, italic, or strike.
 * Tables, images, and breaks stay in the manuscript and are not part of the page.
 */

import {
  applyTextChange,
  normalizeSpans,
  splitSpans,
  syncBlockPoints,
  type InputEvidence,
  type InsertionOrigin,
  type ProvenanceSpan,
} from './certification.ts';
import { editField, type ManuscriptDocument } from './document.ts';
import { isHeadingType } from './manuscript.ts';
import { clearFormatting, normalizeMarks, toggleMark } from './richText.ts';
import { isProseBlock, type InlineMark, type InlineMarkKind, type ManuscriptBlock } from './types.ts';

export const RAW_KINDS = ['chapter', 'scene', 'section', 'paragraph', 'blockquote'] as const;
export type RawKind = (typeof RAW_KINDS)[number];

export type RawSegment = {
  blockId: string;
  kind: RawKind;
  text: string;
  start: number;
  end: number;
};

export type RawFlat = {
  text: string;
  segments: RawSegment[];
};

type Atom =
  | { type: 'char'; flat: number; ch: string; blockId?: string; kind?: RawKind; local?: number; fresh?: boolean; origin?: InsertionOrigin }
  | { type: 'sep'; flat: number; fresh?: boolean }
  | { type: 'empty'; at: number; blockId?: string; kind?: RawKind };

type Run = {
  text: string;
  blockId: string | null;
  localStart: number;
  localEnd: number;
  origin: InsertionOrigin | null;
};

type Chunk = {
  id: string;
  kind: RawKind;
  text: string;
  sourceIds: string[];
  spans: ProvenanceSpan[];
  marks: InlineMark[];
};

export function isRawKind(type: string): type is RawKind {
  return (RAW_KINDS as readonly string[]).includes(type);
}

export function flattenRaw(doc: ManuscriptDocument): RawFlat {
  const segments: RawSegment[] = [];
  let text = '';
  for (const block of doc.blocks) {
    if (!isRawKind(block.type)) continue;
    if (segments.length) text += '\n';
    const piece = isHeadingType(block.type) ? block.title : block.text;
    const start = text.length;
    text += piece;
    segments.push({ blockId: block.id, kind: block.type, text: piece, start, end: text.length });
  }
  return { text, segments };
}

export function rawKindAt(doc: ManuscriptDocument, start: number, end: number): RawKind | null {
  const flat = flattenRaw(doc);
  const trimmed = trimToText(flat.text, start, end);
  if (trimmed.end <= trimmed.start) return null;
  const host = flat.segments.find((segment) => trimmed.start >= segment.start && trimmed.end <= segment.end);
  if (!host) return null;
  return host.kind;
}

export async function replaceRawRange(args: {
  doc: ManuscriptDocument;
  start: number;
  end: number;
  insert: string;
  origin: InsertionOrigin | null;
  event?: InputEvidence | null;
  now: string;
  newId: () => string;
}): Promise<ManuscriptDocument> {
  const flat = flattenRaw(args.doc);
  const start = clamp(args.start, 0, flat.text.length);
  const end = clamp(args.end, start, flat.text.length);
  const insert = args.insert.replace(/\r\n/g, '\n');
  if (start === end && insert === '') return args.doc;

  if (flat.segments.length === 0) {
    if (!insert) return args.doc;
    return materialize(args.doc, groupAtoms(atomsFromInsert(insert, args.origin), args.newId, false), args);
  }

  const host = flat.segments.find((segment) => start >= segment.start && end <= segment.end);
  if (host && !insert.includes('\n')) {
    return editField({
      doc: args.doc,
      blockId: host.blockId,
      field: isHeadingType(host.kind) ? 'title' : 'text',
      start: start - host.start,
      end: end - host.start,
      insert,
      origin: args.origin,
      event: args.event ?? null,
      now: args.now,
      newId: args.newId,
    });
  }

  const atoms = spliceAtoms(atomsFromDoc(args.doc), start, end, insert, args.origin);
  return materialize(args.doc, groupAtoms(atoms, args.newId, atoms.at(-1)?.type === 'sep'), args);
}

export async function assignRawKind(args: {
  doc: ManuscriptDocument;
  start: number;
  end: number;
  kind: RawKind;
  now: string;
  newId: () => string;
}): Promise<ManuscriptDocument> {
  const flat = flattenRaw(args.doc);
  const range = trimToText(flat.text, args.start, args.end);
  if (range.end <= range.start) return args.doc;
  const exact = flat.segments.find((segment) => segment.start === range.start && segment.end === range.end);
  if (exact) return retargetBlock(args.doc, exact.blockId, args.kind);

  const { before, body, after } = takeSelection(atomsFromDoc(args.doc), range.start, range.end);
  if (!body.some((atom) => atom.type === 'char' && atom.ch.trim())) return args.doc;
  const joined = joinSelection(before, body, after);
  const chunks = groupAtoms(joined.atoms, args.newId, false);
  const forced = chunks.map((chunk) =>
    chunk.chars.some((atom) => joined.body.includes(atom)) ? { ...chunk, kind: args.kind } : chunk,
  );
  return materialize(args.doc, forced, { ...args, origin: null });
}

export function clearRawFormat(doc: ManuscriptDocument, start: number, end: number): ManuscriptDocument {
  const flat = flattenRaw(doc);
  const from = Math.max(0, Math.min(start, flat.text.length));
  const to = Math.max(from, Math.min(end, flat.text.length));
  if (to <= from) return doc;
  return {
    ...doc,
    blocks: doc.blocks.map((block) => {
      const segment = flat.segments.find((item) => item.blockId === block.id);
      if (!segment || !isProseBlock(block.type)) return block;
      const overlapStart = Math.max(from, segment.start);
      const overlapEnd = Math.min(to, segment.end);
      if (overlapEnd <= overlapStart) return block;
      return {
        ...block,
        marks: clearFormatting(block.marks, overlapStart - segment.start, overlapEnd - segment.start, block.text.length),
      };
    }),
  };
}

export function applyRawFormat(
  doc: ManuscriptDocument,
  start: number,
  end: number,
  kind: InlineMarkKind,
): ManuscriptDocument {
  const flat = flattenRaw(doc);
  let from = Math.max(0, Math.min(start, flat.text.length));
  let to = Math.max(from, Math.min(end, flat.text.length));
  if (to <= from) {
    const host = flat.segments.find((segment) => from >= segment.start && from <= segment.end && isProseBlock(segment.kind));
    if (!host) return doc;
    const local = from - host.start;
    const word = expandWord(host.text, local);
    if (word.end <= word.start) return doc;
    return toggleOnBlock(doc, host.blockId, word.start, word.end, kind);
  }
  let next = doc;
  for (const segment of flat.segments) {
    if (!isProseBlock(segment.kind)) continue;
    const overlapStart = Math.max(from, segment.start);
    const overlapEnd = Math.min(to, segment.end);
    if (overlapEnd <= overlapStart) continue;
    next = toggleOnBlock(next, segment.blockId, overlapStart - segment.start, overlapEnd - segment.start, kind);
  }
  return next;
}

function toggleOnBlock(doc: ManuscriptDocument, blockId: string, start: number, end: number, kind: InlineMarkKind): ManuscriptDocument {
  return {
    ...doc,
    blocks: doc.blocks.map((block) => {
      if (block.id !== blockId || !isProseBlock(block.type)) return block;
      return { ...block, marks: toggleMark(block.marks, start, end, kind, block.text.length) };
    }),
  };
}

function expandWord(text: string, index: number): { start: number; end: number } {
  const isWord = (ch: string) => /[A-Za-z0-9'’-]/u.test(ch);
  let start = index;
  let end = index;
  while (start > 0 && isWord(text[start - 1] ?? '')) start -= 1;
  while (end < text.length && isWord(text[end] ?? '')) end += 1;
  if (end > start) return { start, end };
  return { start: 0, end: text.length };
}

function retargetBlock(doc: ManuscriptDocument, blockId: string, kind: RawKind): ManuscriptDocument {
  const block = doc.blocks.find((item) => item.id === blockId);
  if (!block || !isRawKind(block.type) || block.type === kind) return doc;
  const fromHeading = isHeadingType(block.type);
  const toHeading = isHeadingType(kind);
  const words = fromHeading ? block.title : block.text;
  const prov = doc.provenance[blockId] ?? { title: [], text: [] };
  const spans = fromHeading ? prov.title : prov.text;
  const next: ManuscriptBlock = {
    ...block,
    type: kind,
    title: toHeading ? words : '',
    text: toHeading ? '' : words,
    marks: toHeading || fromHeading ? [] : block.marks,
  };
  return {
    ...doc,
    blocks: doc.blocks.map((item) => (item.id === blockId ? next : item)),
    provenance: {
      ...doc.provenance,
      [blockId]: toHeading ? { title: spans, text: [] } : { title: [], text: spans },
    },
  };
}

type Anchor = { afterId: string | null; beforeId: string | null; blocks: ManuscriptBlock[] };

function anchorsOf(doc: ManuscriptDocument): Anchor[] {
  const anchors: Anchor[] = [];
  let afterId: string | null = null;
  let pending: ManuscriptBlock[] = [];
  const flush = (beforeId: string | null) => {
    if (!pending.length) return;
    anchors.push({ afterId, beforeId, blocks: pending });
    pending = [];
  };
  for (const block of doc.blocks) {
    if (isRawKind(block.type)) {
      flush(block.id);
      afterId = block.id;
      continue;
    }
    pending.push(block);
  }
  flush(null);
  return anchors;
}

async function materialize(
  doc: ManuscriptDocument,
  chunks: DraftChunk[],
  args: { now: string; newId: () => string; origin: InsertionOrigin | null },
): Promise<ManuscriptDocument> {
  const built: Chunk[] = [];
  const claimed = new Set<string>();
  let points = doc.points;
  for (const chunk of chunks) {
    const source = chunk.chars.find((atom) => atom.type === 'char' && atom.blockId);
    const sourceId = (source?.type === 'char' ? source.blockId : undefined) ?? chunk.emptyId ?? null;
    const id = sourceId && !claimed.has(sourceId) ? sourceId : args.newId();
    if (sourceId) claimed.add(sourceId);
    const assembled = assembleChunk(doc, chunk, id, args.newId);
    const fieldText = assembled.text;
    const sealed = await syncBlockPoints({
      blockId: id,
      text: fieldText,
      spans: assembled.spans,
      points,
      evidence: null,
      now: args.now,
      newId: args.newId,
    });
    points = sealed.points;
    built.push({ ...assembled, id, spans: sealed.spans });
  }

  const bySource = new Map<string, number>();
  built.forEach((chunk, index) => {
    for (const sourceId of chunk.sourceIds) bySource.set(sourceId, index);
  });
  const firstSource = new Map<string, number>();
  built.forEach((chunk, index) => {
    for (const sourceId of chunk.sourceIds) {
      if (!firstSource.has(sourceId)) firstSource.set(sourceId, index);
    }
  });

  const placed = new Set<Anchor>();
  const anchors = anchorsOf(doc);
  const blocks: ManuscriptBlock[] = [];
  const provenance: ManuscriptDocument['provenance'] = {};
  const pushAnchor = (anchor: Anchor) => {
    if (placed.has(anchor)) return;
    placed.add(anchor);
    blocks.push(...anchor.blocks);
    for (const block of anchor.blocks) {
      if (doc.provenance[block.id]) provenance[block.id] = doc.provenance[block.id]!;
    }
  };

  anchors.filter((anchor) => anchor.afterId == null && anchor.beforeId && !firstSource.has(anchor.beforeId)).forEach(pushAnchor);

  built.forEach((chunk, index) => {
    anchors
      .filter((anchor) => anchor.beforeId && firstSource.get(anchor.beforeId) === index && (anchor.afterId == null || !bySource.has(anchor.afterId)))
      .forEach(pushAnchor);
    const fromHeading = isHeadingType(chunk.kind);
    const previous = doc.blocks.find((block) => block.id === chunk.id);
    blocks.push({
      id: chunk.id,
      type: chunk.kind,
      title: fromHeading ? chunk.text : '',
      text: fromHeading ? '' : chunk.text,
      marks: fromHeading ? [] : chunk.marks,
      listStyle: previous && isProseBlock(previous.type) && isProseBlock(chunk.kind) ? previous.listStyle ?? null : null,
      indentLevel: previous?.indentLevel ?? 0,
    });
    provenance[chunk.id] = fromHeading ? { title: chunk.spans, text: [] } : { title: [], text: chunk.spans };
    anchors.filter((anchor) => anchor.afterId && bySource.get(anchor.afterId) === index).forEach(pushAnchor);
  });
  anchors.filter((anchor) => !placed.has(anchor)).forEach(pushAnchor);

  const live = new Set<string>();
  for (const block of blocks) {
    for (const span of [...(provenance[block.id]?.title ?? []), ...(provenance[block.id]?.text ?? [])]) {
      if (span.certificationId) live.add(span.certificationId);
    }
  }
  return {
    ...doc,
    blocks,
    provenance,
    points: points.filter((point) => live.has(point.id)),
  };
}

function assembleChunk(doc: ManuscriptDocument, chunk: DraftChunk, id: string, newId: () => string): Chunk {
  const runs = runsOf(chunk.chars);
  let text = '';
  const spans: ProvenanceSpan[] = [];
  const marks: InlineMark[] = [];
  const sourceIds: string[] = [];
  for (const run of runs) {
    if (run.blockId && !sourceIds.includes(run.blockId)) sourceIds.push(run.blockId);
    const shift = text.length;
    if (!run.blockId) {
      const created = applyTextChange({
        text: '',
        spans: [],
        marks: [],
        start: 0,
        end: 0,
        insert: run.text,
        origin: run.origin,
        newId,
      });
      spans.push(...created.spans.map((span) => ({ ...span, start: span.start + shift, end: span.end + shift })));
    } else {
      const block = doc.blocks.find((item) => item.id === run.blockId);
      const fromHeading = block ? isHeadingType(block.type) : false;
      const sourceText = block ? (fromHeading ? block.title : block.text) : '';
      const sourceSpans = block ? (fromHeading ? doc.provenance[block.id]?.title : doc.provenance[block.id]?.text) ?? [] : [];
      const sliced = sliceSpans(sourceSpans, sourceText.length, run.localStart, run.localEnd, newId);
      spans.push(...sliced.map((span) => ({ ...span, start: span.start + shift, end: span.end + shift })));
      if (block && isProseBlock(block.type) && isProseBlock(chunk.kind)) {
        marks.push(...sliceMarks(block.marks, run.localStart, run.localEnd, shift));
      }
    }
    text += run.text;
  }
  if (chunk.emptyId && !sourceIds.includes(chunk.emptyId)) sourceIds.unshift(chunk.emptyId);
  return {
    id,
    kind: chunk.kind,
    text,
    sourceIds: chunk.emptyId && !text ? [chunk.emptyId] : sourceIds,
    spans: normalizeSpans(text, spans, newId),
    marks: isHeadingType(chunk.kind) ? [] : normalizeMarks(marks, text.length),
  };
}

function runsOf(chars: Atom[]): Run[] {
  const runs: Run[] = [];
  for (const atom of chars) {
    if (atom.type !== 'char') continue;
    const previous = runs[runs.length - 1];
    const contiguous =
      previous &&
      previous.blockId === (atom.blockId ?? null) &&
      previous.origin === (atom.fresh ? atom.origin ?? 'keyboard' : null) &&
      (atom.blockId == null || previous.localEnd === atom.local);
    if (contiguous && previous) {
      previous.text += atom.ch;
      if (atom.blockId != null && atom.local != null) previous.localEnd = atom.local + 1;
      continue;
    }
    runs.push({
      text: atom.ch,
      blockId: atom.blockId ?? null,
      localStart: atom.local ?? 0,
      localEnd: atom.blockId != null && atom.local != null ? atom.local + 1 : 0,
      origin: atom.fresh ? atom.origin ?? 'keyboard' : null,
    });
  }
  return runs;
}

type DraftChunk = {
  kind: RawKind;
  chars: Atom[];
  emptyId?: string;
};

function groupAtoms(atoms: Atom[], newId: () => string, trailingSep: boolean): DraftChunk[] {
  const chunks: DraftChunk[] = [];
  let current: DraftChunk | null = null;
  let nextIsParagraph = false;
  let previousWasSep = false;
  const push = () => {
    if (!current) return;
    chunks.push(current);
    current = null;
  };
  for (const atom of atoms) {
    if (atom.type === 'sep') {
      push();
      if (chunks.length === 0 || previousWasSep) chunks.push({ kind: 'paragraph', chars: [], emptyId: newId() });
      previousWasSep = true;
      nextIsParagraph = Boolean(atom.fresh);
      continue;
    }
    previousWasSep = false;
    if (atom.type === 'empty') {
      push();
      chunks.push({ kind: nextIsParagraph ? 'paragraph' : atom.kind ?? 'paragraph', chars: [], emptyId: atom.blockId ?? newId() });
      nextIsParagraph = false;
      continue;
    }
    if (!current) {
      const kind = atom.fresh || nextIsParagraph ? 'paragraph' : atom.kind ?? 'paragraph';
      current = { kind, chars: [] };
      nextIsParagraph = false;
    }
    current.chars.push(atom);
  }
  push();
  if (trailingSep || (atoms.at(-1)?.type === 'sep' && previousWasSep)) {
    if (atoms.at(-1)?.type === 'sep') chunks.push({ kind: 'paragraph', chars: [], emptyId: newId() });
  }
  return chunks;
}

function atomsFromDoc(doc: ManuscriptDocument): Atom[] {
  const flat = flattenRaw(doc);
  const atoms: Atom[] = [];
  flat.segments.forEach((segment, index) => {
    if (!segment.text) atoms.push({ type: 'empty', at: segment.start, blockId: segment.blockId, kind: segment.kind });
    for (let local = 0; local < segment.text.length; local += 1) {
      atoms.push({
        type: 'char',
        flat: segment.start + local,
        ch: segment.text[local]!,
        blockId: segment.blockId,
        kind: segment.kind,
        local,
      });
    }
    if (index < flat.segments.length - 1) atoms.push({ type: 'sep', flat: segment.end });
  });
  return atoms;
}

function atomsFromInsert(insert: string, origin: InsertionOrigin | null): Atom[] {
  const atoms: Atom[] = [];
  for (const ch of insert) {
    if (ch === '\n') atoms.push({ type: 'sep', flat: -1, fresh: true });
    else atoms.push({ type: 'char', flat: -1, ch, fresh: true, origin: origin ?? 'keyboard' });
  }
  return atoms;
}

function spliceAtoms(atoms: Atom[], start: number, end: number, insert: string, origin: InsertionOrigin | null): Atom[] {
  const kept = atoms.filter((atom) => !covers(atom, start, end) && !orphanedEmpty(atom, start, end));
  const added = atomsFromInsert(insert, origin);
  const index = kept.findIndex((atom) => atomAfter(atom, start));
  const at = index < 0 ? kept.length : index;
  return [...kept.slice(0, at), ...added, ...kept.slice(at)];
}

function takeSelection(atoms: Atom[], start: number, end: number): { before: Atom[]; body: Atom[]; after: Atom[] } {
  const before: Atom[] = [];
  const body: Atom[] = [];
  const after: Atom[] = [];
  let seen = false;
  for (const atom of atoms) {
    if (atom.type === 'sep' && covers(atom, start, end)) {
      seen = true;
      body.push({ type: 'char', flat: -1, ch: ' ', fresh: true, origin: 'other' });
      continue;
    }
    if (covers(atom, start, end)) {
      seen = true;
      if (atom.type === 'char') body.push(atom);
      continue;
    }
    if (seen) after.push(atom);
    else before.push(atom);
  }
  return {
    before: dropEdgeSpace(before, 'end'),
    body: trimEdgeSpaces(body),
    after: dropEdgeSpace(after, 'start'),
  };
}

function dropEdgeSpace(atoms: Atom[], edge: 'start' | 'end'): Atom[] {
  const index = edge === 'start' ? 0 : atoms.length - 1;
  const atom = atoms[index];
  if (atom?.type !== 'char' || atom.ch !== ' ') return atoms;
  return edge === 'start' ? atoms.slice(1) : atoms.slice(0, -1);
}

function joinSelection(before: Atom[], body: Atom[], after: Atom[]): { atoms: Atom[]; body: Atom[] } {
  const atoms = [...before];
  if (atoms.length && atoms[atoms.length - 1]?.type !== 'sep') atoms.push({ type: 'sep', flat: -1, fresh: true });
  atoms.push(...body);
  if (after.length && after[0]?.type !== 'sep') atoms.push({ type: 'sep', flat: -1, fresh: true });
  atoms.push(...after);
  return { atoms, body };
}

/** Deleting the line break beside an empty paragraph removes that paragraph. */
function orphanedEmpty(atom: Atom, start: number, end: number): boolean {
  if (atom.type !== 'empty' || end <= start) return false;
  return atom.at === start || atom.at === end;
}

function covers(atom: Atom, start: number, end: number): boolean {
  if (end <= start) return false;
  if (atom.type === 'empty') return atom.at >= start && atom.at < end;
  if (atom.flat < 0) return false;
  return atom.flat >= start && atom.flat < end;
}

function atomAfter(atom: Atom, offset: number): boolean {
  if (atom.type === 'empty') return atom.at > offset;
  if (atom.flat < 0) return false;
  return atom.flat >= offset;
}

function isFreshSpace(atom: Atom | undefined): boolean {
  return atom?.type === 'char' && atom.ch === ' ' && Boolean(atom.fresh);
}

function trimEdgeSpaces(atoms: Atom[]): Atom[] {
  let start = 0;
  let end = atoms.length;
  while (start < end && isFreshSpace(atoms[start])) start += 1;
  while (end > start && isFreshSpace(atoms[end - 1])) end -= 1;
  return atoms.slice(start, end);
}

function trimToText(text: string, start: number, end: number): { start: number; end: number } {
  let from = clamp(start, 0, text.length);
  let to = clamp(end, from, text.length);
  while (from < to && text[from] === '\n') from += 1;
  while (to > from && text[to - 1] === '\n') to -= 1;
  return { start: from, end: to };
}

function sliceSpans(spans: ProvenanceSpan[], textLength: number, localStart: number, localEnd: number, newId: () => string): ProvenanceSpan[] {
  const fromStart = splitSpans(spans, localStart, textLength, newId).right;
  return splitSpans(fromStart, Math.max(0, localEnd - localStart), Math.max(0, textLength - localStart), newId).left;
}

function sliceMarks(marks: InlineMark[], localStart: number, localEnd: number, shift: number): InlineMark[] {
  const sliced: InlineMark[] = [];
  for (const mark of marks) {
    const start = Math.max(mark.start, localStart);
    const end = Math.min(mark.end, localEnd);
    if (end <= start) continue;
    sliced.push({ kind: mark.kind, start: start - localStart + shift, end: end - localStart + shift });
  }
  return sliced;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}
