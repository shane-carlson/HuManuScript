/**
 * Trim-size print interior.
 * One Typst source paints the proof and the downloaded PDF.
 * The letter-size jsPDF file stays the reading copy, with the certification summary.
 */

import type { ManuscriptDocument } from './document.ts';
import { displayTitle } from './document.ts';
import { normalizeIsbn } from './bookPages.ts';
import { dividerDisplayText } from './manuscript.ts';
import type { PublicationFormatId } from './publication.ts';
import { publicationFormat } from './publication.ts';
import { buildPrintMatter, copyrightNoticeLines, type PublicationMatterInput } from './publicationPages.ts';
import { styledSpans } from './richText.ts';
import type { InlineMark, ManuscriptBlock } from './types.ts';
import type { PublicationFileOptions } from './exportManuscript.ts';

/** A short also-by list fits the half-title verso. Same cutoff as the print stack. */
const SHORT_ALSO_BY = 8;

const OUTSIDE_IN = 0.5;
const TOP_IN = 0.75;
const BOTTOM_IN = 0.75;

export interface PrintTrim {
  id: PublicationFormatId;
  widthIn: number;
  heightIn: number;
  /** What the download is, in inches. */
  fileLabel: string;
  binding: 'paperback' | 'hardcover' | 'mass-market';
  halfTitle: boolean;
  /** Shown on the proof for this choice. */
  note: string;
  minSheets: number;
  maxSheets: number;
  /** Cap described for the warning. */
  maxLabel: string;
  minLabel: string;
}

const TRADE_NOTE =
  '6 × 9 in. One interior for KDP paperback and hardcover, Ingram, and Lulu US Trade.';

export const PRINT_TRIMS: readonly PrintTrim[] = [
  trim('trade', 6, 9, 'paperback', true, TRADE_NOTE, 24, 'KDP paperback starts at 24 pages.', 828, 'KDP black-ink paperback stops at 828 pages for this trim.'),
  trim('paperback-5x8', 5, 8, 'paperback', true, '5 × 8 in. KDP paperback, Ingram, and Lulu Novella. Not a KDP hardcover trim.', 24, 'KDP paperback starts at 24 pages.', 828, 'KDP black-ink paperback stops at 828 pages for this trim.'),
  trim('paperback-5-25x8', 5.25, 8, 'paperback', true, '5.25 × 8 in. KDP paperback and Ingram. Not on Lulu’s published chart, and not a KDP hardcover trim.', 24, 'KDP paperback starts at 24 pages.', 828, 'KDP black-ink paperback stops at 828 pages for this trim.'),
  trim('paperback-5-5x8-5', 5.5, 8.5, 'paperback', true, '5.5 × 8.5 in. KDP paperback and hardcover, Ingram, and Lulu Digest.', 24, 'KDP paperback starts at 24 pages.', 828, 'KDP black-ink paperback stops at 828 pages for this trim.'),
  trim('paperback-6-14x9-21', 6.14, 9.21, 'paperback', true, '6.14 × 9.21 in. KDP paperback and hardcover, Ingram, and Lulu Royal.', 24, 'KDP paperback starts at 24 pages.', 828, 'KDP black-ink paperback stops at 828 pages for this trim.'),
  trim('paperback-7x10', 7, 10, 'paperback', true, '7 × 10 in. KDP paperback and hardcover, Ingram, and Lulu Executive.', 24, 'KDP paperback starts at 24 pages.', 828, 'KDP black-ink paperback stops at 828 pages for this trim.'),
  trim(
    'hardcover',
    6,
    9,
    'hardcover',
    true,
    'The hardcover button is the 6.125 × 9.25 in bleed sheet of a 6 × 9 book, not a case trim. This file is 6 × 9 in, the same interior as the trade paperback.',
    75,
    'KDP hardcover starts at 75 pages.',
    550,
    'KDP hardcover stops at 550 pages for this trim.',
  ),
  trim('hardcover-6x9', 6, 9, 'hardcover', true, '6 × 9 in. The same file as the trade paperback.', 75, 'KDP hardcover starts at 75 pages.', 550, 'KDP hardcover stops at 550 pages for this trim.'),
  trim('hardcover-5-5x8-5', 5.5, 8.5, 'hardcover', true, '5.5 × 8.5 in. The same file as the paperback of this trim.', 75, 'KDP hardcover starts at 75 pages.', 550, 'KDP hardcover stops at 550 pages for this trim.'),
  trim('hardcover-6-14x9-21', 6.14, 9.21, 'hardcover', true, '6.14 × 9.21 in. The same file as the paperback of this trim.', 75, 'KDP hardcover starts at 75 pages.', 550, 'KDP hardcover stops at 550 pages for this trim.'),
  trim('hardcover-7x10', 7, 10, 'hardcover', true, '7 × 10 in. The same file as the paperback of this trim.', 75, 'KDP hardcover starts at 75 pages.', 550, 'KDP hardcover stops at 550 pages for this trim.'),
  trim(
    'hardcover-8-5x11',
    8.5,
    11,
    'hardcover',
    true,
    '8.5 × 11 in. This is not a KDP hardcover trim. KDP’s hardcover large size is 8.25 × 11 in. KDP prints 8.5 × 11 as paperback, up to 590 black-ink pages. Ingram and Lulu US Letter use this size.',
    24,
    'KDP paperback starts at 24 pages.',
    590,
    'KDP’s black-ink cap for 8.5 × 11 in paperback is 590 pages.',
  ),
  trim(
    'mass-market',
    4.25,
    6.875,
    'mass-market',
    false,
    'Lulu pocket, 4.25 × 6.875 in. The size button rounds the height to 6.87. KDP has no 4.25 × 6.87 preset. Ingram’s small trim is 4.25 × 7 in, a different book. The margin stays 0.5 in.',
    24,
    'A pocket paperback this short is under the 24-page floor used for paperbacks.',
    0,
    '',
  ),
];

