/**
 * Library backup export / restore (selected books, default all).
 */

import type { Library } from './library.ts';
import type { VersionLedger } from './versions.ts';

export interface LibraryBackupFile {
  product: 'HuManuScript';
  backupVersion: 1;
  exportedAt: string;
  books: Library['books'];
  series: Library['series'];
  /** Snapshots for exported books only, when available. */
  versions?: VersionLedger;
}

export function buildLibraryBackup(args: {
  library: Library;
  bookIds: string[];
  versions: VersionLedger;
  exportedAt: string;
}): LibraryBackupFile {
  const pick = new Set(args.bookIds);
  const books = args.library.books.filter((b) => pick.has(b.id));
  const seriesIds = new Set(books.map((b) => b.seriesId).filter(Boolean) as string[]);
  const series = args.library.series.filter((s) => seriesIds.has(s.id));
  const byBookId: VersionLedger['byBookId'] = {};
  for (const id of pick) {
    if (args.versions.byBookId[id]) byBookId[id] = args.versions.byBookId[id]!;
  }
  const versions: VersionLedger | undefined = Object.keys(byBookId).length
    ? { version: 1, byBookId }
    : undefined;
  return {
    product: 'HuManuScript',
    backupVersion: 1,
    exportedAt: args.exportedAt,
    books,
    series,
    versions,
  };
}

export function parseLibraryBackup(raw: string): LibraryBackupFile {
  const parsed = JSON.parse(raw) as LibraryBackupFile;
  if (parsed.product !== 'HuManuScript' || parsed.backupVersion !== 1 || !Array.isArray(parsed.books)) {
    throw new Error('This file is not a HuManuScript library backup.');
  }
  if (!Array.isArray(parsed.series)) parsed.series = [];
  return parsed;
}

export function mergeBackupIntoLibrary(
  library: Library,
  backup: LibraryBackupFile,
  versions: VersionLedger,
): { library: Library; versions: VersionLedger } {
  const seriesById = new Map(library.series.map((s) => [s.id, s]));
  for (const s of backup.series) {
    if (!seriesById.has(s.id)) seriesById.set(s.id, s);
  }
  const booksById = new Map(library.books.map((b) => [b.id, b]));
  for (const book of backup.books) {
    booksById.set(book.id, book);
  }
  let nextVersions = { ...versions, byBookId: { ...versions.byBookId } };
  if (backup.versions?.byBookId) {
    for (const [bookId, list] of Object.entries(backup.versions.byBookId)) {
      nextVersions.byBookId[bookId] = list;
    }
  }
  const books = [...booksById.values()].sort((a, b) => a.title.localeCompare(b.title));
  const activeBookId = books.some((b) => b.id === library.activeBookId)
    ? library.activeBookId
    : books[0]?.id ?? library.activeBookId;
  return {
    library: {
      ...library,
      series: [...seriesById.values()].sort((a, b) => a.name.localeCompare(b.name)),
      books,
      activeBookId,
    },
    versions: nextVersions,
  };
}

export function backupFilename(exportedAt: string): string {
  const stamp = exportedAt.slice(0, 19).replace(/[:T]/g, '-');
  return `humanuscript-library-${stamp}.json`;
}
