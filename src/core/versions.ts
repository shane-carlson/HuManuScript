/**
 * Named manuscript snapshots per book (Speak Fiction–style version history).
 */

import type { ManuscriptDocument } from './document.ts';

export const VERSION_LEDGER_KEY = 'humanuscript.versions.v1';
export const MAX_VERSIONS_PER_BOOK = 40;
/** Minimum gap between automatic recovery points (Speak Fiction uses debounced edit capture). */
export const AUTO_VERSION_INTERVAL_MS = 10 * 60 * 1000;

export type VersionKind = 'manual' | 'auto' | 'restore-guard';

export interface BookVersion {
  id: string;
  bookId: string;
  label: string;
  savedAt: string;
  kind: VersionKind;
  document: ManuscriptDocument;
}

export interface VersionLedger {
  version: 1;
  /** Newest first per book. */
  byBookId: Record<string, BookVersion[]>;
}

export function emptyVersionLedger(): VersionLedger {
  return { version: 1, byBookId: {} };
}

function cloneDocument(doc: ManuscriptDocument): ManuscriptDocument {
  return JSON.parse(JSON.stringify(doc)) as ManuscriptDocument;
}

export function listBookVersions(ledger: VersionLedger, bookId: string): BookVersion[] {
  return ledger.byBookId[bookId] ?? [];
}

export function pushVersion(
  ledger: VersionLedger,
  args: {
    bookId: string;
    document: ManuscriptDocument;
    label: string;
    kind: VersionKind;
    id: string;
    now?: string;
  },
): VersionLedger {
  const entry: BookVersion = {
    id: args.id,
    bookId: args.bookId,
    label: args.label.trim() || defaultVersionLabel(args.kind),
    savedAt: args.now ?? new Date().toISOString(),
    kind: args.kind,
    document: cloneDocument(args.document),
  };
  const prev = ledger.byBookId[args.bookId] ?? [];
  const next = [entry, ...prev].slice(0, MAX_VERSIONS_PER_BOOK);
  return { ...ledger, byBookId: { ...ledger.byBookId, [args.bookId]: next } };
}

function defaultVersionLabel(kind: VersionKind): string {
  if (kind === 'auto') return 'Auto-save';
  if (kind === 'restore-guard') return 'Before restore';
  return 'Version';
}

export function versionDisplayLabel(version: BookVersion, index: number): string {
  if (version.label && version.label !== 'Version') return version.label;
  return `Version ${listIndex(index)}`;
}

function listIndex(index: number): number {
  return index + 1;
}

export function findBookVersion(ledger: VersionLedger, bookId: string, versionId: string): BookVersion | null {
  return (ledger.byBookId[bookId] ?? []).find((v) => v.id === versionId) ?? null;
}

/** Restore a snapshot; saves a restore-guard copy of the current doc first. */
export function restoreBookVersion(
  ledger: VersionLedger,
  bookId: string,
  versionId: string,
  currentDocument: ManuscriptDocument,
  newId: () => string,
): { ledger: VersionLedger; document: ManuscriptDocument } | null {
  const target = findBookVersion(ledger, bookId, versionId);
  if (!target) return null;
  let nextLedger = pushVersion(ledger, {
    bookId,
    document: currentDocument,
    label: 'Before restore',
    kind: 'restore-guard',
    id: newId(),
  });
  return { ledger: nextLedger, document: cloneDocument(target.document) };
}

export function maybeAutoVersion(
  ledger: VersionLedger,
  bookId: string,
  document: ManuscriptDocument,
  newId: () => string,
  now = Date.now(),
): VersionLedger {
  const recent = ledger.byBookId[bookId]?.[0];
  if (recent?.kind === 'auto') {
    const at = Date.parse(recent.savedAt);
    if (Number.isFinite(at) && now - at < AUTO_VERSION_INTERVAL_MS) return ledger;
  } else if (recent) {
    const at = Date.parse(recent.savedAt);
    if (Number.isFinite(at) && now - at < AUTO_VERSION_INTERVAL_MS) return ledger;
  }
  return pushVersion(ledger, {
    bookId,
    document,
    label: 'Auto-save',
    kind: 'auto',
    id: newId(),
    now: new Date(now).toISOString(),
  });
}

export function loadVersionLedger(): VersionLedger {
  try {
    const raw = localStorage.getItem(VERSION_LEDGER_KEY);
    if (!raw) return emptyVersionLedger();
    const parsed = JSON.parse(raw) as VersionLedger;
    if (parsed.version !== 1 || !parsed.byBookId || typeof parsed.byBookId !== 'object') {
      return emptyVersionLedger();
    }
    return parsed;
  } catch {
    return emptyVersionLedger();
  }
}

export function saveVersionLedger(ledger: VersionLedger): void {
  localStorage.setItem(VERSION_LEDGER_KEY, JSON.stringify(ledger));
}

export function pruneVersionsForBooks(ledger: VersionLedger, bookIds: Set<string>): VersionLedger {
  const byBookId: Record<string, BookVersion[]> = {};
  for (const id of bookIds) {
    if (ledger.byBookId[id]) byBookId[id] = ledger.byBookId[id]!;
  }
  return { ...ledger, byBookId };
}
