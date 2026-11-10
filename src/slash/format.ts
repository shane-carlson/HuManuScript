import type { Person } from "./types.ts";

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

export function identityLine(person: Pick<Person, "gender" | "pronouns" | "roleTitle">) {
  return [person.roleTitle, person.gender, person.pronouns?.label].filter(Boolean).join(" · ");
}

export function sideWord(side: Person["slashSide"]) {
  if (side === "leading") return "Leading";
  if (side === "following") return "Following";
  return "Still picking a side";
}

export function clientDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function prettyDate(iso: string) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function prettyTime(iso: string) {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function supplyHint(hints: string[], supplies: string[]) {
  if (!hints.length) return "";
  const owned = supplies.map((item) => item.toLowerCase());
  const matched = hints.filter((hint) => owned.some((item) => item.includes(hint) || hint.includes(item)));
  if (matched.length) return `In their stash: ${matched.join(", ")}.`;
  return "Nothing in their stash matches this one yet.";
}

export const EXPERIENCE = [
  { id: "new", label: "New to this" },
  { id: "some", label: "A little practice" },
  { id: "experienced", label: "Lots of practice" },
] as const;

export function experienceLabel(id: string) {
  return EXPERIENCE.find((item) => item.id === id)?.label || "Not set";
}
