import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { familyFromSfnt, inspectFontFile } from './fontFile.ts';

const root = path.join(import.meta.dirname, '..', '..');

test('a bundled TrueType file is an approved font and keeps its family name', () => {
  const bytes = new Uint8Array(readFileSync(path.join(root, 'src/fonts/Cardo-Regular.ttf')));
  const inspected = inspectFontFile('Cardo-Regular.ttf', bytes);
  assert.equal(inspected.ok, true);
  if (!inspected.ok) return;
  assert.equal(inspected.format, 'ttf');
  assert.match(inspected.family, /Cardo/);
  assert.match(familyFromSfnt(bytes) ?? '', /Cardo/);
});

test('OpenType, WOFF, and WOFF2 signatures are approved and other files are not', () => {
  const otto = new Uint8Array([0x4f, 0x54, 0x54, 0x4f, 0, 0, 0, 0]);
  const otf = inspectFontFile('Writer.otf', otto);
  assert.equal(otf.ok, true);
  if (otf.ok) assert.equal(otf.family, 'Writer');

  const woff = inspectFontFile('Writer.woff', new Uint8Array([0x77, 0x4f, 0x46, 0x46, 0, 0]));
  assert.equal(woff.ok, true);
  if (woff.ok) assert.equal(woff.format, 'woff');

  const woff2 = inspectFontFile('Writer.woff2', new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0]));
  assert.equal(woff2.ok, true);
  if (woff2.ok) assert.equal(woff2.format, 'woff2');

  const png = inspectFontFile('notes.ttf', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]));
  assert.equal(png.ok, false);
  const zip = inspectFontFile('face.zip', new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
  assert.equal(zip.ok, false);
  if (!zip.ok) assert.match(zip.message, /approved font type/);
  const empty = inspectFontFile('empty.ttf', new Uint8Array());
  assert.equal(empty.ok, false);
  const huge = inspectFontFile('huge.ttf', new Uint8Array(8 * 1024 * 1024 + 1));
  assert.equal(huge.ok, false);
  if (!huge.ok) assert.match(huge.message, /8 MB/);
});
