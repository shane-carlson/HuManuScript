/**
 * Fonts a writer adds on this computer. The file stays in this browser.
 * Only an approved font type is stored, and the face is registered for the page.
 */

import { inspectFontFile, type ApprovedFontFormat } from './fontFile.ts';
import {
  MANUSCRIPT_FONTS,
  isCustomFontId,
  setExtraManuscriptFaces,
  type ManuscriptFontFace,
} from './typography.ts';

const DB_NAME = 'humanuscript-fonts';
const STORE = 'faces';

interface StoredCustomFont {
  id: string;
  family: string;
  format: ApprovedFontFormat;
  bytes: ArrayBuffer;
}

const loaded = new Map<string, FontFace>();

export async function installCustomFonts(): Promise<ManuscriptFontFace[]> {
  const stored = await readAll();
  const faces: ManuscriptFontFace[] = [];
  for (const font of stored) {
    const face = await activate(font);
    if (face) faces.push(face);
  }
  setExtraManuscriptFaces(faces);
  return faces;
}

export async function addCustomFontFile(file: File): Promise<{ ok: true; face: ManuscriptFontFace } | { ok: false; message: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const inspected = inspectFontFile(file.name, bytes);
  if (!inspected.ok) return inspected;
  const id = await fontId(bytes);
  const stored = await readAll();
  const existing = stored.find((font) => font.id === id);
  if (existing) {
    const face = await activate(existing);
    if (!face) return { ok: false, message: 'That font file could not be loaded.' };
    const faces = await installCustomFonts();
    return { ok: true, face: faces.find((item) => item.id === id) ?? face };
  }
  const family = uniqueFamily(inspected.family, stored.map((font) => font.family));
  const record: StoredCustomFont = {
    id,
    family,
    format: inspected.format,
    bytes: bytes.slice().buffer,
  };
  const face = await activate(record);
  if (!face) return { ok: false, message: 'That font file could not be loaded.' };
  await put(record);
  await installCustomFonts();
  return { ok: true, face };
}

export async function removeCustomFont(id: string): Promise<void> {
  const face = loaded.get(id);
  if (face && typeof document !== 'undefined' && document.fonts) document.fonts.delete(face);
  loaded.delete(id);
  await deleteId(id);
  await installCustomFonts();
}

function toFace(font: StoredCustomFont): ManuscriptFontFace {
  const mono = /mono|code|courier|consol/i.test(font.family);
  const sans = /sans|gothic|grotesk|franklin/i.test(font.family);
  const kind = mono ? 'mono' : sans ? 'sans' : 'serif';
  const css = kind === 'mono'
    ? `"${font.family}", "Courier New", Courier, monospace`
    : kind === 'sans'
      ? `"${font.family}", Arial, Helvetica, sans-serif`
      : `"${font.family}", Palatino, Georgia, serif`;
  return {
    id: font.id,
    label: font.family,
    css,
    exportName: font.family,
    pdfFont: kind === 'mono' ? 'courier' : kind === 'sans' ? 'helvetica' : 'times',
    rtfFamily: kind === 'mono' ? '\\fmodern' : kind === 'sans' ? '\\fswiss' : '\\froman',
  };
}

async function activate(font: StoredCustomFont): Promise<ManuscriptFontFace | null> {
  const described = toFace(font);
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return described;
  if (loaded.has(font.id)) return described;
  try {
    const face = new FontFace(font.family, font.bytes.slice(0));
    await face.load();
    document.fonts.add(face);
    loaded.set(font.id, face);
    return described;
  } catch {
    return null;
  }
}

function uniqueFamily(family: string, existing: string[]): string {
  const taken = new Set<string>([...MANUSCRIPT_FONTS.map((font) => font.label), ...existing]);
  if (!taken.has(family)) return family;
  let count = 2;
  while (taken.has(`${family} ${count}`)) count += 1;
  return `${family} ${count}`;
}

async function fontId(bytes: Uint8Array): Promise<`custom-${string}`> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const id = `custom-${hex.slice(0, 12)}`;
  if (!isCustomFontId(id)) throw new Error('font id');
  return id;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readAll(): Promise<StoredCustomFont[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result as StoredCustomFont[]) ?? []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

async function put(font: StoredCustomFont): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(font);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function deleteId(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    /* The face is already gone from the page. */
  }
}
