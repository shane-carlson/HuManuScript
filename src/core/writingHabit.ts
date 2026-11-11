/**
 * A device-local writing habit. Days, streaks, points, badges, and rest days
 * live here. They are not part of a manuscript, a seal, or a registration.
 */

export const HABIT_VERSION = 1;
export const WORDS_PER_POINT = 50;
export const MINUTES_PER_POINT = 10;
export const REST_EVERY_WRITING_DAYS = 7;
export const REST_BANK_MAX = 2;
/** A timed sitting at least this long counts as writing even with no new words. */
export const MIN_SESSION_MS = 60_000;
const HOUR_MS = 60 * MIN_SESSION_MS;
const MAX_DAYS = 4000;

export type BadgeId =
  | 'first-words'
  | 'first-sitting'
  | 'steady-five-hundred'
  | 'deep-hour'
  | 'thousand-day'
  | 'streak-3'
  | 'streak-7'
  | 'streak-30'
  | 'chain-kept';

export interface BadgeCopy {
  id: BadgeId;
  name: string;
  requirement: string;
}

export const BADGES: readonly BadgeCopy[] = [
  { id: 'first-words', name: 'First words', requirement: 'Add words to a manuscript.' },
  { id: 'first-sitting', name: 'First sitting', requirement: 'End a timed sitting of at least one minute.' },
  { id: 'steady-five-hundred', name: 'Steady sitting', requirement: 'Write 500 words in one timed sitting.' },
  { id: 'deep-hour', name: 'Deep hour', requirement: 'Keep one sitting going for 60 minutes.' },
  { id: 'thousand-day', name: 'Long day', requirement: 'Add 1,000 words in a single day.' },
  { id: 'streak-3', name: 'Three days', requirement: 'Write three days in a row.' },
  { id: 'streak-7', name: 'Seven days', requirement: 'Write seven days in a row.' },
  { id: 'streak-30', name: 'Thirty days', requirement: 'Write thirty days in a row.' },
  { id: 'chain-kept', name: 'Chain kept', requirement: 'Spend a rest day and keep the streak.' },
];

export interface HabitDay {
  date: string;
  wordsAdded: number;
  sessionMs: number;
  sessions: number;
  longestSessionMs: number;
  bestSessionWords: number;
  rest: boolean;
}

export interface EarnedBadge {
  id: BadgeId;
  earnedOn: string;
}

export interface WritingHabit {
  version: typeof HABIT_VERSION;
  days: HabitDay[];
  badges: EarnedBadge[];
  /** Writing days since the last rest day was granted. Holds at 7 while the bank is full. */
  writingDaysTowardRest: number;
  restBank: number;
}

export type DayKind = 'write' | 'rest' | 'empty';

export interface RecentDay {
  date: string;
  kind: DayKind;
  today: boolean;
  letter: string;
}

export function emptyHabit(): WritingHabit {
  return { version: HABIT_VERSION, days: [], badges: [], writingDaysTowardRest: 0, restBank: 0 };
}

/** Local calendar date, YYYY-MM-DD. The streak follows the computer clock, not UTC. */
export function localDateKey(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shiftDateKey(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year || 1970, (month || 1) - 1, day || 1);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function weekdayLetter(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year || 1970, (month || 1) - 1, day || 1);
  return 'SMTWTFS'[date.getDay()] ?? 'S';
}

function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return shiftDateKey(value, 0) === value;
}

function whole(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 500_000_000;
}

export function isWritingDay(day: HabitDay | undefined): boolean {
  if (!day || day.rest) return false;
  return day.wordsAdded > 0 || day.sessionMs >= MIN_SESSION_MS;
}

export function isActiveDay(day: HabitDay | undefined): boolean {
  if (!day) return false;
  return day.rest || isWritingDay(day);
}

function dayMap(habit: WritingHabit): Map<string, HabitDay> {
  return new Map(habit.days.map((day) => [day.date, day]));
}

