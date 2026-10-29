/**
 * Optional writing-session pictures.
 *
 * Camera and screen stay off until the writer turns the setting on.
 * A capture runs at session start, every five minutes, and session end.
 * The stored file is one JPEG: a moderate-resolution screenshot with the
 * camera drawn in the upper left. The certification record includes that
 * composite only while the setting is on. The manuscript export does not.
 *
 * The writer chooses how long the allow lasts. This writing session keeps
 * the devices open until the session ends, then asks again next time.
 * Remember on this device keeps the allow for later sessions. Neither
 * choice asks again for every picture.
 */

export const SESSION_CAPTURE_SETTINGS_KEY = 'humanuscript.sessionCapture.v1';
export const WRITING_SESSION_KEY = 'humanuscript.writingSession.v1';
export const SESSION_CAPTURE_DB = 'humanuscript.sessionCaptures.v1';
export const SESSION_STORE = 'sessions';
/** IndexedDB object store. Each record is one composite JPEG, not a separate thumbnail. */
export const THUMBNAIL_STORE = 'thumbnails';

export const CAPTURE_INTERVAL_MS = 5 * 60 * 1000;
export const CAPTURE_INTERVAL_MINUTES = 5;
export const COMPOSITE_MAX_WIDTH = 1280;
export const COMPOSITE_MAX_HEIGHT = 720;
export const COMPOSITE_JPEG_QUALITY = 0.72;
export const CAMERA_OVERLAY_MAX_WIDTH = 240;
export const CAMERA_OVERLAY_MAX_HEIGHT = 135;
export const CAMERA_OVERLAY_MARGIN = 12;
export const CAMERA_OVERLAY_WIDTH_RATIO = 0.28;
export const CAMERA_OVERLAY_HEIGHT_RATIO = 0.34;

export const SESSION_CAPTURE_CONSENT =
  'A session picture is stored only after the writer turns the setting on and allows the camera and screen for this writing session, or remembers that allow on this device. The stored file is the screenshot with the camera in the upper left.';

export type CaptureKind = 'composite';
/** Older captures stored the camera and the screen as separate files. Those are not exported. */
export type StoredCaptureKind = CaptureKind | 'camera' | 'screenshot';
export type CaptureReason = 'start' | 'interval' | 'end';
/** How long an allow lasts. Session asks again next writing session. Permanent is remembered on this device. */
export type CapturePermissionDuration = 'session' | 'permanent';
export type CaptureGrantMode = 'off' | CapturePermissionDuration;

export interface SessionCaptureSettings {
  /** Device camera. Off until the writer turns it on. */
  camera: boolean;
  /** Screen. Off until the writer turns it on. */
  screenshot: boolean;
  /** Applies when camera or screen is on. Defaults to this writing session. */
  permission: CapturePermissionDuration;
}

export interface CaptureGrantRequest {
  camera: CaptureGrantMode;
  screen: CaptureGrantMode;
}

