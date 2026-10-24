/**
 * Grammar-check ranges and the Harper update choice.
 * The checker itself lives in harperEngine.ts so tests of these rules do not load WebAssembly.
 */

import type { BlockType, ManuscriptBlock } from './types.ts';

export const HARPER_ENGINE_VERSION = '2.13.0';
export const HARPER_UPDATE_MANIFEST_URL = 'https://www.readywriter.one/harper-update/manifest.json';

export type GrammarScope = 'block' | 'chapter' | 'scene' | 'section' | 'manuscript';

export const GRAMMAR_SCOPES: readonly GrammarScope[] = ['block', 'chapter', 'scene', 'section', 'manuscript'];

export const GRAMMAR_SCOPE_LABELS: Record<GrammarScope, string> = {
  block: 'Current paragraph',
  chapter: 'Current chapter',
  scene: 'Current scene',
  section: 'Current section',
  manuscript: 'Full manuscript',
};

export type GrammarSuggestionKindName = 'replace' | 'remove' | 'insert-after';

export interface GrammarSuggestionChoice {
  kind: GrammarSuggestionKindName;
  text: string;
}

/** One Harper finding, in the coordinates of a single block field. */
export interface GrammarLint {
  id: string;
  blockId: string;
  field: 'title' | 'text';
  start: number;
  end: number;
  message: string;
  lintKind: string;
  problem: string;
  suggestions: GrammarSuggestionChoice[];
}

export interface HarperUpdateManifest {
  version: string;
  engine: 'harper';
  wasmUrl: string;
  sha256: string;
}

const VERSION = /^[0-9]+(\.[0-9]+){0,3}$/;

export function compareVersions(left: string, right: string): number {
  const a = left.split('.').map((part) => Number(part) || 0);
  const b = right.split('.').map((part) => Number(part) || 0);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  if (!VERSION.test(candidate) || !VERSION.test(current)) return false;
  return compareVersions(candidate, current) > 0;
}

/** Newest of the copy shipped with the app, a cached download, and the manifest. */
export function chooseHarperSource(args: {
  bundledVersion: string;
  cachedVersion: string | null;
  remoteVersion: string | null;
}): 'bundled' | 'cached' | 'remote' {
  const cached =
    args.cachedVersion && isNewerVersion(args.cachedVersion, args.bundledVersion) ? args.cachedVersion : null;
  const remote =
    args.remoteVersion && isNewerVersion(args.remoteVersion, cached ?? args.bundledVersion) ? args.remoteVersion : null;
  if (remote) return 'remote';
  if (cached) return 'cached';
  return 'bundled';
}

export function parseHarperManifest(value: unknown, manifestUrl: string): HarperUpdateManifest | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { version?: unknown; engine?: unknown; wasm?: unknown; sha256?: unknown };
  if (record.engine !== 'harper' || typeof record.version !== 'string' || !VERSION.test(record.version)) return null;
  if (typeof record.wasm !== 'string' || !record.wasm.trim()) return null;
  if (typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(record.sha256)) return null;
  let wasmUrl: string;
  try {
    wasmUrl = new URL(record.wasm, manifestUrl).href;
  } catch {
    return null;
  }
  return { version: record.version, engine: 'harper', wasmUrl, sha256: record.sha256.toLowerCase() };
}

function headingStart(blocks: ManuscriptBlock[], index: number, kinds: ReadonlySet<BlockType>): number {
  for (let i = index; i >= 0; i--) {
    if (kinds.has(blocks[i]!.type)) return i;
  }
  return 0;
}

function headingEnd(blocks: ManuscriptBlock[], start: number, kinds: ReadonlySet<BlockType>): number {
  for (let i = start + 1; i < blocks.length; i++) {
    if (kinds.has(blocks[i]!.type)) return i;
  }
  return blocks.length;
}

/** Blocks Harper should read for one menu action. */
export function blocksForGrammarScope(
  blocks: ManuscriptBlock[],
  anchorId: string | null,
  scope: GrammarScope,
): ManuscriptBlock[] {
  if (scope === 'manuscript') return blocks;
  const found = anchorId ? blocks.findIndex((block) => block.id === anchorId) : 0;
  const index = found >= 0 ? found : 0;
  if (scope === 'block') return blocks[index] ? [blocks[index]!] : [];
  const stop =
    scope === 'chapter'
      ? new Set<BlockType>(['chapter'])
      : scope === 'scene'
        ? new Set<BlockType>(['chapter', 'scene'])
        : new Set<BlockType>(['chapter', 'scene', 'section']);
  const start = headingStart(blocks, index, stop);
  return blocks.slice(start, headingEnd(blocks, start, stop));
}

export function grammarFields(block: ManuscriptBlock): Array<{ field: 'title' | 'text'; text: string }> {
  if (block.type === 'paragraph' || block.type === 'blockquote') {
    return block.text ? [{ field: 'text', text: block.text }] : [];
  }
  if (block.type === 'chapter' || block.type === 'scene' || block.type === 'section') {
    return block.title ? [{ field: 'title', text: block.title }] : [];
  }
  return [];
}

/** Drop the accepted lint and move later findings in that field by the same edit. */
export function shiftGrammarLints(lints: GrammarLint[], accepted: GrammarLint, insertLength: number): GrammarLint[] {
  const delta = insertLength - (accepted.end - accepted.start);
  const next: GrammarLint[] = [];
  for (const lint of lints) {
    if (lint.id === accepted.id) continue;
    if (lint.blockId !== accepted.blockId || lint.field !== accepted.field) {
      next.push(lint);
      continue;
    }
    if (lint.end <= accepted.start) {
      next.push(lint);
      continue;
    }
    if (lint.start >= accepted.end) {
      next.push({ ...lint, start: lint.start + delta, end: lint.end + delta });
      continue;
    }
  }
  return next;
}

export function grammarEditForSuggestion(
  lint: GrammarLint,
  suggestion: GrammarSuggestionChoice,
): { start: number; end: number; insert: string } {
  if (suggestion.kind === 'insert-after') {
    return { start: lint.start, end: lint.end, insert: lint.problem + suggestion.text };
  }
  if (suggestion.kind === 'remove') return { start: lint.start, end: lint.end, insert: '' };
  return { start: lint.start, end: lint.end, insert: suggestion.text };
}
