/**
 * Manuscript export for writers. Every format leads with the certification page, then the body.
 * Body text comes from blocks only; provenance is summarized on the certification page.
 */

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import {
  buildCertificationPageModel,
  certificationPagePlain,
  type CertificationPageModel,
} from './certificationPage.ts';
import type { ManuscriptDocument } from './document.ts';
import { displayTitle } from './document.ts';
import { markedToMarkdown, markedToRtf, styledSpans } from './richText.ts';
import type { ManuscriptBlock } from './types.ts';

export const SCRIVENER_SPLIT_SEPARATOR = '#';
const SCENE_BREAK = '* * *';

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
  const plain = certificationPagePlain(model).replace(/---\n\n$/, '');
  const parts = plain.split('\n').map((line) => {
    if (!line.trim()) return '\\par';
    if (line === line.toUpperCase() && line.length < 60 && !line.startsWith(' ')) {
      return `\\pard{\\b ${rtfEscape(line)}\\par}`;
    }
    if (line.endsWith('---') || line.match(/^[-=]+$/)) return '\\par';
    return `\\pard ${rtfEscape(line)}\\par`;
  });
  return parts.join('\n');
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
      case 'paragraph': {
        const raw = block.text.trim();
        if (!raw) break;
        lines.push(block.marks.length ? markedToMarkdown(block.text, block.marks) : raw, '');
        break;
      }
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
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
        if (block.text.trim()) lines.push(block.text.trim(), '');
        break;
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
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
      case 'paragraph': {
        const raw = block.text ?? '';
        if (!raw.trim()) break;
        const inner = block.marks.length ? markedToRtf(raw, block.marks) : rtfEscape(raw.trim());
        parts.push(`\\fi720 ${inner}\\par`);
        break;
      }
    }
  }
  return parts.join('\n');
}

function wrapRtf(inner: string): string {
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\n{\\fonttbl{\\f0 Times New Roman;}}\n\\f0\\fs24\n${inner}\n}`;
}

function certificationMarkdown(model: CertificationPageModel): string {
  const plain = certificationPagePlain(model);
  return plain
    .split('\n')
    .map((line) => {
      if (line === 'HUMANUSCRIPT CERTIFICATION SUMMARY') return '# HuManuScript certification summary';
      if (line.match(/^=+$/)) return '';
      if (line.endsWith('---') && line.length < 6) return '---';
      if (line.match(/^[A-Z].*-$/) && !line.includes(':')) return `## ${line.replace(/-+$/, '').trim()}`;
      return line;
    })
    .join('\n');
}

