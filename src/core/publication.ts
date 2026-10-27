/**
 * Read-only publication layout: the manuscript as common print and e-reader pages.
 * Typesetting only. It does not change the document or its certification.
 */

import { displayTitle, type ManuscriptDocument } from './document.ts';
import { dividerDisplayText, wordsInBlock } from './manuscript.ts';
import type { InlineMark, ListStyle } from './types.ts';

export type PublicationFormatId =
  | 'trade'
  | 'hardcover'
  | 'mass-market'
  | 'ereader'
  | 'tablet'
  | 'paperback-5x8'
  | 'paperback-5-25x8'
  | 'paperback-5-5x8-5'
  | 'paperback-6-14x9-21'
  | 'paperback-7x10'
  | 'hardcover-5-5x8-5'
  | 'hardcover-6x9'
  | 'hardcover-6-14x9-21'
  | 'hardcover-7x10'
  | 'hardcover-8-5x11';

export type PublicationBinding = 'paperback' | 'hardcover' | 'mass-market' | 'reader';

export interface PublicationFormat {
  id: PublicationFormatId;
  label: string;
  /** One sentence under the view title. */
  blurb: string;
  /** Trim or device, shown beside the page count. */
  trim: string;
  /** Print stack, or a reader that turns one fixed page at a time. */
  kind: 'print' | 'reader';
  binding: PublicationBinding;
  /** Shown as its own format button. Other sizes of that binding open from the chevron. */
  button: boolean;
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

/** Same density as the tuned 6 × 9 trade page, scaled by text area and type size. */
function pageWords(widthIn: number, heightIn: number, marginXIn: number, marginYIn: number, bodyPt: number): number {
  const area = (widthIn - 2 * marginXIn) * (heightIn - 2 * marginYIn);
  const tradeArea = (6 - 1.5) * (9 - 1.4);
  const scale = (11 / bodyPt) ** 2;
  return Math.max(40, Math.round(120 * (area / tradeArea) * scale));
}

function printSize(
  id: PublicationFormatId,
  binding: 'paperback' | 'hardcover',
  trim: string,
  widthIn: number,
  heightIn: number,
  marginXIn: number,
  marginYIn: number,
  bodyPt: number,
): PublicationFormat {
  const name = binding === 'paperback' ? 'trade paperback' : 'hardcover';
  return {
    id,
    label: trim,
    blurb: `A ${trim} ${name}. A chapter continues onto the next page when the page is full.`,
    trim,
    kind: 'print',
    binding,
    button: false,
    widthIn,
    heightIn,
    marginXIn,
    marginYIn,
    wordsPerPage: pageWords(widthIn, heightIn, marginXIn, marginYIn, bodyPt),
    bodyPt,
    lineHeight: 1.35,
  };
}

export const PUBLICATION_FORMATS: readonly PublicationFormat[] = [
  {
    id: 'trade',
    label: 'Trade paperback',
    blurb: 'A 6 × 9 in trade paperback. A chapter continues onto the next page when the page is full.',
    trim: '6 × 9 in',
    kind: 'print',
    binding: 'paperback',
    button: true,
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
    binding: 'hardcover',
    button: true,
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
    binding: 'mass-market',
    button: true,
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
    binding: 'reader',
    button: true,
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
    binding: 'reader',
    button: true,
    widthIn: 6,
    heightIn: 8,
    marginXIn: 0.55,
    marginYIn: 0.5,
    wordsPerPage: 65,
    bodyPt: 14,
    lineHeight: 1.42,
  },
  printSize('paperback-5x8', 'paperback', '5 × 8 in', 5, 8, 0.65, 0.6, 11),
  printSize('paperback-5-25x8', 'paperback', '5.25 × 8 in', 5.25, 8, 0.65, 0.6, 11),
  printSize('paperback-5-5x8-5', 'paperback', '5.5 × 8.5 in', 5.5, 8.5, 0.7, 0.65, 11),
  printSize('paperback-6-14x9-21', 'paperback', '6.14 × 9.21 in', 6.14, 9.21, 0.75, 0.7, 11),
  printSize('paperback-7x10', 'paperback', '7 × 10 in', 7, 10, 0.8, 0.75, 11.5),
  printSize('hardcover-5-5x8-5', 'hardcover', '5.5 × 8.5 in', 5.5, 8.5, 0.7, 0.65, 11),
  printSize('hardcover-6x9', 'hardcover', '6 × 9 in', 6, 9, 0.75, 0.7, 11.5),
  printSize('hardcover-6-14x9-21', 'hardcover', '6.14 × 9.21 in', 6.14, 9.21, 0.8, 0.75, 11.5),
  printSize('hardcover-7x10', 'hardcover', '7 × 10 in', 7, 10, 0.85, 0.8, 12),
  printSize('hardcover-8-5x11', 'hardcover', '8.5 × 11 in', 8.5, 11, 1, 0.9, 12),
];

/** Sizes that open from a binding's chevron. The button itself keeps the original trim. */
export function otherBindingSizes(binding: 'paperback' | 'hardcover'): readonly PublicationFormat[] {
  return PUBLICATION_FORMATS.filter((format) => format.binding === binding && !format.button);
}

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

type ProseNode = Extract<PublicationNode, { kind: 'paragraph' | 'blockquote' }>;

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
  node: ProseNode,
  start: number,
  end: number,
  piece: number,
): ProseNode {
  const raw = node.text.slice(start, end);
  const text = raw.trim();
  const lead = raw.length - raw.trimStart().length;
  const trimmedStart = start + lead;
  const marks = sliceMarks(node.marks, trimmedStart, trimmedStart + text.length);
  const continued = piece > 0 || node.continued === true;
  const id = piece === 0 ? node.id : `${node.id}~${piece}`;
  if (node.kind === 'blockquote') {
    return { kind: 'blockquote', id, text, marks, continued };
  }
  return {
    kind: 'paragraph',
    id,
    text,
    marks,
    listStyle: continued ? null : node.listStyle,
    listIndex: continued ? null : node.listIndex,
    indentLevel: node.indentLevel,
    continued,
  };
}

