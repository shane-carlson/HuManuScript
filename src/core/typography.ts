/**
 * Typeface and size for one book.
 * The first six faces are system fonts. Twenty-five more are TrueType files
 * bundled with the app. A writer can also add a font file of an approved type;
 * those faces are registered beside the built-in list.
 */

import type { ManuscriptDocument } from './document.ts';

const SYSTEM_MANUSCRIPT_FONTS = [
  {
    id: 'palatino',
    label: 'Palatino',
    css: 'Palatino, "Palatino Linotype", "Book Antiqua", "Noto Serif", "Liberation Serif", serif',
    exportName: 'Palatino',
    pdfFont: 'times',
    rtfFamily: '\\froman',
  },
  {
    id: 'georgia',
    label: 'Georgia',
    css: 'Georgia, "Noto Serif", "Liberation Serif", serif',
    exportName: 'Georgia',
    pdfFont: 'times',
    rtfFamily: '\\froman',
  },
  {
    id: 'times',
    label: 'Times New Roman',
    css: '"Times New Roman", Times, Tinos, "Liberation Serif", serif',
    exportName: 'Times New Roman',
    pdfFont: 'times',
    rtfFamily: '\\froman',
  },
  {
    id: 'garamond',
    label: 'Garamond',
    css: 'Garamond, "EB Garamond", "Palatino Linotype", "Noto Serif", serif',
    exportName: 'Garamond',
    pdfFont: 'times',
    rtfFamily: '\\froman',
  },
  {
    id: 'courier',
    label: 'Courier',
    css: '"Courier New", Courier, Cousine, "Liberation Mono", monospace',
    exportName: 'Courier New',
    pdfFont: 'courier',
    rtfFamily: '\\fmodern',
  },
  {
    id: 'arial',
    label: 'Arial',
    css: 'Arial, Helvetica, Arimo, "Liberation Sans", sans-serif',
    exportName: 'Arial',
    pdfFont: 'helvetica',
    rtfFamily: '\\fswiss',
  },
] as const;

/** TrueType files in src/fonts. Variable faces cover a weight range; the rest are regular. */
export const BUNDLED_TRUETYPE_FONTS = [
  face('crimson-text', 'Crimson Text', 'CrimsonText-Regular.ttf', 'serif'),
  face('cardo', 'Cardo', 'Cardo-Regular.ttf', 'serif'),
  face('spectral', 'Spectral', 'Spectral-Regular.ttf', 'serif'),
  face('eb-garamond', 'EB Garamond', 'EBGaramond.ttf', 'serif'),
  face('gentium-book-plus', 'Gentium Book Plus', 'GentiumBookPlus-Regular.ttf', 'serif'),
  face('literata', 'Literata', 'Literata.ttf', 'serif'),
  face('newsreader', 'Newsreader', 'Newsreader.ttf', 'serif'),
  face('ibm-plex-serif', 'IBM Plex Serif', 'IBMPlexSerif-Regular.ttf', 'serif'),
  face('tinos', 'Tinos', 'Tinos-Regular.ttf', 'serif'),
  face('charis-sil', 'Charis SIL', 'CharisSIL-Regular.ttf', 'serif'),
  face('source-serif-4', 'Source Serif 4', 'SourceSerif4.ttf', 'serif'),
  face('alegreya', 'Alegreya', 'Alegreya.ttf', 'serif'),
  face('vollkorn', 'Vollkorn', 'Vollkorn.ttf', 'serif'),
  face('cormorant-garamond', 'Cormorant Garamond', 'CormorantGaramond.ttf', 'serif'),
  face('neuton', 'Neuton', 'Neuton-Regular.ttf', 'serif'),
  face('sorts-mill-goudy', 'Sorts Mill Goudy', 'SortsMillGoudy-Regular.ttf', 'serif'),
  face('fanwood-text', 'Fanwood Text', 'FanwoodText-Regular.ttf', 'serif'),
  face('lora', 'Lora', 'Lora.ttf', 'serif'),
  face('atkinson-hyperlegible', 'Atkinson Hyperlegible', 'AtkinsonHyperlegible-Regular.ttf', 'sans'),
  face('source-sans-3', 'Source Sans 3', 'SourceSans3.ttf', 'sans'),
  face('libre-franklin', 'Libre Franklin', 'LibreFranklin.ttf', 'sans'),
  face('karla', 'Karla', 'Karla.ttf', 'sans'),
  face('ibm-plex-mono', 'IBM Plex Mono', 'IBMPlexMono-Regular.ttf', 'mono'),
  face('source-code-pro', 'Source Code Pro', 'SourceCodePro.ttf', 'mono'),
  face('jetbrains-mono', 'JetBrains Mono', 'JetBrainsMono.ttf', 'mono'),
] as const;

export const MANUSCRIPT_FONTS = [...SYSTEM_MANUSCRIPT_FONTS, ...BUNDLED_TRUETYPE_FONTS] as const;

export type BuiltinFontId = (typeof MANUSCRIPT_FONTS)[number]['id'];
export type ManuscriptFontId = BuiltinFontId | `custom-${string}`;
export type ManuscriptFont = (typeof MANUSCRIPT_FONTS)[number];

export interface ManuscriptFontFace {
  id: string;
  label: string;
  css: string;
  exportName: string;
  pdfFont: 'times' | 'courier' | 'helvetica';
  rtfFamily: '\\froman' | '\\fswiss' | '\\fmodern';
}

