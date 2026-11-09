import { useEffect, useState } from "react";
import { useSession } from "../session.tsx";
import { Field, PageHead, Shell } from "../ui.tsx";

const PHASES = [
  { name: "Breathe in", scale: 1 },
  { name: "Hold", scale: 1 },
  { name: "Breathe out", scale: 0.72 },
  { name: "Hold", scale: 0.72 },
];

const SENSES = [
  { label: "See", count: 5 },
  { label: "Feel", count: 4 },
  { label: "Hear", count: 3 },
  { label: "Smell", count: 2 },
  { label: "Taste", count: 1 },
];

export function Ground() {
  const { request } = useSession();
  const [phase, setPhase] = useState(0);
  const [second, setSecond] = useState(4);
  const [running, setRunning] = useState(false);
  const [sense, setSense] = useState(0);
  const [tally, setTally] = useState(0);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setSecond((current) => {
        if (current > 1) return current - 1;
        setPhase((index) => (index + 1) % PHASES.length);
        return 4;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const current = PHASES[phase] ?? PHASES[0];
  const round = SENSES[sense] ?? SENSES[0];

  async function send(event: React.FormEvent) {
    event.preventDefault();
    try {
      await request("/api/checkins", { method: "POST", body: { kind: "grounding", note } });
      setNote("");
      setSent(true);
    } catch {
      /* The toast shows the problem. */
    }
  }

  return (
    <Shell nav>
      <div className="pad">
        <PageHead title="Grounding" kicker="When you need to land" />
        <p className="lead">A pause you can use if your partner is busy. It is a tool, not a test.</p>
        <section className="card center">
          <h2>Box breathing</h2>
          <div className="orb" style={{ transform: `scale(${current?.scale ?? 1})` }} />
          <p className="timer">{current?.name} · {second}</p>
          <button className="primary" type="button" onClick={() => setRunning((value) => !value)}>
            {running ? "Pause" : "Start"}
          </button>
        </section>
        <section className="card center">
          <h2>Count what is here</h2>
          <p className="eyebrow">{round?.label}</p>
          <p className="timer">{tally} / {round?.count}</p>
          <button
            className="ghost"
            type="button"
            onClick={() => {
              const next = tally + 1;
              if (!round) return;
              if (next >= round.count) {
                setTally(0);
                setSense((index) => (index + 1) % SENSES.length);
              } else setTally(next);
            }}
          >
            I found one
          </button>
        </section>
        <form className="card stack" onSubmit={(event) => void send(event)}>
          <h2>Tell your partner</h2>
          <Field label="A note they will see">
            <textarea value={note} rows={3} onChange={(event) => setNote(event.target.value)} placeholder="I used a pause. I am all right, or I want company." />
          </Field>
          <button className="primary" type="submit" disabled={!note.trim()}>Send the note</button>
          {sent ? <p className="fine">Sent. It is on their home screen.</p> : null}
        </form>
      </div>
    </Shell>
  );
}
