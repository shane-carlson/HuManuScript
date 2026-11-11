import { useState } from 'react';
import { formatClock } from '../core/writingTimer.ts';
import {
  BADGES,
  REST_BANK_MAX,
  REST_EVERY_WRITING_DAYS,
  currentStreak,
  habitBests,
  habitPoints,
  restChoices,
  type WritingHabit,
} from '../core/writingHabit.ts';
import { spendRestDay } from '../core/writingHabitStore.ts';
import { BadgeMedal } from './BadgeMedal.tsx';
import { StreakRail } from './StreakRail.tsx';
import { useWritingHabit } from './useWritingHabit.ts';

function restLine(habit: WritingHabit): string {
  const saved = `${habit.restBank} of ${REST_BANK_MAX} rest days saved`;
  if (habit.restBank >= REST_BANK_MAX && habit.writingDaysTowardRest >= REST_EVERY_WRITING_DAYS) {
    return `${saved}. The next one is ready when you spend one.`;
  }
  const left = REST_EVERY_WRITING_DAYS - habit.writingDaysTowardRest;
  const more = left === 1 ? '1 more writing day' : `${left} more writing days`;
  if (habit.restBank >= REST_BANK_MAX) {
    return `${saved}. ${more} ${left === 1 ? 'puts' : 'put'} the next one on hold until you spend one.`;
  }
  return `${saved}. ${more} ${left === 1 ? 'earns' : 'earn'} another.`;
}

export function StatsStreaksPane() {
  const habit = useWritingHabit();
  const now = new Date();
  const streak = currentStreak(habit, now);
  const points = habitPoints(habit);
  const bests = habitBests(habit);
  const choices = restChoices(habit, now);
  const earned = new Map(habit.badges.map((badge) => [badge.id, badge.earnedOn]));
  const [message, setMessage] = useState('');

  const spend = (target: 'today' | 'yesterday') => {
    const error = spendRestDay(target);
    setMessage(error ?? (target === 'today' ? 'Today is a rest day.' : 'Yesterday is a rest day.'));
  };

  return (
    <div className="stats-streaks">
      <div className="stats-streaks__head">
        <div>
          <h2>Stats &amp; Streaks</h2>
          <p>
            A writing day is a day you add words, or end a sitting of at least one minute.
            Yesterday still counts until midnight. The day follows this computer’s clock.
          </p>
        </div>
        <p className="stats-streaks__points">
          <span data-stat="points">{points.toLocaleString()}</span>
          <b>{points === 1 ? 'point' : 'points'}</b>
        </p>
      </div>
      <p className="stats-streaks__rule">
        1 point for each writing day, 1 point for every 50 words added, and 1 point for every 10 minutes on the clock.
        A rest day keeps the streak and adds no points.
      </p>

      <div className="stats-streaks__rail">
        <StreakRail />
      </div>

      <dl className="stats-streaks__bests">
        <div>
          <dt>Current streak</dt>
          <dd>{streak.toLocaleString()} {streak === 1 ? 'day' : 'days'}</dd>
        </div>
        <div>
          <dt>Longest streak</dt>
          <dd>{bests.longestStreak.toLocaleString()} {bests.longestStreak === 1 ? 'day' : 'days'}</dd>
        </div>
        <div>
          <dt>Longest sitting</dt>
          <dd>{formatClock(bests.longestSessionMs)}</dd>
        </div>
        <div>
          <dt>Most words in a sitting</dt>
          <dd>{bests.bestSessionWords.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Most words in a day</dt>
          <dd>{bests.bestDayWords.toLocaleString()}</dd>
        </div>
      </dl>

      <section className="stats-streaks__badges-section" aria-label="Badges">
        <div className="stats-streaks__section-head">
          <h3>Badges</h3>
          <p>{earned.size} of {BADGES.length}</p>
        </div>
        <ul className="stats-streaks__badges">
          {BADGES.map((badge) => {
            const on = earned.get(badge.id);
            return (
              <li key={badge.id} className={on ? 'is-earned' : 'is-ahead'} data-badge={badge.id}>
                <BadgeMedal id={badge.id} earned={Boolean(on)} />
                <div className="badge-copy">
                  <strong>{badge.name}</strong>
                  <span>{on ? `Earned ${on}` : badge.requirement}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="stats-streaks__rest" aria-label="Rest days">
        <h3>Rest days</h3>
        <p>{restLine(habit)}</p>
        <div className="stats-streaks__actions">
          <button type="button" disabled={!choices.today} onClick={() => spend('today')}>
            Mark today as a rest day
          </button>
          <button type="button" disabled={!choices.yesterday} onClick={() => spend('yesterday')}>
            Use a rest day for yesterday
          </button>
        </div>
        {message ? <p className="stats-streaks__message" role="status">{message}</p> : null}
      </section>
    </div>
  );
}
