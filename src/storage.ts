import { emptyDocument, type ManuscriptDocument, type StoredManuscript } from './core/document.ts';
import type { CertificationPoint, MoveRecord, ProvenanceSpan } from './core/certification.ts';
import type { BlockType, InlineMark, ManuscriptBlock } from './core/types.ts';

export const STORAGE_KEY = 'humanuscript.manuscript.v1';
export const THEME_KEY = 'humanuscript.theme';

const BLOCKS = new Set<BlockType>(['chapter', 'scene', 'section', 'paragraph']);
const ORIGINS = new Set(['keyboard', 'paste', 'drop', 'other']);

function isSpan(value: unknown): value is ProvenanceSpan {
  if (!value || typeof value !== 'object') return false;
  const span = value as ProvenanceSpan;
  return (
    typeof span.id === 'string' &&
    typeof span.start === 'number' &&
    typeof span.end === 'number' &&
    ORIGINS.has(span.origin)
  );
}

function isBlock(value: unknown): value is ManuscriptBlock {
  if (!value || typeof value !== 'object') return false;
  const block = value as ManuscriptBlock;
  return BLOCKS.has(block.type) && typeof block.id === 'string' && typeof block.title === 'string' && typeof block.text === 'string' && Array.isArray(block.marks);
}

export type LoadResult =
  | { ok: true; doc: ManuscriptDocument | null }
  | { ok: false; error: string; raw: string };

export function loadManuscript(): LoadResult {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Storage could not be read.', raw: '' };
  }
  if (!raw) return { ok: true, doc: null };
  try {
    const parsed = JSON.parse(raw) as StoredManuscript;
    if (parsed.version !== 1 || typeof parsed.manuscriptId !== 'string' || !Array.isArray(parsed.blocks)) {
      return { ok: false, error: 'The saved manuscript is not a HuManuScript file.', raw };
    }
    if (!parsed.blocks.every(isBlock)) return { ok: false, error: 'A block in the saved manuscript is unreadable.', raw };
    const provenance = parsed.provenance ?? {};
    for (const block of parsed.blocks) {
      const entry = provenance[block.id];
      if (!entry) continue;
      if (!Array.isArray(entry.title) || !Array.isArray(entry.text)) {
        return { ok: false, error: 'Provenance for a block is unreadable.', raw };
      }
      if (!entry.title.every(isSpan) || !entry.text.every(isSpan)) {
        return { ok: false, error: 'A provenance span is unreadable.', raw };
      }
    }
    const doc: ManuscriptDocument = {
      version: 1,
      manuscriptId: parsed.manuscriptId,
      title: typeof parsed.title === 'string' ? parsed.title : '',
      blocks: parsed.blocks.map((block) => ({
        ...block,
        marks: (block.marks ?? []).filter(isMark),
      })),
      provenance,
      points: Array.isArray(parsed.points) ? parsed.points.filter(isPoint) : [],
      moves: Array.isArray(parsed.moves) ? parsed.moves.filter(isMove) : [],
    };
    return { ok: true, doc };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'The saved manuscript could not be parsed.',
      raw,
    };
  }
}

function isMark(value: unknown): value is InlineMark {
  if (!value || typeof value !== 'object') return false;
  const mark = value as InlineMark;
  return typeof mark.start === 'number' && typeof mark.end === 'number' && typeof mark.kind === 'string';
}

function isPoint(value: unknown): value is CertificationPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as CertificationPoint;
  return point.origin === 'keyboard' && typeof point.id === 'string' && typeof point.contentHash === 'string' && typeof point.text === 'string';
}

function isMove(value: unknown): value is MoveRecord {
  if (!value || typeof value !== 'object') return false;
  const move = value as MoveRecord;
  return typeof move.id === 'string' && typeof move.label === 'string' && Array.isArray(move.blockIds);
}

export function saveManuscript(doc: ManuscriptDocument): void {
  const stored: StoredManuscript = { ...doc, savedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

export function clearManuscript(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function freshDocument(id: string): ManuscriptDocument {
  return emptyDocument(id);
}
