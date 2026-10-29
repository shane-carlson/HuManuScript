/**
 * Merge two HuManuScript installs without rewriting certification seals.
 * The winning manuscript, notes, and points are copied. contentHash is not recomputed.
 */

import type { Book, Library, Series } from './library.ts';
import { parseLibraryRecord } from '../storage.ts';
import {
  MAX_VERSIONS_PER_BOOK,
  emptyVersionLedger,
  type BookVersion,
  type VersionLedger,
} from './versions.ts';

const EPOCH = '1970-01-01T00:00:00.000Z';

export interface SyncClockBook {
  fingerprint: string;
  updatedAt: string;
  /** True after this book has been stored on the account. */
  synced: boolean;
}

export interface SyncClock {
  /** Account this clock was last synced with. A different account starts over. */
  accountId: string | null;
  revision: string | null;
  books: Record<string, SyncClockBook>;
  versionsFingerprint: string;
  versionsUpdatedAt: string;
  /** True after this install has stored its version ledger on the account. */
  versionsSynced: boolean;
  seriesFingerprint: string;
  seriesUpdatedAt: string;
  /** True after this install has stored its series list on the account. */
  seriesSynced: boolean;
}

export interface AccountSnapshot {
  /** Null when this account has never stored a snapshot. */
  revision: string | null;
  updatedAt: string | null;
  /**
   * False when GET /api/humanuscript/sync returns snapshot: null.
   * True after a snapshot has been stored, even if it has no books.
   */
  present: boolean;
  library: Library | null;
  versions: VersionLedger;
  bookUpdatedAt: Record<string, string>;
  versionsUpdatedAt: string | null;
  seriesUpdatedAt: string | null;
  /** Top-level keys from the account snapshot, so a later push can keep them. */
  raw: Record<string, unknown> | null;
}

export interface MergedAccount {
  library: Library;
  versions: VersionLedger;
  bookUpdatedAt: Record<string, string>;
  versionsUpdatedAt: string;
  seriesUpdatedAt: string;
}

export function emptySyncClock(): SyncClock {
  return {
    accountId: null,
    revision: null,
    books: {},
    versionsFingerprint: fingerprintVersions(emptyVersionLedger()),
    versionsUpdatedAt: EPOCH,
    versionsSynced: false,
    seriesFingerprint: fingerprintSeries([]),
    seriesUpdatedAt: EPOCH,
    seriesSynced: false,
  };
}

export function emptyAccountSnapshot(): AccountSnapshot {
  return {
    revision: null,
    updatedAt: null,
    present: false,
    library: null,
    versions: emptyVersionLedger(),
    bookUpdatedAt: {},
    versionsUpdatedAt: null,
    seriesUpdatedAt: null,
    raw: null,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stripVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      if (key === 'savedAt') continue;
      const next = (value as Record<string, unknown>)[key];
      if (next === undefined) continue;
      out[key] = stripVolatile(next);
    }
    return out;
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stripVolatile(value));
}

export function fingerprintBook(book: Book): string {
  return stableStringify(book);
}

export function fingerprintSeries(series: Series[]): string {
  return stableStringify(series);
}

export function fingerprintVersions(versions: VersionLedger): string {
  return stableStringify(versions);
}

export function fingerprintLibrary(library: Library): string {
  return stableStringify({ series: library.series, books: library.books });
}

