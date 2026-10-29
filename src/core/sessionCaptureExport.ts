/**
 * Separate session-capture document. This is not the certification summary
 * that leads a manuscript export.
 *
 * Each page holds six composites: two across and three down. The certification
 * details for that window sit under the picture.
 */

import { jsPDF } from 'jspdf';
import type { CertificationPoint } from './certification.ts';
import { certificationFactLines, formatExportDateTime, type CertificationPageModel } from './certificationPage.ts';
import { inputSourceLine, typingRateLine } from './inputSource.ts';
import {
  CAPTURE_PAGE,
  captureCellSize,
  captureDocumentHeader,
  cellsFromSchema,
  planCapturePages,
  passageImageLabel,
  sessionCaptureReportLeadsWithSummary,
  sessionCaptureReportShowsImages,
  type PassageCaptureImage,
  type PlannedCaptureCell,
  type SealWindowMeta,
  type SessionCaptureReportKind,
  type SessionCaptureSchema,
} from './sessionCapture.ts';

export function sessionCaptureFilename(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'untitled-manuscript'}-session-capture.pdf`;
}

function reasonLabel(reason: PlannedCaptureCell['reason']): string {
  if (reason === 'start') return 'Session start';
  if (reason === 'end') return 'Session end';
  return 'Every 5 minutes';
}

function fitBox(srcW: number, srcH: number, maxW: number, maxH: number): { width: number; height: number } {
  const width = Math.max(1, srcW || maxW);
  const height = Math.max(1, srcH || maxH);
  const scale = Math.min(maxW / width, maxH / height);
  return { width: width * scale, height: height * scale };
}

function sealLines(doc: jsPDF, seal: SealWindowMeta, width: number): string[] {
  const origin = seal.origin === 'dictation' ? 'Dictation' : 'Keyboard';
  return [
    `${origin} · updated ${formatExportDateTime(seal.updatedAt)}`,
    `Sealed ${formatExportDateTime(seal.sealedAt)}`,
    ...doc.splitTextToSize(seal.contentHash, width).map(String),
    `Seal ${seal.id}`,
    `Block ${seal.blockId}`,
  ];
}

function drawHeader(doc: jsPDF, title: string, manuscriptId: string): void {
  const lines = captureDocumentHeader(title, manuscriptId);
  let y = CAPTURE_PAGE.margin + 4;
  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.text(lines[0]!, CAPTURE_PAGE.margin, y);
  y += 14;
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  doc.text(lines[1]!, CAPTURE_PAGE.margin, y);
  y += 12;
  doc.setFontSize(8);
  const wrapped = doc.splitTextToSize(lines[2]!, CAPTURE_PAGE.pageWidth - CAPTURE_PAGE.margin * 2);
  doc.text(wrapped, CAPTURE_PAGE.margin, y);
  y += wrapped.length * 9;
  doc.text(lines[3]!, CAPTURE_PAGE.margin, y);
}

function drawCell(doc: jsPDF, cell: PlannedCaptureCell, x: number, y: number, width: number, height: number): void {
  const imageMax = Math.min(CAPTURE_PAGE.imageMaxHeight, height * 0.48);
  const box = fitBox(cell.width ?? width, cell.height ?? imageMax, width, imageMax);
  if (cell.dataUrl) {
    try {
      doc.addImage(cell.dataUrl, 'JPEG', x, y, box.width, box.height);
    } catch {
      doc.setDrawColor(180);
      doc.rect(x, y, width, imageMax);
    }
  } else {
    doc.setDrawColor(180);
    doc.rect(x, y, width, imageMax);
  }

  let cursor = y + imageMax + 11;
  const bottom = y + height - 2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`${reasonLabel(cell.reason)} · ${formatExportDateTime(cell.at)}`, x, cursor);
  cursor += 9;

  doc.setFontSize(6.5);
  if (cell.seals.length === 0) {
    if (cursor <= bottom) doc.text('No seals in this window.', x, cursor);
    return;
  }

  let hidden = 0;
  for (let index = 0; index < cell.seals.length; index += 1) {
    const lines = sealLines(doc, cell.seals[index]!, width);
    if (cursor + lines.length * 8 > bottom) {
      hidden = cell.seals.length - index;
      break;
    }
    for (const line of lines) {
      doc.text(line, x, cursor);
      cursor += 8;
    }
    cursor += 2;
  }
  if (hidden > 0 && cursor <= bottom) {
    doc.text(`${hidden} more seal${hidden === 1 ? '' : 's'} in this window.`, x, cursor);
  }
}

function drawEmptyState(doc: jsPDF): void {
  const y = CAPTURE_PAGE.margin + CAPTURE_PAGE.headerHeight + 8;
  doc.setFont('times', 'normal');
  doc.setFontSize(12);
  const message = doc.splitTextToSize(
    'No session pictures are stored for this manuscript. A picture is taken at the start, every five minutes, and at the end only while the camera or the screen is turned on, and only after you allow that device for this writing session or remember it on this device.',
    CAPTURE_PAGE.pageWidth - CAPTURE_PAGE.margin * 2,
  );
  doc.text(message, CAPTURE_PAGE.margin, y);
}

/** Letter-size PDF. Six composites per page, certification details under each. */
export function renderSessionCapturePdf(args: {
  title: string;
  manuscriptId: string;
  schema: SessionCaptureSchema;
}): Uint8Array {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const cells = cellsFromSchema(args.schema);
  const pages = planCapturePages(cells);
  const planned = pages.length > 0 ? pages : [{ cells: [] }];
  const cell = captureCellSize();

  planned.forEach((page, index) => {
    if (index > 0) doc.addPage();
    drawHeader(doc, args.title, args.manuscriptId);
    if (page.cells.length === 0) {
      drawEmptyState(doc);
      return;
    }
    for (const item of page.cells) {
      const x = CAPTURE_PAGE.margin + item.column * (cell.width + CAPTURE_PAGE.columnGap);
      const y = CAPTURE_PAGE.margin + CAPTURE_PAGE.headerHeight + item.row * (cell.height + CAPTURE_PAGE.rowGap);
      drawCell(doc, item, x, y, cell.width, cell.height);
    }
  });

  return new Uint8Array(doc.output('arraybuffer'));
}

const REPORT_SUFFIX: Record<SessionCaptureReportKind, string> = {
  detailed: 'certification-report',
  summary: 'capture-summary',
  seals: 'seal-summaries',
};

export function sessionCaptureReportFilename(title: string, kind: SessionCaptureReportKind): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'untitled-manuscript'}-${REPORT_SUFFIX[kind]}.pdf`;
}

