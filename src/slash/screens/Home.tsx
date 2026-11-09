import { useEffect, useState } from "react";
import { clientDate, firstName, identityLine, prettyDate, sideWord } from "../format.ts";
import { GuideFace } from "../guides.tsx";
import { go } from "../route.ts";
import { useSession } from "../session.tsx";
import { Avatar, Meter, Shell } from "../ui.tsx";

export function Home() {
  const { data, request } = useSession();
  const bundle = data!;
  const { me, partner, stats } = bundle;
  const [line, setLine] = useState(bundle.guide.text);
  const [tick, setTick] = useState(0);
  const adventure = bundle.tasks.find((task) => task.templateId === "daily-adventure" && task.status === "open");
  const open = bundle.tasks.filter((task) => task.status === "open" && task.id !== adventure?.id).slice(0, 3);
  const waiting = bundle.tasks.filter((task) => task.status === "done" && !task.acknowledgedAt);
  const notes = bundle.checkins.slice(0, 2);
  const unseen = bundle.checkins.some((note) => !note.seenBy.includes(me.id));

  useEffect(() => {
    if (!unseen) return;
    void request("/api/checkins/see", { method: "POST" }).catch(() => undefined);
  }, [unseen, request]);

  async function nudge() {
    try {
      const next = tick + 1;
      setTick(next);
      const payload = await request("/api/guide/nudge", { method: "POST", body: { event: "nudge", tick: next } });
      const text = (payload as { line?: { text?: string } }).line?.text;
      if (text) setLine(text);
    } catch {
      /* The toast shows the problem. */
    }
  }

  const level = stats.level;
  const follower = me.slashSide === "following" ? me : partner;

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
            <strong>{bundle.meta.guides.find((guide) => guide.id === me.guideId)?.name || "Guide"}</strong>
            <em>{line}</em>
          </span>
        </button>

        <section className="level-card">
          <div className="row spread">
            <div>
              <p className="eyebrow">{follower ? `${firstName(follower.displayName)}'s level` : "Level"}</p>
              <h2>{level.name}</h2>
            </div>
            <div className="streak">
              <strong>{stats.streak}</strong>
              <span>day streak</span>
            </div>
          </div>
          <Meter value={level.progress} />
          <p className="muted">
            {stats.points} points
            {level.next ? ` · ${level.next} at ${level.nextMin}` : " · top of the ladder"}
            {me.slashSide === "leading" ? ` · ${stats.carePoints} care points` : ""}
          </p>
        </section>

        {!partner ? (
          <section className="card">
            <h2>Invite your partner</h2>
            <p>Send a link by email or text. They register, confirm they are 18 or older, and the code connects you.</p>
            <button className="primary" type="button" onClick={() => go("/pair")}>
              Create an invite
            </button>
          </section>
        ) : null}

        {adventure ? (
          <button className="task seal-card" type="button" onClick={() => go(`/tasks/${adventure.id}`)}>
            <span className="pill gold">{adventure.adventure?.stage === "locked" ? "Locked" : "Sealed"}</span>
            <strong>{adventure.title}</strong>
            <em>{me.slashSide === "following" ? "Pick a headspace. The tasks appear only when you lock the categories." : "Waiting on their categories. The tasks are still hidden."}</em>
          </button>
        ) : null}
        {me.slashSide === "following" && partner && !adventure ? (
          <button className="ghost wide" type="button" onClick={() => void request("/api/adventure/start", { method: "POST", body: { clientDate: clientDate() } }).then((payload) => {
            const opened = payload.tasks.find((task) => task.templateId === "daily-adventure" && task.status === "open");
            if (opened) go(`/tasks/${opened.id}`);
          }).catch(() => undefined)}>
            Open today's adventure
          </button>
        ) : null}

        <section>
          <div className="row spread">
            <h2>Open promises</h2>
            {me.slashSide === "leading" ? (
              <button className="texty" type="button" onClick={() => go("/assign")}>
                Assign
              </button>
            ) : null}
          </div>
          {open.length === 0 ? <p className="muted">Nothing open. The next promise can be a small one.</p> : null}
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

        {me.slashSide === "leading" && waiting.length > 0 ? (
          <section className="card">
            <h2>Ready for you to notice</h2>
            {waiting.map((task) => (
              <button key={task.id} className="texty" type="button" onClick={() => go(`/tasks/${task.id}`)}>
                {task.title}
              </button>
            ))}
          </section>
        ) : null}

        {notes.length > 0 ? (
          <section>
            <h2>Notes between you</h2>
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
          Need a pause
        </button>
      </div>
    </Shell>
  );
}
