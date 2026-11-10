import { prettyDate } from "../format.ts";
import { Badge, FlameMark } from "../progress/Badge.tsx";
import { DayStrip, Ring, StepPips } from "../progress/parts.tsx";
import { dayWords, daysInARow, monthName, restLine, shelfCount, sideOf, streakLine, todayLine, weekLine } from "../progress/words.ts";
import { go } from "../route.ts";
import { useSession } from "../session.tsx";
import type { Progress as ProgressData, TrophyTint } from "../types.ts";
import { Meter, PageHead, Shell } from "../ui.tsx";
import "../progress/progress.css";

const ROWS = ["M", "", "W", "", "F", "", "S"];

function Heat({ progress }: { progress: ProgressData }) {
  const weeks = [];
  for (let index = 0; index < progress.calendar.length; index += 7) weeks.push(progress.calendar.slice(index, index + 7));
  const months = weeks.map((week) => monthName(week[0].date));
  return (
    <div className="pg-heat">
      <div className="pg-heat-rows" aria-hidden="true">
        <i />
        {ROWS.map((letter, index) => (
          <i key={index}>{letter}</i>
        ))}
      </div>
      {weeks.map((week, at) => {
        const label = months[at] === months[at - 1] ? "" : months[at];
        return (
          <div key={week[0].date} className="pg-heat-week">
            <em aria-hidden="true">{label}</em>
            {week.map((entry) => (
              <i key={entry.date} className={`${entry.state}${entry.date === progress.day ? " today" : ""}`} title={dayWords(entry)}>
                <span className="sr">{dayWords(entry)}</span>
              </i>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function Progress() {
  const { data } = useSession();
  const bundle = data!;
  const progress = bundle.progress;
  if (!progress) {
    return (
      <Shell nav>
        <div className="pad">
          <PageHead title="Progress" />
          <p className="muted">Nothing to show yet. Try again in a moment.</p>
        </div>
      </Shell>
    );
  }

  const side = sideOf(bundle);
  const level = progress.level;
  const step = level.step;
  const tints = new Map<string, TrophyTint>((bundle.shelf || []).map((item) => [item.id, item.tint]));
  const tintOf = (id: string) => tints.get(`level-${id}`) || "coral";
  const shelf = shelfCount(bundle);
  const thisWeek = progress.calendar.slice(-7);
  const care = progress.care;
  const leading = bundle.me.slashSide === "leading";
  const rules = progress.rules;
  const stones = rules.streak.map((item) => item.days);
  const active = progress.calendar.filter((entry) => entry.state === "active" || entry.state === "full").length;
  const full = progress.calendar.filter((entry) => entry.state === "full").length;

  return (
    <Shell nav>
      <div className="pad pg-page">
        <PageHead
          title="Progress"
          kicker={!side.paired ? "Once you’re paired" : side.mine ? `You and ${side.leader}` : `${side.name} and you`}
          action={
            <button className="texty" type="button" onClick={() => go("/gallery")}>
              Trophy shelf
            </button>
          }
        />

        <section className="pg-hero">
          <Badge art={`level:${level.id}`} tint={tintOf(level.id)} size={96} label={level.name} />
          <div className="pg-hero-words">
            <p className="eyebrow">{side.mine ? "Your level" : side.paired ? `${side.name}’s level` : "Level"}</p>
            <h2>
              {level.name}
              {step ? <b>{step.numeral}</b> : null}
            </h2>
            <StepPips level={level} />
            {step ? <p className="pg-hero-step">Step {step.index + 1} of {step.of}: {step.name}</p> : null}
          </div>
          <div className="pg-hero-meter">
            <Meter value={step ? step.progress : level.progress} />
            <p>
              {step?.nextTitle ? (
                <>
                  <strong>{step.toNext}</strong> embers to {step.nextTitle}
                </>
              ) : (
                "The very top. Look at you two."
              )}
            </p>
            <p className="pg-hero-total">
              {progress.embers.toLocaleString()} embers so far
              {level.next && level.nextMin != null ? ` · ${level.next} at ${level.nextMin.toLocaleString()}` : ""}
            </p>
          </div>
        </section>

        <section className="card pg-today">
          <Ring progress={progress} tone="light" size={84} />
          <div>
            <p className="eyebrow">Today · {prettyDate(progress.day)}</p>
            <h2>{progress.today.full ? "A full day" : todayLine(progress, side)}</h2>
            <p className="muted">
              {progress.today.tasks === 0
                ? "Nothing finished yet today."
                : `${progress.today.tasks} ${progress.today.tasks === 1 ? "task" : "tasks"} finished, ${progress.today.points} points.`}{" "}
              {progress.today.full ? `+${progress.today.bonus} embers for the full day.` : `A full day is worth +${progress.today.bonus} embers.`}
            </p>
          </div>
        </section>

        <section className="pg-pair">
          <div className="card pg-tile">
            <p className="eyebrow">Day streak</p>
            <p className="pg-big">
              <FlameMark size={26} />
              {progress.streak.days}
            </p>
            <p className="muted">{streakLine(progress, side)}</p>
            <p className="pg-best">Best: {progress.streak.best ? daysInARow(progress.streak.best) : "none yet"}</p>
          </div>
          <div className="card pg-tile">
            <p className="eyebrow">Week streak</p>
            <p className="pg-big">{progress.week.streak}</p>
            <p className="muted">{weekLine(progress, side)}</p>
            <p className="pg-best">Best: {progress.week.best ? `${progress.week.best} ${progress.week.best === 1 ? "week" : "weeks"}` : "none yet"}</p>
          </div>
        </section>

        <p className="pg-rest">{restLine(progress)}</p>

        <section className="card">
          <div className="row spread">
            <h2>This week</h2>
            <span className="pg-patch">
              {progress.week.days} of {progress.week.need} days
            </span>
          </div>
          <div className="pg-thisweek">
            <DayStrip days={thisWeek} today={progress.day} />
          </div>
          <p className="muted">
            {progress.week.need} days with a finished task keeps the week. {progress.week.kept ? `That’s +${progress.week.bonus} embers, already yours.` : `Worth +${progress.week.bonus} embers.`}
            {progress.streak.next ? ` Next streak mark: ${progress.streak.next.days} days${progress.streak.next.embers ? `, +${progress.streak.next.embers} embers` : ""}.` : ""}
          </p>
        </section>

        <section className="card">
          <div className="row spread">
            <h2>Twelve weeks</h2>
            <span className="pg-patch">
              {active} {active === 1 ? "day" : "days"} · {full} full
            </span>
          </div>
          <Heat progress={progress} />
          <div className="pg-legend">
            <span><i className="active" />A task done</span>
            <span><i className="full" />Full day</span>
            <span><i className="rest" />Day off</span>
          </div>
        </section>

        <section className="card">
          <div className="row spread">
            <h2>The ladder</h2>
            <span className="pg-patch">{progress.embers.toLocaleString()} embers</span>
          </div>
          <ol className="pg-ladder">
            {progress.ladder.map((rung, index) => {
              const next = progress.ladder[index - 1]?.state === "here";
              const seen = rung.state !== "ahead" || next;
              return (
                <li key={rung.id} className={`${rung.state}${next ? " next" : ""}`}>
                  <Badge art={seen ? `level:${rung.id}` : undefined} tint={tintOf(rung.id)} group="levels" size={44} />
                  <span>
                    <strong>{rung.name}</strong>
                    <em>
                      {rung.state === "done"
                        ? "Done"
                        : rung.state === "here"
                          ? step
                            ? `Step ${step.index + 1} of ${step.of}, ${step.name}`
                            : "You’re here"
                          : `${(rung.min - progress.embers).toLocaleString()} embers away`}
                    </em>
                  </span>
                  <b>{rung.min.toLocaleString()}</b>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="card pg-care">
          <p className="eyebrow">{leading ? "Your side of it" : side.paired ? `${side.leader}’s side of it` : "The leading side of it"}</p>
          <h2>Care: {care.level.name}</h2>
          <Meter value={care.level.progress} />
          <p className="muted">
            {care.points.toLocaleString()} care points
            {care.level.next && care.level.nextMin != null ? ` · ${care.level.next} at ${care.level.nextMin.toLocaleString()}` : " · as high as it goes"}
          </p>
          <div className="pg-care-facts">
            <span>
              <strong>{care.given}</strong>
              <em>well dones given</em>
            </span>
            <span>
              <strong>{care.streak}</strong>
              <em>answered {care.streak === 1 ? "day" : "days"} running</em>
            </span>
            <span>
              <strong>{care.best}</strong>
              <em>best run</em>
            </span>
          </div>
          <p className="muted">
            A day is answered when every finished task got its well done.
            {leading && care.waiting > 0 ? ` ${care.waiting} ${care.waiting === 1 ? "is" : "are"} waiting on yours.` : ""}
          </p>
        </section>

        <section className="card pg-rules">
          <h2>How it works</h2>
          <ul>
            <li>Every point earned is also an ember. Points get spent on rewards. Embers stay, so a level never goes down.</li>
            <li>Each level has five steps. The first ones come quickly and the last is a climb.</li>
            <li>A full day is every daily task done, or {rules.dayPoints} points when there are no daily tasks. It adds {rules.fullDay} embers.</li>
            <li>A day streak is days in a row with a task finished. One day off a week is forgiven. Two off in a row starts it again.</li>
            <li>Streak marks at {stones.slice(0, -1).join(", ")} and {stones[stones.length - 1]} days add embers, once each.</li>
            <li>A week runs Monday to Sunday. {rules.weekDays} days with a finished task keeps it and adds {rules.weekEmbers} embers. Kept weeks in a row are the week streak.</li>
            <li>Bonus embers only move the level. They aren’t points to spend.</li>
            <li>Care points come from well dones, and they’re {leading ? "yours" : side.paired ? `${side.leader}’s` : "the leading partner’s"} to grow.</li>
          </ul>
        </section>

        <button className="ghost wide" type="button" onClick={() => go("/gallery")}>
          Trophy shelf · {shelf.have} of {shelf.of}
        </button>
      </div>
    </Shell>
  );
}
