import type { Level, Progress, ProgressDay } from "../types.ts";
import { dayLetter, dayWords, ringCount, ringLabel } from "./words.ts";
import "./progress.css";

/** Today's ring: how much of a full day is done. */
export function Ring({ progress, size = 78, tone = "dark" }: { progress: Progress; size?: number; tone?: "dark" | "light" }) {
  const today = progress.today;
  const radius = 33;
  const around = 2 * Math.PI * radius;
  const share = Math.max(0, Math.min(1, today.progress));
  const label = today.full ? "Full day" : `${ringCount(progress).replace("/", " of ")} ${ringLabel(progress)}`;
  return (
    <span className={`pg-ring ${tone}${today.full ? " full" : ""}`} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 80 80" width={size} height={size} aria-hidden="true">
        <circle className="pg-ring-track" cx="40" cy="40" r={radius} />
        {share > 0 ? (
          <circle
            className="pg-ring-fill"
            cx="40"
            cy="40"
            r={radius}
            strokeDasharray={`${(around * share).toFixed(1)} ${around.toFixed(1)}`}
            transform="rotate(-90 40 40)"
          />
        ) : null}
        {today.full ? <path className="pg-ring-tick" d="M29 41 L37 49 L52 32" /> : null}
      </svg>
      {today.full ? null : (
        <span className="pg-ring-words">
          <strong>{ringCount(progress)}</strong>
          <em>{ringLabel(progress)}</em>
        </span>
      )}
    </span>
  );
}

/** The five steps inside a level, with the ones reached lit. */
export function StepPips({ level, step }: { level?: Level; step?: number }) {
  const at = step ?? level?.step?.index ?? 0;
  const of = level?.step?.of ?? 5;
  return (
    <span className="pg-pips" role="img" aria-label={`Step ${at + 1} of ${of}`}>
      {Array.from({ length: of }, (_, index) => (
        <i key={index} className={index < at ? "on" : index === at ? "on here" : ""} />
      ))}
    </span>
  );
}

function DayDot({ entry, today }: { entry: ProgressDay; today: boolean }) {
  return (
    <span className={`pg-day ${entry.state}${today ? " today" : ""}`} title={dayWords(entry)}>
      <i aria-hidden="true" />
      <em aria-hidden="true">{dayLetter(entry.date)}</em>
      <span className="sr">{dayWords(entry)}</span>
    </span>
  );
}

/** A row of days, one dot each. */
export function DayStrip({ days, today }: { days: ProgressDay[]; today: string }) {
  return (
    <span className="pg-days">
      {days.map((entry) => (
        <DayDot key={entry.date} entry={entry} today={entry.date === today} />
      ))}
    </span>
  );
}