type FaceKind = 'serif' | 'sans' | 'mono';

function face<const I extends string, const L extends string>(id: I, label: L, file: string, kind: FaceKind) {
  const stack = kind === 'mono'
    ? `"${label}", "Courier New", Courier, monospace`
    : kind === 'sans'
      ? `"${label}", Arial, Helvetica, sans-serif`
      : `"${label}", Palatino, "Palatino Linotype", Georgia, serif`;
  const metrics = kind === 'mono'
    ? { pdfFont: 'courier' as const, rtfFamily: '\\fmodern' as const }
    : kind === 'sans'
      ? { pdfFont: 'helvetica' as const, rtfFamily: '\\fswiss' as const }
      : { pdfFont: 'times' as const, rtfFamily: '\\froman' as const };
  return { id, label, css: stack, exportName: label, file, ...metrics };
}

export const DEFAULT_MANUSCRIPT_FONT_ID: BuiltinFontId = 'palatino';
/** Body size in points. 12pt is the usual manuscript measure. */
export const DEFAULT_MANUSCRIPT_FONT_SIZE = 12;

/** Point sizes offered in the formatting bar. */
export const MANUSCRIPT_FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 22, 24] as const;

const CUSTOM_FONT_ID = /^custom-[a-f0-9]{12}$/;
const FONT_BY_ID = new Map<string, ManuscriptFontFace>(MANUSCRIPT_FONTS.map((font) => [font.id, font]));
const SIZE_SET = new Set<number>(MANUSCRIPT_FONT_SIZES);

let extraFaces: ManuscriptFontFace[] = [];
const extraListeners = new Set<() => void>();

/** Faces the writer added. The manuscript reads this list when it paints and exports. */
export function setExtraManuscriptFaces(faces: readonly ManuscriptFontFace[]) {
  extraFaces = faces.filter((font) => isCustomFontId(font.id));
  for (const listener of extraListeners) listener();
}

export function extraManuscriptFaces(): readonly ManuscriptFontFace[] {
  return extraFaces;
}

export function subscribeExtraFaces(listener: () => void): () => void {
  extraListeners.add(listener);
  return () => extraListeners.delete(listener);
}

export function isCustomFontId(value: unknown): value is `custom-${string}` {
  return typeof value === 'string' && CUSTOM_FONT_ID.test(value);
}

export function isManuscriptFontId(value: unknown): value is ManuscriptFontId {
  return (typeof value === 'string' && FONT_BY_ID.has(value)) || isCustomFontId(value);
}

export function isManuscriptFontSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && SIZE_SET.has(value);
}

export function manuscriptFontChoices(): ManuscriptFontFace[] {
  return [...MANUSCRIPT_FONTS, ...extraFaces];
}

export interface ManuscriptTypography {
  font: ManuscriptFontFace;
  sizePt: number;
}

function faceById(id: string | undefined): ManuscriptFontFace | undefined {
  if (!id) return undefined;
  return extraFaces.find((font) => font.id === id) ?? FONT_BY_ID.get(id);
}

export function resolveManuscriptTypography(doc: {
  fontFamily?: string;
  fontSize?: number;
}): ManuscriptTypography {
  const known = doc.fontFamily ? faceById(doc.fontFamily) : undefined;
  const font = known ?? (isCustomFontId(doc.fontFamily) ? pendingCustomFace(doc.fontFamily) : FONT_BY_ID.get(DEFAULT_MANUSCRIPT_FONT_ID)!);
  return {
    font,
    sizePt: isManuscriptFontSize(doc.fontSize) ? doc.fontSize : DEFAULT_MANUSCRIPT_FONT_SIZE,
  };
}

function pendingCustomFace(id: `custom-${string}`): ManuscriptFontFace {
  return {
    id,
    label: 'Added font',
    css: 'Palatino, "Palatino Linotype", Georgia, serif',
    exportName: 'Palatino',
    pdfFont: 'times',
    rtfFamily: '\\froman',
  };
}

/** CSS custom properties for the manuscript surface. */
export function manuscriptTypographyStyle(doc: {
  fontFamily?: string;
  fontSize?: number;
}): { '--ms-font': string; '--ms-size': string } {
  const { font, sizePt } = resolveManuscriptTypography(doc);
  return {
    '--ms-font': font.css,
    '--ms-size': `${sizePt}pt`,
  };
}

/**
 * Record a face or size on the book. The text, provenance, and certification
 * points stay as they are — this is not an insertion.
 */
export function setManuscriptTypography(
  doc: ManuscriptDocument,
  patch: { fontFamily?: string; fontSize?: number },
): ManuscriptDocument {
  const current = resolveManuscriptTypography(doc);
  const font = patch.fontFamily !== undefined
    ? faceById(patch.fontFamily) ?? (isCustomFontId(patch.fontFamily) ? pendingCustomFace(patch.fontFamily) : current.font)
    : current.font;
  const sizePt = patch.fontSize !== undefined && isManuscriptFontSize(patch.fontSize)
    ? patch.fontSize
    : current.sizePt;
  if (!isManuscriptFontId(font.id)) return doc;
  if (current.font.id === font.id && current.sizePt === sizePt) return doc;
  return { ...doc, fontFamily: font.id, fontSize: sizePt };
}
