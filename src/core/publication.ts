/**
 * Read-only publication layout: the manuscript as common print and e-reader pages.
 * Typesetting only. It does not change the document or its certification.
 */

import { displayTitle, type ManuscriptDocument } from './document.ts';
import { dividerDisplayText, wordsInBlock } from './manuscript.ts';
import type { InlineMark, ListStyle } from './types.ts';

export type PublicationFormatId = 'trade' | 'hardcover' | 'mass-market' | 'ereader' | 'tablet';

export interface PublicationFormat {
  id: PublicationFormatId;
  label: string;
  /** One sentence under the view title. */
  blurb: string;
  /** Trim or device, shown beside the page count. */
  trim: string;
  /** Print stack, or a reader that turns one fixed page at a time. */
  kind: 'print' | 'reader';
  /** Trim width in inches. Every page of this format uses this size. */
  widthIn: number;
  heightIn: number;
  /** Side and top margins, in inches of the trim. */
  marginXIn: number;
  marginYIn: number;
  /** Body words that fit one page at bodyPt. */
  wordsPerPage: number;
  bodyPt: number;
  lineHeight: number;
}

export const PUBLICATION_FORMATS: readonly PublicationFormat[] = [
  {
    id: 'trade',
    label: 'Trade paperback',
    blurb: 'A 6 × 9 in trade paperback. A chapter continues onto the next page when the page is full.',
    trim: '6 × 9 in',
    kind: 'print',
    widthIn: 6,
    heightIn: 9,
    marginXIn: 0.75,
    marginYIn: 0.7,
    wordsPerPage: 120,
    bodyPt: 11,
    lineHeight: 1.35,
  },
  {
    id: 'hardcover',
    label: 'Hardcover',
    blurb: 'A 6.125 × 9.25 in hardcover. The same fixed page, filled until the page is full.',
    trim: '6.125 × 9.25 in',
    kind: 'print',
    widthIn: 6.125,
    heightIn: 9.25,
    marginXIn: 0.8,
    marginYIn: 0.75,
    wordsPerPage: 130,
    bodyPt: 11.5,
    lineHeight: 1.35,
  },
  {
    id: 'mass-market',
    label: 'Mass market',
    blurb: 'A 4.25 × 6.87 in mass-market paperback. Narrow margins so the text fills the page.',
    trim: '4.25 × 6.87 in',
    kind: 'print',
    widthIn: 4.25,
    heightIn: 6.87,
    marginXIn: 0.42,
    marginYIn: 0.4,
    wordsPerPage: 85,
    bodyPt: 10,
    lineHeight: 1.32,
  },
  {
    id: 'ereader',
    label: 'E-reader',
    blurb: 'A fixed e-reader page. Scroll or turn to the next page, and change the text size.',
    trim: '4.25 × 6.4 in',
    kind: 'reader',
    widthIn: 4.25,
    heightIn: 6.4,
    marginXIn: 0.36,
    marginYIn: 0.32,
    wordsPerPage: 40,
    bodyPt: 13,
    lineHeight: 1.45,
  },
  {
    id: 'tablet',
    label: 'Tablet',
    blurb: 'A 6 × 8 in tablet page. Scroll or turn the page, and change the text size.',
    trim: '6 × 8 in',
    kind: 'reader',
    widthIn: 6,
    heightIn: 8,
    marginXIn: 0.55,
    marginYIn: 0.5,
    wordsPerPage: 65,
    bodyPt: 14,
    lineHeight: 1.42,
  },
];

export function publicationFormat(id: string | null | undefined): PublicationFormat {
  return PUBLICATION_FORMATS.find((format) => format.id === id) ?? PUBLICATION_FORMATS[0]!;
}

export interface PublicationIdentity {
  bookTitle?: string;
  seriesLabel?: string | null;
}

export type PublicationNode =
  | { kind: 'chapter'; kicker: string; title: string; runningHead: string }
  | { kind: 'section'; title: string }
  | { kind: 'scene'; title: string }
  | { kind: 'ornament'; text: string }
  | {
      kind: 'paragraph';
      id: string;
      text: string;
      marks: InlineMark[];
      listStyle: ListStyle;
      listIndex: number | null;
      indentLevel: number;
      continued?: boolean;
    }
  | { kind: 'blockquote'; id: string; text: string; marks: InlineMark[]; continued?: boolean }
  | { kind: 'table'; id: string; rows: string[][] }
  | { kind: 'image'; id: string; src: string; alt: string; caption: string }
  | { kind: 'gap' }
  | { kind: 'note'; text: string };

