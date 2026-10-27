/**
 * Reflowable EPUB 3 built with JSZip. No generator library.
 * The mimetype entry is stored uncompressed, same as the ODT writer.
 * Print-on-demand is not this file.
 */

import JSZip from 'jszip';
import type { ManuscriptDocument } from './document.ts';
import { displayTitle } from './document.ts';
import { copyrightNoticeLines } from './publicationPages.ts';
import {
  EPUB_BODY_SIZE_EM,
  EPUB_PARAGRAPH_GAP,
  EPUB_PARAGRAPH_INDENT,
  canonicalBcp47,
  isEpubBodySize,
  isEpubParagraphStyle,
  isEpubTextAlign,
  isEpubUuid,
  normalizeIsbn,
  type EpubBodySize,
  type EpubParagraphStyle,
  type EpubTextAlign,
} from './epubSettings.ts';
import { dividerDisplayText } from './manuscript.ts';
import { styledSpans } from './richText.ts';
import type { InlineMark, ManuscriptBlock } from './types.ts';

export class EpubExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EpubExportError';
  }
}

export interface EpubImageSource {
  bytes: Uint8Array;
  mediaType: 'image/jpeg' | 'image/png';
}

export interface EpubBuildOptions {
  author: string;
  /** BCP 47 tag. Default in the form is en. */
  language: string;
  /** Ebook ISBN. Empty uses the stored UUID. Print ISBNs are not part of this file. */
  isbn: string;
  /** Stable id already stored on the book. Not minted here. */
  epubUuid: string;
  cover: EpubImageSource | null;
  chapterPageBreaks: boolean;
  paragraphStyle: EpubParagraphStyle;
  textAlign: EpubTextAlign;
  bodySize: EpubBodySize;
  /** Series line already formatted, such as "Book 2 of Harbor". Empty omits it. */
  seriesLine: string;
  subtitle: string;
  imprint: string;
  copyrightYear: number | null;
  copyrightHolder: string;
  rightsLine: string;
  disclaimer: string;
  edition: string;
  dedication: string;
  epigraph: string;
  epigraphAttribution: string;
  alsoBy: string[];
  aboutAuthor: string;
  /** Title, copyright, and the other book pages. Off leaves the package as cover, contents, and chapters. */
  includePublicationPages: boolean;
}

/** Ingram's ebook file guide caps each image at 3.2 million pixels. */
export const MAX_EPUB_IMAGE_PIXELS = 3_200_000;
const MAX_COVER_BYTES = 50 * 1024 * 1024;
const SCENE_BREAK = '* * *';

interface ResolvedEpub {
  author: string;
  language: string;
  identifier: string;
  isbnKind: '13' | '10' | null;
  chapterPageBreaks: boolean;
  paragraphStyle: EpubParagraphStyle;
  textAlign: EpubTextAlign;
  bodySize: EpubBodySize;
  seriesLine: string;
  subtitle: string;
  imprint: string;
  copyrightHolder: string;
  rightsLine: string;
  disclaimer: string;
  edition: string;
  dedication: string;
  epigraph: string;
  epigraphAttribution: string;
  alsoBy: string[];
  aboutAuthor: string;
  includePublicationPages: boolean;
  copyrightYear: number | null;
}

interface PackedImage {
  id: string;
  href: string;
  mediaType: 'image/jpeg' | 'image/png';
  bytes: Uint8Array;
}

interface TocChild {
  title: string;
  href: string;
}

interface TocEntry {
  title: string;
  href: string;
  children: TocChild[];
}

interface Slice {
  kind: 'front' | 'chapter';
  title: string;
  blocks: ManuscriptBlock[];
}