function trim(
  id: PublicationFormatId,
  widthIn: number,
  heightIn: number,
  binding: PrintTrim['binding'],
  halfTitle: boolean,
  note: string,
  minSheets: number,
  minLabel: string,
  maxSheets: number,
  maxLabel: string,
): PrintTrim {
  return {
    id,
    widthIn,
    heightIn,
    fileLabel: `${formatInches(widthIn)} × ${formatInches(heightIn)} in`,
    binding,
    halfTitle,
    note,
    minSheets,
    maxSheets,
    minLabel,
    maxLabel,
  };
}

export function formatInches(n: number): string {
  return Number(n.toFixed(3)).toString();
}

export function printTrim(id: string | null | undefined): PrintTrim | null {
  return PRINT_TRIMS.find((item) => item.id === id) ?? null;
}

export const DEFAULT_PRINT_TRIM_ID: PublicationFormatId = 'trade';

/** Inside margin for a sheet count. The file never goes under 0.5 in. */
export function insideMarginIn(sheets: number): number {
  if (sheets >= 701) return 0.875;
  if (sheets >= 501) return 0.75;
  if (sheets >= 301) return 0.625;
  return OUTSIDE_IN;
}

export function gutterBandLabel(sheets: number): string {
  const inside = formatInches(insideMarginIn(sheets));
  if (sheets >= 701) return `Inside ${inside} in, the gutter for 701 or more pages.`;
  if (sheets >= 501) return `Inside ${inside} in, the gutter for 501–700 pages.`;
  if (sheets >= 301) return `Inside ${inside} in, the gutter for 301–500 pages.`;
  if (sheets >= 151) return `Inside ${inside} in, the gutter for 151–300 pages.`;
  return `Inside ${inside} in. Through 150 pages the KDP gutter is 0.375 in, so the file uses 0.5 in.`;
}

export function printSheetWarnings(item: PrintTrim, sheets: number): string[] {
  const warnings: string[] = [];
  if (item.minSheets > 0 && sheets < item.minSheets) {
    warnings.push(`${item.minLabel} This file has ${sheets}.`);
  }
  if (item.maxSheets > 0 && sheets > item.maxSheets) {
    warnings.push(`${item.maxLabel} This file has ${sheets}.`);
  }
  return warnings;
}

export function printInteriorFilename(title: string, item: PrintTrim): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'untitled-manuscript';
  const size = `${formatInches(item.widthIn)}x${formatInches(item.heightIn)}`.replace(/\./g, '-');
  return `${base}-print-${size}.pdf`;
}

