/**
 * Compile a print interior with Typst in this process.
 * The same source string is what `$typst.pdf` and `$typst.svg` receive.
 * Fonts are the Crimson Text files passed in. The compiler's default font pack stays unloaded.
 */

import { $typst } from '@myriaddreamin/typst.ts';
import type { ManuscriptDocument } from './document.ts';
import type { PublicationFileOptions } from './exportManuscript.ts';
import {
  buildPrintInteriorSource,
  insideMarginIn,
  printInteriorRefusal,
  printTrim,
  type PrintTrim,
} from './printInterior.ts';
import { readPdfFacts } from './printPdf.ts';

export type WasmModuleSource = string | Uint8Array;

export interface CompiledPrintInterior {
  trim: PrintTrim;
  source: string;
  pdf: Uint8Array;
  svg: string;
  sheets: number;
  insideIn: number;
}

let wasmModules: { compiler: WasmModuleSource; renderer: WasmModuleSource } | null = null;
let fontsReady: Uint8Array[] | null = null;
let starting: Promise<void> | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** Call once, before the first compile, with the compiler and renderer wasm. */
export function configurePrintTypstWasm(modules: { compiler: WasmModuleSource; renderer: WasmModuleSource }) {
  if (starting) return;
  wasmModules = modules;
}

/** Drop the renderer's selection script so the proof can be shown as an image. */
export function printPreviewSvg(svg: string): string {
  return svg
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi, '');
}

export async function compilePrintInterior(
  doc: ManuscriptDocument,
  options: PublicationFileOptions,
  formatId: string,
  fonts: Uint8Array[],
  language = 'en',
): Promise<CompiledPrintInterior> {
  const refusal = printInteriorRefusal(doc, options, formatId);
  if (refusal) throw new Error(refusal);
  const trim = printTrim(formatId);
  if (!trim) throw new Error('This size is not a print file.');
  return enqueue(async () => {
    await ensureTypst(fonts);
    let inside = insideMarginIn(0);
    let compiled: CompiledPrintInterior | null = null;
    for (let pass = 0; pass < 4; pass += 1) {
      const source = buildPrintInteriorSource({ doc, options, formatId, insideIn: inside, language });
      const rendered = await renderSource(source);
      const sheets = readPdfFacts(rendered.pdf).pages;
      compiled = { trim, source, pdf: rendered.pdf, svg: rendered.svg, sheets, insideIn: inside };
      const required = insideMarginIn(sheets);
      if (required <= inside + 0.001) break;
      inside = required;
    }
    if (!compiled) throw new Error('The print interior could not be compiled.');
    return compiled;
  });
}

async function ensureTypst(fonts: Uint8Array[]) {
  if (fontsReady) return;
  if (!wasmModules) throw new Error('The typesetter is not loaded yet.');
  if (!starting) {
    const modules = wasmModules;
    const snippet = $typst as unknown as TypstApi;
    snippet.setCompilerInitOptions({ getModule: () => copyWasm(modules.compiler) });
    snippet.setRendererInitOptions({ getModule: () => copyWasm(modules.renderer) });
    snippet.use(snippet.constructor.disableDefaultFontAssets(), snippet.constructor.preloadFonts(fonts));
    starting = snippet.pdf({ mainContent: '#set text(font: "Crimson Text")\n#text(" ")' }).then(
      () => {
        fontsReady = fonts;
      },
      (error: unknown) => {
        starting = null;
        throw typstError(error);
      },
    );
  }
  await starting;
}

async function renderSource(source: string): Promise<{ pdf: Uint8Array; svg: string }> {
  const snippet = $typst as unknown as TypstApi;
  try {
    const pdf = await snippet.pdf({ mainContent: source });
    if (!pdf) throw new Error('The print interior did not produce a PDF.');
    const svg = await snippet.svg({ mainContent: source });
    return { pdf, svg };
  } catch (error) {
    throw typstError(error);
  }
}

function copyWasm(source: WasmModuleSource): WasmModuleSource {
  if (typeof source === 'string') return source;
  return source.slice();
}

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function typstError(error: unknown): Error {
  if (error instanceof Error) return error;
  const message = Array.isArray(error)
    ? error
        .map((item) => {
          if (item && typeof item === 'object' && 'message' in item) return String(item.message);
          return String(item);
        })
        .filter(Boolean)
        .join('\n')
    : error == null
      ? ''
      : String(error);
  const quoted = message.match(/message: "((?:\\.|[^"\\])*)"/);
  const readable = quoted?.[1]?.replace(/\\"/g, '"') || message;
  return new Error(readable || 'The print interior could not be compiled.');
}

interface TypstApi {
  use: (...providers: unknown[]) => void;
  setCompilerInitOptions: (options: { getModule: () => WasmModuleSource }) => void;
  setRendererInitOptions: (options: { getModule: () => WasmModuleSource }) => void;
  pdf: (options: { mainContent: string }) => Promise<Uint8Array | undefined>;
  svg: (options: { mainContent: string }) => Promise<string>;
  constructor: {
    disableDefaultFontAssets: () => unknown;
    preloadFonts: (fonts: Uint8Array[]) => unknown;
  };
}