function timeValue(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function laterTime(left: string, right: string): boolean {
  const l = timeValue(left);
  const r = timeValue(right);
  if (Number.isNaN(l)) return false;
  if (Number.isNaN(r)) return true;
  return l > r;
}

export function isUntouchedBook(book: Book): boolean {
  const title = (book.document.title || book.title).trim();
  const untitled = title === '' || title === 'Untitled book' || title === 'Untitled manuscript';
  const notes = book.document.notes;
  const hasNotes = Boolean(notes && (notes.unreadable || notes.characters.length > 0 || notes.scenes.length > 0));
  return (
    untitled &&
    !book.seriesId &&
    book.document.blocks.length === 0 &&
    book.document.points.length === 0 &&
    book.document.moves.length === 0 &&
    !hasNotes &&
    Object.keys(book.document.provenance).length === 0
  );
}

export function observeLocalSnapshot(
  clock: SyncClock | null,
  library: Library,
  versions: VersionLedger,
  now: string,
  seedBookTimes?: Record<string, string>,
): SyncClock {
  const books: SyncClock['books'] = {};
  for (const book of library.books) {
    const fingerprint = fingerprintBook(book);
    const prev = clock?.books[book.id];
    if (prev && prev.fingerprint === fingerprint) {
      books[book.id] = prev;
      continue;
    }
    const seeded = !clock ? seedBookTimes?.[book.id] : undefined;
    books[book.id] = {
      fingerprint,
      updatedAt: seeded || (clock ? now : EPOCH),
      synced: false,
    };
  }
  const versionsFingerprint = fingerprintVersions(versions);
  const seriesFingerprint = fingerprintSeries(library.series);
  return {
    accountId: clock?.accountId ?? null,
    revision: clock?.revision ?? null,
    books,
    versionsFingerprint,
    versionsUpdatedAt:
      clock && clock.versionsFingerprint === versionsFingerprint ? clock.versionsUpdatedAt : clock ? now : EPOCH,
    versionsSynced: Boolean(clock && clock.versionsFingerprint === versionsFingerprint && clock.versionsSynced),
    seriesFingerprint,
    seriesUpdatedAt:
      clock && clock.seriesFingerprint === seriesFingerprint ? clock.seriesUpdatedAt : clock ? now : EPOCH,
    seriesSynced: Boolean(clock && clock.seriesFingerprint === seriesFingerprint && clock.seriesSynced),
  };
}

export function clockFromMerged(merged: MergedAccount, revision: string | null, accountId: string | null = null): SyncClock {
  const books: SyncClock['books'] = {};
  for (const book of merged.library.books) {
    books[book.id] = {
      fingerprint: fingerprintBook(book),
      updatedAt: merged.bookUpdatedAt[book.id] ?? EPOCH,
      synced: true,
    };
  }
  return {
    accountId,
    revision,
    books,
    versionsFingerprint: fingerprintVersions(merged.versions),
    versionsUpdatedAt: merged.versionsUpdatedAt,
    versionsSynced: true,
    seriesFingerprint: fingerprintSeries(merged.library.series),
    seriesUpdatedAt: merged.seriesUpdatedAt,
    seriesSynced: true,
  };
}

function chooseBook(
  id: string,
  local: Book | undefined,
  remote: Book | undefined,
  clock: SyncClock,
  remoteTimes: Record<string, string>,
): { book: Book | null; updatedAt: string } {
  const known = clock.books[id];
  if (local && !remote) {
    if (known?.synced && known.fingerprint === fingerprintBook(local)) {
      return { book: null, updatedAt: known.updatedAt };
    }
    return { book: clone(local), updatedAt: known?.updatedAt ?? EPOCH };
  }
  if (remote && !local) {
    const remoteHash = fingerprintBook(remote);
    if (known?.synced && known.fingerprint === remoteHash) {
      return { book: null, updatedAt: known.updatedAt };
    }
    return { book: clone(remote), updatedAt: remoteTimes[id] ?? EPOCH };
  }
  if (!local || !remote) return { book: null, updatedAt: EPOCH };

  const localHash = fingerprintBook(local);
  const remoteHash = fingerprintBook(remote);
  if (localHash === remoteHash) {
    return { book: clone(local), updatedAt: known?.updatedAt ?? remoteTimes[id] ?? EPOCH };
  }
  if (known?.synced && localHash === known.fingerprint) {
    return { book: clone(remote), updatedAt: remoteTimes[id] ?? EPOCH };
  }
  if (known?.synced && remoteHash === known.fingerprint) {
    return { book: clone(local), updatedAt: known.updatedAt };
  }
  const localTime = known?.updatedAt ?? EPOCH;
  const remoteTime = remoteTimes[id] ?? EPOCH;
  if (laterTime(remoteTime, localTime)) {
    return { book: clone(remote), updatedAt: remoteTime };
  }
  return { book: clone(local), updatedAt: localTime };
}

function mergeSeries(
  local: Series[],
  remote: Series[],
  clock: SyncClock,
  remoteSeriesUpdatedAt: string | null,
): { series: Series[]; updatedAt: string } {
  const localHash = fingerprintSeries(local);
  const remoteHash = fingerprintSeries(remote);
  if (localHash === remoteHash) {
    return { series: clone(local), updatedAt: clock.seriesUpdatedAt };
  }
  const remoteWins = clock.seriesSynced
    ? clock.seriesFingerprint === localHash || laterTime(remoteSeriesUpdatedAt ?? EPOCH, clock.seriesUpdatedAt)
    : laterTime(remoteSeriesUpdatedAt ?? EPOCH, clock.seriesUpdatedAt);
  const winner = remoteWins ? remote : local;
  const other = remoteWins ? local : remote;
  const byId = new Map<string, Series>();
  for (const series of other) byId.set(series.id, clone(series));
  for (const series of winner) byId.set(series.id, clone(series));
  const updatedAt = remoteWins ? remoteSeriesUpdatedAt ?? clock.seriesUpdatedAt : clock.seriesUpdatedAt;
  return {
    series: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name)),
    updatedAt,
  };
}

