/**
 * Harper runs on this machine. The WebAssembly file ships inside the app.
 * A newer build can replace that file from Ready Writer One without a reinstall.
 * Nothing in this module sends manuscript text anywhere.
 */

import { Dialect, LocalLinter, WorkerLinter, createBinaryModuleFromUrl, type BinaryModule, type Linter } from 'harper.js';
import type { GrammarDialect, GrammarSuggestionKind } from './certification.ts';
import { windowsPathFromFileUrlPathname } from './harperWindowsPath.ts';
import {
  HARPER_ENGINE_VERSION,
  HARPER_UPDATE_MANIFEST_URL,
  chooseHarperSource,
  grammarFields,
  parseHarperManifest,
  type GrammarLint,
  type HarperUpdateManifest,
} from './grammar.ts';
import type { ManuscriptBlock } from './types.ts';

const CACHE_NAME = 'humanuscript-harper';
const MANIFEST_CACHE_KEY = HARPER_UPDATE_MANIFEST_URL;

export interface HarperStatus {
  version: string;
  source: 'bundled' | 'update';
  checking: boolean;
  error?: string;
}

let status: HarperStatus = { version: HARPER_ENGINE_VERSION, source: 'bundled', checking: false };
let sessionPromise: Promise<HarperSession> | null = null;
let refreshPromise: Promise<void> | null = null;

interface HarperSession {
  linter: Linter;
  version: string;
  source: 'bundled' | 'update';
  dialect: GrammarDialect;
}

const DIALECTS: Record<GrammarDialect, Dialect> = {
  American: Dialect.American,
  British: Dialect.British,
  Canadian: Dialect.Canadian,
  Australian: Dialect.Australian,
  Indian: Dialect.Indian,
};

