import { TEMPLATES } from "./catalog.mjs";
import { STUFFIE_PARTS, cleanStuffie } from "./stuffie.mjs";
import { shiftDay, weekOf, weekStart } from "./weekly.mjs";

/**
 * Free and Plus.
 *
 * A plan belongs to the household, never to one person: one Plus covers both
 * partners. `FEATURES` is the only place that says what each plan gets. The
 * engine asks `refusal` before each gated action, the Plans page is drawn from
 * `planView`, and nothing else keeps its own copy of a limit.
 *
 * Three rules hold everywhere:
 *   - Safety, consent, care, pairing and the daily loop are the same on both plans.
 *   - A limit only ever stops the next thing being added. What a couple already
 *     made stays and keeps working.
 *   - Looking back is trimmed in what is shown, never in what is kept.
 */

export const PLAN_NAMES = { free: "Free", plus: "Plus" };

/** How far back a Free household looks: earlier check-ins, the Progress calendar, photos on finished tasks. */
export const HISTORY_WEEKS = 4;

const OWN_PER_WEEK = 3;
const DAILIES_AT_ONCE = 3;
const REWARDS_AT_ONCE = 3;

/** The stuffie questions that draw on the couple's whole history. `side` keeps one to that side of the slash. */
export const DEEP_TOPICS = [{ topic: "us" }, { topic: "assign", side: "leading" }];

/**
 * Every line of the split. `free` and `plus` are `true` (all of it), `false`
 * (not part of that plan) or a number (that many). `freeSays` and `plusSays`
 * are the same thing in the app's words, for the Plans page.
 */
export const FEATURES = [
  {
    id: "stuffie-keep",
    title: "A stuffie of your own",
    line: "Roll a plush nobody else has, name it, and take it home.",
    free: false,
    plus: true,
    freeSays: "Open the maker and roll as long as you like",
    plusSays: "Keep the one you fall for",
  },
  {
    id: "dailies",
    title: "Daily tasks",
    line: "Tasks that come back fresh every day until they’re stopped.",
    free: DAILIES_AT_ONCE,
    plus: true,
    freeSays: `Up to ${DAILIES_AT_ONCE} running at once`,
    plusSays: "As many as you like",
  },
  {
    id: "own-tasks",
    title: "Write-your-own tasks",
    line: "A task in your own words, once or every day. The catalog never runs out.",
    free: OWN_PER_WEEK,
    plus: true,
    freeSays: `${OWN_PER_WEEK} a week`,
    plusSays: "As many as you like",
  },
  {
    id: "rewards",
    title: "Rewards on the table",
    line: "Things to save up for, once you’ve both said yes.",
    free: REWARDS_AT_ONCE,
    plus: true,
    freeSays: `Up to ${REWARDS_AT_ONCE} at once`,
    plusSays: "As many as you like",
  },
  {
    id: "history",
    title: "Looking back",
    line: "Earlier weekly check-ins, and the day-by-day calendar on Progress.",
    free: HISTORY_WEEKS,
    plus: true,
    freeSays: `The last ${HISTORY_WEEKS} weeks`,
    plusSays: "Every check-in, and twelve weeks of days",
  },
  {
    id: "photos",
    title: "Photo keepsakes",
    line: "The photos sent with finished tasks.",
    free: HISTORY_WEEKS,
    plus: true,
    freeSays: `From the last ${HISTORY_WEEKS} weeks`,
    plusSays: "Every one, as far back as they go",
  },
  {
    id: "deep-talk",
    title: "Heart-to-hearts with your stuffie",
    line: "“Tell me something about us”, and “What should I assign?” for whoever leads.",
    free: false,
    plus: true,
    freeSays: "Everyday questions, whenever you like",
    plusSays: "The reflective ones too",
  },
  {
    id: "care",
    title: "Safety, consent and care",
    line: "Grounding, “Not today”, the yes on every spicy task, and notes to each other.",
    free: true,
    plus: true,
  },
  {
    id: "loop",
    title: "The whole daily loop",
    line: "Giving tasks, doing them, well dones, points, levels, streaks, today’s adventure and water.",
    free: true,
    plus: true,
  },
  {
    id: "catalog",
    title: "Every task in the catalog",
    line: "All of it, spicy included, as often as you like.",
    free: true,
    plus: true,
  },
  {
    id: "weekly",
    title: "The weekly check-in",
    line: "Writing yours and reading theirs, every week.",
    free: true,
    plus: true,
  },
  {
    id: "shelf",
    title: "The trophy shelf",
    line: "Every patch the two of you earn.",
    free: true,
    plus: true,
  },
  {
    id: "looks",
    title: "Your avatar and the four stuffies",
    line: "The whole avatar builder, and Lumen, Pip, Moss or Sol to keep you company.",
    free: true,
    plus: true,
  },
  {
    id: "pairing",
    title: "Pairing up",
    line: "Inviting your partner and being the two of you.",
    free: true,
    plus: true,
  },
];

