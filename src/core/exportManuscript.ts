/**
 * Manuscript export for writers. Every format leads with the certification page, then the body.
 * Body text comes from blocks only; provenance is summarized on the certification page.
 */

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  TextRun,
} from 'docx';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { getTypingDeviceLabel } from './deviceName.ts';
import {
  buildCertificationPageModel,
  certificationFactLines,
  certificationPagePlain,
  type CertificationPageIdentity,
  type CertificationPageModel,
} from './certificationPage.ts';
import type { ManuscriptDocument } from './document.ts';
import { displayTitle } from './document.ts';
import { markedToMarkdown, markedToRtf, styledSpans } from './richText.ts';
import { dividerDisplayText } from './manuscript.ts';
import { isProseBlock, type ManuscriptBlock } from './types.ts';

export const SCRIVENER_SPLIT_SEPARATOR = '#';
const SCENE_BREAK = '* * *';

/** Form feed: the page-break character plain text can represent. */
export const PLAIN_PAGE_BREAK = '\f';
/** Explicit page break Markdown can carry, including author page breaks. */
export const MARKDOWN_PAGE_BREAK = '<!-- pagebreak -->';

export type { CertificationPageIdentity };

export type ExportFormat =
  | 'docx'
  | 'rtf'
  | 'scrivener-rtf'
  | 'odt'
  | 'markdown'
  | 'plain'
  | 'pdf';

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  docx: 'Microsoft Word (.docx)',
  rtf: 'Rich Text (.rtf)',
  'scrivener-rtf': 'Scrivener import (.rtf)',
  odt: 'LibreOffice / OpenOffice (.odt)',
  markdown: 'Markdown (.md)',
  plain: 'Plain text (.txt)',
  pdf: 'PDF (.pdf)',
};

function chapterHeading(block: ManuscriptBlock, index: number): string {
  return block.title.trim() || `Chapter ${index}`;
}

function rtfEscape(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ch === '\\' || ch === '{' || ch === '}') out += `\\${ch}`;
    else if (code > 127) out += `\\u${code}?`;
    else out += ch;
  }
  return out;
}

function certificationRtf(model: CertificationPageModel): string {
  return certificationFactLines(model)
    .map((line) => {
      if (!line.trim()) return '\\par';
      const heading =
        line === 'HuManuScript certification summary' ||
        line === 'Certified versus pasted' ||
        line === 'Statistics';
      if (heading) return `\\pard{\\b ${rtfEscape(line)}\\par}`;
      return `\\pard ${rtfEscape(line)}\\par`;
    })
    .join('\n');
}

function bodyMarkdown(doc: ManuscriptDocument): string {
  const title = displayTitle(doc);
  const lines: string[] = [`# ${title}`, ''];
  let chapterNo = 0;
  for (const block of doc.blocks) {
    switch (block.type) {
      case 'chapter':
        chapterNo += 1;
        lines.push('', `## ${chapterHeading(block, chapterNo)}`, '');
        break;
      case 'section':
        lines.push('', `### ${block.title.trim() || 'Section'}`, '');
        break;
      case 'scene':
        lines.push('', block.title.trim() ? `**${block.title.trim()}**` : SCENE_BREAK, '');
        break;
      case 'paragraph':
      case 'blockquote': {
        const md = proseToMarkdown(block);
        if (!md) break;
        lines.push(md, '');
        break;
      }
      case 'pageBreak':
        lines.push('', MARKDOWN_PAGE_BREAK, '');
        break;
      case 'divider':
        lines.push('', dividerDisplayText(block.dividerStyle, block.title), '');
        break;
      case 'table': {
        const rows = block.tableRows ?? [];
        if (!rows.length) break;
        const cols = Math.max(...rows.map((r) => r.length), 1);
        const header = rows[0] ?? [];
        lines.push(
          `| ${Array.from({ length: cols }, (_, i) => (header[i] ?? '').replace(/\|/g, '\\|')).join(' | ')} |`,
          `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`,
        );
        for (const row of rows.slice(1)) {
          lines.push(`| ${Array.from({ length: cols }, (_, i) => (row[i] ?? '').replace(/\|/g, '\\|')).join(' | ')} |`);
        }
        lines.push('');
        break;
      }
      case 'image':
        if (block.imageSrc) {
          lines.push(`![${block.imageAlt?.trim() || 'image'}](${block.imageSrc})`, '');
        }
        break;
    }
  }
  return `${trimBlankEdges(lines.join('\n').replace(/\n{3,}/g, '\n\n'))}\n`;
}

