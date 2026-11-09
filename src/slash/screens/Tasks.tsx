import { useEffect, useRef, useState } from "react";
import { clientDate, experienceLabel, prettyDate, supplyHint } from "../format.ts";
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
          kicker={bundle.me.slashSide === "leading" ? "You assign" : "Yours to keep"}
          title="Promises"
          action={bundle.me.slashSide === "leading" ? (
            <button className="primary tiny" type="button" onClick={() => go("/assign")}>Assign</button>
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
          {tasks.length === 0 ? <p className="muted">No promises in this list yet.</p> : null}
          {tasks.map((task) => (
            <button key={task.id} className="task" type="button" onClick={() => go(`/tasks/${task.id}`)}>
              <span className={`pill ${task.category}`}>{task.status === "open" ? task.category : task.status}</span>
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
          <PageHead title="Assigning" kicker="Leading side" />
          <p>Your partner assigns promises. You keep them, and you can still suggest rewards.</p>
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
  return (
    <Shell nav>
      <div className="pad">
        <PageHead title="Assign a promise" kicker={bundle.partner ? `For ${bundle.partner.displayName}` : "Connect first"} />
        <div className="chips">
          {bundle.meta.categories.map((item) => (
            <Chip key={item.id} pressed={category === item.id} onClick={() => { setCategory(item.id); setPicked(""); }}>
              {item.label}
            </Chip>
          ))}
        </div>
        {category === "spicy" ? <p className="fine">Adult tasks. Either of you can skip one. Nothing here is owed.</p> : null}
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
            <Field label="Note for them">
              <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
            </Field>
            <Field label="Due date, optional">
              <input type="date" value={due} onChange={(event) => setDue(event.target.value)} />
            </Field>
            {template.promptPool ? (
              <Field label="Journal prompt">
                <select value={prompt} onChange={(event) => setPrompt(event.target.value)}>
                  {bundle.meta.journalPrompts.map((item) => <option key={item}>{item}</option>)}
                </select>
              </Field>
            ) : null}
            {template.id === "anal-training" && bundle.partner ? (
              <p className="fine">Notes will match {bundle.partner.displayName}’s experience: {experienceLabel(bundle.partner.experienceLevel)}.</p>
            ) : null}
            <button className="primary" type="submit" disabled={pending || !bundle.partner}>
              {bundle.partner ? "Send this promise" : "Connect before assigning"}
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
          <p>That promise is not in this household.</p>
          <button className="primary" type="button" onClick={() => go("/tasks")}>All tasks</button>
        </div>
      </Shell>
    );
  }
  const mine = task.assignedTo === bundle.me.id;
  const leading = bundle.me.slashSide === "leading";
  return (
    <Shell nav>
      <div className="pad">
        <button className="texty" type="button" onClick={() => go("/tasks")}>All tasks</button>
        <p className="eyebrow">{task.category} · {task.points} pts</p>
        <h1>{task.title}</h1>
        <p>{task.summary}</p>
        {task.note ? <p className="card slim">{task.note}</p> : null}
        {task.prompt ? <p className="prompt">“{task.prompt}”</p> : null}
        {task.supplyNote ? <p className="fine">{task.supplyNote}</p> : null}
        {task.coaching.length ? (
          <ul className="coaching">
            {task.coaching.map((item) => <li key={item}>{item}</li>)}
          </ul>
        ) : null}
        {task.dueDate ? <p className={task.dueDate < clientDate() && task.status === "open" ? "overdue" : "fine"}>Due {prettyDate(task.dueDate)}</p> : null}
        {task.status === "open" && mine ? <CompleteForm task={task} /> : null}
        {task.status !== "open" && task.completion ? <Completion task={task} /> : null}
        {task.status === "done" && leading && !task.acknowledgedAt ? (
          <button className="primary" type="button" onClick={() => void request(`/api/tasks/${task.id}/acknowledge`, { method: "POST" }).catch(() => undefined)}>
            I noticed this
          </button>
        ) : null}
        {task.acknowledgedAt ? <p className="fine">Noticed.</p> : null}
        {task.status === "open" && leading ? (
          <button className="texty" type="button" onClick={() => void request(`/api/tasks/${task.id}/remove`, { method: "POST" }).then(() => go("/tasks")).catch(() => undefined)}>
            Take this back
          </button>
        ) : null}
        {task.status === "open" && mine ? <Skip taskId={task.id} /> : null}
        {task.completionKind === "breath" ? (
          <button className="ghost" type="button" onClick={() => go("/ground")}>Open the breathing guide</button>
        ) : null}
      </div>
    </Shell>
  );
}

function Completion({ task }: { task: Task }) {
  const done = task.completion!;
  return (
    <section className="card">
      <p className="eyebrow">{task.status === "skipped" ? "Skipped" : "Kept"}</p>
      {done.choice ? <p>{done.choice}</p> : null}
      {done.checklist.length ? <p>{done.checklist.join(" · ")}</p> : null}
      {done.note ? <p>{done.note}</p> : null}
      {done.photos.length ? (
        <div className="photos">
          {done.photos.map((src, index) => <img key={`${task.id}-${index}`} src={src} alt="Shared in this household" />)}
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
      setError(caught instanceof Error ? caught.message : "That photo could not be added.");
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
            {left === 0 ? "Minute done" : "Start the minute"}
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
          <p className="fine">Choose {task.checklistCount} you can actually do.</p>
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
          {photos.map((src, index) => <img key={index} src={src} alt="Ready to share" />)}
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
        <Field label={task.prompt ? "What you want them to read" : "How it went"}>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} />
        </Field>
      ) : null}
      {task.consent ? (
        <label className="adult">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span>I want to share this with my partner. I can skip it instead.</span>
        </label>
      ) : null}
      <button className="primary" type="submit" disabled={pending || timerBlocked}>
        {pending ? "Saving…" : "Mark it kept"}
      </button>
    </form>
  );
}

function Skip({ taskId }: { taskId: string }) {
  const { request } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) {
    return <button className="texty" type="button" onClick={() => setOpen(true)}>Skip this</button>;
  }
  return (
    <form className="stack" onSubmit={(event) => {
      event.preventDefault();
      void request(`/api/tasks/${taskId}/skip`, { method: "POST", body: { reason } });
    }}>
      <Field label="A short reason, optional">
        <input value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <button className="ghost" type="submit">Skip it</button>
    </form>
  );
}
