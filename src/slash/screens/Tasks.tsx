import { useEffect, useRef, useState } from "react";
import { clientDate, experienceLabel, firstName, prettyDate, supplyHint } from "../format.ts";
import { compressImage } from "../photos.ts";
import { go } from "../route.ts";
import { useSession } from "../session.tsx";
import type { Task } from "../types.ts";
import { Chip, Field, PageHead, Shell } from "../ui.tsx";

export function Tasks() {
  const { data } = useSession();
  const bundle = data!;
  const [filter, setFilter] = useState("all");
  const tasks = bundle.tasks.filter((task) => filter === "all" || task.category === filter);
  return (
    <Shell nav>
      <div className="pad">
        <PageHead
          kicker={bundle.me.slashSide === "leading" ? "Yours to hand out" : "Yours to do"}
          title="Tasks"
          action={bundle.me.slashSide === "leading" ? (
            <button className="primary tiny" type="button" onClick={() => go("/assign")}>Give a task</button>
          ) : null}
        />
        <div className="chips">
          <Chip pressed={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
          {bundle.meta.categories.map((category) => (
            <Chip key={category.id} pressed={filter === category.id} onClick={() => setFilter(category.id)}>
              {category.label}
            </Chip>
          ))}
        </div>
        <div className="stack">
          {tasks.length === 0 ? <p className="muted">Nothing here yet.</p> : null}
          {tasks.map((task) => (
            <button key={task.id} className="task" type="button" onClick={() => go(`/tasks/${task.id}`)}>
              <span className={`pill ${task.category}`}>{task.status === "open" ? task.category : task.status === "skipped" ? "passed" : "done"}</span>
              <strong>{task.title}</strong>
              <em>{task.points} pts{task.dueDate ? ` · due ${prettyDate(task.dueDate)}` : ""}</em>
            </button>
          ))}
        </div>
      </div>
    </Shell>
  );
}

export function Assign() {
  const { data, request } = useSession();
  const bundle = data!;
  const [category, setCategory] = useState("self-care");
  const [picked, setPicked] = useState("");
  const template = bundle.meta.templates.find((item) => item.id === picked) || null;
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [due, setDue] = useState("");
  const [prompt, setPrompt] = useState(bundle.meta.journalPrompts[0] || "");
  const [pending, setPending] = useState(false);

  if (bundle.me.slashSide !== "leading") {
    return (
      <Shell nav>
        <div className="pad">
          <PageHead title="Handing out tasks" kicker="Not your side of the slash" />
          <p>Your partner hands out the tasks around here. You do them, and you can still suggest rewards.</p>
          <button className="primary" type="button" onClick={() => go("/tasks")}>Back to tasks</button>
        </div>
      </Shell>
    );
  }

  async function send() {
    if (!template) return;
    setPending(true);
    try {
      await request("/api/tasks", {
        method: "POST",
        body: {
          templateId: template.id,
          title: title || template.title,
          note,
          dueDate: due,
          prompt: template.promptPool ? prompt : "",
        },
      });
      go("/tasks");
    } catch {
      /* toast */
    } finally {
      setPending(false);
    }
  }

  const templates = bundle.meta.templates.filter((item) => item.category === category);
  const theirs = bundle.partner ? firstName(bundle.partner.displayName) : "Your partner";
  return (
    <Shell nav>
      <div className="pad">
        <PageHead title="Give a task" kicker={bundle.partner ? `For ${theirs}` : "Pair up first"} />
        <div className="chips">
          {bundle.meta.categories.map((item) => (
            <Chip key={item.id} pressed={category === item.id} onClick={() => { setCategory(item.id); setPicked(""); }}>
              {item.label}
            </Chip>
          ))}
        </div>
        {category === "spicy" ? <p className="fine">Spicy tasks are always optional. {theirs} can pass on any of them, no explanation needed.</p> : null}
        {category === "adventure" ? <p className="fine">{theirs} picks the categories blind. Neither of you sees the tasks until they’re locked in.</p> : null}
        <div className="stack">
          {templates.map((item) => (
            <button
              key={item.id}
              type="button"
              className={picked === item.id ? "task on" : "task"}
              onClick={() => {
                setPicked(item.id);
                setTitle(item.title);
              }}
            >
              <strong>{item.title}</strong>
              <em>{item.points} pts · {item.summary}</em>
              {bundle.partner && item.supplyHints.length ? <em>{supplyHint(item.supplyHints, bundle.partner.supplies)}</em> : null}
            </button>
          ))}
        </div>
        {template ? (
          <form className="card stack" onSubmit={(event) => { event.preventDefault(); void send(); }}>
            <Field label="Title">
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </Field>
            <Field label="A note from you">
              <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
            </Field>
            <Field label="Due (optional)">
              <input type="date" value={due} onChange={(event) => setDue(event.target.value)} />
            </Field>
            {template.promptPool ? (
              <Field label="What should they write about?">
                <select value={prompt} onChange={(event) => setPrompt(event.target.value)}>
                  {bundle.meta.journalPrompts.map((item) => <option key={item}>{item}</option>)}
                </select>
              </Field>
            ) : null}
            {template.id === "anal-training" && bundle.partner ? (
              <p className="fine">The suggestions will match {theirs}’s experience level: {experienceLabel(bundle.partner.experienceLevel)}.</p>
            ) : null}
            <button className="primary" type="submit" disabled={pending || !bundle.partner}>
              {bundle.partner ? `Send it to ${theirs}` : "Pair up first"}
            </button>
          </form>
        ) : null}
      </div>
    </Shell>
  );
}

export function TaskDetail({ id }: { id: string }) {
  const { data, request } = useSession();
  const bundle = data!;
  const task = bundle.tasks.find((item) => item.id === id);
  if (!task) {
    return (
      <Shell nav>
        <div className="pad">
          <p>Can’t find that task.</p>
          <button className="primary" type="button" onClick={() => go("/tasks")}>All tasks</button>
        </div>
      </Shell>
    );
  }
  const mine = task.assignedTo === bundle.me.id;
  const leading = bundle.me.slashSide === "leading";
  const theirs = bundle.partner ? firstName(bundle.partner.displayName) : "your partner";
  return (
    <Shell nav>
      <div className="pad">
        <button className="texty" type="button" onClick={() => go("/tasks")}>All tasks</button>
        <p className="eyebrow">{task.category} · {task.points} pts</p>
        <h1>{task.title}</h1>
        {task.adventure?.stage === "locked" ? <p>{mine ? "Here’s what you got. No take-backs." : `Here’s what ${theirs} got.`}</p> : <p>{task.summary}</p>}
        {task.note && task.completionKind !== "adventure" ? <p className="card slim">{task.note}</p> : null}
        {task.prompt ? <p className="prompt">“{task.prompt}”</p> : null}
        {task.supplyNote ? <p className="fine">{task.supplyNote}</p> : null}
        {task.coaching.length ? (
          <ul className="coaching">
            {task.coaching.map((item) => <li key={item}>{item}</li>)}
          </ul>
        ) : null}
        {task.dueDate ? <p className={task.dueDate < clientDate() && task.status === "open" ? "overdue" : "fine"}>Due {prettyDate(task.dueDate)}</p> : null}
        {task.completionKind === "adventure" ? <AdventureLock task={task} mine={mine} theirs={theirs} /> : null}
        {task.status === "open" && mine && task.completionKind !== "adventure" ? <CompleteForm task={task} /> : null}
        {task.status !== "open" && task.completion && task.completionKind !== "adventure" ? <Completion task={task} /> : null}
        {task.status === "done" && leading && !task.acknowledgedAt ? (
          <button className="primary" type="button" onClick={() => void request(`/api/tasks/${task.id}/acknowledge`, { method: "POST" }).catch(() => undefined)}>
            Tell {theirs} well done
          </button>
        ) : null}
        {task.acknowledgedAt ? <p className="fine">{leading ? "You said well done." : `${theirs} said well done.`}</p> : null}
        {task.status === "open" && leading ? (
          <button className="texty" type="button" onClick={() => void request(`/api/tasks/${task.id}/remove`, { method: "POST" }).then(() => go("/tasks")).catch(() => undefined)}>
            Take it back
          </button>
        ) : null}
        {task.status === "open" && mine ? <Skip taskId={task.id} /> : null}
        {task.completionKind === "breath" ? (
          <button className="ghost" type="button" onClick={() => go("/ground")}>Go to grounding</button>
        ) : null}
      </div>
    </Shell>
  );
}

function AdventureLock({ task, mine, theirs }: { task: Task; mine: boolean; theirs: string }) {
  const { data, request } = useSession();
  const seals = data?.meta.seals || [];
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const locked = task.adventure?.stage === "locked";

  async function lock() {
    setPending(true);
    try {
      await request(`/api/tasks/${task.id}/lock`, {
        method: "POST",
        body: { categories: picked, clientDate: clientDate() },
      });
    } catch {
      /* The toast shows the problem. */
    } finally {
      setPending(false);
    }
  }

  if (locked) {
    return (
      <section className="stack">
        {(task.adventure?.locked || []).map((item) => (
          <button key={item.taskId} className="task reveal" type="button" onClick={() => go(`/tasks/${item.taskId}`)}>
            <span className={`pill ${item.category}`}>{item.category}</span>
            <strong>{item.title}</strong>
          </button>
        ))}
      </section>
    );
  }

  if (!mine) {
    return <p className="card slim">Still sealed. {theirs} picks the categories, then you both find out.</p>;
  }

  return (
    <section className="stack">
      <p className="lead">So, what are you in the mood for?</p>
      <div className="seal-grid">
        {seals.map((seal) => {
          const on = picked.includes(seal.id);
          return (
            <button
              key={seal.id}
              type="button"
              className={on ? "seal on" : "seal"}
              aria-pressed={on}
              onClick={() => setPicked((current) => {
                if (current.includes(seal.id)) return current.filter((id) => id !== seal.id);
                if (current.length >= 3) return current;
                return [...current, seal.id];
              })}
            >
              <span className="eyebrow">{seal.headspace}</span>
              <strong>{seal.label}</strong>
              <em>{on ? "Picked" : "No peeking"}</em>
              <span>{seal.tease}</span>
            </button>
          );
        })}
      </div>
      <button className="primary" type="button" disabled={pending || picked.length < 1} onClick={() => void lock()}>
        {pending ? "Locking…" : "Lock it in"}
      </button>
    </section>
  );
}

function Completion({ task }: { task: Task }) {
  const done = task.completion!;
  return (
    <section className="card">
      <p className="eyebrow">{task.status === "skipped" ? "Passed on" : "Done"}</p>
      {done.choice ? <p>{done.choice}</p> : null}
      {done.checklist.length ? <p>{done.checklist.join(" · ")}</p> : null}
      {done.note ? <p>{done.note}</p> : null}
      {done.photos.length ? (
        <div className="photos">
          {done.photos.map((src, index) => <img key={`${task.id}-${index}`} src={src} alt="Shared between the two of you" />)}
        </div>
      ) : null}
    </section>
  );
}

function CompleteForm({ task }: { task: Task }) {
  const { request, setError } = useSession();
  const [note, setNote] = useState("");
  const [choice, setChoice] = useState("");
  const [checks, setChecks] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [bonuses, setBonuses] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [left, setLeft] = useState(task.timerSeconds || 0);
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState(false);
  const timerRef = useRef<number | null>(null);
  const timerBlocked = task.completionKind === "timer" && left > 0;

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
  }, []);

  function startTimer() {
    if (running || left <= 0 || timerRef.current) return;
    setRunning(true);
    timerRef.current = window.setInterval(() => {
      setLeft((current) => {
        if (current <= 1) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          timerRef.current = null;
          setRunning(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }

  async function addPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      setPhotos((current) => [...current, dataUrl].slice(0, task.photoMax || 3));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn’t add that photo.");
    }
  }

  async function finish(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await request(`/api/tasks/${task.id}/complete`, {
        method: "POST",
        body: {
          note,
          choice,
          checklist: checks,
          bonuses,
          photos,
          consent,
          clientDate: clientDate(),
        },
      });
    } catch {
      /* toast */
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="stack" onSubmit={(event) => void finish(event)}>
      {task.completionKind === "timer" ? (
        <div className="card center">
          <strong className="timer">{left}s</strong>
          <button className="ghost" type="button" onClick={startTimer} disabled={running || left === 0}>
            {left === 0 ? "Time’s up" : "Start the clock"}
          </button>
        </div>
      ) : null}
      {task.completionKind === "choices" ? (
        <div className="chips">
          {task.choices.map((item) => (
            <Chip key={item} pressed={choice === item} onClick={() => setChoice(item)}>{item}</Chip>
          ))}
        </div>
      ) : null}
      {task.completionKind === "checklist" ? (
        <div className="stack">
          <p className="fine">Pick the {task.checklistCount} you did.</p>
          <div className="chips">
            {task.checklistIdeas.map((item) => (
              <Chip
                key={item}
                pressed={checks.includes(item)}
                onClick={() => setChecks((current) => current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item])}
              >
                {item}
              </Chip>
            ))}
          </div>
          <Field label="Or add your own">
            <input value={custom} onChange={(event) => setCustom(event.target.value)} onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (custom.trim()) setChecks((current) => [...current, custom.trim()]);
                setCustom("");
              }
            }} />
          </Field>
        </div>
      ) : null}
      {task.photoMax > 0 ? (
        <Field label={task.photoLabel || "Photos"}>
          <input type="file" accept="image/*" onChange={(event) => void addPhoto(event.target.files?.[0])} />
        </Field>
      ) : null}
      {photos.length ? (
        <div className="photos">
          {photos.map((src, index) => <img key={index} src={src} alt="Ready to send" />)}
        </div>
      ) : null}
      {task.bonuses.map((bonus) => (
        <label key={bonus.id} className="adult">
          <input
            type="checkbox"
            checked={bonuses.includes(bonus.id)}
            onChange={(event) => setBonuses((current) => event.target.checked ? [...current, bonus.id] : current.filter((id) => id !== bonus.id))}
          />
          <span>{bonus.label} · +{bonus.points}</span>
        </label>
      ))}
      {task.completionKind === "note" || task.completionKind === "timer" || task.completionKind === "breath" || task.completionKind === "photos" ? (
        <Field label={task.prompt ? "What you want them to read" : "How’d it go?"}>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} />
        </Field>
      ) : null}
      {task.consent ? (
        <label className="adult">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span>Yes, I want to send this. (You can always pass instead.)</span>
        </label>
      ) : null}
      <button className="primary" type="submit" disabled={pending || timerBlocked}>
        {pending ? "Sending…" : "All done"}
      </button>
    </form>
  );
}

function Skip({ taskId }: { taskId: string }) {
  const { request } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) {
    return <button className="texty" type="button" onClick={() => setOpen(true)}>Not today</button>;
  }
  return (
    <form className="stack" onSubmit={(event) => {
      event.preventDefault();
      void request(`/api/tasks/${taskId}/skip`, { method: "POST", body: { reason } });
    }}>
      <Field label="Want to say why? You don’t have to.">
        <input value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <button className="ghost" type="submit">Pass on this one</button>
    </form>
  );
}