/** Trim spaces and newlines without eating a leading or trailing form feed. */
function trimBlankEdges(text: string): string {
  return text.replace(/^(?:[ \t]*\n)+/, '').replace(/(?:\n[ \t]*)+$/, '');
}

function joinAfterPageBreak(summary: string, breakToken: string, body: string): string {
  return `${trimBlankEdges(summary)}\n\n${breakToken}\n\n${trimBlankEdges(body)}\n`;
}

function bodyPlain(doc: ManuscriptDocument): string {
  const lines: string[] = [displayTitle(doc).toUpperCase(), ''];
  let chapterNo = 0;
  for (const block of doc.blocks) {
    switch (block.type) {
      case 'chapter':
        chapterNo += 1;
        lines.push('', chapterHeading(block, chapterNo).toUpperCase(), '');
        break;
      case 'section':
        lines.push('', block.title.trim() || 'Section', '');
        break;
      case 'scene':
        lines.push('', SCENE_BREAK, '');
        break;
      case 'paragraph':
      case 'blockquote':
        if (block.text.trim()) {
          const quoted = block.type === 'blockquote' ? `"${block.text.trim()}"` : block.text.trim();
          lines.push(quoted, '');
        }
        break;
      case 'pageBreak':
        lines.push('', PLAIN_PAGE_BREAK, '');
        break;
      case 'divider':
        lines.push('', dividerDisplayText(block.dividerStyle, block.title), '');
        break;
      case 'table': {
        const rows = block.tableRows ?? [];
        for (const row of rows) lines.push(row.join('\t'), '');
        break;
      }
      case 'image':
        if (block.imageAlt?.trim()) lines.push(`[Image: ${block.imageAlt.trim()}]`, '');
        else if (block.imageSrc) lines.push('[Image]', '');
        break;
    }
  }
  return `${trimBlankEdges(lines.join('\n').replace(/\n{3,}/g, '\n\n'))}\n`;
}

function bodyRtfInner(doc: ManuscriptDocument, chapterSplit: boolean): string {
  const parts: string[] = [];
  let chapterNo = 0;
  for (const block of doc.blocks) {
    switch (block.type) {
      case 'chapter':
        chapterNo += 1;
        if (chapterSplit) parts.push(`\\pard ${rtfEscape(SCRIVENER_SPLIT_SEPARATOR)}\\par`);
        parts.push(`\\pard{\\b\\fs32 ${rtfEscape(chapterHeading(block, chapterNo))}\\par}\\pard\\par`);
        break;
      case 'section':
        parts.push(`\\pard{\\b\\fs28 ${rtfEscape(block.title.trim() || 'Section')}\\par}\\pard\\par`);
        break;
      case 'scene': {
        const label = block.title.trim() ? `${SCENE_BREAK}  ${block.title.trim()}` : SCENE_BREAK;
        parts.push(`\\pard\\qc ${rtfEscape(label)}\\par\\pard\\ql\\par`);
        break;
      }
      case 'paragraph':
      case 'blockquote': {
        const raw = block.text ?? '';
        if (!raw.trim()) break;
        const inner = block.marks.length ? markedToRtf(raw, block.marks) : rtfEscape(raw.trim());
        const indent = block.type === 'blockquote' ? '\\li1440' : '\\fi720';
        parts.push(`\\pard${indent} ${inner}\\par`);
        break;
      }
      case 'pageBreak':
        parts.push('\\page\\par');
        break;
      case 'divider': {
        const label = dividerDisplayText(block.dividerStyle, block.title);
        parts.push(`\\pard\\qc ${rtfEscape(label)}\\par\\pard\\ql\\par`);
        break;
      }
      case 'table': {
        const rows = block.tableRows ?? [];
        for (const row of rows) {
          parts.push(`\\pard ${row.map((c) => rtfEscape(c)).join('\\tab ')}\\par`);
        }
        parts.push('\\pard\\par');
        break;
      }
      case 'image':
        if (block.imageAlt?.trim()) parts.push(`\\pard\\i ${rtfEscape(`[Image: ${block.imageAlt.trim()}]`)}\\i0\\par\\pard\\par`);
        break;
    }
  }
  return parts.join('\n');
}

