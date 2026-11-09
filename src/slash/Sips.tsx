import { useState } from "react";
import { clientDate } from "./format.ts";
import { useSession } from "./session.tsx";
import type { Task } from "./types.ts";

/** One tap adds a usual drink to the day's count. */
export function SipButtons({ task }: { task: Task }) {
  const { request } = useSession();
  const [pending, setPending] = useState(false);

  async function add(amount: number) {
    setPending(true);
    try {
      await request(`/api/tasks/${task.id}/log`, { method: "POST", body: { amount, clientDate: clientDate() } });
    } catch {
      /* The toast shows the problem. */
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="chips">
      {task.amountSteps.map((step) => (
        <button key={step} className="chip sip" type="button" disabled={pending} onClick={() => void add(step)}>
          +{step} {task.unit}
        </button>
      ))}
    </div>
  );
}
