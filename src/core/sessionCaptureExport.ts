/**
 * Separate session-capture document. This is not the certification summary
 * that leads a manuscript export.
 */

import { jsPDF } from 'jspdf';
import { formatExportDateTime } from './certificationPage.ts';
import {
  CAPTURE_PAGE,
  captureColumnWidth,
  captureDocumentHeader,
  cellsFromSchema,
  planCapturePages,
  type CaptureGridCell,
  type PlannedSealCell,
  type SessionCaptureSchema,
} from './sessionCapture.ts';

export function sessionCaptureFilename(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'untitled-manuscript'}-session-capture.pdf`;
}

function reasonLabel(reason: CaptureGridCell['reason']): string {
  if (reason === 'start') return 'Session start';
  if (reason === 'end') return 'Session end';
  return 'Every 5 minutes';
}

function kindLabel(kind: CaptureGridCell['kind']): string {
  return kind === 'camera' ? 'Camera' : 'Screenshot';
}

function fitBox(srcW: number, srcH: number, maxW: number, maxH: number): { width: number; height: number } {
  const width = Math.max(1, srcW || maxW);
  const height = Math.max(1, srcH || maxH);
  const scale = Math.min(maxW / width, maxH / height);
  return { width: width * scale, height: height * scale };
}

function drawHeader(doc: jsPDF, title: string, manuscriptId: string): void {
  const lines = captureDocumentHeader(title, manuscriptId);
  let y = CAPTURE_PAGE.margin + 4;
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text(lines[0]!, CAPTURE_PAGE.margin, y);
  y += 16;
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  doc.text(lines[1]!, CAPTURE_PAGE.margin, y);
  y += 13;
  doc.setFontSize(8);
  const wrapped = doc.splitTextToSize(lines[2]!, CAPTURE_PAGE.pageWidth - CAPTURE_PAGE.margin * 2);
  doc.text(wrapped, CAPTURE_PAGE.margin, y);
  y += wrapped.length * 10;
  doc.setFontSize(8);
  doc.text(lines[3]!, CAPTURE_PAGE.margin, y);
}

function drawThumb(doc: jsPDF, cell: CaptureGridCell, x: number, y: number, colW: number): void {
  const box = fitBox(cell.width ?? colW, cell.height ?? CAPTURE_PAGE.thumbHeight, colW, CAPTURE_PAGE.thumbHeight);
  if (cell.dataUrl) {
    try {
      doc.addImage(cell.dataUrl, 'JPEG', x, y, box.width, box.height);
    } catch {
      doc.setDrawColor(180);
      doc.rect(x, y, colW, CAPTURE_PAGE.thumbHeight);
    }
  } else {
    doc.setDrawColor(180);
    doc.rect(x, y, colW, CAPTURE_PAGE.thumbHeight);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const captionY = y + CAPTURE_PAGE.thumbHeight + 10;
  doc.text(`${kindLabel(cell.kind)} · ${reasonLabel(cell.reason)}`, x, captionY);
  doc.text(formatExportDateTime(cell.at), x, captionY + 9);
}

function drawSeal(doc: jsPDF, cell: PlannedSealCell, x: number, y: number, colW: number, height: number): void {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  const bottom = y + height - 2;
  if (cell.empty) {
    doc.text('No seals in this window.', x, y + 8);
    return;
  }
  if (!cell.seal) return;
  const origin = cell.seal.origin === 'dictation' ? 'Dictation' : 'Keyboard';
  const lines = [
    `${origin} · updated ${formatExportDateTime(cell.seal.updatedAt)}`,
    `Sealed ${formatExportDateTime(cell.seal.sealedAt)}`,
    ...doc.splitTextToSize(cell.seal.contentHash, colW),
    `Seal ${cell.seal.id}`,
    `Block ${cell.seal.blockId}`,
  ];
  let cursor = y + 8;
  for (const line of lines) {
    if (cursor > bottom) break;
    doc.text(String(line), x, cursor);
    cursor += 8;
  }
}

function drawEmptyState(doc: jsPDF): void {
  const y = CAPTURE_PAGE.margin + CAPTURE_PAGE.headerHeight + 8;
  doc.setFont('times', 'normal');
  doc.setFontSize(12);
  const message = doc.splitTextToSize(
    'No session thumbnails are stored for this manuscript. A picture is taken at the start, every five minutes, and at the end only while camera pictures or screenshots are turned on, and only after you allow the browser or system prompt.',
    CAPTURE_PAGE.pageWidth - CAPTURE_PAGE.margin * 2,
  );
  doc.text(message, CAPTURE_PAGE.margin, y);
}

/** Letter-size PDF. Four thumbnails across, as many rows as fit, seal metadata only. */
export function renderSessionCapturePdf(args: {
  title: string;
  manuscriptId: string;
  schema: SessionCaptureSchema;
}): Uint8Array {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const cells = cellsFromSchema(args.schema);
  const pages = planCapturePages(cells);
  const planned = pages.length > 0 ? pages : [{ rows: [] }];
  const colW = captureColumnWidth();

  planned.forEach((page, index) => {
    if (index > 0) doc.addPage();
    drawHeader(doc, args.title, args.manuscriptId);
    if (page.rows.length === 0) {
      drawEmptyState(doc);
      return;
    }
    let y = CAPTURE_PAGE.margin + CAPTURE_PAGE.headerHeight;
    for (const row of page.rows) {
      if (row.type === 'thumbs') {
        row.cells.forEach((cell, column) => {
          const x = CAPTURE_PAGE.margin + column * (colW + CAPTURE_PAGE.columnGap);
          drawThumb(doc, cell, x, y, colW);
        });
      } else {
        row.cells.forEach((cell, column) => {
          const x = CAPTURE_PAGE.margin + column * (colW + CAPTURE_PAGE.columnGap);
          drawSeal(doc, cell, x, y, colW, row.height);
        });
      }
      y += row.height;
    }
  });

  return new Uint8Array(doc.output('arraybuffer'));
}
