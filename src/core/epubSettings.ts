/**
 * Choices for a reflowable EPUB 3. Stored on the book so the identifier
 * and the last formatting choices survive the next export.
 * Publication pages live in bookPages.ts. The cover file is not stored.
 */

import { bookPagesFromStored, readStoredBookPages } from './bookPages.ts';

export { normalizeIsbn } from './bookPages.ts';

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
  epubLanguage?: string;
  epubChapterBreaks?: boolean;
  epubParagraphStyle?: EpubParagraphStyle;
  epubTextAlign?: EpubTextAlign;
  epubBodySize?: EpubBodySize;
  /** Publication pages in file exports. Absent means off. */
  includePublicationPages?: boolean;
}

/** Keep only values the exporter can write. Drop the rest on load. */
export function readStoredEpubFields(raw: unknown): StoredEpubFields {
  if (!raw || typeof raw !== 'object') return {};
  const value = raw as Record<string, unknown>;
  const out: StoredEpubFields = {};
  if (typeof value.epubUuid === 'string' && isEpubUuid(value.epubUuid)) out.epubUuid = value.epubUuid.toLowerCase();
  if (typeof value.epubLanguage === 'string') {
    const language = canonicalBcp47(value.epubLanguage);
    if (language) out.epubLanguage = language;
  }
  if (typeof value.epubChapterBreaks === 'boolean') out.epubChapterBreaks = value.epubChapterBreaks;
  if (isEpubParagraphStyle(value.epubParagraphStyle)) out.epubParagraphStyle = value.epubParagraphStyle;
  if (isEpubTextAlign(value.epubTextAlign)) out.epubTextAlign = value.epubTextAlign;
  if (isEpubBodySize(value.epubBodySize)) out.epubBodySize = value.epubBodySize;
  if (value.includePublicationPages === true) out.includePublicationPages = true;
  return out;
}

export interface EpubChoicePatch {
  author: string;
  subtitle: string;
  imprint: string;
  /** The year field as typed. Stored only when it is four digits. */
  copyrightYear: string;
  copyrightHolder: string;
  rightsLine: string;
  disclaimer: string;
  paperbackIsbn: string;
  hardcoverIsbn: string;
  ebookIsbn: string;
  edition: string;
  dedication: string;
  epigraph: string;
  epigraphAttribution: string;
  alsoBy: string[];
  aboutAuthor: string;
  includePublicationPages: boolean;
  language: string;
  chapterPageBreaks: boolean;
  paragraphStyle: EpubParagraphStyle;
  textAlign: EpubTextAlign;
  bodySize: EpubBodySize;
}

export interface EpubChoiceView extends EpubChoicePatch {
  uuid: string;
}

export function emptyEpubChoicePatch(): EpubChoicePatch {
  return {
    author: '',
    subtitle: '',
    imprint: '',
    copyrightYear: '',
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
    includePublicationPages: false,
    language: DEFAULT_EPUB_LANGUAGE,
    chapterPageBreaks: DEFAULT_EPUB_CHAPTER_BREAKS,
    paragraphStyle: DEFAULT_EPUB_PARAGRAPH_STYLE,
    textAlign: DEFAULT_EPUB_TEXT_ALIGN,
    bodySize: DEFAULT_EPUB_BODY_SIZE,
  };
}

export function epubChoicesFromBook(book: unknown): EpubChoiceView {
  const stored = readStoredEpubFields(book);
  const pages = bookPagesFromStored(readStoredBookPages(book));
  return {
    ...emptyEpubChoicePatch(),
    uuid: stored.epubUuid ?? '',
    author: pages.author,
    subtitle: pages.subtitle,
    imprint: pages.imprint,
    copyrightYear: pages.copyrightYear != null ? String(pages.copyrightYear) : '',
    copyrightHolder: pages.copyrightHolder,
    rightsLine: pages.rightsLine,
    disclaimer: pages.disclaimer,
    paperbackIsbn: pages.paperbackIsbn,
    hardcoverIsbn: pages.hardcoverIsbn,
    ebookIsbn: pages.ebookIsbn,
    edition: pages.edition,
    dedication: pages.dedication,
    epigraph: pages.epigraph,
    epigraphAttribution: pages.epigraphAttribution,
    alsoBy: pages.alsoBy,
    aboutAuthor: pages.aboutAuthor,
    includePublicationPages: stored.includePublicationPages === true,
    language: stored.epubLanguage ?? DEFAULT_EPUB_LANGUAGE,
    chapterPageBreaks: stored.epubChapterBreaks ?? DEFAULT_EPUB_CHAPTER_BREAKS,
    paragraphStyle: stored.epubParagraphStyle ?? DEFAULT_EPUB_PARAGRAPH_STYLE,
    textAlign: stored.epubTextAlign ?? DEFAULT_EPUB_TEXT_ALIGN,
    bodySize: stored.epubBodySize ?? DEFAULT_EPUB_BODY_SIZE,
  };
}
