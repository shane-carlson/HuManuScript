import { useState } from "react";
import { firstName } from "../format.ts";
import { useSession } from "../session.tsx";
import { Field, PageHead, Shell } from "../ui.tsx";

export function Rewards() {
  const { data, request } = useSession();
  const bundle = data!;
  const me = bundle.me;
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [cost, setCost] = useState(25);
  const [pending, setPending] = useState(false);

  async function propose(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await request("/api/rewards", { method: "POST", body: { title, detail, cost } });
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
        <PageHead title="Rewards" kicker={`${bundle.stats.points} points to spend`} />
        <p className="lead">Suggest one. Your partner agrees. Then points can be spent. Both of you decide.</p>
        <div className="stack">
          {bundle.rewards.map((reward) => {
            const mine = reward.proposedBy === me.id;
            const agreed = reward.agreedBy.includes(me.id);
            return (
              <article key={reward.id} className="card">
                <div className="row spread">
                  <h2>{reward.title}</h2>
                  <span className="pill gold">{reward.cost} pts</span>
                </div>
                {reward.detail ? <p>{reward.detail}</p> : null}
                <p className="fine">{statusLine(reward.status, mine)}</p>
                <div className="row wrap">
                  {reward.status === "proposed" && !agreed ? (
                    <button className="primary tiny" type="button" onClick={() => void request(`/api/rewards/${reward.id}/agree`, { method: "POST" })}>
                      I agree
                    </button>
                  ) : null}
                  {reward.status === "proposed" && mine ? (
                    <button className="texty" type="button" onClick={() => void request(`/api/rewards/${reward.id}/withdraw`, { method: "POST" })}>
                      Withdraw
                    </button>
                  ) : null}
                  {reward.status === "agreed" && me.slashSide === "following" ? (
                    <button className="primary tiny" type="button" onClick={() => void request(`/api/rewards/${reward.id}/request`, { method: "POST" })}>
                      Ask for this
                    </button>
                  ) : null}
                  {reward.status === "requested" && me.slashSide === "leading" ? (
                    <button className="primary tiny" type="button" onClick={() => void request(`/api/rewards/${reward.id}/grant`, { method: "POST" })}>
                      Grant it
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
        <form className="card stack" onSubmit={(event) => void propose(event)}>
          <h2>Suggest a reward</h2>
          <Field label="Name">
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </Field>
          <Field label="What it looks like">
            <textarea value={detail} rows={3} onChange={(event) => setDetail(event.target.value)} />
          </Field>
          <Field label={`Point cost · ${cost}`}>
            <input type="range" min={5} max={150} value={cost} onChange={(event) => setCost(Number(event.target.value))} />
          </Field>
          <button className="primary" type="submit" disabled={pending}>Suggest it</button>
        </form>
        {bundle.partner ? <p className="fine">Asking and granting follow {firstName(bundle.partner.displayName)} and you, one on each side.</p> : null}
      </div>
    </Shell>
  );
}

function statusLine(status: string, mine: boolean) {
  if (status === "proposed") return mine ? "Waiting for your partner to agree." : "Your partner suggested this.";
  if (status === "agreed") return "You both agreed. Points can be asked for.";
  if (status === "requested") return "Asked for. The leading partner can grant it.";
  if (status === "granted") return "Granted.";
  return status;
}
