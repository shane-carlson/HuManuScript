/**
 * Local EPUB checks. These are the package, navigation, CSS, and store rules
 * this app can see without Java EPUBCheck or Kindle Previewer.
 * A warning does not block download. An error does.
 */

import JSZip from 'jszip';
import { normalizeIsbn } from './bookPages.ts';
import type { ManuscriptDocument } from './document.ts';
import { canonicalBcp47 } from './epubSettings.ts';
import {
  EpubExportError,
  buildEpubBlob,
  epubImageInfo,
  type EpubBuildOptions,
  type EpubImageSource,
} from './epubExport.ts';

export type EpubCheckFocus =
  | 'author'
  | 'subtitle'
  | 'imprint'
  | 'copyright-year'
  | 'copyright-holder'
  | 'rights'
  | 'disclaimer'
  | 'ebook-isbn'
  | 'paperback-isbn'
  | 'hardcover-isbn'
  | 'edition'
  | 'dedication'
  | 'epigraph'
  | 'epigraph-attribution'
  | 'also-by'
  | 'about'
  | 'language'
  | 'cover'
  | 'body-size'
  | 'paragraphs'
  | 'align'
  | 'chapter-breaks'
  | 'publication-pages'
  | 'outline';

export interface EpubFinding {
  severity: 'error' | 'warning';
  code: string;
  title: string;
  detail: string;
  fix: string;
  focus: EpubCheckFocus;
}

export interface EpubCheckInput {
  doc: ManuscriptDocument;
  options: EpubBuildOptions;
  paperbackIsbn: string;
  hardcoverIsbn: string;
}

const KDP_BYTES = 650 * 1024 * 1024;
const INGRAM_BYTES = 100 * 1024 * 1024;
const COVER_GUIDE_BYTES = 5 * 1024 * 1024;

export async function checkEpub(input: EpubCheckInput, exportedAt?: string): Promise<EpubFinding[]> {
  const findings: EpubFinding[] = [];
  findings.push(...fieldFindings(input));
  const blocksBuild = findings.some((item) => item.severity === 'error' && BLOCKS_BUILD.has(item.code));
  if (blocksBuild) return findings;
  try {
    const blob = await buildEpubBlob(input.doc, input.options, exportedAt);
    findings.push(...(await inspectEpubPackage(blob, input)));
  } catch (error) {
    const message = error instanceof EpubExportError ? error.message : 'The EPUB could not be built from this manuscript.';
    const focus: EpubCheckFocus = /cover/i.test(message) ? 'cover' : /picture|image/i.test(message) ? 'outline' : 'author';
    findings.push({
      severity: 'error',
      code: 'build-failed',
      title: 'The EPUB could not be built',
      detail: message,
      fix: 'Change the field named in the message, then check again.',
      focus,
    });
  }
  return findings;
}

const BLOCKS_BUILD = new Set([
  'author-missing',
  'language-invalid',
  'ebook-isbn-invalid',
  'uuid-missing',
  'year-missing',
  'cover-invalid',
]);

