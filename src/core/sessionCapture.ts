/**
 * Optional writing-session pictures.
 *
 * Camera stills and screenshots stay off until the writer turns the setting on.
 * Capture runs at session start, every five minutes, and session end.
 * Thumbnails are low-resolution JPEGs. The certification record includes them
 * only while that setting is on. The manuscript export does not.
 */

export const SESSION_CAPTURE_SETTINGS_KEY = 'humanuscript.sessionCapture.v1';
export const WRITING_SESSION_KEY = 'humanuscript.writingSession.v1';
export const SESSION_CAPTURE_DB = 'humanuscript.sessionCaptures.v1';
export const SESSION_STORE = 'sessions';
export const THUMBNAIL_STORE = 'thumbnails';

export const CAPTURE_INTERVAL_MS = 5 * 60 * 1000;
export const CAPTURE_INTERVAL_MINUTES = 5;
export const THUMBNAIL_MAX_WIDTH = 240;
export const THUMBNAIL_MAX_HEIGHT = 135;
export const THUMBNAIL_JPEG_QUALITY = 0.55;

export const SESSION_CAPTURE_CONSENT =
  'Camera and screen thumbnails are stored only after the writer turns the setting on and allows the browser or system permission prompt.';

export type CaptureKind = 'camera' | 'screenshot';
export type CaptureReason = 'start' | 'interval' | 'end';

export interface SessionCaptureSettings {
  /** Device-camera still. Off until the writer turns it on. */
  camera: boolean;
  /** Screen still. Off until the writer turns it on. */
  screenshot: boolean;
}

export interface WritingSessionState {
  id: string;
  bookId: string;
  manuscriptId: string;
  startedAt: string;
  /** When the last capture attempt finished (saved or declined). */
  lastAttemptAt: string;
  /** End of the last window that actually stored a thumbnail. */
  lastWindowEnd: string;
  endedAt: string | null;
}

export interface SealSource {
  id: string;
  blockId: string;
  contentHash: string;
  origin: 'keyboard' | 'dictation';
  sealedAt: string;
  updatedAt: string;
}

/** Seal fields for one time window. Not the passage text, evidence, or prior hashes. */
export interface SealWindowMeta {
  id: string;
  blockId: string;
  contentHash: string;
  origin: 'keyboard' | 'dictation';
  sealedAt: string;
  updatedAt: string;
}

export interface StillImage {
  blob: Blob;
  width: number;
  height: number;
  mime: 'image/jpeg';
}

export interface StoppableStream {
  getTracks(): Array<{ stop(): void }>;
}

export interface ThumbnailSchema {
  fileId: string;
  mime: 'image/jpeg';
  width: number;
  height: number;
  dataUrl: string;
}

export interface SessionCaptureMoment {
  at: string;
  reason: CaptureReason;
  windowStart: string;
  windowEnd: string;
  cameraThumbnail?: ThumbnailSchema;
  screenshotThumbnail?: ThumbnailSchema;
  seals: SealWindowMeta[];
}

export interface SessionCaptureSchemaSession {
  id: string;
  manuscriptId: string;
  startedAt: string;
  endedAt: string | null;
  captures: SessionCaptureMoment[];
}

export interface SessionCaptureSchema {
  camera: boolean;
  screenshot: boolean;
  intervalMinutes: 5;
  thumbnail: { maxWidth: number; maxHeight: number; mime: 'image/jpeg' };
  consent: string;
  sessions: SessionCaptureSchemaSession[];
}

export interface CaptureSessionInput {
  id: string;
  manuscriptId: string;
  startedAt: string;
  endedAt: string | null;
}

export interface CaptureThumbnailInput {
  id: string;
  sessionId: string;
  at: string;
  reason: CaptureReason;
  kind: CaptureKind;
  windowStart: string;
  windowEnd: string;
  mime: 'image/jpeg';
  width: number;
  height: number;
  dataUrl: string;
}

export function defaultSessionCaptureSettings(): SessionCaptureSettings {
  return { camera: false, screenshot: false };
}

/** Only a boolean true turns a capture on. Missing and other truthy values stay off. */
export function normalizeSessionCaptureSettings(value: unknown): SessionCaptureSettings {
  if (!value || typeof value !== 'object') return defaultSessionCaptureSettings();
  const record = value as Record<string, unknown>;
  return {
    camera: record.camera === true,
    screenshot: record.screenshot === true,
  };
}