function certificationDocxParagraphs(model: CertificationPageModel): Paragraph[] {
  const out: Paragraph[] = [
    new Paragraph({ text: 'HuManuScript certification summary', heading: HeadingLevel.HEADING_1 }),
    new Paragraph(`Manuscript: ${model.manuscriptTitle}`),
    new Paragraph(`Exported: ${new Date(model.exportedAt).toLocaleString()}`),
    new Paragraph({ text: 'Trust limit', heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ children: [new TextRun({ text: model.trust })] }),
    new Paragraph({ text: 'Word counts', heading: HeadingLevel.HEADING_2 }),
    new Paragraph(`Keyboard-sealed words: ${model.totals.keyboardSealed}`),
    new Paragraph(`Pasted words (not sealed): ${model.totals.paste}`),
    new Paragraph(`Dropped words (not sealed): ${model.totals.drop}`),
    new Paragraph(`Other / unknown (not sealed): ${model.totals.other}`),
    new Paragraph(`Certification points: ${model.certificationPoints}`),
  ];
  if (model.sealedPassages.length) {
    out.push(new Paragraph({ text: 'Keyboard-sealed passages', heading: HeadingLevel.HEADING_2 }));
    for (const p of model.sealedPassages) {
      out.push(new Paragraph({ children: [new TextRun({ text: p.text, bold: true })] }));
      out.push(new Paragraph({ children: [new TextRun({ text: `Hash: ${p.contentHash}`, size: 20 })] }));
    }
  }
  if (model.uncertifiedExcerpts.length) {
    out.push(new Paragraph({ text: 'Not keyboard-sealed', heading: HeadingLevel.HEADING_2 }));
    for (const u of model.uncertifiedExcerpts) {
      out.push(new Paragraph(`[${u.origin}] ${u.blockLabel}: ${u.text}`));
    }
  }
  out.push(new Paragraph({ text: 'Manuscript', heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
  return out;
}

function paragraphToDocx(block: ManuscriptBlock): Paragraph | null {
  const raw = block.text ?? '';
  if (!raw.trim()) return null;
  const runs = styledSpans(raw, block.marks).map(
    (span) =>
      new TextRun({
        text: span.text,
        bold: span.bold || undefined,
        italics: span.italic || undefined,
        strike: span.strike || undefined,
        underline: span.underline ? {} : undefined,
      }),
  );
  return new Paragraph({ children: runs });
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
      case 'paragraph': {
        const para = paragraphToDocx(block);
        if (para) children.push(para);
        break;
      }
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

function certificationOdtBody(model: CertificationPageModel): string {
  const lines: string[] = [
    '<text:h text:style-name="Heading_20_1">HuManuScript certification summary</text:h>',
    `<text:p>Manuscript: ${xmlEscape(model.manuscriptTitle)}</text:p>`,
    `<text:p>Exported: ${xmlEscape(model.exportedAt)}</text:p>`,
    '<text:h text:style-name="Heading_20_2">Trust limit</text:h>',
    `<text:p>${xmlEscape(model.trust)}</text:p>`,
    '<text:h text:style-name="Heading_20_2">Word counts</text:h>',
    `<text:p>Keyboard-sealed words: ${model.totals.keyboardSealed}</text:p>`,
    `<text:p>Pasted words: ${model.totals.paste}</text:p>`,
    `<text:p>Dropped words: ${model.totals.drop}</text:p>`,
    `<text:p>Other / unknown: ${model.totals.other}</text:p>`,
  ];
  for (const p of model.sealedPassages) {
    lines.push(`<text:p text:style-name="Quotations">${xmlEscape(p.text)}</text:p>`);
    lines.push(`<text:p>${xmlEscape(p.contentHash)}</text:p>`);
  }
  for (const u of model.uncertifiedExcerpts) {
    lines.push(`<text:p>[${xmlEscape(u.origin)}] ${xmlEscape(u.text)}</text:p>`);
  }
  lines.push('<text:h text:style-name="Heading_20_1">Manuscript</text:h>');
  return lines.join('');
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
    }
  }
  return parts.join('');
}

async function buildOdtBlob(innerXml: string): Promise<Blob> {
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">
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

function pdfAddWrapped(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  for (const line of lines) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

async function buildPdfBlob(model: CertificationPageModel, manuscript: ManuscriptDocument): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  let y = 20;
  const margin = 18;
  const width = 210 - margin * 2;
  doc.setFontSize(16);
  doc.text('HuManuScript certification summary', margin, y);
  y += 10;
  doc.setFontSize(10);
  y = pdfAddWrapped(doc, certificationPagePlain(model), margin, y, width, 5);
  y += 8;
  doc.setFontSize(14);
  if (y > 250) {
    doc.addPage();
    y = 20;
  }
  doc.text(displayTitle(manuscript), margin, y);
  y += 8;
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
      y = pdfAddWrapped(doc, chapterHeading(block, chapterNo), margin, y, width, 6);
      doc.setFont('helvetica', 'normal');
      y += 2;
    } else if (block.type === 'section') {
      y = pdfAddWrapped(doc, block.title.trim() || 'Section', margin, y, width, 6);
    } else if (block.type === 'scene') {
      y = pdfAddWrapped(doc, block.title.trim() || SCENE_BREAK, margin, y, width, 6);
    } else if (block.type === 'paragraph' && block.text.trim()) {
      y = pdfAddWrapped(doc, block.text.trim(), margin, y, width, 5);
      y += 2;
    }
  }
  return doc.output('blob');
}

export async function exportManuscriptBlob(
  doc: ManuscriptDocument,
  format: ExportFormat,
  exportedAt: string = new Date().toISOString(),
): Promise<Blob> {
  const model = buildCertificationPageModel(doc, exportedAt);
  switch (format) {
    case 'plain': {
      const text = certificationPagePlain(model) + bodyPlain(doc);
      return new Blob([text], { type: 'text/plain;charset=utf-8' });
    }
    case 'markdown': {
      const text = certificationMarkdown(model) + '\n\n' + bodyMarkdown(doc);
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
            children: [...certificationDocxParagraphs(model), ...bodyDocxParagraphsFixed(doc)],
          },
        ],
      });
      return Packer.toBlob(document);
    }
    case 'odt': {
      const inner = certificationOdtBody(model) + bodyOdt(doc);
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