function fieldFindings(input: EpubCheckInput): EpubFinding[] {
  const findings: EpubFinding[] = [];
  const { options } = input;
  if (!options.author.trim()) {
    findings.push({
      severity: 'error',
      code: 'author-missing',
      title: 'The author name is missing',
      detail: 'Stores match this name to the product page. The EPUB is not built with a placeholder.',
      fix: 'Type the author name in Author.',
      focus: 'author',
    });
  }
  if (!canonicalBcp47(options.language)) {
    findings.push({
      severity: 'error',
      code: 'language-invalid',
      title: 'Language is not a language tag',
      detail: 'Ebook stores want a BCP 47 tag such as en, en-US, or fr.',
      fix: 'Change Language to a tag like en.',
      focus: 'language',
    });
  }
  isbnFinding(findings, options.isbn, 'ebook', options.includePublicationPages);
  isbnFinding(findings, input.paperbackIsbn, 'paperback', options.includePublicationPages);
  isbnFinding(findings, input.hardcoverIsbn, 'hardcover', options.includePublicationPages);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(options.epubUuid.trim())) {
    findings.push({
      severity: 'error',
      code: 'uuid-missing',
      title: 'This book has no saved id',
      detail: 'Each download has to reuse one id stored on the book. A new id is not minted per file.',
      fix: 'Leave the ebook ISBN blank and check again so the saved id can be used.',
      focus: 'ebook-isbn',
    });
  }
  if (options.includePublicationPages) {
    const year = options.copyrightYear;
    if (year == null || !Number.isInteger(year) || year < 1000 || year > 9999) {
      findings.push({
        severity: 'error',
        code: 'year-missing',
        title: 'The copyright year is missing',
        detail: 'Publication pages need the year you choose. Export does not invent one.',
        fix: 'Enter a four-digit year in Copyright year, or turn publication pages off.',
        focus: 'copyright-year',
      });
    }
  }
  if (options.epigraphAttribution.trim() && !options.epigraph.trim()) {
    findings.push({
      severity: 'warning',
      code: 'attribution-without-epigraph',
      title: 'The epigraph attribution has no epigraph',
      detail: 'The attribution is left out until the epigraph itself has text.',
      fix: 'Write the epigraph, or clear the attribution.',
      focus: 'epigraph',
    });
  }
  if (options.cover) {
    try {
      const info = epubImageInfo(options.cover.bytes);
      if (!info || info.cmyk) {
        findings.push(coverError('This cover is not a usable RGB JPEG or PNG.'));
      }
    } catch (error) {
      findings.push(coverError(error instanceof Error ? error.message : 'This cover could not be read.'));
    }
  }
  return findings;
}

function coverError(detail: string): EpubFinding {
  return {
    severity: 'error',
    code: 'cover-invalid',
    title: 'The cover cannot go in the EPUB',
    detail,
    fix: 'Choose a different JPEG or PNG, or remove the cover.',
    focus: 'cover',
  };
}

function isbnFinding(findings: EpubFinding[], raw: string, kind: 'ebook' | 'paperback' | 'hardcover', publishing: boolean): void {
  const trimmed = raw.trim();
  if (!trimmed) return;
  if (normalizeIsbn(trimmed)) return;
  const focus = kind === 'ebook' ? 'ebook-isbn' : kind === 'paperback' ? 'paperback-isbn' : 'hardcover-isbn';
  const name = kind === 'ebook' ? 'ebook' : kind;
  if (kind !== 'ebook' && !publishing) {
    findings.push({
      severity: 'warning',
      code: `${kind}-isbn-invalid`,
      title: `The ${name} ISBN does not check out`,
      detail: 'Publication pages are off, so this number is not written into the file. A bad checksum should still be corrected before you turn those pages on.',
      fix: `Correct the ${name} ISBN, or clear the field.`,
      focus,
    });
    return;
  }
  findings.push({
    severity: 'error',
    code: `${kind}-isbn-invalid`,
    title: `The ${name} ISBN does not check out`,
    detail:
      kind === 'ebook'
        ? 'The digits fail the ISBN checksum, so it cannot be the book identifier.'
        : 'This number is printed on the copyright page of Word, PDF, and the other writer files when publication pages are on. It is not written into the EPUB.',
    fix: kind === 'ebook'
      ? 'Correct the ebook ISBN, or clear it to use the id saved on this book.'
      : `Correct the ${name} ISBN, or clear the field.`,
    focus,
  });
}

