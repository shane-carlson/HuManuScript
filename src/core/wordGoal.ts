import type { ManuscriptBlock } from './types.ts';
import type { ManuscriptDocument } from './document.ts';
import { chapterWordCount, manuscriptStats } from './manuscript.ts';
import type { BookNotes } from './notes.ts';

export type GoalScope = 'session' | 'chapter';
export type WordGoalPhase = 'loading' | 'error' | 'empty' | 'ready';

export interface SessionGoal {
  bookId: string;
  target: number;
  /** Manuscript word count when the goal was set. Progress is words written after that. */
  baseline: number;
}

export function wordGoalPhase(args: { ready: boolean; error: string; target: number | null }): WordGoalPhase {
  if (!args.ready) return 'loading';
  if (args.error) return 'error';
  if (args.target == null) return 'empty';
  return 'ready';
}

export function parseGoalCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[1-9]\d{0,6}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

export function sessionWordsWritten(totalWords: number, goal: SessionGoal | null, bookId: string): number | null {
  if (!goal || goal.bookId !== bookId) return null;
  return Math.max(0, totalWords - goal.baseline);
}

export function noteAnchor(
  blocks: ManuscriptBlock[],
  blockId: string | null,
): { blockId: string; label: string } | null {
  const index = blockId ? blocks.findIndex((block) => block.id === blockId) : -1;
  const from = index >= 0 ? index : blocks.length - 1;
  let chapter: ManuscriptBlock | null = null;
  let scene: ManuscriptBlock | null = null;
  for (let i = from; i >= 0; i--) {
    const block = blocks[i]!;
    if (!scene && block.type === 'scene') scene = block;
    if (block.type === 'chapter') {
      chapter = block;
      break;
    }
  }
  const target = scene ?? chapter;
  if (!target) return null;
  if (target.type === 'scene') return { blockId: target.id, label: target.title.trim() || 'Scene' };
  let number = 0;
  for (const block of blocks) {
    if (block.type === 'chapter') number += 1;
    if (block.id === target.id) break;
  }
  const title = target.title.trim();
  return { blockId: target.id, label: title ? `Chapter ${number} · ${title}` : `Chapter ${number}` };
}

export function activeChapter(blocks: ManuscriptBlock[], blockId: string | null): ManuscriptBlock | null {
  const index = blockId ? blocks.findIndex((block) => block.id === blockId) : -1;
  const from = index >= 0 ? index : blocks.length - 1;
  for (let i = from; i >= 0; i--) {
    if (blocks[i]!.type === 'chapter') return blocks[i]!;
  }
  return null;
}

export function chapterGoalWords(blocks: ManuscriptBlock[], chapterId: string | null): number {
  if (!chapterId) return 0;
  return chapterWordCount(blocks, chapterId);
}

export function setChapterWordGoal(
  doc: ManuscriptDocument,
  chapterId: string,
  goal: number | null,
): ManuscriptDocument {
  return {
    ...doc,
    blocks: doc.blocks.map((block) => {
      if (block.id !== chapterId || block.type !== 'chapter') return block;
      if (!goal) {
        if (block.wordGoal == null) return block;
        const rest = { ...block };
        delete rest.wordGoal;
        return rest;
      }
      return { ...block, wordGoal: goal };
    }),
  };
}

export interface WritingAids {
  notes: BookNotes | undefined;
  goals: Map<string, number>;
}

export function readWritingAids(doc: ManuscriptDocument): WritingAids {
  const goals = new Map<string, number>();
  for (const block of doc.blocks) {
    if (block.type === 'chapter' && block.wordGoal && block.wordGoal > 0) goals.set(block.id, block.wordGoal);
  }
  return { notes: doc.notes, goals };
}

/** Keep notes and chapter goals on top of an undo snapshot or an in-flight text edit. */
export function applyWritingAids(doc: ManuscriptDocument, aids: WritingAids): ManuscriptDocument {
  let blocks = doc.blocks;
  let changed = false;
  const nextBlocks = blocks.map((block) => {
    if (block.type !== 'chapter') return block;
    const goal = aids.goals.get(block.id);
    if (!goal) {
      if (block.wordGoal == null) return block;
      changed = true;
      const rest = { ...block };
      delete rest.wordGoal;
      return rest;
    }
    if (block.wordGoal === goal) return block;
    changed = true;
    return { ...block, wordGoal: goal };
  });
  if (changed) blocks = nextBlocks;
  if (blocks === doc.blocks && doc.notes === aids.notes) return doc;
  return { ...doc, blocks, notes: aids.notes };
}

export function manuscriptWordTotal(doc: ManuscriptDocument): number {
  return manuscriptStats(doc.blocks).words;
}