export function epubStylesheet(options: Pick<EpubBuildOptions, 'paragraphStyle' | 'textAlign' | 'bodySize'>): string {
  const size = EPUB_BODY_SIZE_EM[options.bodySize];
  const align = options.textAlign;
  const paragraphs =
    options.paragraphStyle === 'indent'
      ? `p {
  text-indent: ${EPUB_PARAGRAPH_INDENT};
  margin: 0;
  text-align: ${align};
}
h1 + p,
h2 + p,
p.scene + p,
p.divider + p,
hr.scene-rule + p,
hr.page-break + p {
  text-indent: 0;
}`
      : `p {
  text-indent: 0;
  margin: 0 0 ${EPUB_PARAGRAPH_GAP} 0;
  text-align: ${align};
}`;
  return `body {
  margin: 0;
  padding: 0;
  font-size: ${size};
}
${paragraphs}
h1, h2 {
  text-align: left;
  text-indent: 0;
  font-weight: bold;
  margin: 1em 0 0.5em 0;
}
h1 { font-size: 1.5em; }
h2 { font-size: 1.2em; }
h1.chapter-break {
  break-before: page;
  page-break-before: always;
}
p.scene, p.divider, p.caption {
  text-align: center;
  text-indent: 0;
  margin: 1em 0;
}
hr.scene-rule {
  border: 0;
  border-top: 0.06em solid;
  width: 35%;
  height: 0;
  margin: 1em auto;
}
hr.page-break {
  break-before: page;
  page-break-before: always;
  border: 0;
  height: 0;
  margin: 0;
  padding: 0;
}
blockquote {
  margin: 0.6em 0 0.6em 8%;
  padding: 0;
}
blockquote p {
  text-indent: 0;
  margin: 0;
}
ul, ol {
  margin: 0.4em 0 0.4em 5%;
  padding: 0 0 0 4%;
}
li {
  text-indent: 0;
  text-align: ${align};
  margin: 0;
}
figure {
  margin: 0.6em 0;
  padding: 0;
  text-align: center;
}
figcaption {
  text-indent: 0;
  text-align: center;
  margin: 0.4em 0 0;
}
img {
  max-width: 100%;
  height: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.6em 0;
}
th, td {
  border: 0.06em solid;
  padding: 0.2em 0.4em;
  text-align: left;
  vertical-align: top;
}
nav ol {
  list-style: none;
  margin: 0.3em 0;
  padding: 0 0 0 5%;
}
nav li {
  text-align: left;
  text-indent: 0;
  margin: 0.25em 0;
}
body.cover-page {
  text-align: center;
}
h1.book-title {
  text-align: center;
  text-indent: 0;
  margin: 1.2em 0 0.4em;
}
p.book-line, p.book-foot, p.dedication, p.attribution {
  text-indent: 0;
  text-align: center;
  margin: 0.4em 0;
}
p.book-foot { margin-top: 2em; }
p.copyright-line, p.about {
  text-indent: 0;
  text-align: left;
  margin: 0.4em 0;
}
p.attribution { margin-top: 0.8em; }
`;
}

export function readEpubImage(bytes: Uint8Array, label: 'cover' | 'picture'): EpubImageSource {
  if (label === 'cover' && bytes.byteLength > MAX_COVER_BYTES) {
    throw new EpubExportError('This cover is over 50 MB. KDP will not take a cover that large.');
  }
  const mediaType = sniffImage(bytes);
  if (!mediaType) {
    const which = label === 'cover' ? 'The cover' : 'A picture in the manuscript';
    throw new EpubExportError(`${which} must be a JPEG or PNG. SVG, GIF, and WebP are not used in this EPUB.`);
  }
  const info = mediaType === 'image/png' ? pngInfo(bytes) : jpegInfo(bytes);
  if (info?.cmyk) {
    throw new EpubExportError('This picture is CMYK. Ebook images need RGB.');
  }
  return { bytes, mediaType };
}

export function epubImageInfo(
  bytes: Uint8Array,
): { mediaType: 'image/jpeg' | 'image/png'; width: number; height: number; cmyk: boolean } | null {
  const mediaType = sniffImage(bytes);
  if (!mediaType) return null;
  const info = mediaType === 'image/png' ? pngInfo(bytes) : jpegInfo(bytes);
  if (!info) return { mediaType, width: 0, height: 0, cmyk: false };
  return { mediaType, width: info.width, height: info.height, cmyk: info.cmyk };
}

