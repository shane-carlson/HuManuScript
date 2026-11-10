import { prettyDate } from "./format.ts";
import type { Person, Weekly, WeeklyEntry } from "./types.ts";

export const SELF_SCALE = ["Rough", "Wobbly", "Okay", "Good", "Lovely"];
export const US_SCALE = ["Distant", "A bit off", "Steady", "Close", "So close"];

export type WeeklyPart = {
  id: "self" | "dynamic" | "needs" | "requests";
  title: string;
  /** The heading once it has been sent and is being read. */
  short: string;
  prompt: string;
  placeholder: string;
};

/** The four parts of the check-in, worded for the side of the slash the writer is on. */
export function weeklyParts(side: Person["slashSide"], partnerName: string): WeeklyPart[] {
  const leading = side === "leading";
  return [
    {
      id: "self",
      title: "How I’m feeling about myself",
      short: "About myself",
      prompt: "Body, mood, energy, headspace. What’s been heavy? What’s felt good? One honest line is plenty.",
      placeholder: "This week I’ve been…",
    },
    {
      id: "dynamic",
      title: "How I’m feeling about us",
      short: "About us",
      prompt: leading
        ? "The dynamic, the distance, how we’ve been with each other. What felt good to lead? What’s been heavy to hold?"
        : "The dynamic, the distance, how we’ve been with each other. Where did you feel held? Where did you feel unsure, or far away?",
      placeholder: "Lately, the two of us have felt…",
    },
    {
      id: "needs",
      title: "What I need and want",
      short: "Needs and wants",
      prompt: leading
        ? `Leading doesn’t mean needing nothing. What would help you? What would you love from ${partnerName}?`
        : "Needs are what you can’t go without. Wants are what you’d love. Both belong here, even the ones that feel like a lot to ask.",
      placeholder: "I need… I’d love…",
    },
    {
      id: "requests",
      title: "Requests for the week ahead",
      short: "For the week ahead",
      prompt: "Tap anything you’d like more of. Pick as many as you want, then say the rest in your own words.",
      placeholder: "A long call on Saturday. A new rule. A night off. Ask for it.",
    },
  ];
}

export function weekRange(week: string, weekEnd: string) {
  return `${prettyDate(week)} – ${prettyDate(weekEnd)}`;
}

