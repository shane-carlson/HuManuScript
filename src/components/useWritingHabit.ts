import { useSyncExternalStore } from 'react';
import { getWritingHabit, subscribeWritingHabit } from '../core/writingHabitStore.ts';
import type { WritingHabit } from '../core/writingHabit.ts';

export function useWritingHabit(): WritingHabit {
  return useSyncExternalStore(subscribeWritingHabit, getWritingHabit, getWritingHabit);
}
