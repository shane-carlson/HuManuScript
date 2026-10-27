/**
 * Choices for a reflowable EPUB 3. Stored on the book so the identifier
 * and the last formatting choices survive the next export.
 * The cover file is not stored here.
 */

export type EpubParagraphStyle = 'indent' | 'spacing';
export type EpubTextAlign = 'left' | 'justify';
export type EpubBodySize = 'small' | 'medium' | 'large' | 'xlarge';

export const DEFAULT_EPUB_LANGUAGE = 'en';
export const DEFAULT_EPUB_PARAGRAPH_STYLE: EpubParagraphStyle = 'indent';
export const DEFAULT_EPUB_TEXT_ALIGN: EpubTextAlign = 'left';
export const DEFAULT_EPUB_BODY_SIZE: EpubBodySize = 'medium';
export const DEFAULT_EPUB_CHAPTER_BREAKS = true;

/** Relative to the reader's own size. Medium is 1em, which is that default. */
export const EPUB_BODY_SIZE_EM: Record<EpubBodySize, string> = {
  small: '0.9em',
  medium: '1em',
  large: '1.15em',
  xlarge: '1.3em',
};

export const EPUB_BODY_SIZE_LABEL: Record<EpubBodySize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  xlarge: 'Extra large',
};

/** First-line indent. Kindle's cap for a paragraph indent is 4em. */
export const EPUB_PARAGRAPH_INDENT = '1.5em';
/** Gap used when the author picks spacing instead of an indent. Not a blank line. */
export const EPUB_PARAGRAPH_GAP = '0.75em';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BCP47 =
  /^[a-zA-Z]{2,3}(?:-[a-zA-Z]{4})?(?:-(?:[a-zA-Z]{2}|\d{3}))?(?:-(?:[a-zA-Z0-9]{5,8}|\d[a-zA-Z0-9]{3}))?$/;

export function isEpubUuid(value: string): boolean {
  return UUID_RE.test(value.toLowerCase());
}

export function mintEpubUuid(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID().toLowerCase();
  const bytes = new Uint8Array(16);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') cryptoObj.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Canonical BCP 47 tag, or null when the text is not one. */
export function canonicalBcp47(raw: string): string | null {
  const trimmed = raw.trim();
  if (!BCP47.test(trimmed)) return null;
  return trimmed
    .split('-')
    .map((part, index) => {
      if (index === 0) return part.toLowerCase();
      if (/^[a-zA-Z]{2}$/.test(part)) return part.toUpperCase();
      if (/^[a-zA-Z]{4}$/.test(part)) return `${part[0]!.toUpperCase()}${part.slice(1).toLowerCase()}`;
      if (/^\d{3}$/.test(part)) return part;
      return part.toLowerCase();
    })
    .join('-');
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

export function isEpubParagraphStyle(value: unknown): value is EpubParagraphStyle {
  return value === 'indent' || value === 'spacing';
}

export function isEpubTextAlign(value: unknown): value is EpubTextAlign {
  return value === 'left' || value === 'justify';
}

export function isEpubBodySize(value: unknown): value is EpubBodySize {
  return value === 'small' || value === 'medium' || value === 'large' || value === 'xlarge';
}

export interface StoredEpubFields {
  epubUuid?: string;
  epubIsbn?: string;
  epubAuthor?: string;
  epubLanguage?: string;
  epubChapterBreaks?: boolean;
  epubParagraphStyle?: EpubParagraphStyle;
  epubTextAlign?: EpubTextAlign;
  epubBodySize?: EpubBodySize;
}

/** Keep only values the exporter can write. Drop the rest on load. */
export function readStoredEpubFields(raw: unknown): StoredEpubFields {
  if (!raw || typeof raw !== 'object') return {};
  const value = raw as Record<string, unknown>;
  const out: StoredEpubFields = {};
  if (typeof value.epubUuid === 'string' && isEpubUuid(value.epubUuid)) out.epubUuid = value.epubUuid.toLowerCase();
  if (typeof value.epubIsbn === 'string') {
    const isbn = normalizeIsbn(value.epubIsbn);
    if (isbn) out.epubIsbn = isbn;
  }
  if (typeof value.epubAuthor === 'string' && value.epubAuthor.trim()) out.epubAuthor = value.epubAuthor.trim();
  if (typeof value.epubLanguage === 'string') {
    const language = canonicalBcp47(value.epubLanguage);
    if (language) out.epubLanguage = language;
  }
  if (typeof value.epubChapterBreaks === 'boolean') out.epubChapterBreaks = value.epubChapterBreaks;
  if (isEpubParagraphStyle(value.epubParagraphStyle)) out.epubParagraphStyle = value.epubParagraphStyle;
  if (isEpubTextAlign(value.epubTextAlign)) out.epubTextAlign = value.epubTextAlign;
  if (isEpubBodySize(value.epubBodySize)) out.epubBodySize = value.epubBodySize;
  return out;
}

export interface EpubChoicePatch {
  author: string;
  language: string;
  isbn: string;
  chapterPageBreaks: boolean;
  paragraphStyle: EpubParagraphStyle;
  textAlign: EpubTextAlign;
  bodySize: EpubBodySize;
}

export interface EpubChoiceView {
  uuid: string;
  author: string;
  language: string;
  isbn: string;
  chapterPageBreaks: boolean;
  paragraphStyle: EpubParagraphStyle;
  textAlign: EpubTextAlign;
  bodySize: EpubBodySize;
}

export function epubChoicesFromBook(book: StoredEpubFields): EpubChoiceView {
  const stored = readStoredEpubFields(book);
  return {
    uuid: stored.epubUuid ?? '',
    author: stored.epubAuthor ?? '',
    language: stored.epubLanguage ?? DEFAULT_EPUB_LANGUAGE,
    isbn: stored.epubIsbn ?? '',
    chapterPageBreaks: stored.epubChapterBreaks ?? DEFAULT_EPUB_CHAPTER_BREAKS,
    paragraphStyle: stored.epubParagraphStyle ?? DEFAULT_EPUB_PARAGRAPH_STYLE,
    textAlign: stored.epubTextAlign ?? DEFAULT_EPUB_TEXT_ALIGN,
    bodySize: stored.epubBodySize ?? DEFAULT_EPUB_BODY_SIZE,
  };
}
