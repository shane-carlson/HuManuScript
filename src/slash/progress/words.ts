import { firstName, prettyDate } from "../format.ts";
import type { Bundle, Person, Progress, ProgressDay } from "../types.ts";

/**
 * Who is looking and whose progress it is. The numbers are the couple's; the
 * following partner is the one who earns them, so `mine` is true for them.
 */
export type Side = { mine: boolean; name: string; leader: string; paired: boolean };

const UNPAIRED_LINE = "This starts counting once the two of you are paired.";

export function sideOf(bundle: Bundle): Side {
  const people = [bundle.me, bundle.partner].filter((person): person is Person => Boolean(person));
  const follower = people.find((person) => person.slashSide === "following");
  const leader = people.find((person) => person.slashSide === "leading");
  return {
    mine: bundle.me.slashSide !== "leading",
    name: follower ? firstName(follower.displayName) : "your partner",
    leader: leader ? firstName(leader.displayName) : "your partner",
    paired: Boolean(bundle.partner),
  };
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function daysInARow(days: number) {
  return days === 1 ? "1 day" : `${days} days in a row`;
}

export function todayLine(progress: Progress, side: Side) {
  const today = progress.today;
  if (!side.paired) return UNPAIRED_LINE;
  if (today.full) return side.mine ? "Full day. Everything for today is done." : `${side.name} has had a full day.`;
  if (today.goal === "dailies") {
    const left = today.dailyTotal - today.dailyDone;
    if (!side.mine) return `${side.name} has ${plural(left, "daily task")} left today.`;
    return left === today.dailyTotal
      ? `${plural(left, "daily task")} today. Finish ${left === 1 ? "it" : "them all"} for a full day.`
      : `${plural(left, "daily task")} to go for a full day.`;
  }
  const left = Math.max(0, today.pointsGoal - today.points);
  if (!side.mine) return `${side.name} is ${plural(left, "point")} off a full day.`;
  return today.points === 0 ? `${today.pointsGoal} points today makes it a full day.` : `${plural(left, "more point")} makes today a full day.`;
}

export function ringCount(progress: Progress) {
  const today = progress.today;
  return today.goal === "dailies" ? `${today.dailyDone}/${today.dailyTotal}` : `${Math.min(today.points, today.pointsGoal)}/${today.pointsGoal}`;
}

export function ringLabel(progress: Progress) {
  return progress.today.goal === "dailies" ? "daily tasks" : "points";
}

export function streakLine(progress: Progress, side: Side) {
  const streak = progress.streak;
  if (!side.paired) return "Days in a row with a task finished.";
  if (streak.days === 0) return side.mine ? "One finished task starts a streak." : `${side.name}’s next finished task starts a streak.`;
  if (streak.doneToday) return streak.next ? `${plural(streak.next.days - streak.days, "more day")} to ${streak.next.days}.` : "Longer than anything we thought to count.";
  if (streak.rest === "resting") {
    return side.mine ? "Yesterday was your day off. One task today and the streak carries on." : `Yesterday was ${side.name}’s day off. One task today and the streak carries on.`;
  }
  return side.mine ? "One task today keeps it going." : `One task from ${side.name} today keeps it going.`;
}

export function restLine(progress: Progress) {
  const streak = progress.streak;
  const rule = "One day off a week never breaks a streak.";
  if (streak.rest === "used" && streak.restReadyOn) return `${rule} This week’s is used; the next is free from ${prettyDate(streak.restReadyOn)}.`;
  if (streak.rest === "resting") return `${rule} Yesterday was it.`;
  if (streak.rest === "ready") return `${rule} This week’s is still free.`;
  return rule;
}

export function weekLine(progress: Progress, side: Side) {
  const week = progress.week;
  if (!side.paired) return `Weeks in a row with ${week.need} active days.`;
  if (week.kept) return `Week kept, with ${plural(week.days, "day")} in it.`;
  const left = week.need - week.days;
  const room = week.daysLeft + (progress.streak.doneToday ? 0 : 1);
  if (left > room) return side.mine ? "This week got away. Next Monday is a fresh one." : `This week got away from ${side.name}. Next Monday is a fresh one.`;
  return `${plural(left, "more day")} this week keeps it.`;
}

export function whoBy(by: string, bundle: Bundle) {
  if (by === "both") return bundle.partner ? "Both of you" : "You";
  if (by === bundle.me.id) return "You";
  if (bundle.partner && by === bundle.partner.id) return firstName(bundle.partner.displayName);
  return "";
}

export function longDate(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return new Date(year, month - 1, date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

export function dayLetter(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return LETTERS[new Date(year, month - 1, date).getDay()] || "";
}

export function monthName(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, { month: "short" });
}

/** The seven days ending today, oldest first. */
export function lastSeven(progress: Progress): ProgressDay[] {
  return progress.calendar.filter((entry) => entry.date <= progress.day).slice(-7);
}

export function dayWords(entry: ProgressDay) {
  const when = prettyDate(entry.date);
  if (entry.state === "full") return `${when}: a full day`;
  if (entry.state === "active") return `${when}: ${plural(entry.tasks, "task")} done`;
  if (entry.state === "rest") return `${when}: day off`;
  if (entry.state === "ahead") return `${when}: still to come`;
  return `${when}: nothing`;
}

export function shelfCount(bundle: Bundle) {
  const shelf = bundle.shelf || [];
  return { have: shelf.filter((item) => item.earned).length, of: shelf.length };
}
