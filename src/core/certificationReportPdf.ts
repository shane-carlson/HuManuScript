/**
 * Detailed certification report as a letter-size PDF.
 *
 * The certification pane downloads the author copy: each sealed passage, its
 * wording, the time, the hash, and the other seal details, with the screenshots
 * and camera photos for that passage.
 *
 * The registry copy is the same report without the manuscript wording. Seal
 * hashes are printed as stored. This file does not recompute them.
 */

import { jsPDF } from 'jspdf';
import type { CertificationPoint } from './certification.ts';
import { certificationFactLines, formatExportDateTime, type CertificationPageModel } from './certificationPage.ts';
import { inputSourceLine, typingRateLine } from './inputSource.ts';
import { passageImageLabel, type PassageCaptureImage } from './sessionCapture.ts';

export const CERTIFICATION_REPORT_PDF_FILENAME = 'certification-report.pdf';
export const CERTIFICATION_REPORT_PDF_MEDIA_TYPE = 'application/pdf' as const;

/** The object the Certified Manuscript Registry stores and lets a holder download. */
export interface CertificationReportPdfDocument {
  filename: typeof CERTIFICATION_REPORT_PDF_FILENAME;
  mediaType: typeof CERTIFICATION_REPORT_PDF_MEDIA_TYPE;
  byteLength: number;
  sha256: string;
  base64: string;
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/**
 * One sealed span for the author download, grouped the way the certification
 * pane shows it. Input events stay inside the seal. They are not printed one
 * keystroke per line. The passage wording in these lines stays on the machine.
 */
export function detailedSealText(point: CertificationPoint): string[] {
  const origin = point.origin === 'dictation' ? 'Dictation, sealed' : 'Keyboard, sealed';
  const lines = [
    origin,
    point.text,
    `Updated ${formatExportDateTime(point.updatedAt)}`,
    `Sealed ${formatExportDateTime(point.sealedAt)}`,
    `SHA-256 ${point.contentHash}`,
    `Seal ${point.id}`,
    `Block ${point.blockId}`,
    `Span ${point.spanId}`,
  ];
  if (point.typingDevice?.trim()) lines.push(`Device: ${point.typingDevice.trim()}`);
  lines.push(inputSourceLine(point));
  lines.push(typingRateLine(point));
  const types = point.evidence.inputTypes.join(', ') || 'keyboard';
  const count = point.evidence.eventCount;
  lines.push(`${count} observed input event${count === 1 ? '' : 's'} · ${types}`);
  if (point.priorHashes.length > 0) {
    lines.push('Prior hashes');
    for (const hash of point.priorHashes) lines.push(hash);
  }
  if (point.lineage) lines.push(point.lineage);
  if (point.spellcheck?.used) {
    lines.push(point.spellcheck.comment);
    for (const check of point.spellcheck.checks) {
      lines.push(`Spelling ${formatExportDateTime(check.at)}: ${check.before} to ${check.after}`);
    }
  }
  if (point.grammar?.used) {
    lines.push(point.grammar.comment);
    for (const check of point.grammar.checks) {
      lines.push(`Grammar ${formatExportDateTime(check.at)}: ${check.before} to ${check.after}`);
    }
  }
  return lines;
}

const MARGIN = 40;
const BOTTOM = 752;
const WIDTH = 612 - MARGIN * 2;

function fitBox(srcW: number, srcH: number, maxW: number, maxH: number): { width: number; height: number } {
  const width = Math.max(1, srcW || maxW);
  const height = Math.max(1, srcH || maxH);
  const scale = Math.min(maxW / width, maxH / height);
  return { width: width * scale, height: height * scale };
}

function imageFormat(dataUrl: string): 'JPEG' | 'PNG' | null {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  return null;
}

interface PdfCursor {
  doc: jsPDF;
  y: number;
  header: () => void;
}

function newPage(cursor: PdfCursor): void {
  cursor.doc.addPage();
  cursor.header();
}

function room(cursor: PdfCursor, need: number): void {
  if (cursor.y + need > BOTTOM) newPage(cursor);
}

function writeLines(
  cursor: PdfCursor,
  lines: string[],
  size: number,
  leading: number,
  weight: 'bold' | 'normal' = 'normal',
): void {
  cursor.doc.setFont('times', weight);
  cursor.doc.setFontSize(size);
  for (const line of lines) {
    const wrapped = (line ? cursor.doc.splitTextToSize(line, WIDTH) : ['']) as string[];
    for (const row of wrapped) {
      room(cursor, leading);
      if (row) cursor.doc.text(row, MARGIN, cursor.y);
      cursor.y += leading;
    }
  }
}

function drawPicture(cursor: PdfCursor, dataUrl: string, width: number, height: number, maxH: number): void {
  const box = fitBox(width || WIDTH, height || maxH, WIDTH, maxH);
  room(cursor, box.height + 8);
  const format = imageFormat(dataUrl);
  if (format) {
    try {
      cursor.doc.addImage(dataUrl, format, MARGIN, cursor.y, box.width, box.height);
    } catch {
      cursor.doc.setDrawColor(160);
      cursor.doc.rect(MARGIN, cursor.y, box.width, box.height);
      cursor.doc.setFont('times', 'normal');
      cursor.doc.setFontSize(11);
      cursor.doc.text('Picture unavailable', MARGIN + 8, cursor.y + 18);
    }
  } else {
    cursor.doc.setDrawColor(160);
    cursor.doc.rect(MARGIN, cursor.y, box.width, Math.min(box.height, 72));
    cursor.doc.setFont('times', 'normal');
    cursor.doc.setFontSize(11);
    cursor.doc.text('Picture unavailable', MARGIN + 8, cursor.y + 18);
  }
  cursor.y += box.height + 12;
}

function paintAuthorHeader(doc: jsPDF, title: string, manuscriptId: string): number {
  let y = MARGIN;
  doc.setTextColor(0);
  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.text('Detailed certification report', MARGIN, y);
  y += 18;
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  const titleLines = doc.splitTextToSize(title, WIDTH) as string[];
  doc.text(titleLines, MARGIN, y);
  y += titleLines.length * 14;
  doc.setFontSize(8);
  doc.text(`Manuscript ${manuscriptId}`, MARGIN, y);
  return y + 16;
}

function drawCertificationSummaryPage(doc: jsPDF, model: CertificationPageModel): void {
  let y = 48;
  doc.setTextColor(0);
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text('HuManuScript certification summary', MARGIN, y);
  y += 20;
  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  for (const line of certificationFactLines(model).slice(1)) {
    if (!line) {
      y += 7;
      continue;
    }
    const heading = line === 'Certified versus pasted' || line === 'Statistics';
    if (heading) {
      y += 3;
      doc.setFont('times', 'bold');
    }
    const wrapped = doc.splitTextToSize(line, WIDTH) as string[];
    doc.text(wrapped, MARGIN, y);
    y += wrapped.length * 12;
    if (heading) doc.setFont('times', 'normal');
  }
}

/**
 * Certification-pane download. A one-page summary, then each sealed passage
 * with its wording, time, hash, and the pictures tied to that seal.
 */
export function renderPaneDetailedCertificationReport(args: {
  title: string;
  manuscriptId: string;
  points: CertificationPoint[];
  summary: CertificationPageModel;
  imagesBySeal: ReadonlyMap<string, readonly PassageCaptureImage[]>;
}): Uint8Array {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: false });
  drawCertificationSummaryPage(doc, args.summary);
  doc.addPage();
  const cursor: PdfCursor = {
    doc,
    y: paintAuthorHeader(doc, args.title, args.manuscriptId),
    header: () => {
      cursor.y = paintAuthorHeader(doc, args.title, args.manuscriptId);
    },
  };
  if (args.points.length === 0) {
    writeLines(cursor, ['No sealed passages were included.'], 12, 16);
    return new Uint8Array(doc.output('arraybuffer'));
  }
  args.points.forEach((point, index) => {
    if (index > 0) {
      room(cursor, 16);
      doc.setDrawColor(180);
      doc.setLineWidth(0.6);
      doc.line(MARGIN, cursor.y, MARGIN + WIDTH, cursor.y);
      cursor.y += 14;
    }
    writeLines(cursor, detailedSealText(point), 9, 12);
    cursor.y += 4;
    const pictures = (args.imagesBySeal.get(point.id) ?? []).filter((image) => image.dataUrl.startsWith('data:image/'));
    for (const picture of pictures) {
      writeLines(cursor, [`${passageImageLabel(picture.kind)} · ${formatExportDateTime(picture.at)}`], 9, 12, 'bold');
      cursor.y += 4;
      drawPicture(cursor, picture.dataUrl, picture.width, picture.height, 220);
    }
    cursor.y += 8;
  });
  return new Uint8Array(doc.output('arraybuffer'));
}

