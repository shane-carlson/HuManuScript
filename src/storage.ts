import { emptyDocument, type ManuscriptDocument, type StoredManuscript } from './core/document.ts';
import type { Book, Library, Series } from './core/library.ts';
import { readGrammarUsage, type CertificationPoint, type MoveRecord, type ProvenanceSpan } from './core/certification.ts';
import type { BlockType, InlineMark, ManuscriptBlock } from './core/types.ts';
import { readBookNotes } from './core/notes.ts';
import {
  LAYOUT_SESSION_KEY,
  layoutSessionFromStored,
  type LayoutSession,
  type LayoutSessionFlags,
} from './core/layoutSession.ts';
import { isManuscriptFontId, isManuscriptFontSize } from './core/typography.ts';

export const LIBRARY_KEY = 'humanuscript.library.v2';
export const STORAGE_KEY = 'humanuscript.manuscript.v1';
export const THEME_KEY = 'humanuscript.theme';
export const EDITOR_VIEW_KEY = 'humanuscript.editorView';
export const SIDEBAR_COLLAPSED_KEY = 'humanuscript.sidebarCollapsed';
export const CERTIFICATION_COLLAPSED_KEY = 'humanuscript.certificationCollapsed';
export const NOTES_COLLAPSED_KEY = 'humanuscript.notesCollapsed';
export const MANUSCRIPT_FOCUS_KEY = 'humanuscript.manuscriptFocus';

export type EditorViewMode = 'manuscript' | 'raw' | 'highlights' | 'preview' | 'publication';
export type WorkspaceTab = 'manuscript' | 'export' | 'history';

/** A new session opens on the blank raw-write page. A choice made in this session stays. */
export function editorViewFromStored(value: string | null | undefined): EditorViewMode {
  if (value === 'manuscript' || value === 'highlights' || value === 'preview' || value === 'publication' || value === 'raw') return value;
  return 'raw';
}

export function loadEditorView(): EditorViewMode {
  try {
    return editorViewFromStored(sessionStorage.getItem(EDITOR_VIEW_KEY));
  } catch {
    return 'raw';
  }
}

export function saveEditorView(mode: EditorViewMode): void {
  try {
    sessionStorage.setItem(EDITOR_VIEW_KEY, mode);
  } catch {
    /* session storage may be unavailable */
  }
}

export function loadWorkspaceTab(): WorkspaceTab {
  try {
    const value = sessionStorage.getItem('humanuscript.workspaceTab');
    if (value === 'export' || value === 'history') return value;
    return 'manuscript';
  } catch {
    return 'manuscript';
  }
}

export function saveWorkspaceTab(tab: WorkspaceTab): void {
  try {
    sessionStorage.setItem('humanuscript.workspaceTab', tab);
  } catch {
    /* ignore */
  }
}

function readSessionFlag(key: string): boolean | undefined {
  try {
    const value = sessionStorage.getItem(key);
    if (value === '1') return true;
    if (value === '0') return false;
  } catch {
    /* ignore */
  }
  return undefined;
}

function sessionLayoutFlags(): LayoutSessionFlags {
  return {
    sidebarCollapsed: readSessionFlag(SIDEBAR_COLLAPSED_KEY),
    notesCollapsed: readSessionFlag(NOTES_COLLAPSED_KEY),
    certificationCollapsed: readSessionFlag(CERTIFICATION_COLLAPSED_KEY),
  };
}

/** Last rails and grab-bar widths. localStorage survives the next launch and an update. */
export function loadLayoutSession(): LayoutSession {
  try {
    return layoutSessionFromStored(localStorage.getItem(LAYOUT_SESSION_KEY), sessionLayoutFlags());
  } catch {
    return layoutSessionFromStored(null, sessionLayoutFlags());
  }
}