function sortedDays(days: HabitDay[]): HabitDay[] {
  return [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function currentStreak(habit: WritingHabit, now: Date): number {
  const dates = dayMap(habit);
  let cursor = localDateKey(now);
  if (!isActiveDay(dates.get(cursor))) cursor = shiftDateKey(cursor, -1);
  let count = 0;
  while (isActiveDay(dates.get(cursor))) {
    count += 1;
    cursor = shiftDateKey(cursor, -1);
    if (count > MAX_DAYS) break;
  }
  return count;
}

export function longestStreak(habit: WritingHabit): number {
  const active = sortedDays(habit.days).filter(isActiveDay);
  let best = 0;
  let run = 0;
  let previous = '';
  for (const day of active) {
    run = previous && shiftDateKey(previous, 1) === day.date ? run + 1 : 1;
    previous = day.date;
    if (run > best) best = run;
  }
  return best;
}

export function habitPoints(habit: WritingHabit): number {
  let words = 0;
  let sessionMs = 0;
  let writingDays = 0;
  for (const day of habit.days) {
    words += day.wordsAdded;
    sessionMs += day.sessionMs;
    if (isWritingDay(day)) writingDays += 1;
  }
  return Math.floor(words / WORDS_PER_POINT) + Math.floor(sessionMs / MIN_SESSION_MS / MINUTES_PER_POINT) + writingDays;
}

export function todayRecord(habit: WritingHabit, now: Date): { words: number; sessionMs: number } {
  const day = dayMap(habit).get(localDateKey(now));
  return { words: day?.wordsAdded ?? 0, sessionMs: day?.sessionMs ?? 0 };
}

export function recentDays(habit: WritingHabit, now: Date, count = 7): RecentDay[] {
  const dates = dayMap(habit);
  const today = localDateKey(now);
  const days: RecentDay[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = shiftDateKey(today, -index);
    const day = dates.get(date);
    const kind: DayKind = day?.rest ? 'rest' : isWritingDay(day) ? 'write' : 'empty';
    days.push({ date, kind, today: date === today, letter: weekdayLetter(date) });
  }
  return days;
}

export interface HabitBests {
  longestSessionMs: number;
  bestSessionWords: number;
  bestDayWords: number;
  longestStreak: number;
}

export function habitBests(habit: WritingHabit): HabitBests {
  let longestSessionMs = 0;
  let bestSessionWords = 0;
  let bestDayWords = 0;
  for (const day of habit.days) {
    if (day.longestSessionMs > longestSessionMs) longestSessionMs = day.longestSessionMs;
    if (day.bestSessionWords > bestSessionWords) bestSessionWords = day.bestSessionWords;
    if (day.wordsAdded > bestDayWords) bestDayWords = day.wordsAdded;
  }
  return { longestSessionMs, bestSessionWords, bestDayWords, longestStreak: longestStreak(habit) };
}

export interface RestChoice {
  today: boolean;
  yesterday: boolean;
}

/** Which rest buttons can succeed right now. */
export function restChoices(habit: WritingHabit, now: Date): RestChoice {
  return {
    today: applyRestDay(habit, 'today', now).ok,
    yesterday: applyRestDay(habit, 'yesterday', now).ok,
  };
}

function blankDay(date: string): HabitDay {
  return {
    date,
    wordsAdded: 0,
    sessionMs: 0,
    sessions: 0,
    longestSessionMs: 0,
    bestSessionWords: 0,
    rest: false,
  };
}

function putDay(habit: WritingHabit, day: HabitDay): WritingHabit {
  const days = habit.days.filter((item) => item.date !== day.date);
  days.push(day);
  return { ...habit, days: sortedDays(days).slice(-MAX_DAYS) };
}

function grantRest(habit: WritingHabit): WritingHabit {
  let next = habit;
  while (next.writingDaysTowardRest >= REST_EVERY_WRITING_DAYS && next.restBank < REST_BANK_MAX) {
    next = {
      ...next,
      restBank: next.restBank + 1,
      writingDaysTowardRest: next.writingDaysTowardRest - REST_EVERY_WRITING_DAYS,
    };
  }
  if (next.restBank >= REST_BANK_MAX && next.writingDaysTowardRest > REST_EVERY_WRITING_DAYS) {
    next = { ...next, writingDaysTowardRest: REST_EVERY_WRITING_DAYS };
  }
  return next;
}

function noteWritingDay(habit: WritingHabit, before: HabitDay | undefined, after: HabitDay): WritingHabit {
  if (isWritingDay(before) || !isWritingDay(after)) return habit;
  return grantRest({ ...habit, writingDaysTowardRest: habit.writingDaysTowardRest + 1 });
}

const BADGE_IDS = new Set<string>(BADGES.map((badge) => badge.id));

function awardBadges(habit: WritingHabit, earnedOn: string): WritingHabit {
  const have = new Set(habit.badges.map((badge) => badge.id));
  const longest = longestStreak(habit);
  const wanted: BadgeId[] = [];
  if (habit.days.some((day) => day.wordsAdded > 0)) wanted.push('first-words');
  if (habit.days.some((day) => day.sessions > 0)) wanted.push('first-sitting');
  if (habit.days.some((day) => day.bestSessionWords >= 500)) wanted.push('steady-five-hundred');
  if (habit.days.some((day) => day.longestSessionMs >= HOUR_MS)) wanted.push('deep-hour');
  if (habit.days.some((day) => day.wordsAdded >= 1000)) wanted.push('thousand-day');
  if (longest >= 3) wanted.push('streak-3');
  if (longest >= 7) wanted.push('streak-7');
  if (longest >= 30) wanted.push('streak-30');
  if (habit.days.some((day) => day.rest)) wanted.push('chain-kept');
  const badges = [...habit.badges];
  for (const id of wanted) {
    if (have.has(id)) continue;
    badges.push({ id, earnedOn });
  }
  return badges.length === habit.badges.length ? habit : { ...habit, badges };
}

export function addWords(habit: WritingHabit, words: number, now: Date): WritingHabit {
  if (!Number.isInteger(words) || words <= 0 || words > 100_000_000) return habit;
  const date = localDateKey(now);
  const before = dayMap(habit).get(date);
  const day = before && !before.rest ? { ...before } : blankDay(date);
  day.wordsAdded += words;
  let next = putDay(habit, day);
  next = noteWritingDay(next, before, day);
  return awardBadges(next, date);
}

export function addSitting(
  habit: WritingHabit,
  args: { elapsedMs: number; words: number; now: Date },
): WritingHabit {
  const elapsedMs = args.elapsedMs;
  const words = args.words;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 24 * HOUR_MS) return habit;
  if (!whole(words)) return habit;
  if (elapsedMs < 1000 && words === 0) return habit;
  const date = localDateKey(args.now);
  const before = dayMap(habit).get(date);
  const day = before && !before.rest ? { ...before } : blankDay(date);
  day.sessionMs += Math.round(elapsedMs);
  if (elapsedMs >= MIN_SESSION_MS || words > 0) day.sessions += 1;
  if (elapsedMs > day.longestSessionMs) day.longestSessionMs = Math.round(elapsedMs);
  if (words > day.bestSessionWords) day.bestSessionWords = words;
  let next = putDay(habit, day);
  next = noteWritingDay(next, before, day);
  return awardBadges(next, date);
}

export type RestTarget = 'today' | 'yesterday';

export function applyRestDay(
  habit: WritingHabit,
  target: RestTarget,
  now: Date,
): { ok: true; habit: WritingHabit } | { ok: false; message: string } {
  if (habit.restBank < 1) {
    return { ok: false, message: 'No rest day is saved. Seven writing days earn one, and two can be kept.' };
  }
  const today = localDateKey(now);
  const date = target === 'today' ? today : shiftDateKey(today, -1);
  const dates = dayMap(habit);
  const existing = dates.get(date);
  if (existing?.rest) return { ok: false, message: 'That day is already a rest day.' };
  if (existing && (existing.wordsAdded > 0 || existing.sessionMs > 0)) {
    return {
      ok: false,
      message: target === 'today' ? 'Today already has writing on it.' : 'Yesterday already has writing on it.',
    };
  }
  const previous = dates.get(shiftDateKey(date, -1));
  if (!isActiveDay(previous)) {
    return { ok: false, message: 'A rest day can only follow a writing day or another rest day.' };
  }
  const day = blankDay(date);
  day.rest = true;
  let next = putDay({ ...habit, restBank: habit.restBank - 1 }, day);
  next = grantRest(next);
  next = awardBadges(next, date);
  return { ok: true, habit: next };
}

function readDay(value: unknown): HabitDay | null {
  if (!value || typeof value !== 'object') return null;
  const day = value as Partial<HabitDay>;
  if (typeof day.date !== 'string' || !isDateKey(day.date)) return null;
  if (!whole(day.wordsAdded ?? -1) || !whole(day.sessionMs ?? -1) || !whole(day.sessions ?? -1)) return null;
  if (!whole(day.longestSessionMs ?? -1) || !whole(day.bestSessionWords ?? -1)) return null;
  if (typeof day.rest !== 'boolean') return null;
  return {
    date: day.date,
    wordsAdded: day.wordsAdded ?? 0,
    sessionMs: day.sessionMs ?? 0,
    sessions: day.sessions ?? 0,
    longestSessionMs: day.longestSessionMs ?? 0,
    bestSessionWords: day.bestSessionWords ?? 0,
    rest: day.rest,
  };
}

export function habitFromStored(value: unknown): WritingHabit {
  if (!value || typeof value !== 'object') return emptyHabit();
  const stored = value as Partial<WritingHabit>;
  if (stored.version !== HABIT_VERSION || !Array.isArray(stored.days)) return emptyHabit();
  const seen = new Map<string, HabitDay>();
  for (const item of stored.days) {
    const day = readDay(item);
    if (day) seen.set(day.date, day);
  }
  const badges: EarnedBadge[] = [];
  const badgeSeen = new Set<string>();
  if (Array.isArray(stored.badges)) {
    for (const item of stored.badges) {
      if (!item || typeof item !== 'object') continue;
      const badge = item as Partial<EarnedBadge>;
      if (typeof badge.id !== 'string' || !BADGE_IDS.has(badge.id) || badgeSeen.has(badge.id)) continue;
      if (typeof badge.earnedOn !== 'string' || !isDateKey(badge.earnedOn)) continue;
      badgeSeen.add(badge.id);
      badges.push({ id: badge.id as BadgeId, earnedOn: badge.earnedOn });
    }
  }
  const toward = stored.writingDaysTowardRest;
  const bank = stored.restBank;
  return {
    version: HABIT_VERSION,
    days: sortedDays([...seen.values()]).slice(-MAX_DAYS),
    badges,
    writingDaysTowardRest: typeof toward === 'number' && whole(toward) ? Math.min(REST_EVERY_WRITING_DAYS, toward) : 0,
    restBank: typeof bank === 'number' && whole(bank) ? Math.min(REST_BANK_MAX, bank) : 0,
  };
}