/** Why the interior cannot be compiled. Null means the source can be built. */
export function printInteriorRefusal(
  doc: ManuscriptDocument,
  options: PublicationFileOptions,
  formatId: string,
): string | null {
  if (!printTrim(formatId)) return 'E-reader and tablet sizes are devices. They are not a print file.';
  if (doc.blocks.some((block) => block.type === 'image')) {
    return 'This print interior cannot include a picture yet. Take it out of the manuscript, or download the letter-size PDF on Writer files.';
  }
  if (doc.blocks.some((block) => block.type === 'table')) {
    return 'This print interior cannot include a table yet. Take it out of the manuscript, or download the letter-size PDF on Writer files.';
  }
  if (!options.includePublicationPages) {
    return 'Turn on publication pages, and enter the author and a four-digit copyright year. This interior waits for those. The letter-size PDF on Writer files stays the reading copy.';
  }
  try {
    buildPrintMatter(matterInput(doc, options));
  } catch (error) {
    return error instanceof Error ? error.message : 'Publication pages are not ready.';
  }
  return null;
}

export interface PrintInteriorSourceInput {
  doc: ManuscriptDocument;
  options: PublicationFileOptions;
  /** BCP 47 tag from the ebook form. The primary subtag is the Typst language. */
  language?: string;
  formatId: string;
  insideIn: number;
}

/** Typst source for one compile. Author text is in strings, not markup. */
export function buildPrintInteriorSource(input: PrintInteriorSourceInput): string {
  const item = printTrim(input.formatId);
  if (!item) throw new Error('This size is not a print file.');
  const refusal = printInteriorRefusal(input.doc, input.options, input.formatId);
  if (refusal) throw new Error(refusal);
  const matter = matterInput(input.doc, input.options);
  buildPrintMatter(matter);
  const bodyPt = publicationFormat(item.id).bodyPt;
  return renderSource({
    item,
    insideIn: input.insideIn,
    bodyPt,
    language: typstLang(input.language ?? ''),
    title: matter.title,
    series: matter.seriesLine,
    author: matter.author.replace(/\s+/g, ' ').trim(),
    subtitle: matter.subtitle.replace(/\s+/g, ' ').trim(),
    imprint: matter.imprint.replace(/\s+/g, ' ').trim(),
    copyright: copyrightNoticeLines({
      year: Number(matter.copyrightYear),
      author: matter.author,
      copyrightHolder: matter.copyrightHolder,
      rightsLine: matter.rightsLine,
      disclaimer: matter.disclaimer,
      imprint: matter.imprint,
      edition: matter.edition,
      paperbackIsbn: normalizeIsbn(matter.paperbackIsbn) ?? '',
      hardcoverIsbn: normalizeIsbn(matter.hardcoverIsbn) ?? '',
      ebookIsbn: normalizeIsbn(matter.ebookIsbn) ?? '',
      printIsbns: true,
    }),
    dedication: proseLines(matter.dedication),
    epigraph: proseLines(matter.epigraph),
    epigraphAttribution: matter.epigraphAttribution.replace(/\s+/g, ' ').trim(),
    alsoBy: matter.alsoBy.map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean),
    about: proseLines(matter.aboutAuthor),
    blocks: input.doc.blocks,
  });
}

function matterInput(doc: ManuscriptDocument, options: PublicationFileOptions): PublicationMatterInput {
  return {
    title: displayTitle(doc),
    seriesLine: options.seriesLine?.trim() || '',
    author: options.author,
    subtitle: options.subtitle,
    imprint: options.imprint,
    copyrightYear: options.copyrightYear,
    copyrightHolder: options.copyrightHolder,
    rightsLine: options.rightsLine,
    disclaimer: options.disclaimer,
    paperbackIsbn: options.paperbackIsbn,
    hardcoverIsbn: options.hardcoverIsbn,
    ebookIsbn: options.ebookIsbn,
    edition: options.edition,
    dedication: options.dedication,
    epigraph: options.epigraph,
    epigraphAttribution: options.epigraphAttribution,
    alsoBy: options.alsoBy,
    aboutAuthor: options.aboutAuthor,
    contents: [],
  };
}