export async function buildEpubBlob(
  doc: ManuscriptDocument,
  options: EpubBuildOptions,
  exportedAt: string = new Date().toISOString(),
): Promise<Blob> {
  const resolved = resolveEpubOptions(options);
  const title = displayTitle(doc);
  const cover = options.cover ? await fitImage(readEpubImage(options.cover.bytes, 'cover'), 'The cover') : null;
  const packed: PackedImage[] = [];
  let imageN = 0;
  const slices = splitSlices(doc);
  const hasChapter = slices.some((slice) => slice.kind === 'chapter');
  const files: { id: string; href: string; xhtml: string; toc: TocEntry | null; frontLinks: TocChild[] }[] = [];
  let chapterIndex = 0;

  for (const slice of slices) {
    chapterIndex += slice.kind === 'chapter' ? 1 : 0;
    const filename = slice.kind === 'chapter' ? `ch-${String(chapterIndex).padStart(4, '0')}.xhtml` : 'front.xhtml';
    const id = slice.kind === 'chapter' ? `ch-${String(chapterIndex).padStart(4, '0')}` : 'front';
    const breakBefore = resolved.chapterPageBreaks && slice.kind === 'chapter' && chapterIndex > 1;
    const bodyType =
      (slice.kind === 'chapter' && chapterIndex === 1) || (slice.kind === 'front' && !hasChapter) ? 'bodymatter' : '';
    const rendered = await renderBlocks(slice.blocks, async (source) => {
      const fitted = await fitImage(source, 'A picture in the manuscript');
      imageN += 1;
      const ext = fitted.mediaType === 'image/png' ? 'png' : 'jpg';
      const href = `images/img-${String(imageN).padStart(3, '0')}.${ext}`;
      packed.push({ id: `img-${imageN}`, href, mediaType: fitted.mediaType, bytes: fitted.bytes });
      return href;
    });
    if (slice.kind === 'front' && !rendered.html.trim() && rendered.sections.length === 0) continue;
    const heading = slice.kind === 'chapter'
      ? `<h1 id="chap"${breakBefore ? ' class="chapter-break"' : ''}>${xmlText(slice.title)}</h1>`
      : '';
    const inner = slice.kind === 'chapter'
      ? `<section epub:type="chapter">${heading}${rendered.html}</section>`
      : rendered.html;
    const xhtml = xhtmlDocument(
      resolved.language,
      slice.kind === 'chapter' ? slice.title : title,
      inner,
      bodyType,
    );
    const toc = slice.kind === 'chapter'
      ? {
          title: slice.title,
          href: filename,
          children: rendered.sections.map((section) => ({ title: section.title, href: `${filename}#${section.id}` })),
        }
      : null;
    const frontLinks = slice.kind === 'front'
      ? rendered.sections.map((section) => ({ title: section.title, href: `${filename}#${section.id}` }))
      : [];
    files.push({ id, href: filename, xhtml, toc, frontLinks });
  }

  if (!files.length) {
    const filename = 'ch-0001.xhtml';
    files.push({
      id: 'ch-0001',
      href: filename,
      xhtml: xhtmlDocument(
        resolved.language,
        title,
        `<section epub:type="chapter"><h1 id="chap">${xmlText(title)}</h1></section>`,
        'bodymatter',
      ),
      toc: { title, href: filename, children: [] },
      frontLinks: [],
    });
  }

  const bookPages = resolved.includePublicationPages ? ebookPageDocuments(resolved, title) : { before: [], after: [] };
  const tocEntries: TocEntry[] = [];
  for (const file of files) {
    for (const link of file.frontLinks) tocEntries.push({ title: link.title, href: link.href, children: [] });
    if (file.toc) tocEntries.push(file.toc);
  }
  for (const page of bookPages.after) {
    if (page.toc) tocEntries.push(page.toc);
  }
  if (!tocEntries.length) {
    const first = files[0]!;
    tocEntries.push({ title, href: first.href, children: [] });
  }

  const coverHref = cover ? `images/cover.${cover.mediaType === 'image/png' ? 'png' : 'jpg'}` : null;
  const landmarks: { type: string; href: string; label: string }[] = [];
  if (coverHref) landmarks.push({ type: 'cover', href: 'cover.xhtml', label: 'Cover' });
  landmarks.push({ type: 'toc', href: 'nav.xhtml#toc', label: 'Table of Contents' });
  const bodyStart = files.find((file) => file.id.startsWith('ch-')) ?? files[0]!;
  landmarks.push({ type: 'bodymatter', href: bodyStart.href, label: 'Begin reading' });

  const nav = navDocument(resolved.language, tocEntries, landmarks);
  const ncx = ncxDocument(resolved.language, resolved.identifier, title, tocEntries);
  const spineIds = [
    ...(coverHref ? ['cover'] : []),
    ...bookPages.before.map((page) => page.id),
    'nav',
    ...files.map((file) => file.id),
    ...bookPages.after.map((page) => page.id),
  ];
  const documents = [...bookPages.before, ...files, ...bookPages.after];
  const opf = opfDocument({
    resolved,
    title,
    modified: epubModified(exportedAt),
    coverHref,
    coverMedia: cover?.mediaType ?? null,
    documents,
    spineIds,
    images: packed,
  });
  const css = epubStylesheet(resolved);
  const coverPage = coverHref
    ? xhtmlDocument(
        resolved.language,
        'Cover',
        `<figure><img class="cover" src="${coverHref}" alt="${xmlAttr(coverAlt(title))}"/></figure>`,
        'cover',
        'cover-page',
      )
    : '';

  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', containerXml(), { compression: 'DEFLATE' });
  zip.file('OEBPS/content.opf', opf, { compression: 'DEFLATE' });
  zip.file('OEBPS/nav.xhtml', nav, { compression: 'DEFLATE' });
  zip.file('OEBPS/toc.ncx', ncx, { compression: 'DEFLATE' });
  zip.file('OEBPS/style.css', css, { compression: 'DEFLATE' });
  if (cover && coverHref) {
    zip.file(`OEBPS/${coverHref}`, cover.bytes, { compression: 'DEFLATE' });
    zip.file('OEBPS/cover.xhtml', coverPage, { compression: 'DEFLATE' });
  }
  for (const file of documents) zip.file(`OEBPS/${file.href}`, file.xhtml, { compression: 'DEFLATE' });
  for (const image of packed) zip.file(`OEBPS/${image.href}`, image.bytes, { compression: 'DEFLATE' });

  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
}