function wrapRtf(inner: string): string {
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\n{\\fonttbl{\\f0 Times New Roman;}}\n\\f0\\fs24\n${inner}\n}`;
}

function certificationMarkdown(model: CertificationPageModel): string {
  const headings = new Set(['Certified versus pasted', 'Statistics']);
  return certificationFactLines(model)
    .map((line) => {
      if (line === 'HuManuScript certification summary') return '# HuManuScript certification summary';
      if (headings.has(line)) return `## ${line}`;
      return line;
    })
    .join('\n');
}

function certificationDocxParagraphs(model: CertificationPageModel): Paragraph[] {
  const headings = new Set(['HuManuScript certification summary', 'Certified versus pasted', 'Statistics']);
  return certificationFactLines(model).map((line) => {
    if (!line) return new Paragraph('');
    if (line === 'HuManuScript certification summary') {
      return new Paragraph({ text: line, heading: HeadingLevel.HEADING_1 });
    }
    if (headings.has(line)) return new Paragraph({ text: line, heading: HeadingLevel.HEADING_2 });
    return new Paragraph({ children: [new TextRun(line)] });
  });
}

function proseToMarkdown(block: ManuscriptBlock): string | null {
  if (!isProseBlock(block.type)) return null;
  const raw = block.text.trim();
  if (!raw) return null;
  const md = block.marks.length ? markedToMarkdown(block.text, block.marks) : raw;
  if (block.type === 'blockquote') {
    return md.split('\n').map((line) => `> ${line}`).join('\n');
  }
  return md;
}

function proseToDocx(block: ManuscriptBlock): Paragraph | null {
  if (!isProseBlock(block.type)) return null;
  const raw = block.text ?? '';
  if (!raw.trim()) return null;
  const runs = styledSpans(raw, block.marks).map(
    (span) =>
      new TextRun({
        text: span.text,
        bold: span.bold || undefined,
        italics: block.type === 'blockquote' ? true : span.italic || undefined,
        strike: span.strike || undefined,
        underline: span.underline ? {} : undefined,
      }),
  );
  return new Paragraph({
    indent: block.type === 'blockquote' ? { left: 720 } : undefined,
    children: runs,
  });
}

function bodyDocxParagraphsFixed(doc: ManuscriptDocument): Paragraph[] {
  const children: Paragraph[] = [
    new Paragraph({ text: displayTitle(doc), heading: HeadingLevel.TITLE }),
  ];
  let chapterNo = 0;
  for (const block of doc.blocks) {
    switch (block.type) {
      case 'chapter':
        chapterNo += 1;
        children.push(
          new Paragraph({
            text: chapterHeading(block, chapterNo),
            heading: HeadingLevel.HEADING_1,
            pageBreakBefore: chapterNo > 1,
          }),
        );
        break;
      case 'section':
        children.push(new Paragraph({ text: block.title.trim() || 'Section', heading: HeadingLevel.HEADING_2 }));
        break;
      case 'scene':
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun(block.title.trim() || SCENE_BREAK)],
          }),
        );
        break;
      case 'paragraph':
      case 'blockquote': {
        const para = proseToDocx(block);
        if (para) children.push(para);
        break;
      }
      case 'pageBreak':
        children.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      case 'divider':
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun(dividerDisplayText(block.dividerStyle, block.title))],
          }),
        );
        break;
      case 'table': {
        for (const row of block.tableRows ?? []) {
          children.push(new Paragraph({ children: row.map((cell) => new TextRun({ text: cell })) }));
        }
        break;
      }
      case 'image':
        if (block.imageAlt?.trim()) {
          children.push(new Paragraph({ children: [new TextRun({ text: `[Image: ${block.imageAlt.trim()}]`, italics: true })] }));
        }
        break;
    }
  }
  return children;
}

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ODT_PAGE_BREAK = '<text:p text:style-name="PageBreak"/>';

