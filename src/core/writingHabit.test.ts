import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addSitting,
  addWords,
  applyRestDay,
  currentStreak,
  emptyHabit,
  habitBests,
  habitFromStored,
  habitPoints,
  longestStreak,
  MIN_SESSION_MS,
  recentDays,
  restChoices,
} from './writingHabit.ts';

const day = (iso: string, hour = 12) => {
  const [year, month, date] = iso.split('-').map(Number);
  return new Date(year!, month! - 1, date!, hour, 0, 0, 0);
};

test('added words start a streak and count again the next day', () => {
  let habit = addWords(emptyHabit(), 120, day('2026-11-01'));
  assert.equal(currentStreak(habit, day('2026-11-01')), 1);
  assert.equal(habit.days[0]!.wordsAdded, 120);
  habit = addWords(habit, 30, day('2026-11-01', 18));
  assert.equal(habit.days[0]!.wordsAdded, 150);
  habit = addWords(habit, 10, day('2026-11-02'));
  assert.equal(currentStreak(habit, day('2026-11-02')), 2);
  assert.equal(currentStreak(habit, day('2026-11-03', 8)), 2);
  assert.equal(currentStreak(habit, day('2026-11-04')), 0);
});

test('a missed day breaks the streak and one rest day can bridge yesterday', () => {
  let habit = emptyHabit();
  for (let index = 0; index < 7; index += 1) {
    habit = addWords(habit, 20, day(`2026-11-${String(index + 1).padStart(2, '0')}`));
  }
  assert.equal(habit.restBank, 1);
  assert.equal(habit.writingDaysTowardRest, 0);
  const morning = day('2026-11-09', 8);
  assert.equal(currentStreak(habit, morning), 0);
  assert.equal(restChoices(habit, morning).yesterday, true);
  assert.equal(restChoices(habit, morning).today, false);
  const rested = applyRestDay(habit, 'yesterday', morning);
  assert.equal(rested.ok, true);
  if (!rested.ok) return;
  habit = rested.habit;
  assert.equal(currentStreak(habit, morning), 8);
  assert.equal(habit.restBank, 0);
  assert.equal(habit.badges.some((badge) => badge.id === 'chain-kept'), true);
  assert.equal(applyRestDay(habit, 'yesterday', morning).ok, false);
});

test('rest days are saved two at a time and the next one waits until one is spent', () => {
  let habit = emptyHabit();
  for (let index = 0; index < 14; index += 1) {
    const date = day('2026-10-01');
    date.setDate(date.getDate() + index);
    habit = addWords(habit, 10, date);
  }
  assert.equal(habit.restBank, 2);
  assert.equal(habit.writingDaysTowardRest, 0);
  for (let index = 0; index < 7; index += 1) {
    const date = day('2026-10-15');
    date.setDate(date.getDate() + index);
    habit = addWords(habit, 10, date);
  }
  assert.equal(habit.restBank, 2);
  assert.equal(habit.writingDaysTowardRest, 7);
  const now = day('2026-10-22');
  const rested = applyRestDay(habit, 'today', now);
  assert.equal(rested.ok, true);
  if (!rested.ok) return;
  assert.equal(rested.habit.restBank, 2);
  assert.equal(rested.habit.writingDaysTowardRest, 0);
  assert.equal(currentStreak(rested.habit, now), 22);
});

test('a rest day cannot start a chain or cover a day that already has writing', () => {
  const habit = addWords(emptyHabit(), 40, day('2026-11-02'));
  const withBank = { ...habit, restBank: 1 };
  assert.equal(applyRestDay(withBank, 'today', day('2026-11-02')).ok, false);
  assert.equal(applyRestDay(emptyHabit(), 'today', day('2026-11-02')).ok, false);
  assert.equal(applyRestDay(withBank, 'yesterday', day('2026-11-05')).ok, false);
});

test('points come from days, words, and time on the clock', () => {
  let habit = addWords(emptyHabit(), 120, day('2026-11-01'));
  habit = addSitting(habit, { elapsedMs: 25 * MIN_SESSION_MS, words: 80, now: day('2026-11-01') });
  assert.equal(habitPoints(habit), 1 + Math.floor(120 / 50) + Math.floor(25 / 10));
  assert.equal(habit.days[0]!.sessions, 1);
  assert.equal(habit.days[0]!.bestSessionWords, 80);
});