/** Seal fields the registry already stored as plain text. No passage wording. */
export interface RegistryReportSeal {
  id: string;
  origin: 'keyboard' | 'dictation';
  sealedAt: string;
  updatedAt: string;
  charLength: number;
  inputSource: { kind: 'keyboard' | 'microphone'; name?: string };
  keyboardPace?: { keystrokes: number; firstAt: string; lastAt: string };
  priorHashCount: number;
  eventCount: number;
  inputTypes: readonly string[];
  typingDevice?: string;
  blockId: string;
  spanId: string;
  lineage?: string;
  images?: readonly PassageCaptureImage[];
  spellcheck?: {
    comment: string;
    checks: readonly { at: string }[];
  };
  grammar?: {
    comment: string;
    checks: readonly {
      at: string;
      engine: string;
      engineVersion: string;
      dialect: string;
      lintKind: string;
      suggestion: string;
    }[];
  };
}

export interface RegistryCertificationReport {
  name: string;
  manuscriptId: string;
  exportedAt: string;
  seals: readonly RegistryReportSeal[];
}

function registrySealLines(seal: RegistryReportSeal, index: number): string[] {
  const lines = [`Seal ${index + 1}`, `Id: ${seal.id}`, `Origin: ${seal.origin}`, `Input: ${seal.inputSource.kind}`];
  if (seal.inputSource.name) lines.push(`Input source: ${seal.inputSource.name}`);
  if (seal.typingDevice) lines.push(`Computer: ${seal.typingDevice}`);
  lines.push(
    `Sealed: ${seal.sealedAt}`,
    `Updated: ${seal.updatedAt}`,
    `Characters: ${seal.charLength}`,
    `Earlier hashes: ${seal.priorHashCount}`,
    `Input events: ${seal.eventCount}`,
  );
  if (seal.inputTypes.length > 0) lines.push(`Input types: ${seal.inputTypes.join(', ')}`);
  if (seal.keyboardPace) {
    lines.push(
      `Typing: ${seal.keyboardPace.keystrokes} keystrokes from ${seal.keyboardPace.firstAt} to ${seal.keyboardPace.lastAt}`,
    );
  }
  if (seal.lineage) lines.push(`Lineage: ${seal.lineage}`);
  lines.push(`Block: ${seal.blockId}`, `Span: ${seal.spanId}`);
  if (seal.spellcheck) {
    lines.push(`Spell check: ${seal.spellcheck.comment}`);
    for (const check of seal.spellcheck.checks) lines.push(`Spell check at ${check.at}`);
  }
  if (seal.grammar) {
    lines.push(`Grammar check: ${seal.grammar.comment}`);
    for (const check of seal.grammar.checks) {
      lines.push(
        `Grammar check at ${check.at} with ${check.engine} ${check.engineVersion}, ${check.dialect}, ${check.lintKind}, suggestion ${check.suggestion}`,
      );
    }
  }
  return lines;
}

