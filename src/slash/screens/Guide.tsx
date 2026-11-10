import { useEffect, useRef, useState } from "react";
import { firstName } from "../format.ts";
import { GuideFace } from "../guides.tsx";
import { useSession } from "../session.tsx";
import { PageHead, Shell } from "../ui.tsx";
import "./Guide.css";

type Entry = { id: number; from: "me" | "stuffie"; text: string };

/** One sitting with the stuffie. It lasts until the app is closed or reloaded. */
type Visit = {
  entries: Entry[];
  /** How many times each question has been asked, so asking again moves the answer on. */
  asked: Record<string, number>;
  /** What was said last for each question, so it is not said twice running. */
  last: Record<string, { text: string; key: string }>;
  greeting: string;
  turn: number;
  next: number;
};

type Reply = { line?: { text?: string; key?: string } };

const visits = new Map<string, Visit>();
const KEEP = 40;

function questionsFor(side: string, partner: string) {
  if (side === "leading") {
    return [
      { id: "status", label: "How are we doing?" },
      { id: "partner", label: partner ? `How’s ${partner} doing?` : "How’s my partner doing?" },
      { id: "waiting", label: "Anything waiting on me?" },
      { id: "streak", label: "How’s the streak?" },
      { id: "assign", label: "What should I assign?" },
      { id: "nice", label: "Say something nice" },
      { id: "us", label: "Tell me something about us" },
      { id: "ground", label: "Help me calm down" },
    ];
  }
  return [
    { id: "status", label: "How are we doing?" },
    { id: "streak", label: "How’s my streak?" },
    { id: "week", label: "What did I get done this week?" },
    { id: "next", label: "What’s next?" },
    { id: "rewards", label: "What am I saving for?" },
    { id: "nice", label: "Say something nice" },
    { id: "us", label: "Tell me something about us" },
    { id: "ground", label: "Help me calm down" },
  ];
}

function visitFor(id: string, greeting: string) {
  const known = visits.get(id);
  if (!known) {
    const fresh: Visit = { entries: [{ id: 0, from: "stuffie", text: greeting }], asked: {}, last: {}, greeting, turn: Date.now() % 7, next: 1 };
    visits.set(id, fresh);
    return fresh;
  }
  // Something happened while they were away: the stuffie picks the thread back up with it.
  if (greeting !== known.greeting) {
    known.greeting = greeting;
    if (known.entries.at(-1)?.text !== greeting) known.entries = [...known.entries, { id: known.next, from: "stuffie" as const, text: greeting }].slice(-KEEP);
    known.next += 1;
  }
  return known;
}

function remember(id: string, from: Entry["from"], text: string) {
  const visit = visits.get(id);
  if (!visit) return [];
  visit.entries = [...visit.entries, { id: visit.next, from, text }].slice(-KEEP);
  visit.next += 1;
  return visit.entries;
}

/** What to send with a question: which telling of the answer this is, and what the last one was. */
function asking(id: string, topic: string) {
  const visit = visits.get(id);
  const times = visit?.asked[topic] || 0;
  if (visit) visit.asked[topic] = times + 1;
  const before = visit?.last[topic];
  return { topic, tick: (visit?.turn || 0) + times, last: before?.text || "", lastKey: before?.key || "", tz: new Date().getTimezoneOffset() };
}

export function GuidePage() {
  const { data, request } = useSession();
  const bundle = data!;
  const { me, partner } = bundle;
  const picked = bundle.meta.guides.find((item) => item.id === me.guideId) || bundle.meta.guides[0];
  const name = bundle.guide.name || picked?.name || "Your stuffie";
  const species = bundle.guide.species || picked?.species;
  const [entries, setEntries] = useState(() => visitFor(me.id, bundle.guide.text).entries);
  const [thinking, setThinking] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const settled = useRef(false);
  const questions = questionsFor(me.slashSide, partner ? firstName(partner.displayName) : "");

  useEffect(() => {
    if (entries.length < 2 && !thinking) return;
    // Coming back to a long thread lands on its newest line; after that, new lines glide in.
    const glide = settled.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    settled.current = true;
    end.current?.scrollIntoView({ block: "end", behavior: glide ? "smooth" : "auto" });
  }, [entries, thinking]);

  async function ask(topic: string, label: string) {
    if (thinking) return;
    const body = asking(me.id, topic);
    setEntries(remember(me.id, "me", label));
    setThinking(true);
    try {
      const payload = (await request("/api/guide/ask", { method: "POST", body })) as unknown as Reply;
      const text = payload.line?.text;
      if (text) {
        const visit = visits.get(me.id);
        if (visit) visit.last[topic] = { text, key: payload.line?.key || "" };
        setEntries(remember(me.id, "stuffie", text));
      }
    } catch {
      /* The toast shows the problem. */
    } finally {
      setThinking(false);
    }
  }

  return (
    <Shell nav>
      <div className="pad gt">
        <PageHead title={name} kicker={species} />
        <div className="gt-who">
          <GuideFace id={me.guideId || "lumen"} className="guide-face float" />
          <p>{picked?.blurb || "Ask me anything about the two of you."}</p>
        </div>

        <ol className="gt-thread" role="log" aria-live="polite" aria-label={`Talking with ${name}`}>
          {entries.map((entry) => (
            <li key={entry.id} className={entry.from === "me" ? "gt-line mine" : "gt-line"}>
              {entry.from === "stuffie" ? <span className="gt-by">{name}</span> : null}
              <p>{entry.text}</p>
            </li>
          ))}
          {thinking ? (
            <li className="gt-line gt-wait" aria-label={`${name} is thinking`}>
              <p>
                <i />
                <i />
                <i />
              </p>
            </li>
          ) : null}
        </ol>

        <div className="gt-ask">
          <p className="eyebrow">Ask {name}</p>
          <div className="gt-asks">
            {questions.map((question) => (
              <button
                key={question.id}
                className={question.id === "ground" ? "gt-q calm" : "gt-q"}
                type="button"
                disabled={thinking}
                onClick={() => void ask(question.id, question.label)}
              >
                {question.label}
              </button>
            ))}
          </div>
        </div>
        <div ref={end} />
      </div>
    </Shell>
  );
}