function mergeVersionLists(local: BookVersion[], remote: BookVersion[]): BookVersion[] {
  const byId = new Map<string, BookVersion>();
  for (const version of remote) byId.set(version.id, clone(version));
  for (const version of local) {
    const other = byId.get(version.id);
    if (!other || laterTime(version.savedAt, other.savedAt) || version.savedAt === other.savedAt) {
      byId.set(version.id, clone(version));
    }
  }
  return [...byId.values()]
    .sort((a, b) => timeValue(b.savedAt) - timeValue(a.savedAt))
    .slice(0, MAX_VERSIONS_PER_BOOK);
}

function mergeVersions(
  local: VersionLedger,
  remote: VersionLedger,
  keepIds: Set<string>,
): VersionLedger {
  const ids = new Set<string>([...Object.keys(local.byBookId), ...Object.keys(remote.byBookId)]);
  const byBookId: VersionLedger['byBookId'] = {};
  for (const id of ids) {
    if (!keepIds.has(id)) continue;
    const merged = mergeVersionLists(local.byBookId[id] ?? [], remote.byBookId[id] ?? []);
    if (merged.length) byBookId[id] = merged;
  }
  return { version: 1, byBookId };
}

function dropUntouchedIfRealBooksExist(books: Book[]): Book[] {
  const real = books.filter((book) => !isUntouchedBook(book));
  return real.length ? real : books;
}

export function mergeAccountSnapshots(args: {
  localLibrary: Library;
  localVersions: VersionLedger;
  remote: AccountSnapshot;
  clock: SyncClock;
}): MergedAccount {
  if (!args.remote.present) {
    const books = args.localLibrary.books.map((book) => clone(book));
    const bookUpdatedAt: Record<string, string> = {};
    for (const book of books) bookUpdatedAt[book.id] = args.clock.books[book.id]?.updatedAt ?? EPOCH;
    return {
      library: { ...clone(args.localLibrary), books },
      versions: clone(args.localVersions),
      bookUpdatedAt,
      versionsUpdatedAt: args.clock.versionsUpdatedAt,
      seriesUpdatedAt: args.clock.seriesUpdatedAt,
    };
  }

  const remoteLibrary = args.remote.library ?? {
    version: 2 as const,
    activeBookId: args.localLibrary.activeBookId,
    series: [],
    books: [],
  };
  const localById = new Map(args.localLibrary.books.map((book) => [book.id, book]));
  const remoteById = new Map(remoteLibrary.books.map((book) => [book.id, book]));
  const order: string[] = [];
  for (const book of args.localLibrary.books) order.push(book.id);
  for (const book of remoteLibrary.books) {
    if (!localById.has(book.id)) order.push(book.id);
  }

  const chosen: Book[] = [];
  const bookUpdatedAt: Record<string, string> = {};
  for (const id of order) {
    const pick = chooseBook(id, localById.get(id), remoteById.get(id), args.clock, args.remote.bookUpdatedAt);
    if (!pick.book) continue;
    chosen.push(pick.book);
    bookUpdatedAt[pick.book.id] = pick.updatedAt;
  }

  let books = dropUntouchedIfRealBooksExist(chosen);
  if (!books.length) {
    const fallback = args.localLibrary.books.find((book) => isUntouchedBook(book)) ?? args.localLibrary.books[0];
    if (fallback) books = [clone(fallback)];
  }
  const keep = new Set(books.map((book) => book.id));
  for (const id of Object.keys(bookUpdatedAt)) {
    if (!keep.has(id)) delete bookUpdatedAt[id];
  }

  const series = mergeSeries(
    args.localLibrary.series,
    remoteLibrary.series,
    args.clock,
    args.remote.seriesUpdatedAt,
  );
  const usedSeries = new Set(books.map((book) => book.seriesId).filter(Boolean) as string[]);
  const nextSeries = series.series.filter((item) => usedSeries.has(item.id));

  const activeCandidates = [args.localLibrary.activeBookId, remoteLibrary.activeBookId, books[0]?.id];
  const activeBookId = activeCandidates.find((id) => id && keep.has(id)) ?? books[0]!.id;

  const resolvedVersions = resolveVersions(args.localVersions, args.remote.versions, args.clock, args.remote, keep);

  return {
    library: {
      version: 2,
      activeBookId,
      series: nextSeries,
      books,
    },
    versions: resolvedVersions.versions,
    bookUpdatedAt,
    versionsUpdatedAt: resolvedVersions.updatedAt,
    seriesUpdatedAt: series.updatedAt,
  };
}