function reportHeading(kind: SessionCaptureReportKind): string {
  if (kind === 'detailed') return 'Detailed certification report';
  if (kind === 'summary') return 'High-level summary';
  return 'Seal summaries';
}

/** Short seal lines. Not the passage, the evidence, or the other certification fields. */
export function sealSummaryText(seal: SealWindowMeta): string[] {
  const origin = seal.origin === 'dictation' ? 'Dictation' : 'Keyboard';
  return [
    `${origin} · updated ${formatExportDateTime(seal.updatedAt)}`,
    `Sealed ${formatExportDateTime(seal.sealedAt)}`,
    seal.contentHash,
    `Seal ${seal.id}`,
  ];
}

/**
 * One sealed span for the detailed report, grouped the way the certification
 * pane shows it: the passage that was entered, the hash, the time, and the
 * other certification details. Input events stay inside the seal. They are
 * not printed one keystroke per line.
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

const REPORT_MARGIN = 40;
const REPORT_BOTTOM = 752;
const REPORT_WIDTH = 612 - REPORT_MARGIN * 2;

function paintReportHeader(doc: jsPDF, kind: SessionCaptureReportKind, title: string, manuscriptId: string): number {
  let y = REPORT_MARGIN;
  doc.setTextColor(0);
  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.text(reportHeading(kind), REPORT_MARGIN, y);
  y += 18;
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  const titleLines = doc.splitTextToSize(title, REPORT_WIDTH) as string[];
  doc.text(titleLines, REPORT_MARGIN, y);
  y += titleLines.length * 14;
  doc.setFontSize(8);
  doc.text(`Manuscript ${manuscriptId}`, REPORT_MARGIN, y);
  return y + 16;
}

function drawCertificationSummaryPage(doc: jsPDF, model: CertificationPageModel): void {
  const width = 612 - REPORT_MARGIN * 2;
  let y = 48;
  doc.setTextColor(0);
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text('HuManuScript certification summary', REPORT_MARGIN, y);
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
    const wrapped = doc.splitTextToSize(line, width) as string[];
    doc.text(wrapped, REPORT_MARGIN, y);
    y += wrapped.length * 12;
    if (heading) doc.setFont('times', 'normal');
  }
}

function fitReportImage(srcW: number, srcH: number, maxW: number, maxH: number): { width: number; height: number } {
  return fitBox(srcW || maxW, srcH || maxH, maxW, maxH);
}

/** Composites already linked to seals. Separate camera files are not in the schema. */
function imagesBySealFromSchema(schema: SessionCaptureSchema): Map<string, PassageCaptureImage[]> {
  const images = new Map<string, PassageCaptureImage[]>();
  for (const session of schema.sessions) {
    for (const capture of session.captures) {
      const composite = capture.composite;
      if (!composite?.dataUrl.startsWith('data:image/')) continue;
      const image: PassageCaptureImage = {
        kind: 'composite',
        at: capture.at,
        width: composite.width,
        height: composite.height,
        dataUrl: composite.dataUrl,
      };
      for (const seal of capture.seals) {
        const list = images.get(seal.id) ?? [];
        list.push(image);
        images.set(seal.id, list);
      }
    }
  }
  return images;
}

/**
 * Certification-pane download.
 * Detailed: one-page certification summary, then each sealed passage. Screenshots
 * and camera photos from that passage sit with it, not in a separate gallery.
 * High-level: the pictures and a short seal summary, and not the other fields.
 * Seal summaries: the same short lines, and no pictures.
 */
