/** The hours a day's water is spread across, on the device's own clock. */
const DAY_START = 8;
const DAY_END = 21;

const EVERY_KEY = "slashconnect.water.every";
const LAST_KEY = "slashconnect.water.last";
const RAISED_KEY = "slashconnect.water.raised";

export const REMINDER_CHOICES = [
  { minutes: 0, label: "Off" },
  { minutes: 60, label: "Every hour" },
  { minutes: 120, label: "Every 2 hours" },
] as const;

export function withinWaterDay(now: Date) {
  const hours = now.getHours() + now.getMinutes() / 60;
  return hours >= DAY_START && hours < DAY_END;
}

/** Where the count stands against an even spread of the amount across the day. */
export function waterPace(amount: number, target: number, now: Date) {
  const hours = now.getHours() + now.getMinutes() / 60;
  const share = Math.min(1, Math.max(0, (hours - DAY_START) / (DAY_END - DAY_START)));
  const expected = Math.round(target * share);
  return { left: Math.max(0, target - amount), expected, behind: amount + 4 < expected };
}

/** One line that always carries the real count, for the reminder and the task itself. */
export function waterLine(amount: number, target: number, unit: string, now: Date) {
  const { left, expected, behind } = waterPace(amount, target, now);
  if (left === 0) return `That’s all ${target} ${unit}. Done for today.`;
  if (amount === 0) return `Nothing logged yet today. ${target} ${unit} to go.`;
  if (behind) return `You’re at ${amount} of ${target} ${unit}. About ${expected} by now would be on pace, so have a glass.`;
  return `You’re at ${amount} of ${target} ${unit}. Right on pace, ${left} to go.`;
}

export function readReminderMinutes() {
  const saved = localStorage.getItem(EVERY_KEY);
  if (saved === null) return 60;
  const minutes = Number(saved);
  return REMINDER_CHOICES.some((choice) => choice.minutes === minutes) ? minutes : 60;
}

export function writeReminderMinutes(minutes: number) {
  localStorage.setItem(EVERY_KEY, String(minutes));
}

export function readLastReminder() {
  return Number(localStorage.getItem(LAST_KEY)) || 0;
}

export function writeLastReminder(when: number) {
  localStorage.setItem(LAST_KEY, String(when));
}

/** The count a reminder was raised at. It stays up across screens until that count changes or it is put off. */
export function readRaisedReminder() {
  return localStorage.getItem(RAISED_KEY) || "";
}

export function writeRaisedReminder(standing: string) {
  localStorage.setItem(RAISED_KEY, standing);
}

export function notificationState(): "unsupported" | NotificationPermission {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}
