import { useState } from "react";
import { firstName } from "../format.ts";
import { PlusPatch } from "../plans/Plus.tsx";
import { usePlan } from "../plans/plan.ts";
import { useSession } from "../session.tsx";
import type { Plan, PlanFeature } from "../types.ts";
import { Meter, PageHead, Shell } from "../ui.tsx";
import "../plans/plans.css";

/** Where the two of them stand, in a heading and a line. */
function standing(plan: Plan, partner: string) {
  const both = partner ? `you and ${partner}` : "you";
  if (plan.preview === "free") {
    return { eyebrow: "Trying it out", title: `This is how ${plan.names.free} feels`, line: "Nothing you’ve made has gone anywhere. Flip back whenever you like." };
  }
  if (plan.earlyAccess) {
    return { eyebrow: "In testing", title: plan.note, line: `So ${both} have all of ${plan.names.plus} for now. The split below is how it would work later. Tell us what feels right and what doesn’t.` };
  }
  if (plan.preview === "plus") {
    return { eyebrow: "Trying it out", title: `This is how ${plan.names.plus} feels`, line: "Everything is open, for both of you." };
  }
  if (plan.tier === "plus") {
    return { eyebrow: "Your plan", title: `You two have ${plan.names.plus}`, line: "Everything is open, for both of you." };
  }
  return { eyebrow: "Your plan", title: `You two are on ${plan.names.free}`, line: "The whole dynamic is here. A few extras sit on the other side." };
}

function Row({ feature, plan }: { feature: PlanFeature; plan: Plan }) {
  const free = plan.effective === "free";
  const counted = feature.used != null && feature.limit != null;
  return (
    <article className="card pl-row">
      <h3>{feature.title}</h3>
      <p className="pl-line">{feature.line}</p>
      <div className="pl-sides">
        <p className={free ? "pl-side here" : "pl-side"}>
          <b>{plan.names.free}</b>
          {feature.free}
        </p>
        <p className={free ? "pl-side plus" : "pl-side plus here"}>
          <b>{plan.names.plus}</b>
          {feature.plus}
        </p>
      </div>
      {counted ? (
        <div className="pl-usage">
          <Meter value={Math.min(1, feature.used! / feature.limit!)} />
          <p>
            <strong>Right now:</strong> {feature.usage.replace(/\.$/, "")}.
          </p>
        </div>
      ) : null}
    </article>
  );
}

export function Plans() {
  const { data, request } = useSession();
  const { plan } = usePlan();
  const [pending, setPending] = useState(false);
  const partner = data?.partner ? firstName(data.partner.displayName) : "";

  if (!plan) {
    return (
      <Shell nav>
        <div className="pad">
          <PageHead title="Free and Plus" />
          <p className="muted">Nothing to show yet. Check back after the next update.</p>
        </div>
      </Shell>
    );
  }

  const now = standing(plan, partner);
  const differs = plan.features.filter((feature) => !feature.always);
  const same = plan.features.filter((feature) => feature.always);
  const free = plan.effective === "free";

  async function flip(to: "free" | "plus") {
    setPending(true);
    try {
      await request("/api/plan", { method: "POST", body: { plan: to } });
    } catch {
      /* The toast shows the problem. */
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell nav>
      <div className="pad pl-page">
        <PageHead title={`${plan.names.free} and ${plan.names.plus}`} kicker="One plan for the two of you" />

        <section className="pl-now">
          <p className="eyebrow">{now.eyebrow}</p>
          <h2>{now.title}</h2>
          <p>{now.line}</p>
        </section>

        <section className="pl-tiers" aria-label="The two plans">
          <div className={free ? "pl-tier here" : "pl-tier"}>
            <h2>{plan.names.free}</h2>
            <p>The whole dynamic: tasks, care, check-ins, levels and the shelf.</p>
            {free ? <span className="pl-here">You two are here</span> : null}
          </div>
          <div className={free ? "pl-tier plus" : "pl-tier plus here"}>
            <h2>
              {plan.names.plus}
              <PlusPatch label="extras" />
            </h2>
            <p>Everything in {plan.names.free}, with more depth, keepsakes and room to make it yours.</p>
            {free ? null : <span className="pl-here">{plan.earlyAccess ? "Yours while we test" : "You two are here"}</span>}
          </div>
        </section>

        <section className="stack">
          <div>
            <h2>Where they differ</h2>
            <p className="muted">Nothing here ever takes away something you’ve already made. A limit only stops the next one being added.</p>
          </div>
          {differs.map((feature) => (
            <Row key={feature.id} feature={feature} plan={plan} />
          ))}
        </section>

        <section className="card pl-same">
          <h2>The same on both</h2>
          <p className="muted">Never behind {plan.names.plus}, for anyone.</p>
          <ul>
            {same.map((feature) => (
              <li key={feature.id}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path d="M12 20.5C6.2 16.3 3 13 3 9.2 3 6.6 5 4.6 7.5 4.6c1.8 0 3.4 1 4.5 2.6 1.1-1.6 2.7-2.6 4.5-2.6C19 4.6 21 6.6 21 9.2c0 3.8-3.2 7.1-9 11.3z" />
                </svg>
                <span>
                  <strong>{feature.title}</strong>
                  <em>{feature.line}</em>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="pl-sale">
          <h2>{plan.names.plus} isn’t for sale yet</h2>
          <p>
            {plan.tier === "plus"
              ? "You two already have it."
              : `There’s nothing to buy and nothing to sign up for. It’s open to everyone during testing, and you’ll hear here first if that changes.`}
          </p>
        </section>

        {plan.canSwitch ? (
          <section className="card pl-try">
            <h2>Try each one on</h2>
            <p className="muted">
              This copy of SlashConnect can show you exactly how {plan.names.free} feels. It switches for both of you, keeps everything you’ve made, and flips straight back.
            </p>
            <div className="pl-flip" role="group" aria-label="Which plan to try">
              <button type="button" className={free ? "pl-flip-on" : ""} aria-pressed={free} disabled={pending} onClick={() => void flip("free")}>
                {plan.names.free}
              </button>
              <button type="button" className={free ? "" : "pl-flip-on"} aria-pressed={!free} disabled={pending} onClick={() => void flip("plus")}>
                {plan.names.plus}
                {plan.earlyAccess ? <em>as it is in testing</em> : null}
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </Shell>
  );
}
