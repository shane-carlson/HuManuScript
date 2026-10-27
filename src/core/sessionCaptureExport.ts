/**
 * Separate session-capture document. This is not the certification summary
 * that leads a manuscript export.
 *
 * Each page holds six composites: two across and three down. The certification
 * details for that window sit under the picture.
 */

import { jsPDF } from 'jspdf';
import { formatExportDateTime } from './certificationPage.ts';
import {
  CAPTURE_PAGE,
  captureCellSize,
  captureDocumentHeader,
  cellsFromSchema,
  planCapturePages,
  type PlannedCaptureCell,
  type SealWindowMeta,
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
