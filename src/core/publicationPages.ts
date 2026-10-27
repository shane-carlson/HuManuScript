/**
 * Optional publication pages for a file export.
 * Off unless the author turns them on. Empty optional pages are not written.
 * The ebook spine omits the half title, blank pages, and print ISBNs.
 */

import { defaultRightsLine, normalizeIsbn, parseCopyrightYear } from './bookPages.ts';
import type { ManuscriptDocument } from './document.ts';
import type { ManuscriptBlock } from './types.ts';

export class PublicationPagesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicationPagesError';
  }
}

/** A short also-by list fits the half-title verso. A longer list goes to the back. */
const SHORT_ALSO_BY = 8;

export interface PrintPage {
  /** A verso with no words. Nothing is printed on it. */
  blank: boolean;
  heading: string;
  lines: string[];
  align: 'left' | 'center';
}

export interface PublicationMatterInput {
  title: string;
  seriesLine: string;
  author: string;
  subtitle: string;
  imprint: string;
  /** As typed. Stored and printed only when it is four digits. */
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
  contents: { title: string; level: 1 | 2 }[];
}

export function contentsEntries(blocks: ManuscriptBlock[]): { title: string; level: 1 | 2 }[] {
  const entries: { title: string; level: 1 | 2 }[] = [];
  let chapterNo = 0;
  for (const block of blocks) {
    if (block.type === 'chapter') {
      chapterNo += 1;
      entries.push({ title: block.title.trim() || `Chapter ${chapterNo}`, level: 1 });
    } else if (block.type === 'section') {
      entries.push({ title: block.title.trim() || 'Section', level: 2 });
    }
  }
  return entries;
}

export function contentsFromDocument(doc: ManuscriptDocument): { title: string; level: 1 | 2 }[] {
  return contentsEntries(doc.blocks);
}

export interface PrintMatter {
  front: PrintPage[];
  back: PrintPage[];
  author: string;
  year: number;
  ebookIsbn: string;
}

function blankPage(): PrintPage {
  return { blank: true, heading: '', lines: [], align: 'left' };
}

function page(heading: string, lines: string[], align: 'left' | 'center'): PrintPage {
  return { blank: false, heading, lines: lines.filter((line) => line.trim()), align };
}

function proseLines(raw: string): string[] {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function checkedIsbn(raw: string, label: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const isbn = normalizeIsbn(trimmed);
  if (!isbn) {
    throw new PublicationPagesError(
      `The ${label} ISBN is not valid. Correct it, or clear it. Publication pages are not added with a bad ISBN.`,
    );
  }
  return isbn;
}

export function copyrightNoticeLines(args: {
  year: number;
  author: string;
  copyrightHolder: string;
  rightsLine: string;
  disclaimer: string;
  imprint: string;
  edition: string;
  paperbackIsbn: string;
  hardcoverIsbn: string;
  ebookIsbn: string;
  /** Print files list every filled ISBN. The EPUB lists only the ebook ISBN. */
  printIsbns: boolean;
}): string[] {
  const holder = args.copyrightHolder.replace(/\s+/g, ' ').trim() || args.author;
  const lines = [`Copyright © ${args.year} ${holder}`];
  lines.push(args.rightsLine.replace(/\s+/g, ' ').trim() || defaultRightsLine());
  lines.push(...proseLines(args.disclaimer));
  if (args.printIsbns && args.paperbackIsbn) lines.push(`Paperback ISBN ${args.paperbackIsbn}`);
  if (args.printIsbns && args.hardcoverIsbn) lines.push(`Hardcover ISBN ${args.hardcoverIsbn}`);
  if (args.ebookIsbn) lines.push(`Ebook ISBN ${args.ebookIsbn}`);
  const imprint = args.imprint.replace(/\s+/g, ' ').trim();
  if (imprint) lines.push(imprint);
  const edition = args.edition.replace(/\s+/g, ' ').trim();
  if (edition) lines.push(edition);
  return lines;
}

/** Print stack. Half title first. Blank versos keep the title, dedication, and contents on rectos. */
export function buildPrintMatter(input: PublicationMatterInput): PrintMatter {
  const author = input.author.replace(/\s+/g, ' ').trim();
  if (!author) {
    throw new PublicationPagesError(
      'Enter the author name before including publication pages. The file does not invent one.',
    );
  }
  const year = parseCopyrightYear(input.copyrightYear);
  if (!year) {
    throw new PublicationPagesError(
      'Enter a four-digit copyright year before including publication pages. The year is not filled in on export.',
    );
  }
  const paperbackIsbn = checkedIsbn(input.paperbackIsbn, 'paperback');
  const hardcoverIsbn = checkedIsbn(input.hardcoverIsbn, 'hardcover');
  const ebookIsbn = checkedIsbn(input.ebookIsbn, 'ebook');
  const series = input.seriesLine.replace(/\s+/g, ' ').trim();
  const subtitle = input.subtitle.replace(/\s+/g, ' ').trim();
  const imprint = input.imprint.replace(/\s+/g, ' ').trim();
  const alsoBy = input.alsoBy.map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const dedication = proseLines(input.dedication);
  const epigraph = proseLines(input.epigraph);
  const attribution = input.epigraphAttribution.replace(/\s+/g, ' ').trim();
  const about = proseLines(input.aboutAuthor);
  const shortAlso = alsoBy.length > 0 && alsoBy.length <= SHORT_ALSO_BY;

  const halfLines = [...(series ? [series] : []), input.title.trim() || 'Untitled'];
  const titleLines = [
    ...(series ? [series] : []),
    input.title.trim() || 'Untitled',
    ...(subtitle ? [subtitle] : []),
    author,
    ...(imprint ? [imprint] : []),
  ];
  const copyright = copyrightNoticeLines({
    year,
    author,
    copyrightHolder: input.copyrightHolder,
    rightsLine: input.rightsLine,
    disclaimer: input.disclaimer,
    imprint,
    edition: input.edition,
    paperbackIsbn,
    hardcoverIsbn,
    ebookIsbn,
    printIsbns: true,
  });
  const contentsLines = input.contents.map((entry) => (entry.level === 2 ? `    ${entry.title}` : entry.title));
  const alsoByPage = page(`Also by ${author}`, alsoBy, 'left');

  const front: PrintPage[] = [];
  const push = (item: PrintPage, recto: boolean) => {
    if (recto && front.length % 2 === 1) front.push(blankPage());
    front.push(item);
  };
  push(page('', halfLines, 'center'), true);
  if (shortAlso) front.push(alsoByPage);
  push(page('', titleLines, 'center'), true);
  push(page('', copyright, 'left'), false);
  if (dedication.length) push(page('', dedication, 'center'), true);
  push(page('Contents', contentsLines, 'left'), true);
  if (epigraph.length) {
    const lines = attribution ? [...epigraph, attribution] : epigraph;
    if (front.length % 2 === 1) front.push(page('', lines, 'center'));
    else {
      front.push(page('', lines, 'center'));
      front.push(blankPage());
    }
  } else if (front.length % 2 === 1) {
    front.push(blankPage());
  }

  const back: PrintPage[] = [];
  if (!shortAlso && alsoBy.length) back.push(alsoByPage);
  if (about.length) back.push(page('About the author', about, 'left'));
  return { front, back, author, year, ebookIsbn };
}
