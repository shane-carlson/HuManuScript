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
  kind: 'print' | 'reflow';
  /** Trim width in inches. Reflow uses this only as a column hint. */
  widthIn: number;
  heightIn: number;
  /** Body words that fit one print page. Ignored for reflow. */
  wordsPerPage: number;
  bodyPt: number;
  lineHeight: number;
}

export const PUBLICATION_FORMATS: readonly PublicationFormat[] = [
  {
    id: 'trade',
    label: 'Trade paperback',
    blurb: 'A 6 × 9 in trade paperback. Justified type, indented paragraphs, and each chapter on a new page.',
    trim: '6 × 9 in',
    kind: 'print',
    widthIn: 6,
    heightIn: 9,
    wordsPerPage: 300,
    bodyPt: 11,
    lineHeight: 1.35,
  },
  {
    id: 'hardcover',
    label: 'Hardcover',
    blurb: 'A 6.125 × 9.25 in hardcover. The same book pages, with a slightly larger trim.',
    trim: '6.125 × 9.25 in',
    kind: 'print',
    widthIn: 6.125,
    heightIn: 9.25,
    wordsPerPage: 320,
    bodyPt: 11.5,
    lineHeight: 1.35,
  },
  {
    id: 'mass-market',
    label: 'Mass market',
    blurb: 'A 4.25 × 6.87 in mass-market paperback. Smaller type and a narrower page.',
    trim: '4.25 × 6.87 in',
    kind: 'print',
    widthIn: 4.25,
    heightIn: 6.87,
    wordsPerPage: 200,
    bodyPt: 10,
    lineHeight: 1.32,
  },
  {
    id: 'ereader',
    label: 'E-reader',
    blurb: 'A reflowable e-reader. The same words in one column, without paper pages.',
    trim: 'E-reader',
    kind: 'reflow',
    widthIn: 4.2,
    heightIn: 6.4,
    wordsPerPage: 0,
    bodyPt: 13,
    lineHeight: 1.45,
  },
  {
    id: 'tablet',
    label: 'Tablet',
    blurb: 'A tablet reader. A wider reflowing column, as on a book app.',
    trim: 'Tablet',
    kind: 'reflow',
    widthIn: 7.5,
    heightIn: 5.5,
    wordsPerPage: 0,
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
    }
  | { kind: 'blockquote'; id: string; text: string; marks: InlineMark[] }
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
  if (node.kind === 'table') return tableWords(node.rows);
  if (node.kind === 'image') return node.src ? 40 : 12;
  return 0;
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
): PublicationLayout {
  const { bookTitle, seriesLabel, subtitle } = titles(doc, identity);
  const nodes = flowWithBreaks(doc);
  if (format.kind === 'reflow') {
    const screenNodes = nodes.flatMap((node): PublicationNode[] => (
      node.kind === 'break' ? [{ kind: 'gap' }] : [node]
    ));
    const readable = screenNodes.filter((node) => node.kind !== 'gap');
    return {
      format,
      bookTitle,
      pages: [{
        kind: 'screen',
        number: null,
        header: '',
        seriesLabel,
        title: bookTitle,
        subtitle,
        nodes: readable.length ? screenNodes : [{ kind: 'note', text: 'The manuscript has no pages yet.' }],
      }],
    };
  }

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

  for (const node of nodes) {
    if (node.kind === 'break') {
      seal();
      continue;
    }
    if (node.kind === 'chapter') {
      seal();
      runningHead = node.runningHead;
      bucket.push(node);
      continue;
    }
    const words = nodeWords(node);
    if (bodyWords > 0 && words > 0 && bodyWords + words > format.wordsPerPage) seal();
    bucket.push(node);
    bodyWords += words;
  }
  seal();

  return { format, bookTitle, pages };
}