export function listWords(words: string[]) {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** “Avery asked for more fun and play and more praise.” Empty when there were no tapped requests. */
export function askLine(name: string, weekly: Weekly | undefined) {
  const asks = weekly?.asks;
  if (!asks || !weekly) return "";
  const phrases = asks.requests
    .map((id) => weekly.choices.find((choice) => choice.id === id)?.ask || "")
    .filter(Boolean);
  if (!phrases.length) return asks.note ? `${name} left you a request in ${asks.thisWeek ? "this" : "last"} week’s check-in.` : "";
  const shown = phrases.length > 3 ? [...phrases.slice(0, 3), "more"] : phrases;
  return `${name} asked for ${listWords(shown)}${asks.thisWeek ? "" : " last week"}.`;
}

export type LeadMove = { hint: string; label?: string; href?: string };

/**
 * What the leading partner can do about one request. Where there is a page for
 * it, the move is a button. The rest are things only a person can do.
 */
export function leadMove(id: string, name: string, waitingTaskId?: string): LeadMove {
  if (id === "fun") return { hint: "Something silly counts.", label: "Pick a fun task", href: "/assign/fun" };
  if (id === "spice") return { hint: `Always optional. ${name} can pass on any of them.`, label: "Pick a spicy task", href: "/assign/spicy" };
  if (id === "structure") return { hint: "A daily task gives the week a shape.", label: "Set a daily task", href: "/assign" };
  if (id === "firm") return { hint: "Clear tasks, real due dates, and follow through.", label: "Give a task", href: "/assign" };
  if (id === "soft") return { hint: "Gentle tasks, and a kind note with each one.", label: "Pick a self-care task", href: "/assign/self-care" };
  if (id === "praise") {
    return waitingTaskId
      ? { hint: "There’s one waiting right now.", label: "Say well done", href: `/tasks/${waitingTaskId}` }
      : { hint: "Say what you noticed, out loud and often.", label: "Look at what’s done", href: "/tasks" };
  }
  if (id === "rest") return { hint: "Go lighter this week. Slow tasks only.", label: "Pick a grounding task", href: "/assign/grounding" };
  if (id === "checkins") return { hint: `Ask how ${name} is doing. More than once.` };
  if (id === "date") return { hint: "Pick a night and protect it.", label: "Make it a reward", href: "/rewards" };
  if (id === "new") return { hint: "An adventure is drawn blind, so it’s new to both of you.", label: "Send an adventure", href: "/assign/adventure" };
  if (id === "headspace") return { hint: `Make room for it, and ask what helps ${name} get there.` };
  if (id === "aftercare") return { hint: "Plan the after before the scene, and stay a while." };
  return { hint: "" };
}

export type WeeklyDraft = Pick<WeeklyEntry, "self" | "selfRating" | "dynamic" | "dynamicRating" | "needs" | "requests" | "requestNote">;

export function draftFrom(entry: WeeklyEntry | null): WeeklyDraft {
  return {
    self: entry?.self || "",
    selfRating: entry?.selfRating || 0,
    dynamic: entry?.dynamic || "",
    dynamicRating: entry?.dynamicRating || 0,
    needs: entry?.needs || "",
    requests: entry?.requests || [],
    requestNote: entry?.requestNote || "",
  };
}

export function saysSomething(draft: WeeklyDraft) {
  return Boolean(
    draft.self.trim() || draft.dynamic.trim() || draft.needs.trim() || draft.requestNote.trim() ||
    draft.selfRating || draft.dynamicRating || draft.requests.length,
  );
}

function sameDraft(a: WeeklyDraft, b: WeeklyDraft) {
  return a.self === b.self && a.dynamic === b.dynamic && a.needs === b.needs && a.requestNote === b.requestNote &&
    a.selfRating === b.selfRating && a.dynamicRating === b.dynamicRating && a.requests.join(" ") === b.requests.join(" ");
}

const draftKey = (userId: string, week: string) => `slashconnect.weekly.draft.${userId}.${week}`;

/**
 * Half-written answers are kept in this tab only, so a stray tap does not lose
 * them. They are gone once the check-in is sent or the tab is closed.
 */
export function readDraft(userId: string, week: string): WeeklyDraft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(userId, week));
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<WeeklyDraft>;
    return {
      self: String(saved.self || ""),
      selfRating: Number(saved.selfRating) || 0,
      dynamic: String(saved.dynamic || ""),
      dynamicRating: Number(saved.dynamicRating) || 0,
      needs: String(saved.needs || ""),
      requests: Array.isArray(saved.requests) ? saved.requests.map(String) : [],
      requestNote: String(saved.requestNote || ""),
    };
  } catch {
    return null;
  }
}

export function writeDraft(userId: string, week: string, draft: WeeklyDraft, sent: WeeklyEntry | null) {
  try {
    if (!saysSomething(draft) || sameDraft(draft, draftFrom(sent))) sessionStorage.removeItem(draftKey(userId, week));
    else sessionStorage.setItem(draftKey(userId, week), JSON.stringify(draft));
  } catch {
    /* Private browsing can refuse storage. The form still works. */
  }
}

export function clearDraft(userId: string, week: string) {
  try {
    sessionStorage.removeItem(draftKey(userId, week));
  } catch {
    /* Nothing to clear. */
  }
}

const laterKey = (userId: string) => `slashconnect.weekly.later.${userId}`;

/** “Not today” hides the Home reminder until this person's next calendar day. */
export function putOffUntilTomorrow(userId: string, today: string) {
  try {
    localStorage.setItem(laterKey(userId), today);
  } catch {
    /* It will simply show again. */
  }
}

export function isPutOff(userId: string, today: string) {
  try {
    return localStorage.getItem(laterKey(userId)) === today;
  } catch {
    return false;
  }
}