export interface WritingSessionState {
  id: string;
  bookId: string;
  manuscriptId: string;
  startedAt: string;
  /** When the last capture attempt finished (saved or declined). */
  lastAttemptAt: string;
  /** End of the last window that actually stored a picture. */
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

export interface StoppableTrack {
  stop(): void;
  readyState?: string;
}

export interface StoppableStream {
  getTracks(): StoppableTrack[];
}

export interface CompositeSchema {
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
  composite?: CompositeSchema;
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
  permission: CapturePermissionDuration;
  intervalMinutes: 5;
  composite: { maxWidth: number; maxHeight: number; mime: 'image/jpeg' };
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
  kind: StoredCaptureKind;
  windowStart: string;
  windowEnd: string;
  mime: 'image/jpeg';
  width: number;
  height: number;
  dataUrl: string;
}

export function defaultSessionCaptureSettings(): SessionCaptureSettings {
  return { camera: false, screenshot: false, permission: 'session' };
}

/** Only a boolean true turns a capture on. Only the string "permanent" is remembered. */
export function normalizeSessionCaptureSettings(value: unknown): SessionCaptureSettings {
  if (!value || typeof value !== 'object') return defaultSessionCaptureSettings();
  const record = value as Record<string, unknown>;
  return {
    camera: record.camera === true,
    screenshot: record.screenshot === true,
    permission: record.permission === 'permanent' ? 'permanent' : 'session',
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

/** What the desktop shell should remember. Off devices are not granted. */
export function captureGrantRequest(settings: SessionCaptureSettings): CaptureGrantRequest {
  const duration: CapturePermissionDuration = settings.permission === 'permanent' ? 'permanent' : 'session';
  return {
    camera: settings.camera ? duration : 'off',
    screen: settings.screenshot ? duration : 'off',
  };
}

/** Fit inside the max box. Never enlarges. */
export function fitWithin(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const width = Math.max(1, srcWidth || maxWidth);
  const height = Math.max(1, srcHeight || maxHeight);
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Camera thumbnail drawn on the screenshot. Upper left, inset by the margin,
 * and never larger than the overlay cap or the given fraction of the frame.
 */
export function cameraOverlayRect(
  frameWidth: number,
  frameHeight: number,
  cameraWidth: number,
  cameraHeight: number,
): { x: number; y: number; width: number; height: number } {
  const maxWidth = Math.min(CAMERA_OVERLAY_MAX_WIDTH, Math.max(1, Math.round(frameWidth * CAMERA_OVERLAY_WIDTH_RATIO)));
  const maxHeight = Math.min(CAMERA_OVERLAY_MAX_HEIGHT, Math.max(1, Math.round(frameHeight * CAMERA_OVERLAY_HEIGHT_RATIO)));
  const size = fitWithin(cameraWidth, cameraHeight, maxWidth, maxHeight);
  return {
    x: CAMERA_OVERLAY_MARGIN,
    y: CAMERA_OVERLAY_MARGIN,
    width: size.width,
    height: size.height,
  };
}

export function isPermissionDenial(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name;
  return name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'AbortError' || name === 'SecurityError';
}

function streamIsLive(stream: StoppableStream | null): boolean {
  if (!stream) return false;
  const tracks = stream.getTracks();
  if (tracks.length === 0) return false;
  return tracks.some((track) => track.readyState === undefined || track.readyState === 'live');
}

/**
 * Reuse a camera or screen stream for the permission the writer chose.
 * Opens only when `allowed` is true and no live stream is already held.
 * A denial returns null. The new stream is stopped if the setting flips off
 * while the prompt is open. The caller stops the held stream when the
 * writing session ends, or immediately when the permission is session-only
 * and the session ends.
 */
export async function holdConsentedStream<T extends StoppableStream>(args: {
  allowed: () => boolean;
  current: T | null;
  open: () => Promise<T>;
}): Promise<T | null> {
  if (!args.allowed()) {
    if (args.current) {
      for (const track of args.current.getTracks()) track.stop();
    }
    return null;
  }
  if (streamIsLive(args.current)) return args.current;
  let stream: T;
  try {
    stream = await args.open();
  } catch (error) {
    if (isPermissionDenial(error)) return null;
    throw error;
  }
  if (!args.allowed()) {
    for (const track of stream.getTracks()) track.stop();
    return null;
  }
  return stream;
}

/**
 * One composite for this moment. Does not call `grab` when pictures are off.
 * The grabber is expected to reuse streams already granted for this permission.
 */
export async function captureSessionComposite(
  read: () => SessionCaptureSettings,
  grab: () => Promise<StillImage | null>,
): Promise<{ image: StillImage | null; failure: string | null }> {
  if (!sessionCaptureConfigured(read())) return { image: null, failure: null };
  try {
    const image = await grab();
    if (!sessionCaptureConfigured(read())) return { image: null, failure: null };
    return { image, failure: null };
  } catch (error) {
    return {
      image: null,
      failure: error instanceof Error ? error.message : 'The session picture failed.',
    };
  }
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
 * Certification schema for session pictures.
 * Returns null when neither the camera nor the screen is turned on, so the
 * downloaded certification record omits the field entirely.
 * Separate camera or screenshot files are ignored. Only a composite is included.
 *
 * PDF reports pass `includeStored` so pictures already in IndexedDB can be
 * downloaded after the setting is turned off. That flag does not change the
 * stored JPEG, the hash, or the seal fields copied into each window.
 */
export function buildSessionCaptureSchema(args: {
  settings: SessionCaptureSettings;
  manuscriptId: string;
  sessions: CaptureSessionInput[];
  thumbnails: CaptureThumbnailInput[];
  points: SealSource[];
  includeStored?: boolean;
}): SessionCaptureSchema | null {
  const settings = normalizeSessionCaptureSettings(args.settings);
  if (!sessionCaptureConfigured(settings) && args.includeStored !== true) return null;

  const sessions = args.sessions
    .filter((session) => session.manuscriptId === args.manuscriptId)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const thumbs = args.thumbnails.filter((thumb) => {
    if (thumb.kind !== 'composite') return false;
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
    const grouped = new Map<string, CaptureThumbnailInput>();
    for (const thumb of bySession.get(session.id) ?? []) {
      const key = momentKey(thumb);
      if (!grouped.has(key)) grouped.set(key, thumb);
    }
    const captures: SessionCaptureMoment[] = [...grouped.values()]
      .sort((a, b) => a.windowEnd.localeCompare(b.windowEnd) || a.at.localeCompare(b.at))
      .map((shot) => ({
        at: shot.at,
        reason: shot.reason,
        windowStart: shot.windowStart,
        windowEnd: shot.windowEnd,
        composite: compositeSchema(shot),
        seals: sealsInWindow(args.points, shot.windowStart, shot.windowEnd),
      }));
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
    permission: settings.permission,
    intervalMinutes: CAPTURE_INTERVAL_MINUTES,
    composite: {
      maxWidth: COMPOSITE_MAX_WIDTH,
      maxHeight: COMPOSITE_MAX_HEIGHT,
      mime: 'image/jpeg',
    },
    consent: SESSION_CAPTURE_CONSENT,
    sessions: schemaSessions,
  };
}

function compositeSchema(shot: CaptureThumbnailInput): CompositeSchema {
  return {
    fileId: shot.id,
    mime: 'image/jpeg',
    width: shot.width,
    height: shot.height,
    dataUrl: shot.dataUrl,
  };
}

/** Letter page. Two composites across and three down: six per page. */
export const CAPTURE_PAGE = {
  pageWidth: 612,
  pageHeight: 792,
  margin: 28,
  headerHeight: 62,
  columns: 2,
  rows: 3,
  columnGap: 12,
  rowGap: 10,
  imageMaxHeight: 104,
} as const;

export const CAPTURES_PER_PAGE = CAPTURE_PAGE.columns * CAPTURE_PAGE.rows;

export interface CaptureGridCell {
  compositeId: string;
  reason: CaptureReason;
  at: string;
  windowStart: string;
  windowEnd: string;
  seals: SealWindowMeta[];
  dataUrl?: string;
  width?: number;
  height?: number;
}

export interface PlannedCaptureCell extends CaptureGridCell {
  column: number;
  row: number;
}

export interface PlannedCapturePage {
  cells: PlannedCaptureCell[];
}

export function captureCellSize(page = CAPTURE_PAGE): { width: number; height: number } {
  const width = (page.pageWidth - page.margin * 2 - page.columnGap * (page.columns - 1)) / page.columns;
  const usable = page.pageHeight - page.margin * 2 - page.headerHeight - page.rowGap * (page.rows - 1);
  return { width, height: usable / page.rows };
}

/**
 * Letter pages hold six composites: two across, three down.
 * Each cell keeps the certification details for its window. Those details
 * are drawn under the picture, and a cell does not split onto the next page.
 */
export function planCapturePages(cells: CaptureGridCell[], page = CAPTURE_PAGE): PlannedCapturePage[] {
  const perPage = page.columns * page.rows;
  const pages: PlannedCapturePage[] = [];
  for (let index = 0; index < cells.length; index += perPage) {
    const slice = cells.slice(index, index + perPage);
    pages.push({
      cells: slice.map((cell, offset) => ({
        ...cell,
        column: offset % page.columns,
        row: Math.floor(offset / page.columns),
      })),
    });
  }
  return pages;
}

export function cellsFromSchema(schema: SessionCaptureSchema): CaptureGridCell[] {
  const cells: CaptureGridCell[] = [];
  for (const session of schema.sessions) {
    for (const capture of session.captures) {
      if (!capture.composite) continue;
      cells.push({
        compositeId: capture.composite.fileId,
        reason: capture.reason,
        at: capture.at,
        windowStart: capture.windowStart,
        windowEnd: capture.windowEnd,
        seals: capture.seals,
        dataUrl: capture.composite.dataUrl,
        width: capture.composite.width,
        height: capture.composite.height,
      });
    }
  }
  return cells;
}

export function captureDocumentHeader(title: string, manuscriptId: string): string[] {
  return [
    'HuManuScript session capture',
    title,
    'Screenshot with the camera in the upper left. Certification details for that window are under each picture.',
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

export type PassageImageKind = 'screenshot' | 'camera' | 'composite';

/** A stored JPEG tied to the seals updated in its capture window. Not part of a seal hash. */
export interface PassageCaptureImage {
  kind: PassageImageKind;
  at: string;
  width: number;
  height: number;
  dataUrl: string;
}

const PASSAGE_IMAGE_ORDER: Record<PassageImageKind, number> = {
  screenshot: 0,
  camera: 1,
  composite: 2,
};

export function passageImageLabel(kind: PassageImageKind): string {
  if (kind === 'camera') return 'Camera photo';
  if (kind === 'screenshot') return 'Screenshot';
  return 'Screenshot with the camera in the upper left';
}

function isPassageImageKind(kind: StoredCaptureKind): kind is PassageImageKind {
  return kind === 'screenshot' || kind === 'camera' || kind === 'composite';
}

/**
 * Pictures for each seal whose text was updated in that picture's window.
 * A composite is the screenshot with the camera photo in the upper left, and
 * it stands in for separate files from the same window. Older captures that
 * stored a screenshot and a camera photo separately keep both. Seal hashes
 * are not read or rewritten.
 */
export function imagesWithSeals(
  thumbnails: CaptureThumbnailInput[],
  points: SealSource[],
): Map<string, PassageCaptureImage[]> {
  const windows = new Map<string, CaptureThumbnailInput[]>();
  for (const thumb of thumbnails) {
    if (!isPassageImageKind(thumb.kind) || !thumb.dataUrl.startsWith('data:image/')) continue;
    const key = `${thumb.sessionId}|${thumb.windowStart}|${thumb.windowEnd}`;
    const list = windows.get(key) ?? [];
    list.push(thumb);
    windows.set(key, list);
  }

  const bySeal = new Map<string, PassageCaptureImage[]>();
  for (const shots of windows.values()) {
    const sample = shots[0];
    if (!sample) continue;
    const seals = sealsInWindow(points, sample.windowStart, sample.windowEnd);
    if (seals.length === 0) continue;
    const hasComposite = shots.some((shot) => shot.kind === 'composite');
    const chosen = shots.filter((shot) =>
      hasComposite ? shot.kind === 'composite' : shot.kind === 'screenshot' || shot.kind === 'camera',
    );
    chosen.sort(
      (a, b) =>
        a.at.localeCompare(b.at) ||
        PASSAGE_IMAGE_ORDER[a.kind as PassageImageKind] - PASSAGE_IMAGE_ORDER[b.kind as PassageImageKind],
    );
    for (const seal of seals) {
      const images = bySeal.get(seal.id) ?? [];
      for (const shot of chosen) {
        if (!isPassageImageKind(shot.kind)) continue;
        images.push({
          kind: shot.kind,
          at: shot.at,
          width: shot.width,
          height: shot.height,
          dataUrl: shot.dataUrl,
        });
      }
      bySeal.set(seal.id, images);
    }
  }

  for (const images of bySeal.values()) {
    images.sort((a, b) => a.at.localeCompare(b.at) || PASSAGE_IMAGE_ORDER[a.kind] - PASSAGE_IMAGE_ORDER[b.kind]);
  }
  return bySeal;
}

/** One download from the certification pane. The writer picks exactly one. */
export type SessionCaptureReportKind = 'detailed' | 'summary' | 'seals';

export const SESSION_CAPTURE_REPORTS: readonly {
  kind: SessionCaptureReportKind;
  label: string;
  detail: string;
}[] = [
  {
    kind: 'detailed',
    label: 'Detailed certification report',
    detail:
      'Each sealed passage is one record, with the screenshots and camera photos from that passage. A one-page summary leads.',
  },
  {
    kind: 'summary',
    label: 'High-level summary',
    detail: 'Pictures and seal summaries only. Shorter than the detailed report.',
  },
  {
    kind: 'seals',
    label: 'Seal summaries only',
    detail: 'Seal summaries for each window. No pictures.',
  },
];

export function sessionCaptureReportShowsImages(kind: SessionCaptureReportKind): boolean {
  return kind !== 'seals';
}

export function sessionCaptureReportLeadsWithSummary(kind: SessionCaptureReportKind): boolean {
  return kind === 'detailed';
}