interface SourceModel {
  item: PrintTrim;
  insideIn: number;
  bodyPt: number;
  language: string;
  title: string;
  series: string;
  author: string;
  subtitle: string;
  imprint: string;
  copyright: string[];
  dedication: string[];
  epigraph: string[];
  epigraphAttribution: string;
  alsoBy: string[];
  about: string[];
  blocks: ManuscriptBlock[];
}

interface TocRow {
  level: 1 | 2;
  title: string;
  label: string;
}

function renderSource(model: SourceModel): string {
  const toc = tocRows(model.blocks);
  const lines: string[] = [];
  const push = (line = '') => lines.push(line);
  push(`#set document(title: ${typstStr(model.title)}, author: ${typstStr(model.author)})`);
  push(`#set text(font: "Crimson Text", size: ${pt(model.bodyPt)}, fill: rgb("#000000"), lang: ${typstStr(model.language)}, hyphenate: true)`);
  push('#set smartquote(enabled: false)');
  push('#set par(justify: false, first-line-indent: 0pt, leading: 0.65em)');
  push('#set heading(numbering: none, outlined: false, bookmarked: false)');
  push(`#show heading.where(level: 1): it => {`);
  push(`  set text(size: ${pt(model.bodyPt + 6)}, weight: "bold")`);
  push('  set par(justify: false, first-line-indent: 0pt)');
  push('  block(above: 1.6em, below: 0.8em, width: 100%, it.body)');
  push('}');
  push(`#show heading.where(level: 2): it => {`);
  push(`  set text(size: ${pt(model.bodyPt + 2)}, weight: "bold")`);
  push('  set par(justify: false, first-line-indent: 0pt)');
  push('  block(above: 1em, below: 0.4em, width: 100%, it.body)');
  push('}');
  push(`#let book-title = ${typstStr(model.title)}`);
  push(pageRule(model, 'front'));
  push('');

  if (model.item.halfTitle) {
    push('// leaf half-title');
    push(centeredLeaf([...(model.series ? [model.series] : []), model.title || 'Untitled'], [9, 20]));
    const shortAlso = model.alsoBy.length > 0 && model.alsoBy.length <= SHORT_ALSO_BY;
    if (shortAlso) {
      push('#pagebreak(weak: true)');
      push('// leaf also-by-front');
      push(topLeaf(`Also by ${model.author}`, model.alsoBy));
    }
  }

  if (model.item.halfTitle) push('#pagebreak(to: "odd", weak: true)');
  push('// leaf title');
  push(titleLeaf(model));
  push('#pagebreak(weak: true)');
  push('// leaf copyright');
  push(topLeaf('', model.copyright));

  if (model.dedication.length) {
    push('#pagebreak(to: "odd", weak: true)');
    push('// leaf dedication');
    push(centeredLeaf(model.dedication, model.dedication.map(() => 12)));
  }

  push('#pagebreak(to: "odd", weak: true)');
  push('// leaf contents');
  push(contentsLeaf(toc));

  if (model.epigraph.length) {
    push('#pagebreak(weak: true)');
    push('// leaf epigraph');
    const epi = model.epigraphAttribution ? [...model.epigraph, model.epigraphAttribution] : model.epigraph;
    push(centeredLeaf(epi, epi.map(() => 12)));
  }

  push('#pagebreak(to: "odd", weak: true)');
  push(pageRule(model, 'body'));
  push('#counter(page).update(1)');
  push(bodySource(model.blocks, toc));

  const alsoInFront = model.item.halfTitle && model.alsoBy.length > 0 && model.alsoBy.length <= SHORT_ALSO_BY;
  if (!alsoInFront && model.alsoBy.length) {
    push(rectoLeaf(model, `Also by ${model.author}`, model.alsoBy, 'also-by-back'));
  }
  if (model.about.length) {
    push(rectoLeaf(model, 'About the author', model.about, 'about'));
  }
  push('');
  return lines.join('\n');
}