const featureById = new Map(FEATURES.map((feature) => [feature.id, feature]));
const OWN_TEMPLATES = new Set(TEMPLATES.filter((template) => template.custom).map((template) => template.id));

/** Reads the `SLASH_EARLY_ACCESS` setting. Early access is on unless it is plainly switched off. */
export function earlyAccessFrom(value) {
  return !["0", "off", "false", "no"].includes(String(value ?? "").trim().toLowerCase());
}

/**
 * What plan a household is on.
 *   tier         what they hold: "free" unless Plus was bought
 *   earlyAccess  everything is open to them because the app is in testing
 *   effective    what the gates use
 *   preview      "free" or "plus" while someone is trying a plan out, else ""
 *
 * `options.earlyAccess` comes from the engine (`SLASH_EARLY_ACCESS`, on by
 * default) and `options.hosted` says whether this is the hosted server.
 */
export function planOf(db, options = {}) {
  const saved = db?.plan && typeof db.plan === "object" ? db.plan : {};
  // The billing seam. Nothing in the engine writes `db.plan.tier`, and no route
  // accepts it. When Plus goes on sale, the hosted function checks the App Store
  // or Play receipt with the store's own servers and, only then, writes
  // `db.plan = { tier: "plus", since }` on the household (and back to "free" when
  // a subscription lapses). Everything from here down already follows it.
  const tier = saved.tier === "plus" ? "plus" : "free";
  // A preview is for seeing how a plan feels. Trying Free only takes away, so it
  // is honoured anywhere; trying Plus gives, so a hosted household never gets it.
  const preview = saved.preview === "free" || (saved.preview === "plus" && !options.hosted) ? saved.preview : "";
  const earlyAccess = options.earlyAccess !== false && preview !== "free";
  const plus = preview !== "free" && (earlyAccess || preview === "plus" || tier === "plus");
  return { tier, earlyAccess, effective: plus ? "plus" : "free", preview };
}

/** Whether a plan has a feature at all. A limited feature counts as had. */
export function allows(plan, featureId) {
  const feature = featureById.get(featureId);
  if (!feature) return false;
  const value = feature[plan?.effective === "plus" ? "plus" : "free"];
  return value === true || (typeof value === "number" && value > 0);
}

/** How many of a feature a plan may have: a number, `Infinity` for no limit, 0 for none. */
export function limitOf(plan, featureId) {
  const feature = featureById.get(featureId);
  if (!feature) return 0;
  const value = feature[plan?.effective === "plus" ? "plus" : "free"];
  if (value === true) return Infinity;
  return typeof value === "number" ? value : 0;
}

function nowIsoOf(clock) {
  return clock?.now ? new Date(clock.now).toISOString() : new Date().toISOString();
}

/**
 * How much of a counted feature the household is using, or null when the
 * feature is not counted. A written week is the server's Monday to Sunday, so it
 * turns over at the same moment for two people in different time zones.
 */