function saveLayoutSession(patch: Partial<LayoutSession>): void {
  try {
    const next = layoutSessionFromStored(JSON.stringify({ ...loadLayoutSession(), ...patch }));
    localStorage.setItem(LAYOUT_SESSION_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function loadSidebarCollapsed(): boolean {
  return loadLayoutSession().sidebarCollapsed;
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  saveLayoutSession({ sidebarCollapsed: collapsed });
}

export function loadCertificationCollapsed(): boolean {
  return loadLayoutSession().certificationCollapsed;
}

export function saveCertificationCollapsed(collapsed: boolean): void {
  saveLayoutSession({ certificationCollapsed: collapsed });
}

export function loadNotesCollapsed(): boolean {
  return loadLayoutSession().notesCollapsed;
}

export function saveNotesCollapsed(collapsed: boolean): void {
  saveLayoutSession({ notesCollapsed: collapsed });
}

export function loadRailCollapsed(): boolean {
  return loadLayoutSession().railCollapsed;
}

export function saveRailCollapsed(collapsed: boolean): void {
  saveLayoutSession({ railCollapsed: collapsed });
}

export function loadSidebarWidth(): number {
  return loadLayoutSession().sidebarWidth;
}

export function saveSidebarWidth(width: number): void {
  saveLayoutSession({ sidebarWidth: width });
}

export function loadNotesWidth(): number {
  return loadLayoutSession().notesWidth;
}

export function saveNotesWidth(width: number): void {
  saveLayoutSession({ notesWidth: width });
}

export function loadCertificationWidth(): number {
  return loadLayoutSession().certificationWidth;
}

export function saveCertificationWidth(width: number): void {
  saveLayoutSession({ certificationWidth: width });
}

export function loadManuscriptFocus(): boolean {
  try {
    return sessionStorage.getItem(MANUSCRIPT_FOCUS_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveManuscriptFocus(focus: boolean): void {
  try {
    sessionStorage.setItem(MANUSCRIPT_FOCUS_KEY, focus ? '1' : '0');
  } catch {
    /* ignore */
  }
}

const BLOCKS = new Set<BlockType>([
  'chapter',
  'scene',
  'section',
  'paragraph',
  'blockquote',
  'pageBreak',
  'divider',
  'table',
  'image',
]);
const ORIGINS = new Set(['keyboard', 'dictation', 'paste', 'drop', 'other']);

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

function isMark(value: unknown): value is InlineMark {
  if (!value || typeof value !== 'object') return false;
  const mark = value as InlineMark;
  return typeof mark.start === 'number' && typeof mark.end === 'number' && typeof mark.kind === 'string';
}

function isPoint(value: unknown): value is CertificationPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as CertificationPoint;
  return (
    (point.origin === 'keyboard' || point.origin === 'dictation') &&
    typeof point.id === 'string' &&
    typeof point.contentHash === 'string' &&
    typeof point.text === 'string'
  );
}

function sanitizePoint(point: CertificationPoint): CertificationPoint {
  if (point.grammar == null) return point;
  const grammar = readGrammarUsage(point.grammar);
  if (!grammar) {
    const { grammar: _removed, ...rest } = point;
    return rest;
  }
  return { ...point, grammar };
}

function isMove(value: unknown): value is MoveRecord {
  if (!value || typeof value !== 'object') return false;
  const move = value as MoveRecord;
  return typeof move.id === 'string' && typeof move.label === 'string' && Array.isArray(move.blockIds);
}

function parseDocument(parsed: StoredManuscript): ManuscriptDocument | null {
  if (parsed.version !== 1 || typeof parsed.manuscriptId !== 'string' || !Array.isArray(parsed.blocks)) {
    return null;
  }
  if (!parsed.blocks.every(isBlock)) return null;
  const provenance = parsed.provenance ?? {};
  for (const block of parsed.blocks) {
    const entry = provenance[block.id];
    if (!entry) continue;
    if (!Array.isArray(entry.title) || !Array.isArray(entry.text)) return null;
    if (!entry.title.every(isSpan) || !entry.text.every(isSpan)) return null;
  }
  const notes = readBookNotes(parsed.notes);
  return {
    version: 1,
    manuscriptId: parsed.manuscriptId,
    title: typeof parsed.title === 'string' ? parsed.title : '',
    blocks: parsed.blocks.map((block) => {
      const next = {
        ...block,
        marks: (block.marks ?? []).filter(isMark),
      };
      const goal = block.wordGoal;
      if (typeof goal === 'number' && Number.isInteger(goal) && goal > 0 && goal <= 1_000_000) next.wordGoal = goal;
      else delete next.wordGoal;
      return next;
    }),
    provenance,
    points: Array.isArray(parsed.points) ? parsed.points.filter(isPoint).map(sanitizePoint) : [],
    moves: Array.isArray(parsed.moves) ? parsed.moves.filter(isMove) : [],
    ...(isManuscriptFontId(parsed.fontFamily) ? { fontFamily: parsed.fontFamily } : {}),
    ...(isManuscriptFontSize(parsed.fontSize) ? { fontSize: parsed.fontSize } : {}),
    ...(notes ? { notes } : {}),
  };
}

export type LoadResult =
  | { ok: true; library: Library | null }
  | { ok: false; error: string; raw: string };

function isSeries(value: unknown): value is Series {
  if (!value || typeof value !== 'object') return false;
  const s = value as Series;
  return typeof s.id === 'string' && typeof s.name === 'string';
}

function isBook(value: unknown): value is Book {
  if (!value || typeof value !== 'object') return false;
  const b = value as Book;
  if (typeof b.id !== 'string' || typeof b.title !== 'string' || !b.document) return false;
  const doc = parseDocument(b.document as StoredManuscript);
  if (!doc) return false;
  return true;
}

function hydrateBook(raw: Book): Book {
  const doc = parseDocument(raw.document as StoredManuscript)!;
  return { ...raw, document: doc };
}

export function loadLibrary(): LoadResult {
  try {
    const rawV2 = localStorage.getItem(LIBRARY_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Library;
      if (parsed.version !== 2 || !Array.isArray(parsed.books) || !Array.isArray(parsed.series)) {
        return { ok: false, error: 'The saved library is not a HuManuScript library.', raw: rawV2 };
      }
      if (!parsed.books.every(isBook)) {
        return { ok: false, error: 'A book in the saved library is unreadable.', raw: rawV2 };
      }
      if (!parsed.series.every(isSeries)) {
        return { ok: false, error: 'A series in the saved library is unreadable.', raw: rawV2 };
      }
      const books = parsed.books.map(hydrateBook);
      const activeBookId = books.some((b) => b.id === parsed.activeBookId)
        ? parsed.activeBookId
        : books[0]!.id;
      return { ok: true, library: { version: 2, activeBookId, series: parsed.series, books } };
    }

    const rawV1 = localStorage.getItem(STORAGE_KEY);
    if (!rawV1) return { ok: true, library: null };
    const parsed = JSON.parse(rawV1) as StoredManuscript;
    const doc = parseDocument(parsed);
    if (!doc) return { ok: false, error: 'The saved manuscript is not a HuManuScript file.', raw: rawV1 };
    const bookId = doc.manuscriptId;
    const library: Library = {
      version: 2,
      activeBookId: bookId,
      series: [],
      books: [
        {
          id: bookId,
          title: doc.title.trim() || 'Untitled book',
          document: doc,
        },
      ],
    };
    return { ok: true, library };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'The saved library could not be parsed.',
      raw: '',
    };
  }
}

export function saveLibrary(library: Library): void {
  const payload: Library = {
    ...library,
    books: library.books.map((b) => ({
      ...b,
      document: { ...b.document, savedAt: new Date().toISOString() } as StoredManuscript,
    })),
  };
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(payload));
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    throw new Error(message ? `The book could not be saved in this browser. ${message}` : 'The book could not be saved in this browser.');
  }
}

export function clearLibrary(): void {
  localStorage.removeItem(LIBRARY_KEY);
  localStorage.removeItem(STORAGE_KEY);
}

export function freshDocument(id: string): ManuscriptDocument {
  return emptyDocument(id);
}

/** @deprecated Use loadLibrary */
export function loadManuscript(): { ok: true; doc: ManuscriptDocument | null } | { ok: false; error: string; raw: string } {
  const loaded = loadLibrary();
  if (!loaded.ok) return loaded;
  if (!loaded.library) return { ok: true, doc: null };
  const book = loaded.library.books.find((b) => b.id === loaded.library!.activeBookId);
  return { ok: true, doc: book?.document ?? null };
}

export function saveManuscript(doc: ManuscriptDocument): void {
  const loaded = loadLibrary();
  if (loaded.ok && loaded.library) {
    const books = loaded.library.books.map((b) =>
      b.id === loaded.library!.activeBookId ? { ...b, document: doc, title: doc.title.trim() || b.title } : b,
    );
    saveLibrary({ ...loaded.library, books });
    return;
  }
  const stored: StoredManuscript = { ...doc, savedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

export function clearManuscript(): void {
  clearLibrary();
}
