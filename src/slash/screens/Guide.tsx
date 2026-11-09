import { useState } from "react";
import { GuideFace } from "../guides.tsx";
import { useSession } from "../session.tsx";
import { PageHead, Shell } from "../ui.tsx";

const EVENTS = [
  { id: "nudge", label: "Encourage me" },
  { id: "done", label: "I finished something" },
  { id: "streak", label: "Talk about the streak" },
  { id: "ground", label: "Help me pause" },
  { id: "assign", label: "Help me assign" },
] as const;

export function GuidePage() {
  const { data, request } = useSession();
  const bundle = data!;
  const guide = bundle.meta.guides.find((item) => item.id === bundle.me.guideId) || bundle.meta.guides[0];
  const [lines, setLines] = useState<string[]>([bundle.guide.text]);
  const [tick, setTick] = useState(0);

  async function speak(event: string) {
    const next = tick + 1;
    setTick(next);
    try {
      const payload = await request("/api/guide/nudge", { method: "POST", body: { event, tick: next } });
      const text = (payload as { line?: { text?: string } }).line?.text;
      if (text) setLines((current) => [text, ...current].slice(0, 6));
    } catch {
      /* The toast shows the problem. */
    }
  }

  return (
    <Shell nav>
      <div className="pad">
        <PageHead title={guide?.name || "Guide"} kicker={guide?.species} />
        <div className="center">
          <GuideFace id={guide?.id || "lumen"} className="guide-face xl float" />
        </div>
        <p className="lead">{guide?.blurb}</p>
        <div className="stack">
          {lines.map((line, index) => (
            <p key={`${line}-${index}`} className="bubble">{line}</p>
          ))}
        </div>
        <div className="chips">
          {EVENTS.map((event) => (
            <button key={event.id} className="chip" type="button" onClick={() => void speak(event.id)}>
              {event.label}
            </button>
          ))}
        </div>
      </div>
    </Shell>
  );
}
