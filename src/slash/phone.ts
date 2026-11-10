import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { waterLine, waterReminderTimes } from "./water.ts";

/** True inside the iOS and Android apps, false in a browser and in Electron. */
export const onPhone = Capacitor.isNativePlatform();

/** Android's back button steps back through the app, and leaves it from the first screen. */
export function followBackButton() {
  if (!onPhone) return;
  void App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.minimizeApp();
  });
}

export type PhonePermission = "default" | "granted" | "denied";

const asPermission = (display: string): PhonePermission => (display === "granted" ? "granted" : display === "denied" ? "denied" : "default");

export async function phoneNotifications(): Promise<PhonePermission> {
  if (!onPhone) return "denied";
  try {
    return asPermission((await LocalNotifications.checkPermissions()).display);
  } catch {
    return "denied";
  }
}

export async function askPhoneNotifications(): Promise<PhonePermission> {
  try {
    return asPermission((await LocalNotifications.requestPermissions()).display);
  } catch {
    return "denied";
  }
}

// Water reminders own these ids, so a new plan can replace the old one.
const FIRST_ID = 7100;
const MOST = 40;
let planned = "";

export type WaterPlan = { taskId: string; amount: number; target: number; unit: string; every: number; since: number };

/**
 * Hands the phone the rest of today's and all of tomorrow's water reminders,
 * so they arrive with the app closed. Each one is written now with the count as
 * it stands: the count cannot move until the app is opened, and opening it plans again.
 * `null` clears them, for someone with no water task or who has signed out.
 */
export async function planWaterReminders(plan: WaterPlan | null, now = new Date()) {
  if (!onPhone) return;
  const allowed = plan && plan.every ? (await phoneNotifications()) === "granted" : false;
  const day = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const key = plan && allowed ? `${day}:${plan.taskId}:${plan.amount}:${plan.target}:${plan.unit}:${plan.every}:${plan.since}` : "none";
  if (key === planned) return;
  planned = key;
  try {
    const ids = Array.from({ length: MOST }, (_, index) => ({ id: FIRST_ID + index }));
    await LocalNotifications.cancel({ notifications: ids });
    if (!plan || !allowed) return;
    const times = waterReminderTimes(now, plan.since, plan.every, plan.amount >= plan.target).slice(0, MOST);
    if (!times.length) return;
    await LocalNotifications.schedule({
      notifications: times.map((time, index) => ({
        id: FIRST_ID + index,
        title: "Water check",
        body: waterLine(time.tomorrow ? 0 : plan.amount, plan.target, plan.unit, time.at),
        schedule: { at: time.at, allowWhileIdle: true },
        // A water reminder a few minutes late is fine, and asking for exact
        // alarms would send people to an Android settings screen first.
        isExactNotification: false,
      })),
    });
  } catch {
    // The reminder inside the app still shows. Let the next check try again.
    planned = "";
  }
}
