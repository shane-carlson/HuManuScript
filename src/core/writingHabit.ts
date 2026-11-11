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

export type BadgeGroup = 'today' | 'weeks' | 'months' | 'years';

export const BADGE_GROUPS: readonly { id: BadgeGroup; title: string }[] = [
  { id: 'today', title: 'Today' },
  { id: 'weeks', title: 'Weeks' },
  { id: 'months', title: 'Months' },
  { id: 'years', title: 'Years' },
];

export interface BadgeCopy {
  id: string;
  name: string;
  requirement: string;
  group: BadgeGroup;
}

export const BADGES = [
  { id: 'first-words', name: 'First words', requirement: 'Add words to a manuscript.', group: 'today' },
  { id: 'first-sitting', name: 'First sitting', requirement: 'End a timed sitting of at least one minute.', group: 'today' },
  { id: 'back-again', name: 'Back again', requirement: 'Come back for a second sitting in the same day.', group: 'today' },
  { id: 'page-day', name: 'A page', requirement: 'Add 250 words in a single day.', group: 'today' },
  { id: 'steady-five-hundred', name: 'Steady sitting', requirement: 'Write 500 words in one timed sitting.', group: 'today' },
  { id: 'deep-hour', name: 'Deep hour', requirement: 'Keep one sitting going for 60 minutes.', group: 'today' },
  { id: 'thousand-day', name: 'Long day', requirement: 'Add 1,000 words in a single day.', group: 'today' },
  { id: 'came-back', name: 'Came back', requirement: 'Write again after at least a week away.', group: 'today' },
  { id: 'chain-kept', name: 'Chain kept', requirement: 'Spend a rest day and keep the streak.', group: 'today' },
  { id: 'streak-3', name: 'Three days', requirement: 'Write three days in a row.', group: 'weeks' },
  { id: 'streak-7', name: 'One week', requirement: 'Write seven days in a row.', group: 'weeks' },
  { id: 'week-filled', name: 'A full week', requirement: 'Write on five days inside one week.', group: 'weeks' },
  { id: 'streak-14', name: 'Two weeks', requirement: 'Write fourteen days in a row.', group: 'weeks' },
  { id: 'streak-28', name: 'Four weeks', requirement: 'Write twenty-eight days in a row.', group: 'weeks' },
  { id: 'streak-30', name: 'Thirty days', requirement: 'Write thirty days in a row.', group: 'months' },
  { id: 'writing-days-30', name: 'A month of days', requirement: 'Write on 30 days, with gaps allowed.', group: 'months' },
  { id: 'streak-60', name: 'Two months', requirement: 'Write sixty days in a row.', group: 'months' },
  { id: 'season', name: 'A season', requirement: 'Write in three different months.', group: 'months' },
  { id: 'words-10k', name: 'Ten thousand', requirement: 'Add 10,000 words in all.', group: 'months' },
  { id: 'streak-100', name: 'A hundred days', requirement: 'Write 100 days in a row.', group: 'months' },
  { id: 'writing-days-100', name: 'A hundred sittings', requirement: 'Write on 100 days, with gaps allowed.', group: 'years' },
  { id: 'words-50k', name: 'Novel length', requirement: 'Add 50,000 words in all.', group: 'years' },
  { id: 'words-100k', name: 'A long book', requirement: 'Add 100,000 words in all.', group: 'years' },
  { id: 'year-round', name: 'The whole year', requirement: 'Write in twelve different months.', group: 'years' },
  { id: 'streak-365', name: 'A year unbroken', requirement: 'Write 365 days in a row.', group: 'years' },
  { id: 'writing-days-365', name: 'A year of pages', requirement: 'Write on 365 days, with gaps allowed.', group: 'years' },
  { id: 'five-years', name: 'Five years', requirement: 'Write in five different calendar years.', group: 'years' },
] as const satisfies readonly BadgeCopy[];

export type BadgeId = (typeof BADGES)[number]['id'];

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