export async function inspectEpubPackage(blob: Blob, input: EpubCheckInput): Promise<EpubFinding[]> {
  const findings: EpubFinding[] = [];
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = mimetypeProblem(bytes);
  if (mime) {
    findings.push({
      severity: 'error',
      code: 'mimetype',
      title: 'The package is not a valid EPUB zip',
      detail: mime,
      fix: 'Check again. If this remains, the file was not built by this exporter.',
      focus: 'outline',
    });
  }
  if (bytes.byteLength > KDP_BYTES) {
    findings.push({
      severity: 'error',
      code: 'package-too-large',
      title: 'This EPUB is over 650 MB',
      detail: 'KDP rejects an ebook file that large.',
      fix: 'Use smaller pictures, then check again.',
      focus: 'cover',
    });
  } else if (bytes.byteLength > INGRAM_BYTES) {
    findings.push({
      severity: 'warning',
      code: 'package-large',
      title: 'This EPUB is over 100 MB',
      detail: 'Ingram’s ebook guide asks for a file of at most 100 MB. KDP’s limit is higher.',
      fix: 'Shrink the pictures if you are sending this file to Ingram.',
      focus: 'cover',
    });
  }

  const zip = await JSZip.loadAsync(bytes);
  const opf = await text(zip, 'OEBPS/content.opf');
  const nav = await text(zip, 'OEBPS/nav.xhtml');
  const ncx = await text(zip, 'OEBPS/toc.ncx');
  const css = await text(zip, 'OEBPS/style.css');
  const xhtml = await Promise.all(
    Object.keys(zip.files)
      .filter((name) => name.endsWith('.xhtml'))
      .map(async (name) => ({ name, body: await text(zip, name) })),
  );
  const joined = [opf, nav, ncx, css, ...xhtml.map((file) => file.body)].join('\n');

  if ((opf.match(/<dc:title>/g) ?? []).length !== 1) {
    findings.push(errorFinding('dc-title', 'The book title is not a single title', 'The package needs exactly one dc:title.', 'Use the manuscript title. A subtitle stays on the title page and is not a second title.', 'subtitle'));
  }
  if (!opf.includes('<dc:language>') || !opf.includes('<dc:creator') || !opf.includes('dcterms:modified') || !opf.includes('unique-identifier="book-id"') || !opf.includes('version="3.0"')) {
    findings.push(errorFinding('opf-metadata', 'Required book details are missing', 'The package needs one language, one creator, a modified time, and EPUB 3.', 'Fill in the author and language, then check again.', 'author'));
  }
  if (opf.includes('dc:publisher') || /Published by HuManuScript/i.test(joined)) {
    findings.push(errorFinding('publisher', 'A publisher was written into the EPUB', 'HuManuScript is not the publisher, and the imprint is not filled in for you.', 'Clear any publisher line. An imprint is written only when you type one.', 'imprint'));
  }
  if (/certification summary/i.test(joined)) {
    findings.push(errorFinding('certification', 'The certification summary is in the EPUB', 'That page is a writer export. It does not belong on the ebook spine.', 'Check again. This file should be built without that summary.', 'outline'));
  }
  if (/<script|javascript:|<iframe|<form\b|<object\b|<embed\b/i.test(joined)) {
    findings.push(errorFinding('script', 'The EPUB contains active content', 'Ebook stores reject script, forms, and embedded frames.', 'Remove that content from the manuscript and check again.', 'outline'));
  }
  if (/pre-paginated|rendition:layout/i.test(opf)) {
    findings.push(errorFinding('fixed-layout', 'This EPUB is fixed-layout', 'This book is reflowable. Fixed-layout is for comics and picture books.', 'Check again. This exporter does not write a fixed layout.', 'outline'));
  }
  if (/position\s*:|@font-face|font-family|line-height|display\s*:\s*none/i.test(css) || /margin(?:-[a-z]+)?\s*:\s*-/.test(css) || /font-size\s*:\s*[^;]*(px|pt)/i.test(css)) {
    findings.push(errorFinding('css', 'The stylesheet is not safe for reflowable readers', 'Kindle rejects positioning, negative margins, embedded fonts, and font sizes in px or pt.', 'Use the reading choices on this tab. They stay in em.', 'paragraphs'));
  }
  if (!opf.includes('properties="nav"') || !opf.includes('<itemref idref="nav"/>')) {
    findings.push(errorFinding('nav-missing', 'The contents page is missing from the spine', 'The EPUB needs nav.xhtml in the spine, marked as the navigation document.', 'Check again.', 'outline'));
  }

  const tocLinks = tocHrefs(nav);
  for (const link of tocLinks) {
    const [href, fragment] = link.href.split('#');
    const file = xhtml.find((item) => item.name === `OEBPS/${href}`);
    if (!file) {
      findings.push(errorFinding('toc-href', 'A contents link goes nowhere', `The contents points at ${link.href}, and that file is not in the package.`, 'Rename the chapter in the manuscript if it was removed, then check again.', 'outline'));
      continue;
    }
    if (fragment && !file.body.includes(`id="${fragment}"`)) {
      findings.push(errorFinding('toc-fragment', 'A contents link misses its heading', `${link.title} points at a heading that is not in the chapter.`, 'Check again after the chapter headings are in place.', 'outline'));
    }
  }
  const tocLabels = tocLinks.map((link) => link.title);
  const ncxBody = ncx.replace(/<docTitle>[\s\S]*?<\/docTitle>/, '');
  const ncxLabels = [...ncxBody.matchAll(/<text>([^<]*)<\/text>/g)].map((match) => decode(match[1] ?? ''));
  if (tocLabels.join('\n') !== ncxLabels.join('\n')) {
    findings.push({
      severity: 'warning',
      code: 'ncx-mismatch',
      title: 'The older contents list does not match the contents page',
      detail: 'Kindle still reads the NCX. It should list the same entries as the contents page. EPUBCheck may also warn that an NCX is obsolete. That warning is not a failure.',
      fix: 'Check again. If it remains, the contents and the NCX drifted.',
      focus: 'outline',
    });
  }

  const publishing = input.options.includePublicationPages;
  const names = new Set(xhtml.map((file) => file.name));
  if (publishing) {
    if (!names.has('OEBPS/title.xhtml') || !names.has('OEBPS/copyright.xhtml')) {
      findings.push(errorFinding('pages-missing', 'The title or copyright page is missing', 'With publication pages on, the EPUB includes a title page and a copyright page.', 'Turn publication pages on only after the author and copyright year are filled in, then check again.', 'publication-pages'));
    }
    const spine = [...opf.matchAll(/<itemref idref="([^"]+)"/g)].map((match) => match[1] ?? '');
    const titleAt = spine.indexOf('title');
    const copyAt = spine.indexOf('copyright');
    const navAt = spine.indexOf('nav');
    if (titleAt < 0 || copyAt < titleAt || navAt < copyAt) {
      findings.push(errorFinding('spine-order', 'The opening pages are out of order', 'The ebook order is title, copyright, then contents, then the chapters.', 'Check again.', 'publication-pages'));
    }
    const bodyFile = xhtml.find((file) => file.body.includes('epub:type="bodymatter"'));
    if (!bodyFile || bodyFile.name.includes('title.xhtml')) {
      findings.push(errorFinding('bodymatter', 'The start-reading location points at the wrong page', 'Begin reading stays on the first chapter, not the title page.', 'Check again.', 'outline'));
    }
    const copyright = xhtml.find((file) => file.name.endsWith('copyright.xhtml'))?.body ?? '';
    if (/Paperback ISBN|Hardcover ISBN/.test(copyright)) {
      findings.push(errorFinding('print-isbn', 'A print ISBN is inside the EPUB', 'The ebook copyright page lists the ebook ISBN only. Paperback and hardcover numbers stay on the print files.', 'Check again. Those numbers should not be in this package.', 'ebook-isbn'));
    }
    if (input.options.dedication.trim() && !names.has('OEBPS/dedication.xhtml')) {
      findings.push(errorFinding('dedication-missing', 'The dedication was left out', 'A dedication with text is its own short document.', 'Check again.', 'dedication'));
    }
    if (!input.options.dedication.trim() && names.has('OEBPS/dedication.xhtml')) {
      findings.push(errorFinding('dedication-empty', 'An empty dedication page is in the EPUB', 'Empty book pages are not written.', 'Clear the dedication, or write it, then check again.', 'dedication'));
    }
    const navBody = nav.split('epub:type="landmarks"')[0] ?? nav;
    if (/title\.xhtml|copyright\.xhtml|dedication\.xhtml|epigraph\.xhtml/.test(navBody)) {
      findings.push(errorFinding('nav-front', 'The contents lists an opening page', 'Contents links chapters, sections, and, when present, also-by and about the author. It leaves out the title, copyright, dedication, and epigraph.', 'Check again.', 'outline'));
    }
  } else if ([...names].some((name) => /title\.xhtml|copyright\.xhtml|dedication\.xhtml|epigraph\.xhtml|also-by\.xhtml|about\.xhtml/.test(name))) {
    findings.push(errorFinding('pages-unexpected', 'Publication pages are in the EPUB while the switch is off', 'Those pages are written only when you turn publication pages on.', 'Turn the switch off and check again, or turn it on if you want the pages.', 'publication-pages'));
  }

  findings.push(...coverFindings(input.options.cover));
  for (const file of xhtml) {
    if (/<p>\s*<\/p>/.test(file.body)) {
      findings.push(errorFinding('empty-paragraph', 'An empty paragraph is in the EPUB', 'Blank lines made of empty paragraphs are rejected by Kindle.', 'Remove the empty paragraph and check again.', 'paragraphs'));
      break;
    }
    const alts = file.body.match(/alt="([^"]*)"/g) ?? [];
    if (alts.some((alt) => alt.length > 140 + 'alt=""'.length)) {
      findings.push(errorFinding('alt-long', 'An image description is too long', 'Alt text is kept to 140 characters.', 'Shorten the description on the picture.', 'outline'));
      break;
    }
  }
  return findings;
}