function paintRegistryHeader(doc: jsPDF, report: RegistryCertificationReport): number {
  let y = 56;
  doc.setTextColor(0);
  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  doc.text(report.name, MARGIN, y);
  y += 26;
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  doc.text(`Manuscript id: ${report.manuscriptId}`, MARGIN, y);
  y += 16;
  doc.text(`Exported: ${report.exportedAt}`, MARGIN, y);
  return y + 22;
}

/**
 * Registry download. The same seal record as the old plain-text report, with
 * each screenshot and camera photo drawn under the seal it belongs to.
 * Passage wording is not written into this file.
 */
export function renderRegistryCertificationReportPdf(report: RegistryCertificationReport): Uint8Array {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: false });
  doc.setProperties({
    title: report.name,
    creator: 'HuManuScript',
    subject: 'Detailed certification report',
  });
  const cursor: PdfCursor = {
    doc,
    y: paintRegistryHeader(doc, report),
    header: () => {
      cursor.y = paintRegistryHeader(doc, report);
    },
  };
  if (report.seals.length === 0) {
    writeLines(cursor, ['No sealed passages were included.'], 12, 16);
    return new Uint8Array(doc.output('arraybuffer'));
  }
  report.seals.forEach((seal, index) => {
    if (index > 0) {
      room(cursor, 18);
      doc.setDrawColor(180);
      doc.setLineWidth(0.6);
      doc.line(MARGIN, cursor.y, MARGIN + WIDTH, cursor.y);
      cursor.y += 18;
    }
    const lines = registrySealLines(seal, index);
    writeLines(cursor, [lines[0]!], 13, 18, 'bold');
    writeLines(cursor, lines.slice(1), 11, 15);
    cursor.y += 6;
    for (const image of seal.images ?? []) {
      if (!image.dataUrl.startsWith('data:image/')) continue;
      const caption = [passageImageLabel(image.kind), `Captured: ${image.at}`];
      if (image.width > 0 && image.height > 0) caption.push(`Size: ${image.width}x${image.height}`);
      writeLines(cursor, caption, 11, 15, 'bold');
      cursor.y += 4;
      drawPicture(cursor, image.dataUrl, image.width, image.height, 280);
    }
    cursor.y += 8;
  });
  return new Uint8Array(doc.output('arraybuffer'));
}