function resolveEpubOptions(options: EpubBuildOptions): ResolvedEpub {
  const author = options.author.replace(/\s+/g, ' ').trim();
  if (!author) throw new EpubExportError('Enter the author name. The EPUB does not use a placeholder.');
  const language = canonicalBcp47(options.language);
  if (!language) throw new EpubExportError('Language must be a BCP 47 tag such as en or en-US.');
  const uuid = options.epubUuid.trim().toLowerCase();
  if (!isEpubUuid(uuid)) {
    throw new EpubExportError('This book does not have a saved id yet. Choose EPUB again so one can be stored.');
  }
  const isbnRaw = options.isbn.trim();
  let identifier = `urn:uuid:${uuid}`;
  let isbnKind: '13' | '10' | null = null;
  if (isbnRaw) {
    const isbn = normalizeIsbn(isbnRaw);
    if (!isbn) {
      throw new EpubExportError('That ISBN is not valid. Check the digits, or leave the field blank to use the saved id.');
    }
    identifier = isbn;
    isbnKind = isbn.length === 13 ? '13' : '10';
  }
  if (!isEpubParagraphStyle(options.paragraphStyle) || !isEpubTextAlign(options.textAlign) || !isEpubBodySize(options.bodySize)) {
    throw new EpubExportError('Choose a paragraph style, alignment, and body size the ebook stores accept.');
  }
  const includePublicationPages = options.includePublicationPages === true;
  let copyrightYear: number | null = null;
  if (includePublicationPages) {
    if (options.copyrightYear == null || !Number.isInteger(options.copyrightYear) || options.copyrightYear < 1000 || options.copyrightYear > 9999) {
      throw new EpubExportError(
        'Enter a four-digit copyright year before including publication pages. The year is not filled in on export.',
      );
    }
    copyrightYear = options.copyrightYear;
  }
  const alsoBy = (options.alsoBy ?? []).map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return {
    author,
    language,
    identifier,
    isbnKind,
    chapterPageBreaks: options.chapterPageBreaks,
    paragraphStyle: options.paragraphStyle,
    textAlign: options.textAlign,
    bodySize: options.bodySize,
    seriesLine: options.seriesLine.replace(/\s+/g, ' ').trim(),
    subtitle: options.subtitle.replace(/\s+/g, ' ').trim(),
    imprint: options.imprint.replace(/\s+/g, ' ').trim(),
    copyrightYear,
    copyrightHolder: options.copyrightHolder.replace(/\s+/g, ' ').trim(),
    rightsLine: options.rightsLine.replace(/\s+/g, ' ').trim(),
    disclaimer: options.disclaimer.replace(/\r\n/g, '\n').trim(),
    edition: options.edition.replace(/\s+/g, ' ').trim(),
    dedication: options.dedication.replace(/\r\n/g, '\n').trim(),
    epigraph: options.epigraph.replace(/\r\n/g, '\n').trim(),
    epigraphAttribution: options.epigraphAttribution.replace(/\s+/g, ' ').trim(),
    alsoBy,
    aboutAuthor: options.aboutAuthor.replace(/\r\n/g, '\n').trim(),
    includePublicationPages,
  };
}