export function renderSessionCaptureReport(args: {
  kind: SessionCaptureReportKind;
  title: string;
  manuscriptId: string;
  schema: SessionCaptureSchema;
  points: CertificationPoint[];
  summary: CertificationPageModel;
  /** When set, the detailed report uses these pictures. Seal summaries ignore them. */
  imagesBySeal?: ReadonlyMap<string, readonly PassageCaptureImage[]>;
}): Uint8Array {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: false });
  const captures = cellsFromSchema(args.schema);
  const showImages = sessionCaptureReportShowsImages(args.kind);
  const byId = new Map(args.points.map((point) => [point.id, point]));

  if (sessionCaptureReportLeadsWithSummary(args.kind)) {
    drawCertificationSummaryPage(doc, args.summary);
    doc.addPage();
  }

  let y = paintReportHeader(doc, args.kind, args.title, args.manuscriptId);

  const newPage = () => {
    doc.addPage();
    y = paintReportHeader(doc, args.kind, args.title, args.manuscriptId);
  };
  const room = (need: number) => {
    if (y + need > REPORT_BOTTOM) newPage();
  };
  const writeLines = (lines: string[], size: number, leading: number, weight: 'bold' | 'normal' = 'normal') => {
    doc.setFont('times', weight);
    doc.setFontSize(size);
    for (const line of lines) {
      const wrapped = (line ? doc.splitTextToSize(line, REPORT_WIDTH) : ['']) as string[];
      for (const row of wrapped) {
        room(leading);
        if (row) doc.text(row, REPORT_MARGIN, y);
        y += leading;
      }
    }
  };

  const drawJpeg = (dataUrl: string, width: number, height: number, maxH: number) => {
    const box = fitReportImage(width || REPORT_WIDTH, height || maxH, REPORT_WIDTH, maxH);
    room(box.height + 8);
    if (dataUrl) {
      try {
        doc.addImage(dataUrl, 'JPEG', REPORT_MARGIN, y, box.width, box.height);
      } catch {
        doc.setDrawColor(160);
        doc.rect(REPORT_MARGIN, y, box.width, box.height);
        doc.setFont('times', 'normal');
        doc.setFontSize(9);
        doc.text('Picture unavailable', REPORT_MARGIN + 8, y + 16);
      }
    } else {
      doc.setDrawColor(160);
      doc.rect(REPORT_MARGIN, y, box.width, Math.min(box.height, 72));
    }
    y += box.height + 12;
  };

  if (args.kind === 'detailed') {
    const images = args.imagesBySeal ?? imagesBySealFromSchema(args.schema);
    if (args.points.length === 0) {
      writeLines(['No sealed passages were included.'], 12, 16);
      return new Uint8Array(doc.output('arraybuffer'));
    }
    args.points.forEach((point, index) => {
      if (index > 0) {
        room(16);
        doc.setDrawColor(180);
        doc.setLineWidth(0.6);
        doc.line(REPORT_MARGIN, y, REPORT_MARGIN + REPORT_WIDTH, y);
        y += 14;
      }
      writeLines(detailedSealText(point), 9, 12);
      y += 4;
      const pictures = (images.get(point.id) ?? []).filter((image) => image.dataUrl.startsWith('data:image/'));
      for (const picture of pictures) {
        writeLines([`${passageImageLabel(picture.kind)} · ${formatExportDateTime(picture.at)}`], 9, 12, 'bold');
        y += 4;
        drawJpeg(picture.dataUrl, picture.width, picture.height, 220);
      }
      y += 8;
    });
    return new Uint8Array(doc.output('arraybuffer'));
  }

  if (captures.length === 0) {
    writeLines(
      ['No session pictures are stored for this manuscript yet. Press Start on the session bar after the camera or the screen is on.'],
      12,
      16,
    );
    return new Uint8Array(doc.output('arraybuffer'));
  }

  captures.forEach((cell, index) => {
    if (index > 0) {
      room(16);
      doc.setDrawColor(180);
      doc.setLineWidth(0.6);
      doc.line(REPORT_MARGIN, y, REPORT_MARGIN + REPORT_WIDTH, y);
      y += 14;
    }
    writeLines(
      [
        `${reasonLabel(cell.reason)} · ${formatExportDateTime(cell.at)}`,
        `Window ${formatExportDateTime(cell.windowStart)} to ${formatExportDateTime(cell.windowEnd)}`,
      ],
      10,
      13,
      'bold',
    );
    y += 4;

    if (showImages) drawJpeg(cell.dataUrl ?? '', cell.width ?? REPORT_WIDTH, cell.height ?? 150, 150);

    if (cell.seals.length === 0) {
      writeLines(['No seals in this window.'], 10, 13);
      y += 8;
      return;
    }

    writeLines([args.kind === 'detailed' ? 'Certification details' : 'Seal summary'], 9, 12, 'bold');
    y += 2;
    for (const seal of cell.seals) {
      const point = byId.get(seal.id);
      const lines = args.kind === 'detailed' && point ? detailedSealText(point) : sealSummaryText(seal);
      writeLines(lines, 9, 12);
      y += 8;
    }
  });

  return new Uint8Array(doc.output('arraybuffer'));
}