function daysBetween(earlier: string, later: string): number {
  const [year, month, day] = earlier.split('-').map(Number);
  const [laterYear, laterMonth, laterDay] = later.split('-').map(Number);
  const start = Date.UTC(year || 1970, (month || 1) - 1, day || 1);
  const end = Date.UTC(laterYear || 1970, (laterMonth || 1) - 1, laterDay || 1);
  return Math.round((end - start) / 86_400_000);
}

function cameBack(days: HabitDay[]): boolean {
  const writing = sortedDays(days).filter(isWritingDay);
  for (let index = 1; index < writing.length; index += 1) {
    if (daysBetween(writing[index - 1]!.date, writing[index]!.date) >= 8) return true;
  }
  return false;
}

function hasFullWeek(days: HabitDay[]): boolean {
  const writing = days.filter(isWritingDay).map((day) => day.date);
  if (writing.length < 5) return false;
  const have = new Set(writing);
  for (const start of writing) {
    let count = 0;
    for (let offset = 0; offset < 7; offset += 1) {
      if (have.has(shiftDateKey(start, offset))) count += 1;
    }
    if (count >= 5) return true;
  }
  return false;
}

function awardBadges(habit: WritingHabit, earnedOn: string): WritingHabit {
  const have = new Set(habit.badges.map((badge) => badge.id));
  const writing = habit.days.filter(isWritingDay);
  const words = habit.days.reduce((sum, day) => sum + day.wordsAdded, 0);
  const longest = longestStreak(habit);
  const months = new Set(writing.map((day) => day.date.slice(0, 7))).size;
  const years = new Set(writing.map((day) => day.date.slice(0, 4))).size;
  const hits: Record<BadgeId, boolean> = {
    'first-words': habit.days.some((day) => day.wordsAdded > 0),
    'first-sitting': habit.days.some((day) => day.sessions > 0),
    'back-again': habit.days.some((day) => day.sessions >= 2),
    'page-day': habit.days.some((day) => day.wordsAdded >= 250),
    'steady-five-hundred': habit.days.some((day) => day.bestSessionWords >= 500),
    'deep-hour': habit.days.some((day) => day.longestSessionMs >= HOUR_MS),
    'thousand-day': habit.days.some((day) => day.wordsAdded >= 1000),
    'came-back': cameBack(habit.days),
    'chain-kept': habit.days.some((day) => day.rest),
    'streak-3': longest >= 3,
    'streak-7': longest >= 7,
    'week-filled': hasFullWeek(habit.days),
    'streak-14': longest >= 14,
    'streak-28': longest >= 28,
    'streak-30': longest >= 30,
    'writing-days-30': writing.length >= 30,
    'streak-60': longest >= 60,
    season: months >= 3,
    'words-10k': words >= 10_000,
    'streak-100': longest >= 100,
    'writing-days-100': writing.length >= 100,
    'words-50k': words >= 50_000,
    'words-100k': words >= 100_000,
    'year-round': months >= 12,
    'streak-365': longest >= 365,
    'writing-days-365': writing.length >= 365,
    'five-years': years >= 5,
  };
  const badges = [...habit.badges];
  for (const badge of BADGES) {
    if (have.has(badge.id) || !hits[badge.id]) continue;
    badges.push({ id: badge.id, earnedOn });
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
  const habit: WritingHabit = {
    version: HABIT_VERSION,
    days: sortedDays([...seen.values()]).slice(-MAX_DAYS),
    badges,
    writingDaysTowardRest: typeof toward === 'number' && whole(toward) ? Math.min(REST_EVERY_WRITING_DAYS, toward) : 0,
    restBank: typeof bank === 'number' && whole(bank) ? Math.min(REST_BANK_MAX, bank) : 0,
  };
  if (habit.days.length === 0) return habit;
  const filled = awardBadges(habit, habit.days[habit.days.length - 1]!.date);
  if (filled.badges.length === habit.badges.length) return habit;
  let replay: WritingHabit = { ...habit, days: [] };
  for (const day of habit.days) {
    replay = awardBadges({ ...replay, days: [...replay.days, day] }, day.date);
  }
  return { ...habit, badges: replay.badges };
}