function resolveVersions(
  local: VersionLedger,
  remote: VersionLedger,
  clock: SyncClock,
  snapshot: AccountSnapshot,
  keep: Set<string>,
): { versions: VersionLedger; updatedAt: string } {
  const localChanged = fingerprintVersions(local) !== clock.versionsFingerprint;
  const remoteChanged = laterTime(snapshot.versionsUpdatedAt ?? EPOCH, clock.versionsUpdatedAt);
  if (!clock.versionsSynced) {
    const updatedAt = laterTime(snapshot.versionsUpdatedAt ?? EPOCH, clock.versionsUpdatedAt)
      ? snapshot.versionsUpdatedAt ?? clock.versionsUpdatedAt
      : clock.versionsUpdatedAt;
    return { versions: mergeVersions(local, remote, keep), updatedAt };
  }
  if (!localChanged) {
    return {
      versions: pruneVersions(remote, keep),
      updatedAt: snapshot.versionsUpdatedAt ?? clock.versionsUpdatedAt,
    };
  }
  if (!remoteChanged) {
    return { versions: pruneVersions(local, keep), updatedAt: clock.versionsUpdatedAt };
  }
  return {
    versions: mergeVersions(local, remote, keep),
    updatedAt: snapshot.versionsUpdatedAt ?? clock.versionsUpdatedAt,
  };
}

function pruneVersions(versions: VersionLedger, keep: Set<string>): VersionLedger {
  const byBookId: VersionLedger['byBookId'] = {};
  for (const id of keep) {
    const list = versions.byBookId[id];
    if (list?.length) byBookId[id] = clone(list).slice(0, MAX_VERSIONS_PER_BOOK);
  }
  return { version: 1, byBookId };
}

export function sealRecords(library: Library, versions: VersionLedger): string[] {
  const seals: string[] = [];
  const take = (doc: Book['document'], label: string) => {
    for (const point of doc.points) seals.push(`${label}:${point.id}:${point.contentHash}`);
  };
  for (const book of library.books) take(book.document, book.id);
  for (const [bookId, list] of Object.entries(versions.byBookId)) {
    for (const version of list) take(version.document, `${bookId}/${version.id}`);
  }
  return seals;
}

function sealsInDocument(doc: unknown, label: string): string[] | null {
  if (!doc || typeof doc !== 'object') return null;
  const points = (doc as { points?: unknown }).points;
  if (points == null) return [];
  if (!Array.isArray(points)) return null;
  const seals: string[] = [];
  for (const point of points) {
    if (!point || typeof point !== 'object') return null;
    const id = (point as { id?: unknown }).id;
    const contentHash = (point as { contentHash?: unknown }).contentHash;
    if (typeof id !== 'string' || typeof contentHash !== 'string' || !contentHash) return null;
    seals.push(`${label}:${id}:${contentHash}`);
  }
  return seals;
}

