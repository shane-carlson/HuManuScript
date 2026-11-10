import { clientDate, firstName, prettyDate } from "../format.ts";
import { go } from "../route.ts";
import { useSession } from "../session.tsx";
import { Meter } from "../ui.tsx";
import { FlameMark } from "./Badge.tsx";
import { DayStrip, Ring, StepPips } from "./parts.tsx";
import { lastSeven, shelfCount, sideOf, todayLine } from "./words.ts";
import "./progress.css";

/** The progress card on Home: today, the level and its step, both streaks, and the last seven days. */
export function ProgressCard() {
  const { data } = useSession();
  if (!data) return null;
  const { me, partner, stats } = data;
  const progress = data.progress;

  if (!progress) {
    const follower = me.slashSide === "following" ? me : partner;
    return (
      <section className="level-card">
        <div className="row spread">
          <div>
            <p className="eyebrow">{follower ? `${firstName(follower.displayName)}’s level` : "Level"}</p>
            <h2>{stats.level.name}</h2>
          </div>
          <div className="streak">
            <strong>{stats.streak}</strong>
            <span>day streak</span>
          </div>
        </div>
        <Meter value={stats.level.progress} />
        <p className="muted">{stats.points} points</p>
      </section>
    );
  }

  const side = sideOf(data);
  const level = progress.level;
  const step = level.step;
  const shelf = shelfCount(data);
  const otherDay = progress.day !== clientDate();
  const waiting = me.slashSide === "leading" ? progress.care.waiting : 0;

  return (
    <section className="pg-card" aria-label="Progress">
      <button className="pg-card-main" type="button" onClick={() => go("/progress")}>
        <span className="pg-card-top">
          <Ring progress={progress} />
          <span className="pg-card-level">
            <span className="eyebrow">
              {side.mine ? "Your level" : side.paired ? `${side.name}’s level` : "Level"}
              {otherDay && side.paired ? ` · ${prettyDate(progress.day)}` : ""}
            </span>
            <span className="pg-card-name">
              {level.name}
              {step ? <b>{step.numeral}</b> : null}
            </span>
            <StepPips level={level} />
          </span>
        </span>

        <Meter value={step ? step.progress : level.progress} />
        <span className="pg-card-next">
          {step?.nextTitle ? (
            <span>
              <strong>{step.toNext}</strong> embers to {step.nextTitle}
            </span>
          ) : (
            <span>As high as it goes</span>
          )}
          {level.next && level.nextMin != null ? <span>{level.next} at {level.nextMin.toLocaleString()}</span> : null}
        </span>

        <span className="pg-card-line">{todayLine(progress, side)}</span>

        <span className="pg-card-week">
          <DayStrip days={lastSeven(progress)} today={progress.day} />
        </span>

        <span className="pg-card-stats">
          <span className={progress.streak.doneToday || progress.streak.days === 0 ? "pg-stat" : "pg-stat due"}>
            <FlameMark size={18} />
            <strong>{progress.streak.days}</strong>
            <em>day streak</em>
          </span>
          <span className="pg-stat">
            <strong>{progress.week.streak}</strong>
            <em>{progress.week.streak === 1 ? "week kept" : "weeks kept"}</em>
          </span>
          <span className="pg-stat">
            <strong>
              {progress.week.days}/{progress.week.need}
            </strong>
            <em>days this week</em>
          </span>
        </span>

        {me.slashSide === "leading" ? (
          <span className="pg-card-care">
            Your care: <strong>{progress.care.level.name}</strong>
            {waiting > 0 ? ` · ${waiting} waiting on your well done` : progress.care.streak > 0 ? ` · ${progress.care.streak} answered ${progress.care.streak === 1 ? "day" : "days"} running` : ""}
          </span>
        ) : null}
      </button>
      <div className="pg-card-foot">
        <button type="button" onClick={() => go("/progress")}>
          See progress
        </button>
        <button type="button" onClick={() => go("/gallery")}>
          Trophy shelf · {shelf.have} of {shelf.of}
        </button>
      </div>
    </section>
  );
}
