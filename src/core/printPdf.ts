/**
 * Small reads of a print-interior PDF.
 * Typst writes the page boxes and font names outside compressed streams.
 */

export interface PdfFacts {
  pages: number;
  /** MediaBox width and height in PDF points. */
  mediaBoxes: { width: number; height: number }[];
  baseFonts: string[];
  fontFiles: number;
  outlines: boolean;
}

export function readPdfFacts(bytes: Uint8Array): PdfFacts {
  const raw = latin1(bytes);
  return {
    pages: raw.match(/\/Type\s*\/Page(?!s)/g)?.length ?? 0,
    mediaBoxes: [...raw.matchAll(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/g)].map(
      (match) => ({
        width: Number(match[3]) - Number(match[1]),
        height: Number(match[4]) - Number(match[2]),
      }),
    ),
    baseFonts: [...raw.matchAll(/\/BaseFont\s*\/([^\s/<>[\]]+)/g)].map((match) => match[1] ?? ''),
    fontFiles: raw.match(/\/FontFile2\b/g)?.length ?? 0,
    outlines: raw.includes('/Outlines'),
  };
}

export function latin1(bytes: Uint8Array): string {
  let out = '';
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    out += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return out;
}