function expectedSeals(value: {
  library?: unknown;
  versions?: unknown;
}): string[] | null {
  const seals: string[] = [];
  const library = value.library as { books?: unknown } | null | undefined;
  if (library?.books != null) {
    if (!Array.isArray(library.books)) return null;
    for (const book of library.books) {
      if (!book || typeof book !== 'object') return null;
      const id = (book as { id?: unknown }).id;
      if (typeof id !== 'string') return null;
      const docSeals = sealsInDocument((book as { document?: unknown }).document, id);
      if (!docSeals) return null;
      seals.push(...docSeals);
    }
  }
  const versions = value.versions as { byBookId?: unknown } | null | undefined;
  if (versions?.byBookId != null) {
    if (typeof versions.byBookId !== 'object' || Array.isArray(versions.byBookId)) return null;
    for (const [bookId, list] of Object.entries(versions.byBookId as Record<string, unknown>)) {
      if (!Array.isArray(list)) return null;
      for (const version of list) {
        if (!version || typeof version !== 'object') return null;
        const versionId = (version as { id?: unknown }).id;
        if (typeof versionId !== 'string') return null;
        const docSeals = sealsInDocument((version as { document?: unknown }).document, `${bookId}/${versionId}`);
        if (!docSeals) return null;
        seals.push(...docSeals);
      }
    }
  }
  return seals;
}

function sameSeals(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((seal, index) => seal === b[index]);
}

function readTimeMap(value: unknown): Record<string, string> | null {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const times: Record<string, string> = {};
  for (const [key, time] of Object.entries(value)) {
    if (typeof time !== 'string') return null;
    times[key] = time;
  }
  return times;
}

function readOptionalTime(value: unknown): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== 'string') return undefined;
  return value;
}

/** Live snapshot body limit on PUT /api/humanuscript/sync. */
export const SYNC_SNAPSHOT_BYTE_LIMIT = 4_400_000;

const WIRE_KEYS = new Set([
  'version',
  'manuscripts',
  'notes',
  'certification',
  'library',
  'versions',
  'bookUpdatedAt',
  'versionsUpdatedAt',
  'seriesUpdatedAt',
]);

export function ifMatchHeader(revision: string): string {
  const trimmed = revision.trim();
  if (!trimmed) return '""';
  if (trimmed.startsWith('W/')) return trimmed;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed;
  return `"${trimmed}"`;
}

export function revisionFromEtag(etag: string | null): string | null {
  if (!etag) return null;
  let value = etag.trim();
  if (value.startsWith('W/')) value = value.slice(2).trim();
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  return value || null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function encodeSyncBody(merged: MergedAccount, extra: Record<string, unknown> | null): string {
  const manuscripts: Record<string, unknown> = {};
  const notes: Record<string, unknown> = {};
  const certification: Record<string, unknown> = {};
  for (const book of merged.library.books) {
    const doc = book.document;
    manuscripts[book.id] = {
      version: doc.version,
      manuscriptId: doc.manuscriptId,
      title: doc.title,
      blocks: doc.blocks,
      ...(doc.fontFamily ? { fontFamily: doc.fontFamily } : {}),
      ...(typeof doc.fontSize === 'number' ? { fontSize: doc.fontSize } : {}),
      bookTitle: book.title,
      ...(book.seriesId ? { seriesId: book.seriesId } : {}),
      ...(book.seriesBookNumber != null ? { seriesBookNumber: book.seriesBookNumber } : {}),
    };
    notes[book.id] = doc.notes ?? { characters: [], scenes: [] };
    certification[book.id] = {
      provenance: doc.provenance,
      points: doc.points,
      moves: doc.moves,
    };
  }
  const body: Record<string, unknown> = {
    version: 1,
    manuscripts,
    notes,
    certification,
    library: { activeBookId: merged.library.activeBookId, series: merged.library.series },
    versions: merged.versions,
    bookUpdatedAt: merged.bookUpdatedAt,
    versionsUpdatedAt: merged.versionsUpdatedAt,
    seriesUpdatedAt: merged.seriesUpdatedAt,
  };
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (!WIRE_KEYS.has(key)) body[key] = value;
    }
  }
  return JSON.stringify(body);
}

function sealsFromMap(value: unknown, pointsKey: 'points'): string[] | null {
  const record = asRecord(value);
  if (!record) return null;
  const seals: string[] = [];
  for (const [bookId, entry] of Object.entries(record)) {
    const item = asRecord(entry);
    if (!item) return null;
    const docSeals = sealsInDocument({ points: item[pointsKey] ?? [] }, bookId);
    if (!docSeals) return null;
    seals.push(...docSeals);
  }
  return seals;
}