function pageRule(model: SourceModel, kind: 'front' | 'body'): string {
  const geometry = [
    `width: ${inches(model.item.widthIn)}`,
    `height: ${inches(model.item.heightIn)}`,
    `margin: (inside: ${inches(model.insideIn)}, outside: ${inches(OUTSIDE_IN)}, top: ${inches(TOP_IN)}, bottom: ${inches(BOTTOM_IN)})`,
    'binding: left',
    'header-ascent: 0.18in',
    'footer-descent: 0.12in',
  ];
  if (kind === 'front') {
    return `#set page(${geometry.join(', ')}, numbering: none, header: none, footer: none)`;
  }
  return `#set page(
  ${geometry.join(',\n  ')},
  numbering: "1",
  header: context {
    let pg = here().page()
    if query(heading.where(level: 1)).any(it => it.location().page() == pg) { return }
    let prior = query(heading.where(level: 1).before(here()))
    if prior.len() == 0 { return }
    set text(size: 9pt, hyphenate: false)
    set par(justify: false, first-line-indent: 0pt)
    if calc.even(pg) { align(left, text(book-title)) } else { align(right, prior.last().body) }
  },
  footer: context {
    set text(size: 9pt, hyphenate: false)
    align(center, counter(page).display("1"))
  },
)`;
}

function bodySource(blocks: ManuscriptBlock[], toc: TocRow[]): string {
  const out: string[] = ['// leaf body'];
  let chapterSeen = false;
  let listNumber = 0;
  let flush = true;
  let tocIndex = 0;
  for (const block of blocks) {
    if (block.type === 'chapter' || block.type === 'section' || block.type === 'scene' || block.type === 'divider' || block.type === 'pageBreak' || block.type === 'blockquote') {
      listNumber = 0;
    }
    if (block.type === 'chapter') {
      const row = toc[tocIndex];
      tocIndex += 1;
      if (chapterSeen) out.push('#pagebreak(weak: true)');
      chapterSeen = true;
      flush = true;
      out.push(`#heading(level: 1)[${inlineText(row?.title || 'Chapter', [])}] <${row?.label ?? 'ch-0'}>`);
      continue;
    }
    if (block.type === 'section') {
      const row = toc[tocIndex];
      tocIndex += 1;
      flush = true;
      out.push(`#heading(level: 2)[${inlineText(row?.title || 'Section', [])}] <${row?.label ?? 'sec-0'}>`);
      continue;
    }
    if (block.type === 'scene') {
      flush = true;
      const title = block.title.trim();
      out.push(centerLine(title || '* * *'));
      continue;
    }
    if (block.type === 'divider') {
      flush = true;
      out.push(centerLine(dividerDisplayText(block.dividerStyle, block.title)));
      continue;
    }
    if (block.type === 'pageBreak') {
      flush = true;
      out.push('#pagebreak(weak: true)');
      continue;
    }
    if (block.type === 'blockquote' && block.text.trim()) {
      flush = true;
      out.push(`#par(justify: true, first-line-indent: 0pt)[#pad(left: 1.2em, right: 0.4em)[${inlineText(block.text.trim(), block.marks)}]]`);
      continue;
    }
    if (block.type === 'paragraph' && block.text.trim()) {
      const list = block.listStyle ?? null;
      if (list === 'number') listNumber += 1;
      else listNumber = 0;
      const indent = Math.max(0, block.indentLevel ?? 0);
      if (list) {
        const marker = list === 'number' ? `${listNumber}.` : '•';
        const pad = 1 + indent * 1.1;
        out.push(`#par(justify: true, first-line-indent: 0pt)[#pad(left: ${pad}em)[#text(${typstStr(marker)}) #h(0.45em) ${inlineText(block.text.trim(), block.marks)}]]`);
      } else {
        const first = flush ? '0pt' : '1em';
        out.push(`#par(justify: true, first-line-indent: ${first})[${inlineText(block.text.trim(), block.marks)}]`);
      }
      flush = false;
    }
  }
  return out.join('\n');
}

function tocRows(blocks: ManuscriptBlock[]): TocRow[] {
  const rows: TocRow[] = [];
  let chapterNo = 0;
  let chapters = 0;
  let sections = 0;
  for (const block of blocks) {
    if (block.type === 'chapter') {
      chapterNo += 1;
      rows.push({
        level: 1,
        title: block.title.trim() || `Chapter ${chapterNo}`,
        label: `ch-${chapters}`,
      });
      chapters += 1;
    } else if (block.type === 'section') {
      rows.push({
        level: 2,
        title: block.title.trim() || 'Section',
        label: `sec-${sections}`,
      });
      sections += 1;
    }
  }
  return rows;
}