interface EbookPage {
  id: string;
  href: string;
  xhtml: string;
  toc: TocEntry | null;
}

function ebookPageDocuments(resolved: ResolvedEpub, title: string): { before: EbookPage[]; after: EbookPage[] } {
  const year = resolved.copyrightYear;
  if (year == null) return { before: [], after: [] };
  const notice = copyrightNoticeLines({
    year,
    author: resolved.author,
    copyrightHolder: resolved.copyrightHolder,
    rightsLine: resolved.rightsLine,
    disclaimer: resolved.disclaimer,
    imprint: resolved.imprint,
    edition: resolved.edition,
    paperbackIsbn: '',
    hardcoverIsbn: '',
    ebookIsbn: resolved.isbnKind ? resolved.identifier : '',
    printIsbns: false,
  });
  const before: EbookPage[] = [
    { id: 'title', href: 'title.xhtml', xhtml: titlePageDocument(resolved, title), toc: null },
    {
      id: 'copyright',
      href: 'copyright.xhtml',
      xhtml: xhtmlDocument(
        resolved.language,
        'Copyright',
        notice.map((line) => `<p class="copyright-line">${xmlText(line)}</p>`).join('\n'),
        'copyright-page',
      ),
      toc: null,
    },
  ];
  if (resolved.dedication) {
    before.push({
      id: 'dedication',
      href: 'dedication.xhtml',
      xhtml: xhtmlDocument(resolved.language, 'Dedication', proseParagraphs(resolved.dedication, 'dedication'), 'dedication'),
      toc: null,
    });
  }
  if (resolved.epigraph) {
    const quote = proseParagraphs(resolved.epigraph, 'epigraph');
    const attribution = resolved.epigraphAttribution
      ? `\n<p class="attribution">${xmlText(resolved.epigraphAttribution)}</p>`
      : '';
    before.push({
      id: 'epigraph',
      href: 'epigraph.xhtml',
      xhtml: xhtmlDocument(
        resolved.language,
        'Epigraph',
        `<blockquote>\n${quote}\n</blockquote>${attribution}`,
        'epigraph',
      ),
      toc: null,
    });
  }
  const after: EbookPage[] = [];
  if (resolved.alsoBy.length) {
    const label = `Also by ${resolved.author}`;
    const items = resolved.alsoBy.map((item) => `<li>${xmlText(item)}</li>`).join('');
    after.push({
      id: 'also-by',
      href: 'also-by.xhtml',
      xhtml: xhtmlDocument(
        resolved.language,
        label,
        `<h1>${xmlText(label)}</h1>\n<ul>${items}</ul>`,
        'backmatter',
      ),
      toc: { title: label, href: 'also-by.xhtml', children: [] },
    });
  }
  if (resolved.aboutAuthor) {
    after.push({
      id: 'about',
      href: 'about.xhtml',
      xhtml: xhtmlDocument(
        resolved.language,
        'About the author',
        `<h1>About the author</h1>\n${proseParagraphs(resolved.aboutAuthor, 'about')}`,
        'backmatter',
      ),
      toc: { title: 'About the author', href: 'about.xhtml', children: [] },
    });
  }
  return { before, after };
}

function titlePageDocument(resolved: ResolvedEpub, title: string): string {
  const parts: string[] = [];
  if (resolved.seriesLine) parts.push(`<p class="book-line">${xmlText(resolved.seriesLine)}</p>`);
  parts.push(`<h1 class="book-title">${xmlText(title)}</h1>`);
  if (resolved.subtitle) parts.push(`<p class="book-line">${xmlText(resolved.subtitle)}</p>`);
  parts.push(`<p class="book-line">${xmlText(resolved.author)}</p>`);
  if (resolved.imprint) parts.push(`<p class="book-foot">${xmlText(resolved.imprint)}</p>`);
  return xhtmlDocument(resolved.language, title, parts.join('\n'), 'titlepage');
}

function proseParagraphs(text: string, className: string): string {
  return text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => `<p class="${className}">${xmlText(chunk).replace(/\n/g, '<br />')}</p>`)
    .join('\n');
}