function certificationOdtBody(model: CertificationPageModel): string {
  const headings = new Set(['Certified versus pasted', 'Statistics']);
  return certificationFactLines(model)
    .map((line) => {
      if (!line) return '<text:p/>';
      if (line === 'HuManuScript certification summary') {
        return `<text:h text:style-name="Heading_20_1">${xmlEscape(line)}</text:h>`;
      }
      if (headings.has(line)) return `<text:h text:style-name="Heading_20_2">${xmlEscape(line)}</text:h>`;
      return `<text:p>${xmlEscape(line)}</text:p>`;
    })
    .join('');
}

function bodyOdt(doc: ManuscriptDocument): string {
  const parts: string[] = [`<text:h text:style-name="Heading_20_1">${xmlEscape(displayTitle(doc))}</text:h>`];
  let chapterNo = 0;
  for (const block of doc.blocks) {
    switch (block.type) {
      case 'chapter':
        chapterNo += 1;
        parts.push(
          `<text:h text:style-name="Heading_20_1">${xmlEscape(chapterHeading(block, chapterNo))}</text:h>`,
        );
        break;
      case 'section':
        parts.push(
          `<text:h text:style-name="Heading_20_2">${xmlEscape(block.title.trim() || 'Section')}</text:h>`,
        );
        break;
      case 'scene':
        parts.push(`<text:p text:style-name="Center">${xmlEscape(block.title.trim() || SCENE_BREAK)}</text:p>`);
        break;
      case 'paragraph':
        if (block.text.trim()) parts.push(`<text:p>${xmlEscape(block.text.trim())}</text:p>`);
        break;
      case 'blockquote':
        if (block.text.trim()) parts.push(`<text:p text:style-name="Quotations">${xmlEscape(block.text.trim())}</text:p>`);
        break;
      case 'pageBreak':
        parts.push('<text:p text:style-name="PageBreak"/>');
        break;
      case 'divider':
        parts.push(`<text:p text:style-name="Center">${xmlEscape(dividerDisplayText(block.dividerStyle, block.title))}</text:p>`);
        break;
      case 'table':
        for (const row of block.tableRows ?? []) {
          parts.push(`<text:p>${row.map((c) => xmlEscape(c)).join(' — ')}</text:p>`);
        }
        break;
      case 'image':
        if (block.imageAlt?.trim()) parts.push(`<text:p>${xmlEscape(`[Image: ${block.imageAlt.trim()}]`)}</text:p>`);
        break;
    }
  }
  return parts.join('');
}

async function buildOdtBlob(innerXml: string): Promise<Blob> {
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:fo:1.0" office:version="1.2">
  <office:automatic-styles>
    <style:style style:name="PageBreak" style:family="paragraph">
      <style:paragraph-properties fo:break-before="page"/>
    </style:style>
    <style:style style:name="Center" style:family="paragraph">
      <style:paragraph-properties fo:text-align="center"/>
    </style:style>
  </office:automatic-styles>
  <office:body><office:text>${innerXml}</office:text></office:body>
</office:document-content>`;
  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
  zip.file('content.xml', content);
  zip.file(
    'META-INF/manifest.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.text" manifest:full-path="/"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/>
</manifest:manifest>`,
  );
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.text' });
}

