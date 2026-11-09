import { useEffect, useState } from "react";
import { clientDate } from "./format.ts";
import { GuideFace } from "./guides.tsx";
import { useSession } from "./session.tsx";
import { useNow } from "./useNow.ts";
import {
  notificationState,
  readLastReminder,
  readRaisedReminder,
  readReminderMinutes,
  waterLine,
  withinWaterDay,
  writeLastReminder,
  writeRaisedReminder,
} from "./water.ts";

const CHECK_MS = 30000;

/**
 * Reminds the following partner to drink, with the count as it stands right now.
 * A reminder is due when neither a reminder nor a logged drink has happened for
 * the chosen gap. It shows in the app, and as a system notification when allowed.
 */
export function WaterNudge() {
  const { data, request } = useSession();
  const task = data?.me.slashSide === "following" ? data.tasks.find((item) => item.status === "open" && item.progress && item.assignedTo === data.me.id) : undefined;
  const taskId = task?.id || "";
  const amount = task?.progress?.amount ?? 0;
  const target = task?.target ?? 0;
  const unit = task?.unit || "oz";
  const lastLog = task?.progress?.entries.at(-1)?.at || "";
  // The count the reminder was raised at. A drink logged anywhere else answers it.
  const [raisedAt, setRaisedAt] = useState(readRaisedReminder);
  const [pending, setPending] = useState(false);
  const now = useNow();
  const standing = `${taskId}:${amount}`;

  useEffect(() => {
    if (!taskId) return;
    const check = () => {
      const every = readReminderMinutes();
      const moment = new Date();
      if (!every || !withinWaterDay(moment)) return;
      const since = Math.max(readLastReminder(), lastLog ? Date.parse(lastLog) : 0);
      if (moment.getTime() - since < every * 60000) return;
      writeLastReminder(moment.getTime());
      writeRaisedReminder(standing);
      setRaisedAt(standing);
      if (notificationState() === "granted") {
        try {
          new Notification("Water check", { body: waterLine(amount, target, unit, moment), tag: "slashconnect-water" });
        } catch {
          /* The reminder in the app still shows. */
        }
      }
    };
    const first = window.setTimeout(check, 400);
    const timer = window.setInterval(check, CHECK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [taskId, lastLog, standing, amount, target, unit]);

  if (!task || !data || raisedAt !== standing) return null;
  const step = task.amountSteps[0] || 8;

  async function drink() {
    setPending(true);
    try {
      await request(`/api/tasks/${taskId}/log`, { method: "POST", body: { amount: step, clientDate: clientDate() } });
    } catch {
      /* The toast shows the problem. */
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="nudge" role="status">
      <GuideFace id={data.me.guideId || "lumen"} className="guide-face small" />
      <div>
        <strong>Water check</strong>
        <p>{waterLine(amount, target, unit, now)}</p>
        <div className="row">
          <button className="primary tiny" type="button" disabled={pending} onClick={() => void drink()}>
            +{step} {unit}
          </button>
          <button
            className="texty"
            type="button"
            onClick={() => {
              writeRaisedReminder("");
              setRaisedAt("");
            }}
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
