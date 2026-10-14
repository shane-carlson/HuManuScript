/**
 * Multi-book library with optional series membership (Speak Fiction shape).
 */

import { emptyDocument, type ManuscriptDocument } from './document.ts';

export interface Series {
  id: string;
  name: string;
}

export interface Book {
  id: string;
  title: string;
  seriesId?: string;
  seriesBookNumber?: number;
  document: ManuscriptDocument;
}

export interface Library {
  version: 2;
  activeBookId: string;
  series: Series[];
  books: Book[];
}

export function parseSeriesBookNumber(raw: unknown): number | undefined {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return undefined;
    return raw;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return n;
  }
  return undefined;
}

export function formatSeriesBookNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const text = String(n);
  return text.replace(/\.0+$/, '') || text;
}

export function seriesMembershipLabel(
  book: Pick<Book, 'seriesId' | 'seriesBookNumber'>,
  seriesName?: string,
): string | null {
  if (!book.seriesId || !seriesName) return null;
  const n = parseSeriesBookNumber(book.seriesBookNumber);
  if (n == null) return seriesName;
  return `Book ${formatSeriesBookNumber(n)} of ${seriesName}`;
}

export interface LibraryBookGroup {
  id: string;
  heading: string | null;
  books: Book[];
}

export function groupLibraryBooks(books: Book[], series: Series[]): LibraryBookGroup[] {
  const bySeries = new Map<string, Book[]>();
  const standalone: Book[] = [];
  for (const book of books) {
    if (book.seriesId) {
      const list = bySeries.get(book.seriesId) ?? [];
      list.push(book);
      bySeries.set(book.seriesId, list);
    } else {
      standalone.push(book);
    }
  }
  const groups: LibraryBookGroup[] = [];
  for (const s of series) {
    const list = bySeries.get(s.id);
    if (!list?.length) continue;
    list.sort((a, b) => (a.seriesBookNumber ?? 999) - (b.seriesBookNumber ?? 999) || a.title.localeCompare(b.title));
    groups.push({ id: s.id, heading: s.name, books: list });
  }
  if (standalone.length) {
    groups.push({
      id: 'standalone',
      heading: null,
      books: standalone.slice().sort((a, b) => a.title.localeCompare(b.title)),
    });
  }
  return groups;
}

export function bookDisplayTitle(book: Book): string {
  const t = book.document.title.trim() || book.title.trim();
  return t || 'Untitled book';
}

export function assignSeriesToBook(
  library: Library,
  bookId: string,
  seriesName: string,
  newSeriesId: () => string,
): Library {
  const trimmed = seriesName.trim();
  const book = library.books.find((b) => b.id === bookId);
  if (!book) return library;
  if (!trimmed) {
    return {
      ...library,
      books: library.books.map((b) =>
        b.id === bookId ? { ...b, seriesId: undefined, seriesBookNumber: undefined } : b,
      ),
    };
  }
  const existing = library.series.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
  const seriesId = existing?.id ?? newSeriesId();
  const series = existing ? library.series : [...library.series, { id: seriesId, name: trimmed }];
  return {
    ...library,
    series,
    books: library.books.map((b) => (b.id === bookId ? { ...b, seriesId } : b)),
  };
}

export function setBookSeriesNumber(library: Library, bookId: string, raw: string): Library {
  const book = library.books.find((b) => b.id === bookId);
  if (!book?.seriesId) return library;
  const n = parseSeriesBookNumber(raw);
  return {
    ...library,
    books: library.books.map((b) => (b.id === bookId ? { ...b, seriesBookNumber: n } : b)),
  };
}

export function updateActiveBookDocument(library: Library, doc: ManuscriptDocument): Library {
  const title = doc.title.trim();
  return {
    ...library,
    books: library.books.map((b) =>
      b.id === library.activeBookId
        ? { ...b, document: doc, title: title || b.title || 'Untitled book' }
        : b,
    ),
  };
}

export function switchActiveBook(library: Library, bookId: string): Library | null {
  if (!library.books.some((b) => b.id === bookId)) return null;
  return { ...library, activeBookId: bookId };
}

export function createBook(library: Library, newBookId: string, title = 'Untitled book'): Library {
  const document = emptyDocument(newBookId);
  document.title = title;
  const book: Book = { id: newBookId, title, document };
  return {
    ...library,
    books: [...library.books, book],
    activeBookId: newBookId,
  };
}