test('a short clock does not make a writing day, and a minute does', () => {
  const brief = addSitting(emptyHabit(), { elapsedMs: 20_000, words: 0, now: day('2026-11-01') });
  assert.equal(currentStreak(brief, day('2026-11-01')), 0);
  assert.equal(brief.days[0]!.sessions, 0);
  const minute = addSitting(emptyHabit(), { elapsedMs: MIN_SESSION_MS, words: 0, now: day('2026-11-01') });
  assert.equal(currentStreak(minute, day('2026-11-01')), 1);
  assert.equal(minute.badges.some((badge) => badge.id === 'first-sitting'), true);
});

test('badges record the day they were reached', () => {
  let habit = emptyHabit();
  habit = addWords(habit, 1000, day('2026-11-01'));
  habit = addSitting(habit, { elapsedMs: 60 * MIN_SESSION_MS, words: 500, now: day('2026-11-01') });
  const ids = habit.badges.map((badge) => badge.id);
  assert.ok(ids.includes('first-words'));
  assert.ok(ids.includes('thousand-day'));
  assert.ok(ids.includes('deep-hour'));
  assert.ok(ids.includes('steady-five-hundred'));
  assert.equal(habit.badges.find((badge) => badge.id === 'first-words')!.earnedOn, '2026-11-01');
  const bests = habitBests(habit);
  assert.equal(bests.bestDayWords, 1000);
  assert.equal(bests.bestSessionWords, 500);
  assert.equal(bests.longestSessionMs, 60 * MIN_SESSION_MS);
});

test('the week rail marks writing, rest, and empty days', () => {
  let habit = addWords(emptyHabit(), 10, day('2026-11-08'));
  habit = addWords(habit, 10, day('2026-11-09'));
  habit = { ...habit, restBank: 1 };
  const rested = applyRestDay(habit, 'today', day('2026-11-10'));
  assert.equal(rested.ok, true);
  if (!rested.ok) return;
  const week = recentDays(rested.habit, day('2026-11-10'));
  assert.equal(week.length, 7);
  assert.equal(week[6]!.today, true);
  assert.equal(week[6]!.kind, 'rest');
  assert.equal(week[5]!.kind, 'write');
  assert.equal(week[4]!.kind, 'write');
  assert.equal(week[3]!.kind, 'empty');
  assert.equal(longestStreak(rested.habit), 3);
});

test('a stored habit drops broken records and keeps the rest', () => {
  const habit = habitFromStored({
    version: 1,
    days: [
      {
        date: '2026-11-01',
        wordsAdded: 40,
        sessionMs: 0,
        sessions: 0,
        longestSessionMs: 0,
        bestSessionWords: 0,
        rest: false,
      },
      { date: 'nope', wordsAdded: 1, sessionMs: 0, sessions: 0, longestSessionMs: 0, bestSessionWords: 0, rest: false },
    ],
    badges: [{ id: 'first-words', earnedOn: '2026-11-01' }, { id: 'nope', earnedOn: '2026-11-01' }],
    writingDaysTowardRest: 3,
    restBank: 9,
  });
  assert.equal(habit.days.length, 1);
  assert.equal(habit.badges.length, 1);
  assert.equal(habit.restBank, 2);
  assert.equal(habitFromStored(null).days.length, 0);
});

function writeSpan(start: string, count: number, words = 40) {
  let habit = emptyHabit();
  const date = day(start);
  for (let index = 0; index < count; index += 1) {
    const cursor = new Date(date);
    cursor.setDate(date.getDate() + index);
    habit = addWords(habit, words, cursor);
  }
  return habit;
}