export function usageOf(db, featureId, clock = {}) {
  if (featureId === "dailies") return (db?.routines || []).filter((routine) => !routine.stoppedAt).length;
  if (featureId === "rewards") return (db?.rewards || []).filter((reward) => reward.status !== "granted").length;
  if (featureId === "own-tasks") {
    const since = weekStart(nowIsoOf(clock).slice(0, 10));
    const written = (item) => OWN_TEMPLATES.has(item.templateId) && String(item.createdAt || "").slice(0, 10) >= since;
    const once = (db?.tasks || []).filter((task) => !task.routineId && written(task)).length;
    return once + (db?.routines || []).filter(written).length;
  }
  return null;
}

/** Two rolls are the same plush when every sewn part matches. Its name and temperament are free to change. */
function samePlush(kept, next) {
  if (!kept || !next) return false;
  return Number(kept.seed) === Number(next.seed) && Object.keys(STUFFIE_PARTS).every((slot) => kept[slot] === next[slot]);
}

function deepTopic(user, topic) {
  return DEEP_TOPICS.some((item) => item.topic === topic && (!item.side || item.side === user?.slashSide));
}

/** The first week a Free household can open, given the Monday their current week started on. */
function firstWeekShown(currentWeek) {
  return shiftDay(currentWeek, -7 * HISTORY_WEEKS);
}

/**
 * What a Free household is told at each limit: what is on the other side, in a
 * line. The same words are sent with a refusal and shown on the app's cards.
 */
const SORRY = {
  "stuffie-keep": (limit, kept) => (kept
    ? `${kept} is yours and is staying put. Sewing a different one is part of Plus.`
    : "Keeping a stuffie you made is part of Plus. Roll as many as you like."),
  dailies: (limit) => `${limit} daily tasks are running, which is as many as Free keeps going at once. Stop one to make room, or Plus keeps them all going.`,
  "own-tasks": (limit) => `That’s ${limit} of your own this week. The catalog is wide open, and your own come back on Monday. Plus doesn’t count them.`,
  rewards: (limit) => `${limit} rewards are on the table, which is as many as Free holds at once. There’s room again when one is granted or taken back. Plus holds as many as you like.`,
  history: (limit) => `Anything from more than ${limit} weeks back is kept safe. Plus opens all of it.`,
  photos: (limit) => `Photos from tasks finished more than ${limit} weeks ago are kept safe. Plus shows every one.`,
  "deep-talk": () => "That one’s a heart-to-heart, and those are part of Plus. Ask me anything else.",
};

/**
 * Asked before each gated action. Returns nothing when it may go ahead, or the
 * one line to say when it is on the Plus side. `context` is what the action is:
 *   stuffie-keep  { user, stuffie }   the stuffie about to be saved
 *   deep-talk     { user, topic }     the question being asked
 *   history       { week, clientDate } the earlier check-in being opened
 */