function inBrowser(): boolean {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

let harperFsPatched = false;

/** Node on Windows: rewrite Harper's `/C:/...` pathname before it reads the wasm file. */
async function patchHarperWindowsPaths(): Promise<void> {
  if (harperFsPatched || inBrowser()) return;
  if (typeof process === 'undefined' || process.platform !== 'win32') return;
  harperFsPatched = true;
  const fs = (await import(/* @vite-ignore */ 'node:fs')) as typeof import('node:fs');
  const readFile = fs.readFile;
  const patched = ((path: import('node:fs').PathLike, ...rest: unknown[]) => {
    const fixed = typeof path === 'string' ? (windowsPathFromFileUrlPathname(path) ?? path) : path;
    return (readFile as (path: import('node:fs').PathLike, ...rest: unknown[]) => unknown).call(fs, fixed, ...rest);
  }) as typeof fs.readFile;
  fs.readFile = patched;
}

async function bundledBinary(): Promise<BinaryModule> {
  await patchHarperWindowsPaths();
  const mod = await import('harper.js/binary');
  return mod.binary;
}

async function openSession(binary: BinaryModule, version: string, source: HarperStatus['source']): Promise<HarperSession> {
  const dialect: GrammarDialect = 'American';
  const linter = inBrowser()
    ? new WorkerLinter({ binary, dialect: DIALECTS[dialect] })
    : new LocalLinter({ binary, dialect: DIALECTS[dialect] });
  await linter.setup();
  return { linter, version, source, dialect };
}

export function harperStatus(): HarperStatus {
  return status;
}

export function harperEngineVersion(): string {
  return status.version;
}

/** Compile the bundled WebAssembly before the writer asks for a check. */
export async function prepareHarper(): Promise<void> {
  await session();
}

async function session(): Promise<HarperSession> {
  if (!sessionPromise) {
    sessionPromise = bundledBinary().then((binary) => openSession(binary, HARPER_ENGINE_VERSION, 'bundled'));
    if (inBrowser()) void refreshHarper();
  }
  return sessionPromise;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function cacheStore(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function readCachedManifest(): Promise<HarperUpdateManifest | null> {
  const cache = await cacheStore();
  if (!cache) return null;
  const hit = await cache.match(MANIFEST_CACHE_KEY);
  if (!hit) return null;
  try {
    return parseHarperManifest(await hit.json(), HARPER_UPDATE_MANIFEST_URL);
  } catch {
    return null;
  }
}

async function binaryFromWasm(wasmUrl: string, bytes: ArrayBuffer): Promise<BinaryModule> {
  const cache = await cacheStore();
  if (cache) {
    await cache.put(wasmUrl, new Response(bytes, { headers: { 'content-type': 'application/wasm' } }));
  }
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/wasm' }));
  return createBinaryModuleFromUrl(blobUrl);
}

async function loadCachedWasm(manifest: HarperUpdateManifest): Promise<BinaryModule | null> {
  const cache = await cacheStore();
  if (!cache) return null;
  const hit = await cache.match(manifest.wasmUrl);
  if (!hit) return null;
  const bytes = await hit.arrayBuffer();
  const hash = await sha256Hex(bytes);
  if (hash !== manifest.sha256) return null;
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/wasm' }));
  return createBinaryModuleFromUrl(blobUrl);
}

async function downloadWasm(manifest: HarperUpdateManifest): Promise<BinaryModule | null> {
  const response = await fetch(manifest.wasmUrl);
  if (!response.ok) return null;
  const bytes = await response.arrayBuffer();
  const hash = await sha256Hex(bytes);
  if (hash !== manifest.sha256) return null;
  return binaryFromWasm(manifest.wasmUrl, bytes);
}

async function rememberManifest(manifest: HarperUpdateManifest): Promise<void> {
  const cache = await cacheStore();
  if (!cache) return;
  await cache.put(
    MANIFEST_CACHE_KEY,
    new Response(
      JSON.stringify({
        version: manifest.version,
        engine: manifest.engine,
        wasm: manifest.wasmUrl,
        sha256: manifest.sha256,
      }),
      { headers: { 'content-type': 'application/json' } },
    ),
  );
}

/** Look for a newer Harper binary. Failure leaves the bundled copy in place. */
export async function refreshHarper(): Promise<void> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    status = { ...status, checking: true, error: undefined };
    try {
      const cached = await readCachedManifest();
      let remote: HarperUpdateManifest | null = null;
      try {
        const response = await fetch(HARPER_UPDATE_MANIFEST_URL, { cache: 'no-store' });
        if (response.ok) remote = parseHarperManifest(await response.json(), HARPER_UPDATE_MANIFEST_URL);
      } catch {
        remote = null;
      }
      const choice = chooseHarperSource({
        bundledVersion: HARPER_ENGINE_VERSION,
        cachedVersion: cached?.version ?? null,
        remoteVersion: remote?.version ?? null,
      });
      if (choice === 'bundled') {
        status = { version: HARPER_ENGINE_VERSION, source: 'bundled', checking: false };
        return;
      }
      const manifest = choice === 'remote' ? remote : cached;
      if (!manifest) {
        status = { version: HARPER_ENGINE_VERSION, source: 'bundled', checking: false };
        return;
      }
      const binary = choice === 'remote' ? await downloadWasm(manifest) : await loadCachedWasm(manifest);
      if (!binary) {
        status = { version: status.version, source: status.source, checking: false, error: 'Harper update did not match its checksum.' };
        return;
      }
      if (choice === 'remote') await rememberManifest(manifest);
      const next = await openSession(binary, manifest.version, 'update');
      const previous = sessionPromise;
      sessionPromise = Promise.resolve(next);
      status = { version: manifest.version, source: 'update', checking: false };
      if (previous) {
        const old = await previous.catch(() => null);
        if (old && old.linter !== next.linter) await old.linter.dispose();
      }
    } catch (error) {
      status = {
        version: status.version,
        source: status.source,
        checking: false,
        error: error instanceof Error ? error.message : 'Harper update failed.',
      };
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

function suggestionKind(value: number): GrammarSuggestionKind | null {
  if (value === 0) return 'replace';
  if (value === 1) return 'remove';
  if (value === 2) return 'insert-after';
  return null;
}

export async function lintBlockText(text: string): Promise<Array<Omit<GrammarLint, 'id' | 'blockId' | 'field'>>> {
  const active = await session();
  const lints = await active.linter.lint(text, { language: 'plaintext' });
  return lints.map((lint) => {
    const span = lint.span();
    const suggestions = lint
      .suggestions()
      .map((suggestion) => {
        const kind = suggestionKind(suggestion.kind());
        if (!kind) return null;
        return { kind, text: suggestion.get_replacement_text() };
      })
      .filter((suggestion): suggestion is { kind: GrammarSuggestionKind; text: string } => suggestion != null);
    return {
      start: span.start,
      end: span.end,
      message: lint.message(),
      lintKind: lint.lint_kind(),
      problem: lint.get_problem_text(),
      suggestions,
    };
  });
}

let lintSerial = 0;

/** Lint the blocks in a scope. Each finding keeps the block and field it came from. */
export async function lintManuscriptBlocks(blocks: ManuscriptBlock[]): Promise<GrammarLint[]> {
  const found: GrammarLint[] = [];
  for (const block of blocks) {
    for (const field of grammarFields(block)) {
      const hits = await lintBlockText(field.text);
      for (const hit of hits) {
        lintSerial += 1;
        found.push({ ...hit, id: `harper_${lintSerial}`, blockId: block.id, field: field.field });
      }
    }
  }
  return found;
}