test('shields mark a return visit, a page, and a second sitting', () => {
  let habit = addWords(emptyHabit(), 250, day('2026-11-01'));
  assert.equal(habit.badges.some((badge) => badge.id === 'page-day'), true);
  assert.equal(habit.badges.some((badge) => badge.id === 'thousand-day'), false);
  habit = addWords(habit, 20, day('2026-11-09'));
  assert.equal(habit.badges.some((badge) => badge.id === 'came-back'), true);
  habit = addSitting(habit, { elapsedMs: MIN_SESSION_MS, words: 10, now: day('2026-11-09') });
  habit = addSitting(habit, { elapsedMs: MIN_SESSION_MS, words: 10, now: day('2026-11-09') });
  assert.equal(habit.badges.some((badge) => badge.id === 'back-again'), true);
});

test('week and month shields open on schedule, and a gap still counts the days', () => {
  const week = writeSpan('2026-11-01', 7);
  const weekIds = week.badges.map((badge) => badge.id);
  assert.ok(weekIds.includes('streak-3'));
  assert.ok(weekIds.includes('streak-7'));
  assert.ok(weekIds.includes('week-filled'));
  assert.equal(weekIds.includes('streak-14'), false);

  let gapped = writeSpan('2026-01-01', 29);
  gapped = addWords(gapped, 20, day('2026-02-07'));
  const gappedIds = gapped.badges.map((badge) => badge.id);
  assert.ok(gappedIds.includes('writing-days-30'));
  assert.ok(gappedIds.includes('streak-28'));
  assert.equal(gappedIds.includes('streak-30'), false);
  assert.ok(gappedIds.includes('came-back'));
});

test('months and years count the calendar, not only an unbroken streak', () => {
  let habit = emptyHabit();
  for (const iso of ['2024-01-04', '2024-06-02', '2025-03-09', '2026-11-01', '2027-02-02']) {
    habit = addWords(habit, 30, day(iso));
  }
  assert.equal(habit.badges.some((badge) => badge.id === 'season'), true);
  assert.equal(habit.badges.some((badge) => badge.id === 'five-years'), false);
  habit = addWords(habit, 30, day('2028-04-04'));
  assert.equal(habit.badges.some((badge) => badge.id === 'five-years'), true);
  assert.equal(habit.badges.some((badge) => badge.id === 'streak-365'), false);

  let year = emptyHabit();
  for (let month = 1; month <= 12; month += 1) {
    year = addWords(year, 15, day(`2024-${String(month).padStart(2, '0')}-03`));
  }
  assert.equal(year.badges.some((badge) => badge.id === 'year-round'), true);
  assert.equal(year.badges.some((badge) => badge.id === 'writing-days-365'), false);

  const novel = addWords(emptyHabit(), 50_000, day('2026-11-01'));
  assert.equal(novel.badges.some((badge) => badge.id === 'words-50k'), true);
  assert.equal(novel.badges.some((badge) => badge.id === 'words-10k'), true);
  assert.equal(novel.badges.some((badge) => badge.id === 'words-100k'), false);
});

test('a saved habit gains shields the days already earned', () => {
  const habit = habitFromStored({
    version: 1,
    days: [
      {
        date: '2026-11-01',
        wordsAdded: 250,
        sessionMs: 0,
        sessions: 0,
        longestSessionMs: 0,
        bestSessionWords: 0,
        rest: false,
      },
    ],
    badges: [],
    writingDaysTowardRest: 1,
    restBank: 0,
  });
  assert.equal(habit.badges.some((badge) => badge.id === 'page-day'), true);
  assert.equal(habit.badges.find((badge) => badge.id === 'page-day')!.earnedOn, '2026-11-01');
  const later = habitFromStored({
    version: 1,
    days: [
      {
        date: '2026-11-01',
        wordsAdded: 40,
        sessionMs: 0,
        sessions: 0,
        longestSessionMs: 0,
        bestSessionWords: 0,
        rest: false,
      },
      {
        date: '2026-11-02',
        wordsAdded: 1000,
        sessionMs: 0,
        sessions: 0,
        longestSessionMs: 0,
        bestSessionWords: 0,
        rest: false,
      },
    ],
    badges: [],
    writingDaysTowardRest: 2,
    restBank: 0,
  });
  assert.equal(later.badges.find((badge) => badge.id === 'first-words')!.earnedOn, '2026-11-01');
  assert.equal(later.badges.find((badge) => badge.id === 'thousand-day')!.earnedOn, '2026-11-02');
});