function pdfAddWrapped(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  allowPageBreak: boolean,
): number {
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  for (const line of lines) {
    if (allowPageBreak && y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

async function buildPdfBlob(model: CertificationPageModel, manuscript: ManuscriptDocument): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: false });
  const margin = 18;
  const width = 210 - margin * 2;
  let y = 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('HuManuScript certification summary', margin, y);
  y += 9;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  for (const line of certificationFactLines(model).slice(1)) {
    if (!line) {
      y += 3;
      continue;
    }
    const heading = line === 'Certified versus pasted' || line === 'Statistics';
    if (heading) {
      y += 1;
      doc.setFont('helvetica', 'bold');
    }
    y = pdfAddWrapped(doc, line, margin, y, width, 5, false);
    if (heading) doc.setFont('helvetica', 'normal');
  }
  doc.addPage();
  y = 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(displayTitle(manuscript), margin, y);
  y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  let chapterNo = 0;
  for (const block of manuscript.blocks) {
    if (block.type === 'chapter') {
      chapterNo += 1;
      if (y > 260) {
        doc.addPage();
        y = 20;
      }
      doc.setFont('helvetica', 'bold');
      y = pdfAddWrapped(doc, chapterHeading(block, chapterNo), margin, y, width, 6, true);
      doc.setFont('helvetica', 'normal');
      y += 2;
    } else if (block.type === 'section') {
      y = pdfAddWrapped(doc, block.title.trim() || 'Section', margin, y, width, 6, true);
    } else if (block.type === 'scene') {
      y = pdfAddWrapped(doc, block.title.trim() || SCENE_BREAK, margin, y, width, 6, true);
    } else if (block.type === 'pageBreak') {
      doc.addPage();
      y = 20;
    } else if (block.type === 'divider') {
      y = pdfAddWrapped(doc, dividerDisplayText(block.dividerStyle, block.title), margin, y, width, 6, true);
      y += 4;
    } else if ((block.type === 'paragraph' || block.type === 'blockquote') && block.text.trim()) {
      const text = block.type === 'blockquote' ? `"${block.text.trim()}"` : block.text.trim();
      const inset = block.type === 'blockquote' ? margin + 8 : margin;
      const w = block.type === 'blockquote' ? width - 8 : width;
      y = pdfAddWrapped(doc, text, inset, y, w, 5, true);
      y += 2;
    }
  }
  return doc.output('blob');
}

export async function exportManuscriptBlob(
  doc: ManuscriptDocument,
  format: ExportFormat,
  exportedAt: string = new Date().toISOString(),
  identity: CertificationPageIdentity = {},
): Promise<Blob> {
  const liveDevice = await getTypingDeviceLabel();
  const model = buildCertificationPageModel(doc, exportedAt, identity, liveDevice);
  switch (format) {
    case 'plain': {
      const text = joinAfterPageBreak(certificationPagePlain(model), PLAIN_PAGE_BREAK, bodyPlain(doc));
      return new Blob([text], { type: 'text/plain;charset=utf-8' });
    }
    case 'markdown': {
      const text = joinAfterPageBreak(certificationMarkdown(model), MARKDOWN_PAGE_BREAK, bodyMarkdown(doc));
      return new Blob([text], { type: 'text/markdown;charset=utf-8' });
    }
    case 'rtf': {
      const rtf = wrapRtf(`${certificationRtf(model)}\n\\page\n${bodyRtfInner(doc, false)}`);
      return new Blob([rtf], { type: 'application/rtf' });
    }
    case 'scrivener-rtf': {
      const rtf = wrapRtf(`${certificationRtf(model)}\n\\page\n${bodyRtfInner(doc, true)}`);
      return new Blob([rtf], { type: 'application/rtf' });
    }
    case 'docx': {
      const document = new Document({
        sections: [
          {
            children: [
              ...certificationDocxParagraphs(model),
              new Paragraph({ children: [new PageBreak()] }),
              ...bodyDocxParagraphsFixed(doc),
            ],
          },
        ],
      });
      return Packer.toBlob(document);
    }
    case 'odt': {
      const inner = `${certificationOdtBody(model)}${ODT_PAGE_BREAK}${bodyOdt(doc)}`;
      return buildOdtBlob(inner);
    }
    case 'pdf':
      return buildPdfBlob(model, doc);
    default:
      throw new Error(`Unknown export format: ${format}`);
  }
}

export function exportFilename(title: string, format: ExportFormat): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'untitled-manuscript';
  const ext: Record<ExportFormat, string> = {
    docx: 'docx',
    rtf: 'rtf',
    'scrivener-rtf': 'scrivener-import.rtf',
    odt: 'odt',
    markdown: 'md',
    plain: 'txt',
    pdf: 'pdf',
  };
  return `${base}.${ext[format]}`;
}
