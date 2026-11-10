import { useEffect, useState } from "react";
import { clientDate, firstName, identityLine, prettyDate, sideWord } from "../format.ts";
import { GuideFace } from "../guides.tsx";
import { LeadActions } from "../LeadActions.tsx";
import { ProgressCard } from "../progress/ProgressCard.tsx";
import { go } from "../route.ts";
import { useSession } from "../session.tsx";
import { SipButtons } from "../Sips.tsx";
import type { Routine } from "../types.ts";
import { Avatar, Meter, Shell } from "../ui.tsx";
import { WeeklyCard } from "../WeeklyCard.tsx";

function dailyLine(routine: Routine, mine: boolean) {
  if (routine.status === "open" && routine.target > 0) {
    const count = `${routine.amount} of ${routine.target} ${routine.unit}`;
    return mine ? `${count} · ${Math.max(0, routine.target - routine.amount)} to go` : `${count} so far`;
  }
  if (routine.status === "open") return mine ? `${routine.points} pts · still to do today` : "Not done yet";
  const word = routine.status === "done" ? "Done" : "Passed on";
  return mine ? `${word} today` : `${word} ${prettyDate(routine.day)}`;
}

export function Home() {
  const { data, request } = useSession();
  const bundle = data!;
  const { me, partner } = bundle;
  const [said, setSaid] = useState<{ after: string; text: string; key: string } | null>(null);
  const [tick, setTick] = useState(0);
  // A tapped reply stays until the stuffie has news of its own, which arrives as a new greeting.
  const tapped = said && said.after === bundle.guide.text ? said : null;
  const line = tapped?.text || bundle.guide.text;
  const guideClock = bundle.guide.tz;
  const adventure = bundle.tasks.find((task) => task.templateId === "daily-adventure" && task.status === "open");
  const open = bundle.tasks.filter((task) => task.status === "open" && task.id !== adventure?.id && task.repeat !== "daily").slice(0, 3);
  const notes = bundle.checkins.slice(0, 2);
  const unseen = bundle.checkins.some((note) => !note.seenBy.includes(me.id));

  useEffect(() => {
    if (!unseen) return;
    void request("/api/checkins/see", { method: "POST" }).catch(() => undefined);
  }, [unseen, request]);

  // The stuffie can only say good morning once it knows what time it is here.
  useEffect(() => {
    const tz = new Date().getTimezoneOffset();
    if (guideClock === tz) return;
    void request("/api/guide/ask", { method: "POST", body: { topic: "home", tz } }).catch(() => undefined);
  }, [guideClock, request]);

  async function nudge() {
    try {
      setTick(tick + 1);
      const payload = (await request("/api/guide/ask", {
        method: "POST",
        body: { topic: "nudge", tick, last: line, lastKey: tapped?.key || bundle.guide.key || "", tz: new Date().getTimezoneOffset() },
      })) as unknown as { line?: { text?: string; key?: string } };
      const text = payload.line?.text;
      if (text) setSaid({ after: bundle.guide.text, text, key: payload.line?.key || "" });
    } catch {
      /* The toast shows the problem. */
    }
  }

  const theirs = partner ? firstName(partner.displayName) : "";
  const listTitle = me.slashSide === "leading" ? theirs ? `${theirs}’s tasks` : "Tasks" : "Your tasks";
  const emptyLine = me.slashSide === "leading"
    ? theirs ? `Nothing on ${theirs}’s list. Want to fix that?` : "No tasks yet. Pair up first."
    : "Nothing on your list. Enjoy it while it lasts.";

  return (
    <Shell nav>
      <div className="pad">
        <div className="household">
          <Avatar person={me} />
          <div>
            <p className="eyebrow">{sideWord(me.slashSide)} · {me.roleTitle}</p>
            <h1>{firstName(me.displayName)}</h1>
            <p className="muted">{identityLine(me)}</p>
          </div>
          {partner ? <Avatar person={partner} size={44} /> : null}
        </div>

        <button className="guide-bubble" type="button" onClick={() => void nudge()}>
          <GuideFace id={me.guideId || "lumen"} className="guide-face float" />
          <span>
            <strong>{bundle.guide.name || bundle.meta.guides.find((guide) => guide.id === me.guideId)?.name || "Your stuffie"}</strong>
            <em>{line}</em>
          </span>
        </button>

        <LeadActions />

        <ProgressCard />

        <WeeklyCard />

        {!partner && me.slashSide !== "leading" ? (
          <section className="card">
            <h2>Invite your partner</h2>
            <p>Send a link by email or text. They sign up, confirm they’re 18 or older, and the code pairs you up.</p>
            <button className="primary" type="button" onClick={() => go("/pair")}>
              Make an invite
            </button>
          </section>
        ) : null}

        {adventure ? (
          <button className="task seal-card" type="button" onClick={() => go(`/tasks/${adventure.id}`)}>
            <span className="pill gold">Sealed</span>
            <strong>{adventure.title}</strong>
            <em>{me.slashSide === "following" ? "Pick your headspace. No peeking until you lock in." : `${partner ? firstName(partner.displayName) : "Your partner"} hasn’t picked yet. Nobody knows what’s behind the doors, including you.`}</em>
          </button>
        ) : null}
        {me.slashSide === "following" && partner && !adventure ? (
          <button className="ghost wide" type="button" onClick={() => void request("/api/adventure/start", { method: "POST", body: { clientDate: clientDate() } }).then((payload) => {
            const opened = payload.tasks.find((task) => task.templateId === "daily-adventure" && task.status === "open");
            if (opened) go(`/tasks/${opened.id}`);
          }).catch(() => undefined)}>
            Start today’s adventure
          </button>
        ) : null}

        {bundle.routines.length > 0 ? (
          <section>
            <h2>Every day</h2>
            <div className="stack">
              {bundle.routines.map((routine) => {
                const counted = routine.target > 0 && routine.status === "open";
                const task = counted && me.slashSide === "following" ? bundle.tasks.find((item) => item.id === routine.taskId) : undefined;
                return (
                <div key={routine.id} className="stack tight">
                <button className={`task daily ${routine.status}`} type="button" onClick={() => go(`/tasks/${routine.taskId}`)}>
                  <i className="tick" aria-hidden="true">
                    {routine.status === "done" ? (
                      <svg viewBox="0 0 16 16" width="14" height="14"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    ) : null}
                  </i>
                  <span>
                    <strong>{routine.title}</strong>
                    <em>{dailyLine(routine, me.slashSide === "following")}</em>
                    {counted ? <Meter value={routine.amount / routine.target} tone="water" /> : null}
                  </span>
                </button>
                {task ? <SipButtons task={task} /> : null}
                </div>
                );
              })}
            </div>
          </section>
        ) : null}

        <section>
          <div className="row spread">
            <h2>{listTitle}</h2>
          </div>
          {open.length === 0 ? <p className="muted">{emptyLine}</p> : null}
          <div className="stack">
            {open.map((task) => (
              <button key={task.id} className="task" type="button" onClick={() => go(`/tasks/${task.id}`)}>
                <span className={`pill ${task.category}`}>{task.category}</span>
                <strong>{task.title}</strong>
                <em>{task.points} pts{task.dueDate ? ` · due ${prettyDate(task.dueDate)}` : ""}</em>
              </button>
            ))}
          </div>
        </section>

        {notes.length > 0 ? (
          <section>
            <h2>Between you two</h2>
            {notes.map((note) => {
              const from = note.fromUserId === me.id ? me : partner;
              return (
                <article key={note.id} className="card slim">
                  <p className="eyebrow">{from ? firstName(from.displayName) : "Note"} · {note.kind}</p>
                  <p>{note.note}</p>
                </article>
              );
            })}
          </section>
        ) : null}

        <button className="ghost wide" type="button" onClick={() => go("/ground")}>
          I need a minute
        </button>
      </div>
    </Shell>
  );
}
