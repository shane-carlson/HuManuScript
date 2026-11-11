import { formatClock } from '../core/writingTimer.ts';
import { currentStreak, recentDays, todayRecord } from '../core/writingHabit.ts';
import { useWritingHabit } from './useWritingHabit.ts';

export function StreakRail({ compact = false }: { compact?: boolean }) {
  const habit = useWritingHabit();
  const now = new Date();
  const streak = currentStreak(habit, now);
  const days = recentDays(habit, now);
  const today = todayRecord(habit, now);
  const unit = streak === 1 ? 'day' : 'days';

  return (
    <div className={`streak-rail${compact ? ' is-compact' : ''}`} aria-label="Writing streak">
      <p className="streak-rail__count">
        <span className="streak-rail__number" data-stat="streak">{streak}</span>
        <span className="streak-rail__unit">{unit}</span>
      </p>
      <ol className="streak-rail__week">
        {days.map((day) => (
          <li key={day.date} data-kind={day.kind} data-today={day.today ? 'true' : 'false'}>
            <span className="streak-rail__bar" aria-hidden="true" />
            <span className="streak-rail__letter" aria-hidden="true">{day.letter}</span>
            <span className="sr-only">
              {day.date}
              {day.today ? ', today' : ''}
              {day.kind === 'write' ? ', writing day' : day.kind === 'rest' ? ', rest day' : ', no writing'}
            </span>
          </li>
        ))}
      </ol>
      <p className="streak-rail__today">
        <span data-stat="today-time">{formatClock(today.sessionMs)}</span>
        <span data-stat="today-words">{today.words.toLocaleString()} words</span>
      </p>
    </div>
  );
}
