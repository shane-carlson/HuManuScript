import { useState } from "react";
import { firstName } from "./format.ts";
import { go } from "./route.ts";
import { useSession } from "./session.tsx";
import { isPutOff, putOffUntilTomorrow } from "./weekly.ts";
import "./weekly.css";

/**
 * This week's check-in, on the following partner's Home. The leading partner
 * has the same thing among their things to do, so it is not shown to them twice.
 */
export function WeeklyCard() {
  const { data } = useSession();
  const [, setPutOff] = useState(0);
  const weekly = data?.weekly;
  const me = data?.me;
  const partner = data?.partner;
  if (!weekly || !weekly.available || !me || !partner || me.slashSide === "leading") return null;

  const theirName = firstName(partner.displayName);
  const later = () => {
    putOffUntilTomorrow(me.id, weekly.today);
    setPutOff((count) => count + 1);
  };

  if (weekly.state === "mine-in") {
    return (
      <section className="wk-card slim" aria-label="This week’s check-in">
        <p>Your check-in is in. {theirName} hasn’t sent one yet.</p>
        <button className="wk-later" type="button" onClick={() => go("/weekly")}>See mine</button>
      </section>
    );
  }

  if (weekly.state === "both") {
    if (!weekly.unread) return null;
    return (
      <section className="wk-card">
        <p className="eyebrow">This week’s check-in</p>
        <h2>{weekly.unread === "changed" ? `${theirName} changed a few things` : "Both are in"}</h2>
        <p>
          {weekly.unread === "changed"
            ? "Have another read when you’ve got a quiet minute."
            : `Yours and ${theirName}’s, ready to read side by side.`}
        </p>
        <div className="wk-card-actions">
          <button className="wk-card-go" type="button" onClick={() => go("/weekly")}>Read them</button>
        </div>
      </section>
    );
  }

  if (isPutOff(me.id, weekly.today)) return null;
  const waiting = weekly.state === "partner-waiting";
  return (
    <section className="wk-card">
      <p className="eyebrow">This week’s check-in</p>
      <h2>{waiting ? `${theirName}’s is in` : "How are you, really?"}</h2>
      <p>
        {waiting
          ? "It stays sealed until yours is in too. A few quiet minutes, whenever you’re ready."
          : "A few quiet minutes about you, the two of you, and what you’d like next."}
        {weekly.earns ? ` Worth ${weekly.earns} points.` : ""}
      </p>
      <div className="wk-card-actions">
        <button className="wk-card-go" type="button" onClick={() => go("/weekly")}>{waiting ? "Do mine" : "Start mine"}</button>
        <button className="wk-later" type="button" onClick={later}>Not today</button>
      </div>
    </section>
  );
}