function decodeWire(snapshot: Record<string, unknown>): { ok: true; snapshot: AccountSnapshot } | { ok: false; message: string } {
  if (snapshot.version !== 1) {
    return { ok: false, message: 'readywriter.one sent a snapshot this install does not read. Your books were not changed.' };
  }
  const manuscripts = asRecord(snapshot.manuscripts);
  const notes = asRecord(snapshot.notes);
  const certification = asRecord(snapshot.certification);
  if (!manuscripts || !notes || !certification) {
    return { ok: false, message: 'The account snapshot is missing manuscripts, notes, or certification. Your books were not changed.' };
  }
  const certSeals = sealsFromMap(certification, 'points');
  if (!certSeals) {
    return { ok: false, message: 'A certification seal in the account snapshot was unreadable. Your books were not changed.' };
  }
  const versionSeals = snapshot.versions == null ? [] : expectedSeals({ versions: snapshot.versions });
  if (!versionSeals) {
    return { ok: false, message: 'A certification seal in the account snapshot was unreadable. Your books were not changed.' };
  }

  const books: Library['books'] = [];
  for (const [id, manuscript] of Object.entries(manuscripts)) {
    const doc = asRecord(manuscript);
    if (!doc) {
      return { ok: false, message: 'The account snapshot could not be read. Your books were not changed.' };
    }
    if (id in certification && !asRecord(certification[id])) {
      return { ok: false, message: 'A certification seal in the account snapshot was unreadable. Your books were not changed.' };
    }
    const cert = asRecord(certification[id]) ?? {};
    books.push({
      id,
      title:
        typeof doc.bookTitle === 'string'
          ? doc.bookTitle
          : typeof doc.title === 'string' && doc.title.trim()
            ? doc.title
            : 'Untitled book',
      ...(typeof doc.seriesId === 'string' ? { seriesId: doc.seriesId } : {}),
      ...(typeof doc.seriesBookNumber === 'number' ? { seriesBookNumber: doc.seriesBookNumber } : {}),
      document: {
        version: 1,
        manuscriptId: typeof doc.manuscriptId === 'string' ? doc.manuscriptId : id,
        title: typeof doc.title === 'string' ? doc.title : '',
        blocks: Array.isArray(doc.blocks) ? doc.blocks : [],
        provenance: asRecord(cert.provenance) ?? {},
        points: Array.isArray(cert.points) ? cert.points : [],
        moves: Array.isArray(cert.moves) ? cert.moves : [],
        ...(id in notes ? { notes: notes[id] } : {}),
        ...(typeof doc.fontFamily === 'string' ? { fontFamily: doc.fontFamily } : {}),
        ...(typeof doc.fontSize === 'number' ? { fontSize: doc.fontSize } : {}),
      } as Book['document'],
    });
  }

  let library: Library | null = null;
  if (books.length) {
    const meta = asRecord(snapshot.library);
    const series = meta && Array.isArray(meta.series) ? meta.series : [];
    const activeBookId = meta && typeof meta.activeBookId === 'string' ? meta.activeBookId : books[0]!.id;
    const parsed = parseLibraryRecord({ version: 2, activeBookId, series, books });
    if (!parsed.ok) {
      return { ok: false, message: 'The account snapshot could not be read. Your books were not changed.' };
    }
    library = parsed.library;
  }

  let versions = emptyVersionLedger();
  if (snapshot.versions != null) {
    const parsedVersions = parseVersionLedgerRecord(snapshot.versions);
    if (!parsedVersions) {
      return { ok: false, message: 'The account’s saved versions could not be read. Your books were not changed.' };
    }
    versions = parsedVersions;
  }

  const bookUpdatedAt = readTimeMap(snapshot.bookUpdatedAt);
  const versionsUpdatedAt = readOptionalTime(snapshot.versionsUpdatedAt);
  const seriesUpdatedAt = readOptionalTime(snapshot.seriesUpdatedAt);
  if (!bookUpdatedAt || versionsUpdatedAt === undefined || seriesUpdatedAt === undefined) {
    return { ok: false, message: 'The account snapshot times could not be read. Your books were not changed.' };
  }

  const after = sealRecords(library ?? { version: 2, activeBookId: '', series: [], books: [] }, versions);
  if (!sameSeals([...certSeals, ...versionSeals], after)) {
    return {
      ok: false,
      message: 'Reading the account snapshot would have changed a certification seal. Your books were not changed.',
    };
  }

  return {
    ok: true,
    snapshot: {
      revision: null,
      updatedAt: null,
      present: true,
      library,
      versions,
      bookUpdatedAt,
      versionsUpdatedAt,
      seriesUpdatedAt,
      raw: snapshot,
    },
  };
}

