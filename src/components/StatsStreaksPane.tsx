import { useState, type CSSProperties } from 'react';
import type { Library } from '../core/library.ts';
import { libraryWritingStats, type BookStatLine, type WritingCount } from '../core/libraryStats.ts';
import { formatClock } from '../core/writingTimer.ts';
import {
  BADGES,
  BADGE_GROUPS,
  REST_BANK_MAX,
  REST_EVERY_WRITING_DAYS,
  currentStreak,
  habitBests,
  habitPoints,
  restChoices,
  type WritingHabit,
} from '../core/writingHabit.ts';
import { spendRestDay } from '../core/writingHabitStore.ts';
import { BadgeMedal, badgeTone } from './BadgeMedal.tsx';
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

function CountLine({ counts }: { counts: WritingCount }) {
  return (
    <dl className="library-stats__counts">
      <div>
        <dt>Words</dt>
        <dd>{counts.words.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Chapters</dt>
        <dd>{counts.chapters.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Certified</dt>
        <dd>{counts.certified.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Uncertified</dt>
        <dd>{counts.uncertified.toLocaleString()}</dd>
      </div>
    </dl>
  );
}

function BookRows({ books, activeBookId }: { books: BookStatLine[]; activeBookId: string }) {
  return (
    <ul className="library-stats__books">
      {books.map((book) => (
        <li key={book.id} className={book.id === activeBookId ? 'is-active' : undefined}>
          <div className="library-stats__book">
            <strong>{book.title}</strong>
            {book.seriesLabel ? <span>{book.seriesLabel}</span> : null}
          </div>
          <CountLine counts={book.counts} />
        </li>
      ))}
    </ul>
  );
}

export function StatsStreaksPane({ library }: { library: Library }) {
  const shelf = libraryWritingStats(library);
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

      <section className="library-stats" aria-label="Library totals">
        <div className="stats-streaks__section-head">
          <h3>Library</h3>
          <p>{shelf.totals.books === 1 ? '1 book' : `${shelf.totals.books} books`}</p>
        </div>
        <article className="library-stats__group">
          <header className="library-stats__head">
            <h3>All books</h3>
            <CountLine counts={shelf.totals} />
          </header>
        </article>
        {shelf.series.map((series) => (
          <article key={series.id} className="library-stats__group">
            <header className="library-stats__head">
              <div>
                <h3>{series.name}</h3>
                <p>{series.counts.books === 1 ? '1 book' : `${series.counts.books} books`}</p>
              </div>
              <CountLine counts={series.counts} />
            </header>
            <BookRows books={series.books} activeBookId={library.activeBookId} />
          </article>
        ))}
        {shelf.standalone.length > 0 ? (
          <article className="library-stats__group">
            <header className="library-stats__head">
              <div>
                <h3>Standalone</h3>
                <p>{shelf.standalone.length === 1 ? '1 book' : `${shelf.standalone.length} books`}</p>
              </div>
              <CountLine counts={shelf.standaloneCounts} />
            </header>
            <BookRows books={shelf.standalone} activeBookId={library.activeBookId} />
          </article>
        ) : null}
      </section>

      <section className="stats-streaks__badges-section" aria-label="Achievements">
        <div className="stats-streaks__section-head">
          <h3>Achievements</h3>
          <p>{earned.size} of {BADGES.length}</p>
        </div>
        <p className="stats-streaks__badge-lead">
          Shields for a day at the desk, and for staying with the work across weeks, months, and years.
        </p>
        {BADGE_GROUPS.map((group) => (
          <div key={group.id} className="stats-streaks__badge-group">
            <h4>{group.title}</h4>
            <ul className="stats-streaks__badges">
              {BADGES.filter((badge) => badge.group === group.id).map((badge) => {
                const on = earned.get(badge.id);
                const tone = badgeTone(badge.id);
                return (
                  <li
                    key={badge.id}
                    className={on ? 'is-earned' : 'is-ahead'}
                    data-badge={badge.id}
                    style={{
                      '--shield-rim': tone.rim,
                      '--shield-a': tone.a,
                      '--shield-b': tone.b,
                      '--shield-ink': tone.ink,
                    } as CSSProperties}
                  >
                    <BadgeMedal id={badge.id} earned={Boolean(on)} />
                    <div className="badge-copy">
                      <strong>{badge.name}</strong>
                      <span>{on ? `Earned ${on}` : badge.requirement}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
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