function splitSlices(doc: ManuscriptDocument): Slice[] {
  const slices: Slice[] = [];
  let current: Slice | null = null;
  let chapterNo = 0;
  for (const block of doc.blocks) {
    if (block.type === 'chapter') {
      chapterNo += 1;
      current = { kind: 'chapter', title: block.title.trim() || `Chapter ${chapterNo}`, blocks: [] };
      slices.push(current);
      continue;
    }
    if (!current) {
      current = { kind: 'front', title: '', blocks: [] };
      slices.push(current);
    }
    current.blocks.push(block);
  }
  return slices;
}

interface RenderedBlocks {
  html: string;
  sections: { id: string; title: string }[];
}

async function renderBlocks(
  blocks: ManuscriptBlock[],
  addImage: (source: EpubImageSource) => Promise<string>,
): Promise<RenderedBlocks> {
  const parts: string[] = [];
  const sections: { id: string; title: string }[] = [];
  let sectionN = 0;
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index]!;
    if (block.type === 'paragraph' && (block.listStyle === 'bullet' || block.listStyle === 'number')) {
      const kind = block.listStyle;
      const items: string[] = [];
      while (index < blocks.length && blocks[index]!.type === 'paragraph' && blocks[index]!.listStyle === kind) {
        const item = blocks[index]!;
        if (item.text.trim()) items.push(`<li>${inlineHtml(item.text, item.marks)}</li>`);
        index += 1;
      }
      if (items.length) parts.push(kind === 'bullet' ? `<ul>${items.join('')}</ul>` : `<ol>${items.join('')}</ol>`);
      continue;
    }
    if (block.type === 'section') {
      sectionN += 1;
      const id = `sec-${sectionN}`;
      const heading = block.title.trim() || 'Section';
      sections.push({ id, title: heading });
      parts.push(`<h2 id="${id}">${xmlText(heading)}</h2>`);
    } else if (block.type === 'scene') {
      parts.push(`<p class="scene">${xmlText(block.title.trim() || SCENE_BREAK)}</p>`);
    } else if (block.type === 'paragraph' && block.text.trim()) {
      parts.push(`<p>${inlineHtml(block.text, block.marks)}</p>`);
    } else if (block.type === 'blockquote' && block.text.trim()) {
      parts.push(`<blockquote><p>${inlineHtml(block.text, block.marks)}</p></blockquote>`);
    } else if (block.type === 'pageBreak') {
      parts.push('<hr class="page-break"/>');
    } else if (block.type === 'divider') {
      if ((block.dividerStyle ?? 'scene') === 'line' && !block.title.trim()) parts.push('<hr class="scene-rule"/>');
      else parts.push(`<p class="divider">${xmlText(dividerDisplayText(block.dividerStyle, block.title))}</p>`);
    } else if (block.type === 'table') {
      const table = tableHtml(block.tableRows ?? []);
      if (table) parts.push(table);
    } else if (block.type === 'image') {
      const figure = await imageHtml(block, addImage);
      if (figure) parts.push(figure);
    }
    index += 1;
  }
  return { html: parts.join('\n'), sections };
}

async function imageHtml(
  block: ManuscriptBlock,
  addImage: (source: EpubImageSource) => Promise<string>,
): Promise<string> {
  const caption = block.imageCaption?.trim() ?? '';
  const src = block.imageSrc?.trim() ?? '';
  if (!src) {
    const note = caption || block.imageAlt?.trim() || '';
    return note ? `<p class="caption">${xmlText(note)}</p>` : '';
  }
  if (!src.startsWith('data:')) {
    throw new EpubExportError('A picture in the manuscript is a link, not a saved file. Insert it again from disk, then export.');
  }
  const source = imageFromDataUrl(src);
  const href = await addImage(source);
  const alt = altText(block.imageAlt, caption);
  const captionHtml = caption ? `<figcaption>${xmlText(caption)}</figcaption>` : '';
  return `<figure><img src="${href}" alt="${xmlAttr(alt)}"/>${captionHtml}</figure>`;
}

function imageFromDataUrl(src: string): EpubImageSource {
  const match = /^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)$/i.exec(src.trim());
  if (!match) {
    throw new EpubExportError('A picture in the manuscript is a link, not a saved file. Insert it again from disk, then export.');
  }
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(match[1]!);
  } catch {
    throw new EpubExportError('A picture in the manuscript could not be read. Insert it again, then export.');
  }
  return readEpubImage(bytes, 'picture');
}