function contentsLeaf(rows: TocRow[]): string {
  const entries = rows
    .map((row) => `(level: ${row.level}, title: ${typstStr(row.title)}, id: <${row.label}>)`)
    .join(', ');
  return `#align(center)[#text(size: 16pt, weight: "bold")[Contents]]
#v(1em)
#context {
  let rows = (${entries})
  for row in rows {
    let found = query(row.id)
    let folio = if found.len() == 0 { "" } else { str(counter(page).at(found.first().location()).first()) }
    let gap = if row.level == 2 { 1.15em } else { 0pt }
    pad(left: gap)[#text(row.title) #h(1fr) #text(folio)]
  }
}`;
}

function titleLeaf(model: SourceModel): string {
  const parts = [
    ...(model.series ? [`#text(size: 9pt)[${inlineText(model.series, [])}]`, '#v(0.8em)'] : []),
    `#text(size: 22pt)[${inlineText(model.title || 'Untitled', [])}]`,
    ...(model.subtitle ? ['#v(0.45em)', `#text(size: 13pt)[${inlineText(model.subtitle, [])}]`] : []),
    '#v(1.1em)',
    `#text(size: 13pt)[${inlineText(model.author, [])}]`,
  ];
  const imprint = model.imprint
    ? `#place(bottom + center, dy: -0.15in)[#text(size: 10pt)[${inlineText(model.imprint, [])}]]`
    : '';
  return `#align(center + horizon)[\n  ${parts.join('\n  ')}\n]\n${imprint}`;
}

function centeredLeaf(lines: string[], sizes: number[]): string {
  const body = lines
    .map((line, index) => `#text(size: ${pt(sizes[index] ?? 12)})[${inlineText(line, [])}]`)
    .join('\n  #v(0.55em)\n  ');
  return `#align(center + horizon)[\n  ${body}\n]`;
}

function topLeaf(heading: string, lines: string[]): string {
  const head = heading ? `#text(size: 14pt, weight: "bold")[${inlineText(heading, [])}]\n#v(0.8em)\n` : '';
  const body = lines.map((line) => `#par(justify: false, first-line-indent: 0pt)[${inlineText(line, [])}]`).join('\n');
  return `#align(left + top)[\n${head}${body}\n]`;
}

function centerLine(text: string): string {
  return `#par(justify: false, first-line-indent: 0pt)[#align(center)[${inlineText(text, [])}]]`;
}

function rectoLeaf(model: SourceModel, heading: string, lines: string[], name: string): string {
  return [
    '#pagebreak(weak: true)',
    pageRule(model, 'front'),
    '#pagebreak(to: "odd", weak: true)',
    pageRule(model, 'body'),
    `// leaf ${name}`,
    topLeaf(heading, lines),
  ].join('\n');
}

function inlineText(text: string, marks: InlineMark[]): string {
  const spans = styledSpans(text, marks);
  if (!spans.length) return `#text(${typstStr(text)})`;
  return spans
    .map((span) => {
      let piece = `#text(${typstStr(span.text)})`;
      if (span.italic) piece = `#emph[${piece}]`;
      if (span.bold) piece = `#strong[${piece}]`;
      if (span.underline) piece = `#underline[${piece}]`;
      if (span.strike) piece = `#strike[${piece}]`;
      return piece;
    })
    .join('');
}

export function typstStr(value: string): string {
  let out = '"';
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (ch === '\\' || ch === '"') out += `\\${ch}`;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') continue;
    else if (ch === '\t') out += '\\t';
    else if (code < 32) out += `\\u{${code.toString(16)}}`;
    else out += ch;
  }
  return `${out}"`;
}

function typstLang(tag: string): string {
  const primary = tag.toLowerCase().split('-')[0] ?? '';
  return /^[a-z]{2,3}$/.test(primary) ? primary : 'en';
}

function proseLines(raw: string): string[] {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function inches(n: number): string {
  return `${formatInches(n)}in`;
}

function pt(n: number): string {
  return `${formatInches(n)}pt`;
}
