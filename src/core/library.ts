/**
 * Multi-book library with optional series membership (Speak Fiction shape).
 */

import { emptyDocument, type ManuscriptDocument } from './document.ts';
import { readRegistryReceipts, type RegistryReceipt } from './registry.ts';
import { parseCopyrightYear } from './bookPages.ts';
import {
  canonicalBcp47,
  isEpubUuid,
  mintEpubUuid,
  normalizeIsbn,
  type EpubBodySize,
  type EpubChoicePatch,
  type EpubParagraphStyle,
  type EpubTextAlign,
} from './epubSettings.ts';

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
  /** Stable EPUB id. Minted once. A download does not replace it. */
  epubUuid?: string;
  /** Publication pages. One author. The ebook ISBN is the EPUB identifier when set. */
  author?: string;
  subtitle?: string;
  imprint?: string;
  copyrightYear?: number;
  copyrightHolder?: string;
  rightsLine?: string;
  disclaimer?: string;
  paperbackIsbn?: string;
  hardcoverIsbn?: string;
  ebookIsbn?: string;
  edition?: string;
  dedication?: string;
  epigraph?: string;
  epigraphAttribution?: string;
  alsoBy?: string[];
  aboutAuthor?: string;
  /** File exports include publication pages only when this is true. */
  includePublicationPages?: boolean;
  epubLanguage?: string;
  epubChapterBreaks?: boolean;
  epubParagraphStyle?: EpubParagraphStyle;
  epubTextAlign?: EpubTextAlign;
  epubBodySize?: EpubBodySize;
  /**
   * Certified Manuscript Registry codes for files exported from this book.
   * Kept beside the manuscript. Exporters do not read this field.
   */
  registryReceipts?: RegistryReceipt[];
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

/** Mint a UUID the first time this book is prepared for EPUB. Later calls keep it. */
export function ensureBookEpubUuid(library: Library, bookId: string): { library: Library; uuid: string } {
  const book = library.books.find((item) => item.id === bookId);
  if (!book) return { library, uuid: '' };
  if (book.epubUuid && isEpubUuid(book.epubUuid)) {
    const uuid = book.epubUuid.toLowerCase();
    if (uuid === book.epubUuid) return { library, uuid };
    return {
      uuid,
      library: {
        ...library,
        books: library.books.map((item) => (item.id === bookId ? { ...item, epubUuid: uuid } : item)),
      },
    };
  }
  const uuid = mintEpubUuid();
  return {
    uuid,
    library: {
      ...library,
      books: library.books.map((item) => (item.id === bookId ? { ...item, epubUuid: uuid } : item)),
    },
  };
}

/** Remember the export form on the book. An invalid ISBN, year, or language is left unchanged. */
export function saveBookEpubChoices(library: Library, bookId: string, patch: EpubChoicePatch): Library {
  return {
    ...library,
    books: library.books.map((book) => {
      if (book.id !== bookId) return book;
      const next: Book = {
        ...book,
        epubChapterBreaks: patch.chapterPageBreaks,
        epubParagraphStyle: patch.paragraphStyle,
        epubTextAlign: patch.textAlign,
        epubBodySize: patch.bodySize,
      };
      const legacy = next as Book & { epubAuthor?: string; epubIsbn?: string };
      delete legacy.epubAuthor;
      delete legacy.epubIsbn;
      writeText(next, 'author', patch.author, 200, true);
      writeText(next, 'subtitle', patch.subtitle, 300, true);
      writeText(next, 'imprint', patch.imprint, 200, true);
      writeText(next, 'copyrightHolder', patch.copyrightHolder, 200, true);
      writeText(next, 'rightsLine', patch.rightsLine, 300, true);
      writeText(next, 'disclaimer', patch.disclaimer, 2000, false);
      writeText(next, 'edition', patch.edition, 80, true);
      writeText(next, 'dedication', patch.dedication, 4000, false);
      writeText(next, 'epigraph', patch.epigraph, 2000, false);
      writeText(next, 'epigraphAttribution', patch.epigraphAttribution, 200, true);
      writeText(next, 'aboutAuthor', patch.aboutAuthor, 4000, false);
      const alsoBy = patch.alsoBy
        .map((item) => item.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 40)
        .map((item) => item.slice(0, 200));
      if (alsoBy.length) next.alsoBy = alsoBy;
      else delete next.alsoBy;
      const yearRaw = patch.copyrightYear.trim();
      if (!yearRaw) delete next.copyrightYear;
      else {
        const year = parseCopyrightYear(yearRaw);
        if (year) next.copyrightYear = year;
      }
      writeIsbn(next, 'ebookIsbn', patch.ebookIsbn);
      writeIsbn(next, 'paperbackIsbn', patch.paperbackIsbn);
      writeIsbn(next, 'hardcoverIsbn', patch.hardcoverIsbn);
      const language = canonicalBcp47(patch.language);
      if (language) next.epubLanguage = language;
      if (patch.includePublicationPages) next.includePublicationPages = true;
      else delete next.includePublicationPages;
      return next;
    }),
  };
}

function writeText(
  book: Book,
  key: 'author' | 'subtitle' | 'imprint' | 'copyrightHolder' | 'rightsLine' | 'disclaimer' | 'edition' | 'dedication' | 'epigraph' | 'epigraphAttribution' | 'aboutAuthor',
  raw: string,
  max: number,
  collapse: boolean,
): void {
  const text = (collapse ? raw.replace(/\s+/g, ' ') : raw.replace(/\r\n/g, '\n')).trim();
  if (!text) delete book[key];
  else book[key] = text.slice(0, max);
}

function writeIsbn(book: Book, key: 'ebookIsbn' | 'paperbackIsbn' | 'hardcoverIsbn', raw: string): void {
  const trimmed = raw.trim();
  if (!trimmed) delete book[key];
  else {
    const isbn = normalizeIsbn(trimmed);
    if (isbn) book[key] = isbn;
  }
}

export function addRegistryReceipt(library: Library, bookId: string, receipt: RegistryReceipt): Library {
  return {
    ...library,
    books: library.books.map((book) =>
      book.id === bookId
        ? { ...book, registryReceipts: [...(book.registryReceipts ?? []), receipt] }
        : book,
    ),
  };
}

export function removeRegistryReceipt(library: Library, bookId: string, code: string): Library {
  return {
    ...library,
    books: library.books.map((book) => {
      if (book.id !== bookId || !book.registryReceipts) return book;
      const registryReceipts = book.registryReceipts.filter((item) => item.code !== code);
      if (registryReceipts.length === 0) {
        const next = { ...book };
        delete next.registryReceipts;
        return next;
      }
      return { ...book, registryReceipts };
    }),
  };
}

export function registryReceiptsForBook(book: Pick<Book, 'registryReceipts'> | null | undefined): RegistryReceipt[] {
  return readRegistryReceipts(book?.registryReceipts);
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
