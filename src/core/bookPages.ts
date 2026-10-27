/**
 * Publication pages stored on the book, not on a manuscript block.
 * Empty strings are omitted. A bad value is dropped on load.
 */

export interface BookPages {
  author: string;
  subtitle: string;
  imprint: string;
  copyrightYear: number | null;
  /** Empty means the author. */
  copyrightHolder: string;
  /** Empty means "All rights reserved." */
  rightsLine: string;
  /** Empty means no disclaimer. */
  disclaimer: string;
  paperbackIsbn: string;
  hardcoverIsbn: string;
  /** Ebook product id. The EPUB identifier when set. */
  ebookIsbn: string;
  /** Empty, or a line such as "First edition". */
  edition: string;
  dedication: string;
  epigraph: string;
  epigraphAttribution: string;
  alsoBy: string[];
  aboutAuthor: string;
}

export const EMPTY_BOOK_PAGES: BookPages = {
  author: '',
  subtitle: '',
  imprint: '',
  copyrightYear: null,
  copyrightHolder: '',
  rightsLine: '',
  disclaimer: '',
  paperbackIsbn: '',
  hardcoverIsbn: '',
  ebookIsbn: '',
  edition: '',
  dedication: '',
  epigraph: '',
  epigraphAttribution: '',
  alsoBy: [],
  aboutAuthor: '',
};

const DEFAULT_RIGHTS = 'All rights reserved.';

export function defaultRightsLine(): string {
  return DEFAULT_RIGHTS;
}

export function normalizeIsbn(raw: string): string | null {
  const compact = raw.replace(/[-\s]/g, '').toUpperCase();
  if (!compact) return null;
  if (/^\d{13}$/.test(compact) && isbn13Ok(compact)) return compact;
  if (/^\d{9}[\dX]$/.test(compact) && isbn10Ok(compact)) return compact;
  return null;
}

function isbn13Ok(isbn: string): boolean {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(isbn[12]);
}

function isbn10Ok(isbn: string): boolean {
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(isbn[i]) * (10 - i);
  const last = isbn[9] === 'X' ? 10 : Number(isbn[9]);
  return (sum + last) % 11 === 0;
}

/** Four-digit year the author typed. Not filled in at export. */
export function parseCopyrightYear(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d{4}$/.test(text)) return null;
  const year = Number(text);
  if (year < 1000 || year > 9999) return null;
  return year;
}

export interface StoredBookPages {
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
}

function cleanLine(raw: unknown, max: number): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.slice(0, max);
}

function cleanProse(raw: unknown, max: number): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return undefined;
  return text.slice(0, max);
}

function cleanIsbn(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  return normalizeIsbn(raw) ?? undefined;
}

function cleanYear(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1000 && raw <= 9999) return raw;
  if (typeof raw === 'string') return parseCopyrightYear(raw) ?? undefined;
  return undefined;
}

/** Keep only publication fields the form can write. Legacy EPUB keys migrate here. */
export function readStoredBookPages(raw: unknown): StoredBookPages {
  if (!raw || typeof raw !== 'object') return {};
  const value = raw as Record<string, unknown>;
  const out: StoredBookPages = {};
  const author = cleanLine(value.author, 200) ?? cleanLine(value.epubAuthor, 200);
  if (author) out.author = author;
  const subtitle = cleanLine(value.subtitle, 300);
  if (subtitle) out.subtitle = subtitle;
  const imprint = cleanLine(value.imprint, 200);
  if (imprint) out.imprint = imprint;
  const year = cleanYear(value.copyrightYear);
  if (year) out.copyrightYear = year;
  const holder = cleanLine(value.copyrightHolder, 200);
  if (holder) out.copyrightHolder = holder;
  const rights = cleanLine(value.rightsLine, 300);
  if (rights) out.rightsLine = rights;
  const disclaimer = cleanProse(value.disclaimer, 2000);
  if (disclaimer) out.disclaimer = disclaimer;
  const paperback = cleanIsbn(value.paperbackIsbn);
  if (paperback) out.paperbackIsbn = paperback;
  const hardcover = cleanIsbn(value.hardcoverIsbn);
  if (hardcover) out.hardcoverIsbn = hardcover;
  const ebook = cleanIsbn(value.ebookIsbn) ?? cleanIsbn(value.epubIsbn);
  if (ebook) out.ebookIsbn = ebook;
  const edition = cleanLine(value.edition, 80);
  if (edition) out.edition = edition;
  const dedication = cleanProse(value.dedication, 4000);
  if (dedication) out.dedication = dedication;
  const epigraph = cleanProse(value.epigraph, 2000);
  if (epigraph) out.epigraph = epigraph;
  const attribution = cleanLine(value.epigraphAttribution, 200);
  if (attribution) out.epigraphAttribution = attribution;
  if (Array.isArray(value.alsoBy)) {
    const items = value.alsoBy
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 40)
      .map((item) => item.slice(0, 200));
    if (items.length) out.alsoBy = items;
  }
  const about = cleanProse(value.aboutAuthor, 4000);
  if (about) out.aboutAuthor = about;
  return out;
}

export function bookPagesFromStored(stored: StoredBookPages): BookPages {
  return {
    author: stored.author ?? '',
    subtitle: stored.subtitle ?? '',
    imprint: stored.imprint ?? '',
    copyrightYear: stored.copyrightYear ?? null,
    copyrightHolder: stored.copyrightHolder ?? '',
    rightsLine: stored.rightsLine ?? '',
    disclaimer: stored.disclaimer ?? '',
    paperbackIsbn: stored.paperbackIsbn ?? '',
    hardcoverIsbn: stored.hardcoverIsbn ?? '',
    ebookIsbn: stored.ebookIsbn ?? '',
    edition: stored.edition ?? '',
    dedication: stored.dedication ?? '',
    epigraph: stored.epigraph ?? '',
    epigraphAttribution: stored.epigraphAttribution ?? '',
    alsoBy: stored.alsoBy ? [...stored.alsoBy] : [],
    aboutAuthor: stored.aboutAuthor ?? '',
  };
}