function coverFindings(cover: EpubImageSource | null): EpubFinding[] {
  if (!cover) {
    return [{
      severity: 'warning',
      code: 'cover-missing',
      title: 'No cover image in this EPUB',
      detail: 'The file can still be built. Many readers show a cover inside the book, and the store page wants one too.',
      fix: 'Add a JPEG or PNG cover if you have one. A 2560 by 1600 RGB image under 5 MB matches the usual store page.',
      focus: 'cover',
    }];
  }
  const findings: EpubFinding[] = [];
  const info = epubImageInfo(cover.bytes);
  if (info && info.width > 0 && info.height > 0) {
    const longSide = Math.max(info.width, info.height);
    const shortSide = Math.min(info.width, info.height);
    if (longSide < 1600 || shortSide < 1000) {
      findings.push({
        severity: 'warning',
        code: 'cover-small',
        title: 'The cover is smaller than the store recommendation',
        detail: `This image is ${info.width} by ${info.height}. KDP and Ingram describe a 2560 by 1600 JPEG, with the long side at least 1600 pixels.`,
        fix: 'Use a larger RGB JPEG or PNG if you have one. A smaller cover can still be checked and downloaded.',
        focus: 'cover',
      });
    }
  }
  if (cover.bytes.byteLength > COVER_GUIDE_BYTES) {
    findings.push({
      severity: 'warning',
      code: 'cover-heavy',
      title: 'The cover is over 5 MB',
      detail: 'Stores accept a larger file, and they ask for a cover under 5 MB when they can.',
      fix: 'Export the cover as a JPEG if this PNG is heavy.',
      focus: 'cover',
    });
  }
  return findings;
}