export function readSessionCaptureSettings(raw: string | null): SessionCaptureSettings {
  if (!raw) return defaultSessionCaptureSettings();
  try {
    return normalizeSessionCaptureSettings(JSON.parse(raw));
  } catch {
    return defaultSessionCaptureSettings();
  }
}

export function sessionCaptureConfigured(settings: SessionCaptureSettings): boolean {
  return settings.camera || settings.screenshot;
}

export function thumbnailSize(
  srcWidth: number,
  srcHeight: number,
  maxWidth = THUMBNAIL_MAX_WIDTH,
  maxHeight = THUMBNAIL_MAX_HEIGHT,
): { width: number; height: number } {
  const width = Math.max(1, srcWidth || maxWidth);
  const height = Math.max(1, srcHeight || maxHeight);
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function isPermissionDenial(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name;
  return name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'AbortError' || name === 'SecurityError';
}

/**
 * Open a camera or screen stream only when `allowed` is true, then release it.
 * A denial returns null. The stream is stopped even when the setting flips off
 * while the prompt is open.
 */
export async function grabConsentedStill<T extends StoppableStream>(args: {
  allowed: () => boolean;
  open: () => Promise<T>;
  draw: (stream: T) => Promise<StillImage>;
}): Promise<StillImage | null> {
  if (!args.allowed()) return null;
  let stream: T;
  try {
    stream = await args.open();
  } catch (error) {
    if (isPermissionDenial(error)) return null;
    throw error;
  }
  try {
    if (!args.allowed()) return null;
    return await args.draw(stream);
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}

export async function captureEnabledStills(
  read: () => SessionCaptureSettings,
  grab: {
    camera: () => Promise<StillImage | null>;
    screenshot: () => Promise<StillImage | null>;
  },
): Promise<{ stills: Array<{ kind: CaptureKind; image: StillImage }>; failures: string[] }> {
  const stills: Array<{ kind: CaptureKind; image: StillImage }> = [];
  const failures: string[] = [];
  if (!sessionCaptureConfigured(read())) return { stills, failures };

  if (read().camera) {
    try {
      const image = await grab.camera();
      if (image && read().camera) stills.push({ kind: 'camera', image });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'The camera thumbnail failed.');
    }
  }
  if (read().screenshot) {
    try {
      const image = await grab.screenshot();
      if (image && read().screenshot) stills.push({ kind: 'screenshot', image });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'The screenshot thumbnail failed.');
    }
  }
  return { stills, failures };
}

/** Next five-minute boundary after the last attempt. Null when that moment has not arrived. */
export function nextIntervalDue(
  session: { startedAt: string; lastAttemptAt: string },
  nowMs: number,
): string | null {
  const start = Date.parse(session.startedAt);
  const last = Date.parse(session.lastAttemptAt);
  if (!Number.isFinite(start) || !Number.isFinite(last)) return null;
  const nextSlot = Math.floor((last - start) / CAPTURE_INTERVAL_MS) + 1;
  if (nextSlot < 1) return null;
  const boundary = start + nextSlot * CAPTURE_INTERVAL_MS;
  if (nowMs < boundary) return null;
  return new Date(boundary).toISOString();
}

export function nextCaptureAt(session: { startedAt: string; lastAttemptAt: string }): string {
  const start = Date.parse(session.startedAt);
  const last = Date.parse(session.lastAttemptAt);
  if (!Number.isFinite(start) || !Number.isFinite(last)) return session.startedAt;
  const nextSlot = Math.floor((last - start) / CAPTURE_INTERVAL_MS) + 1;
  return new Date(start + Math.max(1, nextSlot) * CAPTURE_INTERVAL_MS).toISOString();
}

