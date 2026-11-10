import { ApiError } from "../api.ts";
import { useSession } from "../session.tsx";
import { STUFFIE_PARTS, type Stuffie, type StuffiePart } from "../stuffie/roll.ts";
import type { Plan, PlanFeature } from "../types.ts";

/**
 * The household's plan, read for a screen. The server decides everything: this
 * only says where to sew a Plus patch and where a Free household has met a limit.
 * With a server too old to send a plan, nothing is marked and nothing is shut.
 */
export function readPlan(plan: Plan | undefined) {
  const feature = (id: string): PlanFeature | undefined => plan?.features.find((item) => item.id === id);
  return {
    plan,
    feature,
    /** The limits apply right now. */
    free: plan?.effective === "free",
    /** This line differs between the plans, so it wears the patch. A household that holds Plus has no need of it. */
    marked: (id: string) => Boolean(plan && plan.tier !== "plus" && feature(id) && !feature(id)!.always),
    /** A Free household has reached this line's limit, or it is a Plus-only line. */
    shut: (id: string) => Boolean(plan?.effective === "free" && feature(id) && !feature(id)!.open),
    /** Whether a stuffie question is one of the reflective ones, for this side of the slash. */
    deep: (topic: string, side: string) => Boolean(plan?.deepTopics.some((item) => item.topic === topic && (!item.side || item.side === side))),
  };
}

export function usePlan() {
  const { data } = useSession();
  return readPlan(data?.plan);
}

/**
 * The line that goes beside a patch where a Plus line begins, or "" when the
 * patch is not shown. A Free household reads how much of the limit is used;
 * anyone else reads what Free would be, so the split can be seen while everything is open.
 */
export function noteWords(sight: ReturnType<typeof readPlan>, id: string) {
  const line = sight.feature(id);
  if (!line || !sight.plan || !sight.marked(id)) return "";
  const words = sight.free && line.usage ? line.usage : `On ${sight.plan.names.free}: ${line.free.charAt(0).toLowerCase()}${line.free.slice(1)}`;
  return `${words.replace(/\.$/, "")}.`;
}

/** What the server said when it refused something as being on the Plus side, or "" for any other failure. */
export function plusRefusal(caught: unknown) {
  return caught instanceof ApiError && caught.status === 402 && caught.code === "plus" ? caught.message : "";
}

/** The same plush, whatever it is called now: every sewn part matches. */
export function samePlush(kept: Stuffie | null | undefined, next: Stuffie) {
  if (!kept) return false;
  return Number(kept.seed) === Number(next.seed) && (Object.keys(STUFFIE_PARTS) as StuffiePart[]).every((part) => kept[part] === next[part]);
}

/** The calendar day `days` before a `YYYY-MM-DD` day. */
export function daysBefore(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

const COUNTS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** Small counts read better as words: “eight earlier weeks”. */
export function countWord(count: number, capital = false) {
  const word = COUNTS[count] || String(count);
  return capital ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word;
}