/** Take the first `maxWords` words. The tail keeps the rest for the next page. */
function splitOnce(
  node: ProseNode,
  maxWords: number,
): [ProseNode, ProseNode | null] {
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

export interface PublicationSlot {
  /** Running head already chosen for this page. */
  header: string;
  number: number;
}

function isProseNode(node: PublicationNode): node is ProseNode {
  return node.kind === 'paragraph' || node.kind === 'blockquote';
}

function proseWordCount(node: ProseNode): number {
  return wordEnds(node.text).length;
}

/** Largest leading slice that `canTake` accepts. Null when even one word does not fit. */
function largestFit(
  node: ProseNode,
  canTake: (head: PublicationNode) => boolean,
): { head: PublicationNode; tail: PublicationNode | null } | null {
  const total = proseWordCount(node);
  if (total === 0) return null;
  let low = 1;
  let high = total;
  let best = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const [head] = splitOnce(node, mid);
    if (canTake(head)) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (best === 0) return null;
  const [head, tail] = splitOnce(node, best);
  if (tail && proseWordCount(tail) >= total) return null;
  return { head, tail };
}

/**
 * Paginate the manuscript.
 * `fits` is true when those nodes stay inside one page's text area.
 * A chapter always opens on a new page, so the previous chapter may end early.
 * Prose keeps flowing until the page is full.
 */
export function packPublication(
  doc: ManuscriptDocument,
  format: PublicationFormat,
  identity: PublicationIdentity | undefined,
  fits: (nodes: PublicationNode[], slot: PublicationSlot) => boolean,
): PublicationLayout {
  const { bookTitle, seriesLabel, subtitle } = titles(doc, identity);
  const queue: Array<PublicationNode | { kind: 'break' }> = flowWithBreaks(doc);
  const hasBody = queue.some((node) => node.kind !== 'break');
  const pages: PublicationPage[] = [{
    kind: 'title',
    number: null,
    header: '',
    seriesLabel,
    title: bookTitle,
    subtitle,
    nodes: hasBody ? [] : [{ kind: 'note', text: 'The manuscript has no pages yet.' }],
  }];

  let bucket: PublicationNode[] = [];
  let runningHead = '';
  let number = 1;
  let index = 0;
  let steps = 0;

  const slotFor = (nodes: PublicationNode[]): PublicationSlot => {
    let head = runningHead;
    for (const node of nodes) {
      if (node.kind === 'chapter') head = node.runningHead;
    }
    return {
      header: number % 2 === 1 ? (head || bookTitle) : bookTitle,
      number,
    };
  };

  const fitsPage = (nodes: PublicationNode[]) => fits(nodes, slotFor(nodes));

  const seal = () => {
    if (!bucket.length) return;
    const slot = slotFor(bucket);
    pages.push({
      kind: 'text',
      number,
      header: slot.header,
      seriesLabel: null,
      title: bookTitle,
      subtitle: '',
      nodes: bucket,
    });
    for (const node of bucket) {
      if (node.kind === 'chapter') runningHead = node.runningHead;
    }
    number += 1;
    bucket = [];
  };

  while (index < queue.length) {
    if (++steps > 250000) break;
    const node = queue[index]!;
    if (node.kind === 'break') {
      seal();
      index += 1;
      continue;
    }
    if (node.kind === 'chapter' && bucket.length > 0) {
      seal();
      continue;
    }
    if (fitsPage([...bucket, node])) {
      bucket.push(node);
      index += 1;
      continue;
    }
    if (isProseNode(node)) {
      const split = largestFit(node, (head) => fitsPage([...bucket, head]));
      if (split) {
        bucket.push(split.head);
        seal();
        if (split.tail) queue[index] = split.tail;
        else index += 1;
        continue;
      }
    }
    if (bucket.length > 0) {
      seal();
      continue;
    }
    bucket.push(node);
    index += 1;
    seal();
  }
  seal();

  return { format, bookTitle, pages };
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
  const limit = wordsForPage(format, bodyPt);
  return packPublication(doc, format, identity, (nodes) => {
    let used = 0;
    for (const node of nodes) {
      used += nodeWords(node);
      if (used > limit) return false;
    }
    return true;
  });
}