function tableHtml(rows: string[][]): string {
  if (!rows.length) return '';
  const width = Math.max(...rows.map((row) => row.length), 1);
  const cell = (text: string, tag: 'th' | 'td') => `<${tag}>${xmlText(text)}</${tag}>`;
  const head = rows.length > 1 ? rows[0]! : null;
  const body = rows.length > 1 ? rows.slice(1) : rows;
  const headHtml = head
    ? `<thead><tr>${Array.from({ length: width }, (_, i) => cell(head[i] ?? '', 'th')).join('')}</tr></thead>`
    : '';
  const bodyHtml = `<tbody>${body
    .map((row) => `<tr>${Array.from({ length: width }, (_, i) => cell(row[i] ?? '', 'td')).join('')}</tr>`)
    .join('')}</tbody>`;
  return `<table>${headHtml}${bodyHtml}</table>`;
}

function inlineHtml(text: string, marks: InlineMark[]): string {
  return styledSpans(text, marks)
    .map((span) => {
      let html = xmlText(span.text).replace(/\n/g, '<br />');
      if (span.strike) html = `<s>${html}</s>`;
      if (span.underline) html = `<u>${html}</u>`;
      if (span.italic) html = `<em>${html}</em>`;
      if (span.bold) html = `<strong>${html}</strong>`;
      return html;
    })
    .join('');
}

function altText(alt: string | undefined, caption: string): string {
  const raw = (alt?.trim() || caption).replace(/\s+/g, ' ').trim();
  return raw.slice(0, 140);
}

function coverAlt(title: string): string {
  const text = `Cover: ${title}`.replace(/\s+/g, ' ').trim();
  return text.slice(0, 140);
}

