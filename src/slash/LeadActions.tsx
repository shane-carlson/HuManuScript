import { useState } from "react";
import { firstName } from "./format.ts";
import { go } from "./route.ts";
import { useSession } from "./session.tsx";
import { askLine, isPutOff, putOffUntilTomorrow } from "./weekly.ts";
import "./lead-actions.css";

type Action = {
  key: string;
  label: string;
  detail?: string;
  count?: number;
  /** One of several under the action above it, such as each further task waiting on a well done. */
  under?: boolean;
  busy?: boolean;
  run: () => void;
  later?: () => void;
};

/**
 * Everything that is waiting on the leading partner, as buttons, most pressing
 * first. Giving a task is always the last one, so it is never more than a tap away.
 */
export function LeadActions() {
  const { data, request } = useSession();
  const [granting, setGranting] = useState("");
  const [, setPutOff] = useState(0);
  if (!data || data.me.slashSide !== "leading") return null;

  const { me, partner, weekly } = data;
  const name = partner ? firstName(partner.displayName) : "your partner";
  const actions: Action[] = [];
  let waitingOnMe = 0;

  if (!partner) {
    const invite = data.invites[0];
    waitingOnMe += 1;
    actions.push({
      key: "invite",
      label: "Invite your partner",
      detail: invite
        ? `Your invite is out. The code is ${invite.code}.`
        : "Send a link by email or text. Tasks start once you’re paired.",
      run: () => go("/pair"),
    });
  } else {
    const waiting = data.tasks
      .filter((task) => task.status === "done" && !task.acknowledgedAt)
      .sort((a, b) => String(a.completedAt).localeCompare(String(b.completedAt)));
    if (waiting.length > 0) {
      waitingOnMe += waiting.length;
      actions.push({
        key: "well-done",
        label: "Say well done",
        count: waiting.length,
        detail: waiting.length === 1 ? `${name} finished “${waiting[0].title}”.` : `Start with “${waiting[0].title}”.`,
        run: () => go(`/tasks/${waiting[0].id}`),
      });
      for (const task of waiting.slice(1, 4)) {
        actions.push({ key: `well-done-${task.id}`, label: `“${task.title}”`, detail: "Also waiting on your well done.", under: true, run: () => go(`/tasks/${task.id}`) });
      }
      if (waiting.length > 4) {
        actions.push({ key: "well-done-rest", label: `And ${waiting.length - 4} more`, detail: "They’re all on the Tasks page.", under: true, run: () => go("/tasks") });
      }
    }

    for (const reward of data.rewards.filter((item) => item.status === "requested")) {
      waitingOnMe += 1;
      actions.push({
        key: `grant-${reward.id}`,
        label: `Grant “${reward.title}”`,
        detail: `${name} cashed in ${reward.cost} points for it.`,
        busy: granting === reward.id,
        run: () => {
          setGranting(reward.id);
          void request(`/api/rewards/${reward.id}/grant`, { method: "POST" })
            .catch(() => undefined)
            .finally(() => setGranting(""));
        },
      });
    }

    const checkin = weekly?.available ? weekly : null;
    const later = () => {
      if (!checkin) return;
      putOffUntilTomorrow(me.id, checkin.today);
      setPutOff((count) => count + 1);
    };
    const putOff = checkin ? isPutOff(me.id, checkin.today) : false;
    if (checkin?.state === "both" && checkin.unread) {
      waitingOnMe += 1;
      actions.push({
        key: "weekly-read",
        label: `Read ${name}’s check-in`,
        detail: checkin.unread === "changed" ? `${name} changed a few things since you read it.` : "Both are in. They open side by side.",
        run: () => go("/weekly"),
      });
    }
    if (checkin?.state === "partner-waiting" && !putOff) {
      waitingOnMe += 1;
      actions.push({
        key: "weekly-do",
        label: "Do this week’s check-in",
        detail: `${name}’s is in, and stays sealed until yours is too.`,
        run: () => go("/weekly"),
        later,
      });
    }

    const proposals = data.rewards.filter((item) => item.status === "proposed" && !item.agreedBy.includes(me.id));
    if (proposals.length > 0) {
      waitingOnMe += proposals.length;
      actions.push({
        key: "agree",
        label: "Agree on a reward",
        count: proposals.length,
        detail: `${name} suggested “${proposals[0].title}”${proposals.length > 1 ? ", and more" : ""}.`,
        run: () => go("/rewards"),
      });
    }

    if (checkin?.state === "open" && !putOff) {
      waitingOnMe += 1;
      actions.push({
        key: "weekly-do",
        label: "Do this week’s check-in",
        detail: "A few quiet minutes about you and the two of you.",
        run: () => go("/weekly"),
        later,
      });
    }

    actions.push({
      key: "give",
      label: "Give a task",
      detail: askLine(name, weekly) || (waitingOnMe === 0 ? `Pick one and send it to ${name}.` : undefined),
      run: () => go("/assign"),
    });
  }

  const open = data.stats.openCount;
  return (
    <section className="la" aria-label="Things to do">
      <div className="la-head">
        <div>
          <p className="eyebrow">{waitingOnMe > 0 ? "Waiting on you" : "All caught up"}</p>
          <h2>Things to do</h2>
        </div>
        {waitingOnMe > 0 ? <span className="la-total" aria-label={`${waitingOnMe} waiting`}>{waitingOnMe}</span> : null}
      </div>
      {waitingOnMe === 0 ? (
        <p className="la-calm">
          Nothing’s waiting on you right now.
          {open > 0 ? ` ${name} has ${open} ${open === 1 ? "task" : "tasks"} on the go.` : ` ${name}’s list is empty, though.`}
        </p>
      ) : null}
      <div className="la-list">
        {actions.map((action, index) => (
          <div key={action.key} className={action.under ? "la-row under" : action.later ? "la-row can-wait" : "la-row"}>
            <button className={index === 0 ? "la-go main" : "la-go"} type="button" disabled={action.busy} onClick={action.run}>
              <span className="la-text">
                <strong>{action.label}</strong>
                {action.detail ? <em>{action.detail}</em> : null}
              </span>
              {action.count && action.count > 1 ? <span className="la-count">{action.count}</span> : null}
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {action.later ? (
              <button className="la-later" type="button" onClick={action.later}>
                Not today
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
