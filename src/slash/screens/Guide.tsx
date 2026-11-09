import { useState } from "react";
import { GuideFace } from "../guides.tsx";
import { useSession } from "../session.tsx";
import { PageHead, Shell } from "../ui.tsx";

const FOLLOWING = [
  { id: "nudge", label: "Say something nice" },
  { id: "done", label: "I did a thing!" },
  { id: "streak", label: "How’s my streak?" },
  { id: "ground", label: "Help me calm down" },
];

const LEADING = [
  { id: "nudge", label: "Give me a nudge" },
  { id: "assign", label: "What should I assign?" },
  { id: "streak", label: "How’s the streak?" },
  { id: "ground", label: "Help me calm down" },
];

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
        <PageHead title={guide?.name || "Your stuffie"} kicker={guide?.species} />
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
          {(bundle.me.slashSide === "leading" ? LEADING : FOLLOWING).map((event) => (
            <button key={event.id} className="chip" type="button" onClick={() => void speak(event.id)}>
              {event.label}
            </button>
          ))}
        </div>
      </div>
    </Shell>
  );
}