function tocHrefs(nav: string): { href: string; title: string }[] {
  const toc = nav.split('epub:type="landmarks"')[0] ?? nav;
  const links: { href: string; title: string }[] = [];
  const re = /<a href="([^"]+)">([^<]*)<\/a>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(toc))) links.push({ href: match[1] ?? '', title: decode(match[2] ?? '') });
  return links;
}

function decode(text: string): string {
  return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

async function text(zip: JSZip, name: string): Promise<string> {
  const file = zip.file(name);
  return file ? file.async('string') : '';
}

function errorFinding(code: string, title: string, detail: string, fix: string, focus: EpubCheckFocus): EpubFinding {
  return { severity: 'error', code, title, detail, fix, focus };
}

function mimetypeProblem(bytes: Uint8Array): string | null {
  if (bytes.byteLength < 38) return 'The EPUB package is incomplete.';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x04034b50) return 'The EPUB is not a zip package.';
  const method = view.getUint16(8, true);
  const nameLen = view.getUint16(26, true);
  const extraLen = view.getUint16(28, true);
  const name = new TextDecoder().decode(bytes.subarray(30, 30 + nameLen));
  if (name !== 'mimetype') return 'The first file in the EPUB must be named mimetype.';
  if (method !== 0) return 'The mimetype file must be stored uncompressed.';
  const start = 30 + nameLen + extraLen;
  const body = new TextDecoder().decode(bytes.subarray(start, start + 20));
  if (body !== 'application/epub+zip') return 'The mimetype file must contain application/epub+zip and nothing else.';
  return null;
}