export interface PublicationPage {
  kind: 'title' | 'text' | 'screen';
  /** Arabic folio. Absent on the title page and on a reflow screen. */
  number: number | null;
  /** Running head. Empty on the title page and on a reflow screen. */
  header: string;
  seriesLabel: string | null;
  title: string;
  subtitle: string;
  nodes: PublicationNode[];
}

export interface PublicationLayout {
  format: PublicationFormat;
  bookTitle: string;
  pages: PublicationPage[];
}

function cellText(rows: string[][]): string {
  return rows.map((row) => row.join(' ')).join(' ');
}

function tableWords(rows: string[][]): number {
  const words = wordsInBlock({
    id: '',
    type: 'paragraph',
    title: '',
    text: cellText(rows),
    marks: [],
  });
  return words > 0 ? Math.max(30, words) : 0;
}

function flowWithBreaks(doc: ManuscriptDocument): Array<PublicationNode | { kind: 'break' }> {
  const nodes: Array<PublicationNode | { kind: 'break' }> = [];
  let chapterNumber = 0;
  let listNumber = 0;
  for (const block of doc.blocks) {
    if (block.type === 'pageBreak') {
      listNumber = 0;
      nodes.push({ kind: 'break' });
      continue;
    }
    if (block.type === 'chapter') {
      chapterNumber += 1;
      listNumber = 0;
      const title = block.title.trim();
      const kicker = `Chapter ${chapterNumber}`;
      nodes.push({ kind: 'chapter', kicker, title, runningHead: title || kicker });
      continue;
    }
    if (block.type === 'section') {
      listNumber = 0;
      nodes.push({ kind: 'section', title: block.title.trim() || 'Section' });
      continue;
    }
    if (block.type === 'scene') {
      listNumber = 0;
      const title = block.title.trim();
      nodes.push(title ? { kind: 'scene', title } : { kind: 'ornament', text: '* * *' });
      continue;
    }
    if (block.type === 'divider') {
      listNumber = 0;
      nodes.push({ kind: 'ornament', text: dividerDisplayText(block.dividerStyle, block.title) });
      continue;
    }
    if (block.type === 'paragraph' || block.type === 'blockquote') {
      if (!block.text.trim()) continue;
      if (block.type === 'blockquote') {
        listNumber = 0;
        nodes.push({ kind: 'blockquote', id: block.id, text: block.text, marks: block.marks });
        continue;
      }
      const listStyle = block.listStyle ?? null;
      if (listStyle === 'number') listNumber += 1;
      else listNumber = 0;
      nodes.push({
        kind: 'paragraph',
        id: block.id,
        text: block.text,
        marks: block.marks,
        listStyle,
        listIndex: listStyle === 'number' ? listNumber : null,
        indentLevel: Math.max(0, block.indentLevel ?? 0),
      });
      continue;
    }
    if (block.type === 'table') {
      listNumber = 0;
      const rows = block.tableRows ?? [];
      if (tableWords(rows) === 0) continue;
      nodes.push({ kind: 'table', id: block.id, rows });
      continue;
    }
    if (block.type === 'image') {
      listNumber = 0;
      const src = block.imageSrc?.trim() ?? '';
      const alt = block.imageAlt?.trim() ?? '';
      const caption = block.imageCaption?.trim() ?? '';
      if (!src && !alt && !caption) continue;
      nodes.push({ kind: 'image', id: block.id, src, alt, caption });
    }
  }
  return nodes;
}

function nodeWords(node: PublicationNode | { kind: 'break' }): number {
  if (node.kind === 'paragraph' || node.kind === 'blockquote') {
    return wordsInBlock({ id: '', type: 'paragraph', title: '', text: node.text, marks: [] });
  }
  if (node.kind === 'chapter') return Math.max(36, wordsInBlock({ id: '', type: 'paragraph', title: '', text: `${node.kicker} ${node.title}`, marks: [] }));
  if (node.kind === 'section' || node.kind === 'scene') return 10;
  if (node.kind === 'ornament') return 6;
  if (node.kind === 'table') return tableWords(node.rows);
  if (node.kind === 'image') return node.src ? 40 : 12;
  if (node.kind === 'note') return 12;
  return 0;
}

function wordEnds(text: string): number[] {
  const ends: number[] = [];
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) ends.push(match.index + match[0].length);
  return ends;
}

function sliceMarks(marks: InlineMark[], start: number, end: number): InlineMark[] {
  const sliced: InlineMark[] = [];
  for (const mark of marks) {
    const from = Math.max(mark.start, start);
    const to = Math.min(mark.end, end);
    if (to > from) sliced.push({ kind: mark.kind, start: from - start, end: to - start });
  }
  return sliced;
}