/** Read a GET, PUT, or 409 body. `snapshot: null` means nothing has been pushed yet. */
export function parseSyncPayload(
  value: unknown,
  etag: string | null,
): { ok: true; snapshot: AccountSnapshot } | { ok: false; message: string } {
  const body = asRecord(value);
  if (!body) {
    return { ok: false, message: 'readywriter.one did not return a sync snapshot. Your books were not changed.' };
  }
  const revision =
    (typeof body.revision === 'string' && body.revision ? body.revision : null) ?? revisionFromEtag(etag);
  const updatedAt = typeof body.updatedAt === 'string' && body.updatedAt ? body.updatedAt : null;

  if ('snapshot' in body && body.snapshot == null) {
    return {
      ok: true,
      snapshot: { ...emptyAccountSnapshot(), revision, updatedAt },
    };
  }

  const wire = 'snapshot' in body ? asRecord(body.snapshot) : body;
  if (!wire) {
    return { ok: false, message: 'readywriter.one sent a snapshot this install does not read. Your books were not changed.' };
  }
  const decoded = decodeWire(wire);
  if (!decoded.ok) return decoded;
  return {
    ok: true,
    snapshot: { ...decoded.snapshot, revision, updatedAt: updatedAt ?? decoded.snapshot.updatedAt },
  };
}

function parseVersionLedgerRecord(value: unknown): VersionLedger | null {
  if (!value || typeof value !== 'object') return null;
  const ledger = value as { version?: unknown; byBookId?: unknown };
  if (ledger.version !== 1 || !ledger.byBookId || typeof ledger.byBookId !== 'object' || Array.isArray(ledger.byBookId)) {
    return null;
  }
  const books: Library['books'] = [];
  const versionsById: BookVersion[] = [];
  for (const [bookId, list] of Object.entries(ledger.byBookId as Record<string, unknown>)) {
    if (!Array.isArray(list)) return null;
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') return null;
      const version = entry as Partial<BookVersion>;
      if (typeof version.id !== 'string' || typeof version.savedAt !== 'string' || !version.document) return null;
      if (typeof version.bookId === 'string' && version.bookId !== bookId) return null;
      if (version.kind !== 'manual' && version.kind !== 'auto' && version.kind !== 'restore-guard') return null;
      books.push({
        id: `${bookId}__${version.id}`,
        title: typeof version.document.title === 'string' ? version.document.title : 'Version',
        document: version.document,
      });
      versionsById.push({
        id: version.id,
        bookId,
        label: typeof version.label === 'string' ? version.label : 'Version',
        savedAt: version.savedAt,
        kind: version.kind,
        document: version.document,
      });
    }
  }
  if (!books.length) return emptyVersionLedger();
  const parsed = parseLibraryRecord({
    version: 2,
    activeBookId: books[0]!.id,
    series: [],
    books,
  });
  if (!parsed.ok) return null;
  const docs = new Map(parsed.library.books.map((book) => [book.id, book.document]));
  const byBookId: VersionLedger['byBookId'] = {};
  for (const version of versionsById) {
    const document = docs.get(`${version.bookId}__${version.id}`);
    if (!document) return null;
    const next: BookVersion = {
      id: version.id,
      bookId: version.bookId,
      label: typeof version.label === 'string' ? version.label : 'Version',
      savedAt: version.savedAt,
      kind: version.kind,
      document,
    };
    const list = byBookId[version.bookId] ?? [];
    list.push(next);
    byBookId[version.bookId] = list;
  }
  return { version: 1, byBookId };
}

export function snapshotsMatch(left: MergedAccount, right: AccountSnapshot): boolean {
  if (!right.present || !right.library) return false;
  return (
    fingerprintLibrary(left.library) === fingerprintLibrary(right.library) &&
    fingerprintVersions(left.versions) === fingerprintVersions(right.versions)
  );
}