export function refusal(db, plan, featureId, context = {}) {
  if (plan?.effective === "plus" || !SORRY[featureId]) return null;
  const limit = limitOf(plan, featureId);
  const sorry = SORRY[featureId];

  if (featureId === "stuffie-keep") {
    const made = cleanStuffie(context.stuffie);
    const kept = context.user?.stuffie;
    if (!made || samePlush(kept, made)) return null;
    return kept?.name ? sorry(limit, kept.name) : `${sorry(limit)} Any of the four will happily come home with you.`;
  }
  if (featureId === "deep-talk") return deepTopic(context.user, context.topic) ? sorry(limit) : null;
  if (featureId === "history") {
    const week = String(context.week || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return null;
    return week < firstWeekShown(weekOf({ clientDate: context.clientDate, now: context.now }).week) ? sorry(limit) : null;
  }
  const used = usageOf(db, featureId, context);
  return used != null && used >= limit ? sorry(limit) : null;
}

function usageWords(featureId, used, limit) {
  const over = used > limit;
  if (featureId === "dailies") {
    return over ? `${used} daily tasks running. They all stay.` : `${used} of ${limit} daily tasks running`;
  }
  if (featureId === "rewards") {
    return over ? `${used} rewards on the table. They all stay.` : `${used} of ${limit} rewards on the table`;
  }
  if (featureId === "own-tasks") {
    return over ? `${used} of your own written this week` : `${used} of ${limit} of your own written this week`;
  }
  return "";
}

/**
 * The plan as the app shows it: who has what, the table, and where this
 * household stands against each Free limit. `open` is whether the Plus side of
 * a line is theirs right now, or, for a counted line, whether there is room to add one.
 */
export function planView(db, options = {}, clock = {}) {
  const plan = planOf(db, options);
  const plus = plan.effective === "plus";
  return {
    ...plan,
    names: PLAN_NAMES,
    canSwitch: options.hosted !== true,
    note: plan.earlyAccess ? "Everything is open while SlashConnect is in testing." : "",
    historyWeeks: HISTORY_WEEKS,
    deepTopics: DEEP_TOPICS,
    features: FEATURES.map((feature) => {
      const always = feature.free === true;
      const limit = typeof feature.free === "number" ? feature.free : null;
      const used = always ? null : usageOf(db, feature.id, clock);
      const counted = used != null && limit != null;
      return {
        id: feature.id,
        title: feature.title,
        line: feature.line,
        always,
        free: feature.freeSays || "",
        plus: feature.plusSays || "",
        limit,
        used: counted ? used : null,
        usage: counted ? usageWords(feature.id, used, limit) : "",
        nudge: always ? "" : SORRY[feature.id](feature.free),
        open: always || plus || (counted && used < limit),
      };
    }),
  };
}

/**
 * Sets what the Plans page is trying out, on a build that is not hosted.
 * Free really is Free: it switches early access off for this household. Plus
 * goes back to how things were, which during early access is everything open.
 * Returns false for anything that is not a plan.
 */
export function previewPlan(db, wanted, options = {}, now = new Date().toISOString()) {
  if (wanted !== "free" && wanted !== "plus") return false;
  const kept = db.plan && typeof db.plan === "object" ? db.plan : {};
  const next = { tier: kept.tier === "plus" ? "plus" : "free", since: kept.since || now };
  if (wanted === "free") next.preview = "free";
  else if (options.earlyAccess === false && next.tier !== "plus") next.preview = "plus";
  db.plan = next;
  return true;
}

function dayOf(task) {
  return String(task.completionDate || task.completedAt || "").slice(0, 10);
}

/**
 * The bundle as this household's plan shows it, with `plan` added. A Free
 * household gets the same bundle with the older weeks left out and counted, so
 * the app can say they are there. `db` is never touched: everything is still
 * kept, and Plus shows it all again.
 */
export function throughPlan(db, body, options = {}, clock = {}) {
  const view = planView(db, options, clock);
  const out = { ...body, plan: view };
  if (view.effective === "plus") return out;

  const weekly = out.weekly;
  if (weekly && Array.isArray(weekly.history) && weekly.week) {
    const first = firstWeekShown(weekly.week);
    const shown = weekly.history.filter((item) => item.week >= first);
    out.weekly = { ...weekly, history: shown, olderWeeks: weekly.history.length - shown.length };
    if (weekly.opened && weekly.opened.week < first) out.weekly.opened = null;
  }

  const progress = out.progress;
  if (progress && Array.isArray(progress.calendar)) {
    const keep = HISTORY_WEEKS * 7;
    const hidden = Math.max(0, progress.calendar.length - keep);
    out.progress = { ...progress, calendar: progress.calendar.slice(-keep), olderWeeks: Math.floor(hidden / 7) };
  }

  if (Array.isArray(out.tasks)) {
    const first = shiftDay(nowIsoOf(clock).slice(0, 10), -7 * HISTORY_WEEKS);
    out.tasks = out.tasks.map((task) => {
      const photos = task.completion?.photos;
      if (!Array.isArray(photos) || photos.length === 0) return task;
      const day = dayOf(task);
      if (!day || day >= first) return task;
      return { ...task, completion: { ...task.completion, photos: [], photosKept: photos.length } };
    });
  }
  return out;
}