function proseSlice(
  node: Extract<PublicationNode, { kind: 'paragraph' | 'blockquote' }>,
  start: number,
  end: number,
  piece: number,
): PublicationNode {
  const text = node.text.slice(start, end).trim();
  const lead = node.text.slice(start, end).length - node.text.slice(start, end).trimStart().length;
  const trimmedStart = start + lead;
  const marks = sliceMarks(node.marks, trimmedStart, trimmedStart + text.length);
  if (node.kind === 'blockquote') {
    return {
      kind: 'blockquote',
      id: piece === 0 ? node.id : `${node.id}~${piece}`,
      text,
      marks,
      continued: piece > 0,
    };
  }
  return {
    kind: 'paragraph',
    id: piece === 0 ? node.id : `${node.id}~${piece}`,
    text,
    marks,
    listStyle: piece === 0 ? node.listStyle : null,
    listIndex: piece === 0 ? node.listIndex : null,
    indentLevel: node.indentLevel,
    continued: piece > 0,
  };
}

/** Take the first `maxWords` words. The tail keeps the rest for the next page. */
function splitOnce(
  node: Extract<PublicationNode, { kind: 'paragraph' | 'blockquote' }>,
  maxWords: number,
): [PublicationNode, PublicationNode | null] {
  const ends = wordEnds(node.text);
  if (ends.length <= maxWords) return [node, null];
  const cut = ends[maxWords - 1]!;
  const head = proseSlice(node, 0, cut, 0);
  const tail = proseSlice(node, cut, node.text.length, 1);
  if (tail.kind !== 'paragraph' && tail.kind !== 'blockquote') return [head, null];
  if (!tail.text.trim()) return [head, null];
  return [head, tail];
}

/** Words that fit one page at a reader-chosen type size. Larger type fits fewer words. */
export function wordsForPage(format: PublicationFormat, bodyPt = format.bodyPt): number {
  const size = bodyPt > 0 ? bodyPt : format.bodyPt;
  const ratio = format.bodyPt / size;
  return Math.max(24, Math.round(format.wordsPerPage * ratio * ratio));
}

function titles(doc: ManuscriptDocument, identity: PublicationIdentity | undefined): {
  bookTitle: string;
  seriesLabel: string | null;
  subtitle: string;
} {
  const bookTitle = identity?.bookTitle?.trim() || displayTitle(doc);
  const manuscript = doc.title.trim();
  return {
    bookTitle,
    seriesLabel: identity?.seriesLabel?.trim() || null,
    subtitle: manuscript && manuscript !== bookTitle ? manuscript : '',
  };
}

export function layoutPublication(
  doc: ManuscriptDocument,
  format: PublicationFormat = PUBLICATION_FORMATS[0]!,
  identity?: PublicationIdentity,
  bodyPt = format.bodyPt,
): PublicationLayout {
  const { bookTitle, seriesLabel, subtitle } = titles(doc, identity);
  const nodes = flowWithBreaks(doc);
  const limit = wordsForPage(format, bodyPt);
  const pages: PublicationPage[] = [{
    kind: 'title',
    number: null,
    header: '',
    seriesLabel,
    title: bookTitle,
    subtitle,
    nodes: nodes.some((node) => node.kind !== 'break') ? [] : [{ kind: 'note', text: 'The manuscript has no pages yet.' }],
  }];

  let bucket: PublicationNode[] = [];
  let bodyWords = 0;
  let runningHead = '';
  let number = 1;

  const seal = () => {
    if (!bucket.length) return;
    const header = number % 2 === 1 ? (runningHead || bookTitle) : bookTitle;
    pages.push({
      kind: 'text',
      number,
      header,
      seriesLabel: null,
      title: bookTitle,
      subtitle: '',
      nodes: bucket,
    });
    number += 1;
    bucket = [];
    bodyWords = 0;
  };

  const place = (node: PublicationNode) => {
    if (node.kind === 'chapter') runningHead = node.runningHead;
    const words = nodeWords(node);
    const room = bodyWords === 0 ? limit : limit - bodyWords;
    if ((node.kind === 'paragraph' || node.kind === 'blockquote') && words > room && room >= 8) {
      const [head, tail] = splitOnce(node, room);
      if (tail) {
        place(head);
        place(tail);
        return;
      }
    }
    if (words > room && bodyWords > 0) {
      seal();
      place(node);
      return;
    }
    bucket.push(node);
    bodyWords += words;
  };

  for (const node of nodes) {
    if (node.kind === 'break') {
      seal();
      continue;
    }
    place(node);
  }
  seal();

  return { format, bookTitle, pages };
}
