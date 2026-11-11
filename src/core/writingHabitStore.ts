import type { WritingTimer } from './writingTimer.ts';
import {
  addSitting,
  addWords,
  applyRestDay,
  emptyHabit,
  habitFromStored,
  type RestTarget,
  type WritingHabit,
} from './writingHabit.ts';

export const WRITING_HABIT_KEY = 'humanuscript.writingHabit.v1';

export interface OpenSitting {
  timer: WritingTimer;
  /** Words already counted for this sitting, not including the book on screen. */
  words: number;
}

type Memory = Pick<Storage, 'getItem' | 'setItem'>;

let memory: WritingHabit | null = null;
let openSitting: OpenSitting | null = null;
const listeners = new Set<() => void>();

function browserStorage(): Memory | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadWritingHabit(storage: Pick<Storage, 'getItem'> | null = browserStorage()): WritingHabit {
  if (!storage) return emptyHabit();
  try {
    const raw = storage.getItem(WRITING_HABIT_KEY);
    if (!raw) return emptyHabit();
    return habitFromStored(JSON.parse(raw) as unknown);
  } catch {
    return emptyHabit();
  }
}

export function saveWritingHabit(habit: WritingHabit, storage: Memory | null = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(WRITING_HABIT_KEY, JSON.stringify(habit));
  } catch {
    /* the habit can stay in memory for this sitting */
  }
}

export function getWritingHabit(): WritingHabit {
  if (!memory) memory = loadWritingHabit();
  return memory;
}

export function subscribeWritingHabit(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function commit(habit: WritingHabit): void {
  memory = habit;
  saveWritingHabit(habit);
  for (const listener of listeners) listener();
}

export function recordWordsAdded(words: number, now = new Date()): void {
  const next = addWords(getWritingHabit(), words, now);
  if (next !== getWritingHabit()) commit(next);
}

export function recordSitting(args: { elapsedMs: number; words: number; now?: Date }): void {
  const next = addSitting(getWritingHabit(), {
    elapsedMs: args.elapsedMs,
    words: args.words,
    now: args.now ?? new Date(),
  });
  if (next !== getWritingHabit()) commit(next);
}

/** Returns a sentence when the rest day cannot be spent. */
export function spendRestDay(target: RestTarget, now = new Date()): string | null {
  const result = applyRestDay(getWritingHabit(), target, now);
  if (!result.ok) return result.message;
  commit(result.habit);
  return null;
}

export function stashOpenSitting(sitting: OpenSitting | null): void {
  openSitting = sitting;
}

export function takeOpenSitting(): OpenSitting | null {
  const sitting = openSitting;
  openSitting = null;
  return sitting;
}