function xhtmlDocument(lang: string, title: string, body: string, bodyEpubType = '', bodyClass = ''): string {
  const classAttr = bodyClass ? ` class="${bodyClass}"` : '';
  const typeAttr = bodyEpubType ? ` epub:type="${bodyEpubType}"` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">
<head>
<title>${xmlText(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body${classAttr}${typeAttr}>
${body}
</body>
</html>
`;
}

function navDocument(
  lang: string,
  entries: TocEntry[],
  landmarks: { type: string; href: string; label: string }[],
): string {
  const items = entries
    .map((entry) => {
      const children = entry.children.length
        ? `<ol>${entry.children.map((child) => `<li><a href="${xmlAttr(child.href)}">${xmlText(child.title)}</a></li>`).join('')}</ol>`
        : '';
      return `<li><a href="${xmlAttr(entry.href)}">${xmlText(entry.title)}</a>${children}</li>`;
    })
    .join('');
  const marks = landmarks
    .map((mark) => `<li><a epub:type="${mark.type}" href="${xmlAttr(mark.href)}">${xmlText(mark.label)}</a></li>`)
    .join('');
  return xhtmlDocument(
    lang,
    'Contents',
    `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${items}</ol></nav>
<nav epub:type="landmarks" hidden="hidden"><h2>Landmarks</h2><ol>${marks}</ol></nav>`,
  );
}

function ncxDocument(lang: string, uid: string, title: string, entries: TocEntry[]): string {
  let play = 0;
  const point = (label: string, href: string, children: TocChild[]): string => {
    play += 1;
    const order = play;
    const nested = children.map((child) => point(child.title, child.href, [])).join('');
    return `<navPoint id="np-${order}" playOrder="${order}"><navLabel><text>${xmlText(label)}</text></navLabel><content src="${xmlAttr(href)}"/>${nested}</navPoint>`;
  };
  const map = entries.map((entry) => point(entry.title, entry.href, entry.children)).join('');
  const depth = entries.some((entry) => entry.children.length) ? 2 : 1;
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="${lang}">
<head>
<meta name="dtb:uid" content="${xmlAttr(uid)}"/>
<meta name="dtb:depth" content="${depth}"/>
<meta name="dtb:totalPageCount" content="0"/>
<meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>${xmlText(title)}</text></docTitle>
<navMap>${map}</navMap>
</ncx>
`;
}

function opfDocument(args: {
  resolved: ResolvedEpub;
  title: string;
  modified: string;
  coverHref: string | null;
  coverMedia: 'image/jpeg' | 'image/png' | null;
  documents: { id: string; href: string }[];
  spineIds: string[];
  images: PackedImage[];
}): string {
  const { resolved } = args;
  const isbnMeta = resolved.isbnKind
    ? `<meta refines="#book-id" property="identifier-type" scheme="onix:codelist5">${resolved.isbnKind === '13' ? '15' : '02'}</meta>`
    : '';
  const items = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
  ];
  if (args.coverHref && args.coverMedia) {
    items.push(
      `<item id="cover-image" href="${args.coverHref}" media-type="${args.coverMedia}" properties="cover-image"/>`,
      '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>',
    );
  }
  for (const file of args.documents) {
    if (file.id === 'cover' || file.id === 'nav') continue;
    items.push(`<item id="${file.id}" href="${file.href}" media-type="application/xhtml+xml"/>`);
  }
  for (const image of args.images) {
    items.push(`<item id="${image.id}" href="${image.href}" media-type="${image.mediaType}"/>`);
  }
  const spine = args.spineIds.map((id) => `<itemref idref="${id}"/>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${resolved.language}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">${xmlText(resolved.identifier)}</dc:identifier>
${isbnMeta}
<dc:title>${xmlText(args.title)}</dc:title>
<dc:language>${xmlText(resolved.language)}</dc:language>
<dc:creator id="creator">${xmlText(resolved.author)}</dc:creator>
<meta refines="#creator" property="role" scheme="marc:relators">aut</meta>
<meta property="dcterms:modified">${args.modified}</meta>
</metadata>
<manifest>
${items.join('\n')}
</manifest>
<spine toc="ncx">
${spine.join('\n')}
</spine>
</package>
`;
}

function containerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>
`;
}

function epubModified(iso: string): string {
  const date = new Date(iso);
  const stamp = Number.isNaN(date.getTime()) ? new Date() : date;
  return stamp.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function xmlText(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function xmlAttr(text: string): string {
  return xmlText(text).replace(/"/g, '&quot;');
}

function sniffImage(bytes: Uint8Array): 'image/jpeg' | 'image/png' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  return null;
}

function jpegInfo(bytes: Uint8Array): { width: number; height: number; cmyk: boolean } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1]!;
    if (marker === 0xd8) {
      i += 2;
      continue;
    }
    if (marker === 0xd9) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (length < 2 || i + 2 + length > bytes.length) return null;
    if (marker >= 0xc0 && marker <= 0xc2) {
      return {
        height: (bytes[i + 5]! << 8) | bytes[i + 6]!,
        width: (bytes[i + 7]! << 8) | bytes[i + 8]!,
        cmyk: bytes[i + 9] === 4,
      };
    }
    i += 2 + length;
  }
  return null;
}

function pngInfo(bytes: Uint8Array): { width: number; height: number; cmyk: boolean } | null {
  if (bytes.length < 26 || sniffImage(bytes) !== 'image/png') return null;
  const width = readU32(bytes, 16);
  const height = readU32(bytes, 20);
  if (!width || !height) return null;
  return { width, height, cmyk: false };
}

function readU32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
}

async function fitImage(source: EpubImageSource, label: string): Promise<EpubImageSource> {
  const info = source.mediaType === 'image/png' ? pngInfo(source.bytes) : jpegInfo(source.bytes);
  if (!info || info.width * info.height <= MAX_EPUB_IMAGE_PIXELS) return source;
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    throw new EpubExportError(
      `${label} is ${info.width} by ${info.height} pixels, over the 3.2 million pixel limit for ebook images. Shrink it and export again.`,
    );
  }
  const blob = new Blob([source.bytes.slice()], { type: source.mediaType });
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.sqrt(MAX_EPUB_IMAGE_PIXELS / (bitmap.width * bitmap.height));
    let width = Math.max(1, Math.floor(bitmap.width * scale));
    let height = Math.max(1, Math.floor(bitmap.height * scale));
    while (width * height > MAX_EPUB_IMAGE_PIXELS) {
      if (width >= height && width > 1) width -= 1;
      else if (height > 1) height -= 1;
      else break;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new EpubExportError(`${label} could not be resized for the EPUB.`);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const out = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new EpubExportError(`${label} could not be resized for the EPUB.`))),
        source.mediaType,
        0.85,
      );
    });
    return { bytes: new Uint8Array(await out.arrayBuffer()), mediaType: source.mediaType };
  } finally {
    bitmap.close();
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
