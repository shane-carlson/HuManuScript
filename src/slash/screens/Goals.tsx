import { useState } from "react";
import { useSession } from "../session.tsx";
import { Field, Meter, PageHead, Shell } from "../ui.tsx";

export function Goals() {
  const { data, request } = useSession();
  const bundle = data!;
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [pending, setPending] = useState(false);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await request("/api/goals", { method: "POST", body: { title, detail, target: 5 } });
      setTitle("");
      setDetail("");
    } catch {
      /* toast */
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell nav>
      <div className="pad">
        <PageHead title="Goals" kicker="What you two are working on" />
        <p className="lead">Finished tasks move these along. You can also bump one by hand.</p>
        <div className="stack">
          {bundle.goals.map((goal) => (
            <article key={goal.id} className="card">
              <div className="row spread">
                <h2>{goal.title}</h2>
                <span className="muted">{goal.progress}/{goal.target}</span>
              </div>
              <p>{goal.detail}</p>
              <Meter value={goal.target ? goal.progress / goal.target : 0} />
              <button className="texty" type="button" onClick={() => void request(`/api/goals/${goal.id}/step`, { method: "POST" })}>
                Bump it
              </button>
            </article>
          ))}
        </div>
        <form className="card stack" onSubmit={(event) => void add(event)}>
          <h2>Add a goal</h2>
          <Field label="Name">
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </Field>
          <Field label="What does it look like?">
            <input value={detail} onChange={(event) => setDetail(event.target.value)} />
          </Field>
          <button className="primary" type="submit" disabled={pending}>Add it</button>
        </form>
      </div>
    </Shell>
  );
}
