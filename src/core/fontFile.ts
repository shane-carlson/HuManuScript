/**
 * Approved font files are the ones a browser can load as a face:
 * TrueType, OpenType, WOFF, and WOFF2. The check uses the file
 * signature, not the name alone.
 */

export const MAX_FONT_BYTES = 8 * 1024 * 1024;

export const APPROVED_FONT_TYPE_LABEL = 'TrueType (.ttf), OpenType (.otf), WOFF, or WOFF2';

export type ApprovedFontFormat = 'ttf' | 'otf' | 'woff' | 'woff2';

const SIGNATURES: Record<ApprovedFontFormat, readonly string[]> = {
  ttf: ['00010000', '74727565'],
  otf: ['4f54544f', '00010000', '74727565'],
  woff: ['774f4646'],
  woff2: ['774f4632'],
};

export type FontInspection =
  | { ok: true; format: ApprovedFontFormat; family: string }
  | { ok: false; message: string };

export function fontExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0 || dot === filename.length - 1) return '';
  return filename.slice(dot + 1).toLowerCase();
}

export function inspectFontFile(filename: string, bytes: Uint8Array): FontInspection {
  if (bytes.byteLength === 0) return { ok: false, message: 'That font file is empty.' };
  if (bytes.byteLength > MAX_FONT_BYTES) {
    return { ok: false, message: 'That font is larger than 8 MB.' };
  }
  const extension = fontExtension(filename);
  if (extension !== 'ttf' && extension !== 'otf' && extension !== 'woff' && extension !== 'woff2') {
    return { ok: false, message: `Use an approved font type: ${APPROVED_FONT_TYPE_LABEL}.` };
  }
  const signature = [...bytes.subarray(0, 4)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (!SIGNATURES[extension].includes(signature)) {
    return { ok: false, message: `That file is not a ${extension.toUpperCase()} font.` };
  }
  const parsed = extension === 'ttf' || extension === 'otf' ? familyFromSfnt(bytes) : null;
  return { ok: true, format: extension, family: parsed ?? familyFromFilename(filename) };
}

export function familyFromFilename(filename: string): string {
  const base = filename.slice(0, filename.length - (fontExtension(filename).length ? fontExtension(filename).length + 1 : 0));
  const cleaned = cleanFamily(base.replace(/[-_]+/g, ' '));
  return cleaned || 'Added font';
}

/** Read the typographic family from a TrueType or OpenType name table. */
export function familyFromSfnt(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  const numTables = u16(bytes, 4);
  let nameOffset = -1;
  let nameLength = 0;
  for (let index = 0; index < numTables; index += 1) {
    const record = 12 + index * 16;
    if (record + 16 > bytes.length) return null;
    const tag = String.fromCharCode(bytes[record]!, bytes[record + 1]!, bytes[record + 2]!, bytes[record + 3]!);
    if (tag !== 'name') continue;
    nameOffset = u32(bytes, record + 8);
    nameLength = u32(bytes, record + 12);
    break;
  }
  if (nameOffset < 0 || nameLength < 6 || nameOffset + nameLength > bytes.length) return null;
  const count = u16(bytes, nameOffset + 2);
  const stringOffset = u16(bytes, nameOffset + 4);
  const preferred: string[] = [];
  const fallback: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const record = nameOffset + 6 + index * 12;
    if (record + 12 > nameOffset + nameLength) break;
    const platformId = u16(bytes, record);
    const nameId = u16(bytes, record + 6);
    const length = u16(bytes, record + 8);
    const offset = u16(bytes, record + 10);
    if (nameId !== 16 && nameId !== 1) continue;
    const start = nameOffset + stringOffset + offset;
    if (start + length > bytes.length) continue;
    const text = platformId === 3 || platformId === 0
      ? decodeUtf16be(bytes.subarray(start, start + length))
      : decodeLatin(bytes.subarray(start, start + length));
    const family = cleanFamily(text);
    if (!family) continue;
    if (nameId === 16) preferred.push(family);
    else fallback.push(family);
  }
  return preferred[0] ?? fallback[0] ?? null;
}

function cleanFamily(value: string): string | null {
  const cleaned = value.replace(/[\u0000-\u001f"\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 80);
}

function decodeUtf16be(bytes: Uint8Array): string {
  let out = '';
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    out += String.fromCharCode((bytes[index]! << 8) | bytes[index + 1]!);
  }
  return out;
}

function decodeLatin(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

function u16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1000000) +
    ((bytes[offset + 1] ?? 0) << 16) +
    ((bytes[offset + 2] ?? 0) << 8) +
    (bytes[offset + 3] ?? 0)
  );
}