/** Seals whose text was updated inside (windowStart, windowEnd]. */
export function sealsInWindow(points: SealSource[], windowStart: string, windowEnd: string): SealWindowMeta[] {
  const start = Date.parse(windowStart);
  const end = Date.parse(windowEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const seals: SealWindowMeta[] = [];
  for (const point of points) {
    const updated = Date.parse(point.updatedAt);
    if (!Number.isFinite(updated) || updated <= start || updated > end) continue;
    seals.push({
      id: point.id,
      blockId: point.blockId,
      contentHash: point.contentHash,
      origin: point.origin,
      sealedAt: point.sealedAt,
      updatedAt: point.updatedAt,
    });
  }
  return seals;
}

function momentKey(thumb: CaptureThumbnailInput): string {
  return `${thumb.sessionId}|${thumb.reason}|${thumb.windowStart}|${thumb.windowEnd}`;
}

/**
 * Certification schema for session thumbnails.
 * Returns null when neither pictures nor screenshots are turned on, so the
 * downloaded certification record omits the field entirely.
 */
export function buildSessionCaptureSchema(args: {
  settings: SessionCaptureSettings;
  manuscriptId: string;
  sessions: CaptureSessionInput[];
  thumbnails: CaptureThumbnailInput[];
  points: SealSource[];
}): SessionCaptureSchema | null {
  const settings = normalizeSessionCaptureSettings(args.settings);
  if (!sessionCaptureConfigured(settings)) return null;

  const sessions = args.sessions
    .filter((session) => session.manuscriptId === args.manuscriptId)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const thumbs = args.thumbnails.filter((thumb) => {
    if (thumb.kind === 'camera' && !settings.camera) return false;
    if (thumb.kind === 'screenshot' && !settings.screenshot) return false;
    return sessions.some((session) => session.id === thumb.sessionId);
  });

  const bySession = new Map<string, CaptureThumbnailInput[]>();
  for (const thumb of thumbs) {
    const list = bySession.get(thumb.sessionId) ?? [];
    list.push(thumb);
    bySession.set(thumb.sessionId, list);
  }

  const schemaSessions: SessionCaptureSchemaSession[] = [];
  for (const session of sessions) {
    const grouped = new Map<string, CaptureThumbnailInput[]>();
    for (const thumb of bySession.get(session.id) ?? []) {
      const list = grouped.get(momentKey(thumb)) ?? [];
      list.push(thumb);
      grouped.set(momentKey(thumb), list);
    }
    const captures: SessionCaptureMoment[] = [...grouped.values()]
      .sort((a, b) => a[0]!.windowEnd.localeCompare(b[0]!.windowEnd) || a[0]!.at.localeCompare(b[0]!.at))
      .map((group) => {
        const first = group[0]!;
        const camera = group.find((thumb) => thumb.kind === 'camera');
        const screenshot = group.find((thumb) => thumb.kind === 'screenshot');
        const moment: SessionCaptureMoment = {
          at: first.at,
          reason: first.reason,
          windowStart: first.windowStart,
          windowEnd: first.windowEnd,
          seals: sealsInWindow(args.points, first.windowStart, first.windowEnd),
        };
        if (camera) moment.cameraThumbnail = thumbnailSchema(camera);
        if (screenshot) moment.screenshotThumbnail = thumbnailSchema(screenshot);
        return moment;
      });
    if (captures.length === 0) continue;
    schemaSessions.push({
      id: session.id,
      manuscriptId: session.manuscriptId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      captures,
    });
  }

  return {
    camera: settings.camera,
    screenshot: settings.screenshot,
    intervalMinutes: CAPTURE_INTERVAL_MINUTES,
    thumbnail: {
      maxWidth: THUMBNAIL_MAX_WIDTH,
      maxHeight: THUMBNAIL_MAX_HEIGHT,
      mime: 'image/jpeg',
    },
    consent: SESSION_CAPTURE_CONSENT,
    sessions: schemaSessions,
  };
}

function thumbnailSchema(thumb: CaptureThumbnailInput): ThumbnailSchema {
  return {
    fileId: thumb.id,
    mime: 'image/jpeg',
    width: thumb.width,
    height: thumb.height,
    dataUrl: thumb.dataUrl,
  };
}

export const CAPTURE_PAGE = {
  pageWidth: 612,
  pageHeight: 792,
  margin: 36,
  headerHeight: 56,
  columns: 4,
  columnGap: 8,
  thumbHeight: 70,
  cellChrome: 28,
  rowGap: 10,
  lineHeight: 12,
  sealBlockHeight: 52,
} as const;

export interface CaptureGridCell {
  thumbnailId: string;
  kind: CaptureKind;
  reason: CaptureReason;
  at: string;
  windowStart: string;
  windowEnd: string;
  seals: SealWindowMeta[];
  dataUrl?: string;
  width?: number;
  height?: number;
}

export interface PlannedSealCell {
  thumbnailId: string;
  seal: SealWindowMeta | null;
  empty: boolean;
}

export type PlannedCaptureRow =
  | { type: 'thumbs'; height: number; cells: CaptureGridCell[] }
  | { type: 'seals'; height: number; cells: PlannedSealCell[] };

export interface PlannedCapturePage {
  rows: PlannedCaptureRow[];
}

export function captureColumnWidth(page = CAPTURE_PAGE): number {
  const gaps = page.columnGap * (page.columns - 1);
  return (page.pageWidth - page.margin * 2 - gaps) / page.columns;
}

/** How many thumbnail rows fit on a page when each window has no seals. */
export function emptyCaptureRowsPerPage(page = CAPTURE_PAGE): number {
  const usable = page.pageHeight - page.margin * 2 - page.headerHeight;
  const row = page.thumbHeight + page.cellChrome + page.rowGap + page.lineHeight;
  return Math.max(1, Math.floor(usable / row));
}

/**
 * Letter pages: four thumbnails across, then the seal metadata for that window.
 * A row moves to the next page when it does not fit. Seal lines continue under
 * the same column when a window has more metadata than the page can hold.
 */
export function planCapturePages(cells: CaptureGridCell[], page = CAPTURE_PAGE): PlannedCapturePage[] {
  const usable = page.pageHeight - page.margin * 2 - page.headerHeight;
  const thumbRowH = page.thumbHeight + page.cellChrome;
  const pages: PlannedCapturePage[] = [];
  let rows: PlannedCaptureRow[] = [];
  let used = 0;

  const flush = () => {
    if (rows.length === 0) return;
    pages.push({ rows });
    rows = [];
    used = 0;
  };

  const place = (row: PlannedCaptureRow) => {
    if (row.height > usable) {
      if (used > 0) flush();
      rows.push(row);
      flush();
      return;
    }
    if (used > 0 && used + row.height > usable) flush();
    rows.push(row);
    used += row.height;
  };

  for (let index = 0; index < cells.length; index += page.columns) {
    const group = cells.slice(index, index + page.columns);
    place({ type: 'thumbs', height: thumbRowH, cells: group });
    const layers = Math.max(1, ...group.map((cell) => cell.seals.length));
    for (let layer = 0; layer < layers; layer += 1) {
      const hasSeal = group.some((cell) => cell.seals.length > layer);
      const last = layer === layers - 1;
      const height = (hasSeal ? page.sealBlockHeight : page.lineHeight) + (last ? page.rowGap : 0);
      place({
        type: 'seals',
        height,
        cells: group.map((cell) => ({
          thumbnailId: cell.thumbnailId,
          seal: cell.seals[layer] ?? null,
          empty: cell.seals.length === 0 && layer === 0,
        })),
      });
    }
  }

  flush();
  return pages;
}

export function cellsFromSchema(schema: SessionCaptureSchema): CaptureGridCell[] {
  const cells: CaptureGridCell[] = [];
  for (const session of schema.sessions) {
    for (const capture of session.captures) {
      const shared = {
        at: capture.at,
        reason: capture.reason,
        windowStart: capture.windowStart,
        windowEnd: capture.windowEnd,
        seals: capture.seals,
      };
      if (capture.cameraThumbnail) {
        cells.push({
          ...shared,
          thumbnailId: capture.cameraThumbnail.fileId,
          kind: 'camera',
          dataUrl: capture.cameraThumbnail.dataUrl,
          width: capture.cameraThumbnail.width,
          height: capture.cameraThumbnail.height,
        });
      }
      if (capture.screenshotThumbnail) {
        cells.push({
          ...shared,
          thumbnailId: capture.screenshotThumbnail.fileId,
          kind: 'screenshot',
          dataUrl: capture.screenshotThumbnail.dataUrl,
          width: capture.screenshotThumbnail.width,
          height: capture.screenshotThumbnail.height,
        });
      }
    }
  }
  return cells;
}

export function captureDocumentHeader(title: string, manuscriptId: string): string[] {
  return [
    'HuManuScript session capture',
    title,
    'Low-resolution thumbnails, with the seal id, content hash, origin, and times for passages written in that window.',
    `Manuscript ${manuscriptId}`,
  ];
}

export function normalizeWritingSession(value: unknown): WritingSessionState | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<WritingSessionState>;
  if (typeof record.id !== 'string' || typeof record.bookId !== 'string' || typeof record.manuscriptId !== 'string') {
    return null;
  }
  if (typeof record.startedAt !== 'string' || typeof record.lastAttemptAt !== 'string' || typeof record.lastWindowEnd !== 'string') {
    return null;
  }
  return {
    id: record.id,
    bookId: record.bookId,
    manuscriptId: record.manuscriptId,
    startedAt: record.startedAt,
    lastAttemptAt: record.lastAttemptAt,
    lastWindowEnd: record.lastWindowEnd,
    endedAt: typeof record.endedAt === 'string' ? record.endedAt : null,
  };
}

export function readWritingSession(raw: string | null): WritingSessionState | null {
  if (!raw) return null;
  try {
    return normalizeWritingSession(JSON.parse(raw));
  } catch {
    return null;
  }
}
