/**
 * The weekly check-in: once a week each partner writes how they are, how the two
 * of them are, what they need, and what they would like in the week ahead.
 *
 * Everything here works on the household record and a clock that is handed in
 * (`{ clientDate, now }`), so the rules can be tested on any date.
 *
 * A week starts on Monday and is named by that Monday, on the writer's own calendar.
 */

export const WEEKLY_POINTS = 10;
export const WEEKLY_CARE_POINTS = 10;
export const WEEKLY_LIMITS = { text: 1200, note: 400, weeksKept: 52 };

/**
 * What a person can ask for in the week ahead. `ask` finishes the sentence
 * "Avery asked for …". `side` keeps a choice to one side of the slash.
 */
export const REQUEST_CHOICES = [
  { id: "fun", label: "More fun and play", ask: "more fun and play" },
  { id: "spice", label: "More spice", ask: "more spice" },
  { id: "structure", label: "More structure", ask: "more structure" },
  { id: "firm", label: "A firmer hand", ask: "a firmer hand", side: "following" },
  { id: "feedback", label: "More feedback on my tasks", ask: "more feedback on tasks", side: "leading" },
  { id: "soft", label: "More softness and care", ask: "more softness and care" },
  { id: "praise", label: "More praise", ask: "more praise" },
  { id: "rest", label: "More quiet and rest", ask: "more quiet and rest" },
  { id: "checkins", label: "More check-ins", ask: "more check-ins" },
  { id: "date", label: "A date night or a long call", ask: "a date night or a long call" },
  { id: "new", label: "Something new", ask: "something new" },
  { id: "headspace", label: "More time in my headspace", ask: "more headspace time" },
  { id: "aftercare", label: "More aftercare", ask: "more aftercare" },
];

const DAY_MS = 86400000;

function fail(status, error) {
  const err = new Error(error);
  err.status = status;
  throw err;
}

function firstName(user) {
  return String(user?.displayName || "").trim().split(/\s+/)[0] || "Your partner";
}

export function validDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "";
  return value;
}

export function shiftDay(day, days) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The Monday on or before a calendar day. */
export function weekStart(day) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return shiftDay(day, -((weekday + 6) % 7));
}

function nowMs(clock) {
  const now = clock?.now;
  if (now instanceof Date) return now.getTime();
  if (typeof now === "function") return Number(now());
  if (typeof now === "number") return now;
  if (typeof now === "string") return new Date(now).getTime();
  return Date.now();
}

/**
 * The day it is for the person asking. Their phone says what day it is where they
 * are, and that is believed as long as it is a day some time zone could be on.
 * Anything further off falls back to the server's day, so a phone with the wrong
 * date cannot write into weeks that are over or have not started.
 */
export function resolveDay(clock = {}) {
  const serverDay = new Date(nowMs(clock)).toISOString().slice(0, 10);
  const client = validDay(clock.clientDate);
  if (!client) return serverDay;
  const apart = Math.abs(new Date(`${client}T00:00:00Z`).getTime() - new Date(`${serverDay}T00:00:00Z`).getTime()) / DAY_MS;
  return apart <= 1 ? client : serverDay;
}

export function weekOf(clock = {}) {
  const today = resolveDay(clock);
  const week = weekStart(today);
  return { today, week, weekEnd: shiftDay(week, 6), nowIso: new Date(nowMs(clock)).toISOString() };
}

function entriesOf(db) {
  return Array.isArray(db?.weeklies) ? db.weeklies : [];
}

function partnerIn(db, user) {
  const members = db?.pair?.members;
  if (!user || !Array.isArray(members) || members.length < 2 || !members.includes(user.id)) return null;
  const otherId = members.find((id) => id !== user.id);
  return (db.users || []).find((item) => item.id === otherId) || null;
}

function entryFor(db, userId, week) {
  return entriesOf(db).find((item) => item.week === week && item.userId === userId) || null;
}

/**
 * Keeps line breaks, since this is writing and not a label, and drops what has
 * no place in it: control characters, text-direction overrides, runs of blank lines.
 */
export function cleanWriting(value, max) {
  if (typeof value !== "string") return "";
  const text = value
    .replace(/\r\n?/g, "\n")
    .replace(/\p{Cc}/gu, (char) => (char === "\n" ? "\n" : " "))
    .replace(/[\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return Array.from(text).slice(0, max).join("").trim();
}

function cleanRating(value) {
  const rating = Math.round(Number(value));
  return Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : 0;
}

export function sanitiseWeekly(body) {
  const input = body && typeof body === "object" ? body : {};
  const asked = new Set(Array.isArray(input.requests) ? input.requests.filter((id) => typeof id === "string") : []);
  return {
    self: cleanWriting(input.self, WEEKLY_LIMITS.text),
    selfRating: cleanRating(input.selfRating),
    dynamic: cleanWriting(input.dynamic, WEEKLY_LIMITS.text),
    dynamicRating: cleanRating(input.dynamicRating),
    needs: cleanWriting(input.needs, WEEKLY_LIMITS.text),
    requests: REQUEST_CHOICES.filter((choice) => asked.has(choice.id)).map((choice) => choice.id),
    requestNote: cleanWriting(input.requestNote, WEEKLY_LIMITS.note),
  };
}

function saysSomething(clean) {
  return Boolean(clean.self || clean.dynamic || clean.needs || clean.requestNote || clean.selfRating || clean.dynamicRating || clean.requests.length);
}

function sameAnswers(entry, clean) {
  return ["self", "selfRating", "dynamic", "dynamicRating", "needs", "requestNote"].every((key) => entry[key] === clean[key])
    && (entry.requests || []).join(" ") === clean.requests.join(" ");
}

function prune(db) {
  const weeks = [...new Set(db.weeklies.map((item) => item.week))].sort().reverse();
  if (weeks.length <= WEEKLY_LIMITS.weeksKept) return;
  const kept = new Set(weeks.slice(0, WEEKLY_LIMITS.weeksKept));
  db.weeklies = db.weeklies.filter((item) => kept.has(item.week));
}

/**
 * Sends this week's check-in, or changes it if it is already in.
 * Points are given once, when it is first sent. When this one completes the pair,
 * `hooks.queueCheer(partner, cheer)` is called so the first person hears about it.
 * Levels and trophies are not worked out here: the caller wraps this in progress.
 */
export function saveWeekly(db, user, body, clock = {}, hooks = {}) {
  const partner = partnerIn(db, user);
  if (!partner) fail(409, "The weekly check-in opens once the two of you are paired. It’ll be here.");
  const { week, nowIso } = weekOf(clock);
  const clean = sanitiseWeekly(body);
  if (!saysSomething(clean)) fail(400, "Say a little something first. One line is plenty.");
  if (!Array.isArray(db.weeklies)) db.weeklies = [];

  const existing = entryFor(db, user.id, week);
  if (existing) {
    if (!sameAnswers(existing, clean)) {
      Object.assign(existing, clean);
      existing.updatedAt = nowIso;
    }
    return { entry: existing, created: false, celebration: null };
  }

  const leading = user.slashSide === "leading";
  const following = user.slashSide === "following";
  const earned = leading ? WEEKLY_CARE_POINTS : following ? WEEKLY_POINTS : 0;
  const entry = {
    id: `${week}:${user.id}`,
    week,
    userId: user.id,
    ...clean,
    createdAt: nowIso,
    updatedAt: nowIso,
    readAt: {},
    earned,
  };
  db.weeklies.push(entry);
  prune(db);

  if (leading) user.carePoints = (user.carePoints || 0) + earned;
  if (following) user.points = (user.points || 0) + earned;

  const theirs = entryFor(db, partner.id, week);
  if (theirs && typeof hooks.queueCheer === "function") {
    hooks.queueCheer(partner, { kind: "weekly", what: week, from: user.id });
  }

  const name = firstName(partner);
  const gained = earned ? `+${earned} ${leading ? "care points" : "points"}. ` : "";
  const celebration = {
    kind: "weekly",
    title: "Check-in sent",
    detail: theirs
      ? `${gained}${name}’s is in too. Go read them together.`
      : `${gained}${name} sees it once both of you have sent one.`,
    points: earned,
  };
  return { entry, created: true, celebration };
}

/** What the waiting celebration says once both check-ins are in. `from` is the first name of whoever sent second. */
export function weeklyCheer(ids, from) {
  return {
    ids,
    kind: "weekly",
    from,
    title: "Both check-ins are in",
    detail: `${from}’s is in too. They’re ready to read, side by side, whenever you are.`,
  };
}

function canRead(db, viewer, entry, currentWeek) {
  if (entry.userId === viewer.id) return true;
  if (entry.week < currentWeek) return true;
  return Boolean(entryFor(db, viewer.id, entry.week));
}

function unreadState(entry, viewerId) {
  const readAt = entry.readAt?.[viewerId];
  if (!readAt) return "new";
  return readAt < entry.updatedAt ? "changed" : "";
}

/** Notes that the viewer has read everything of their partner's that they are allowed to see. */
export function markWeeklyRead(db, user, clock = {}) {
  const partner = partnerIn(db, user);
  if (!partner) return false;
  const { week, nowIso } = weekOf(clock);
  let changed = false;
  for (const entry of entriesOf(db)) {
    if (entry.userId !== partner.id || !canRead(db, user, entry, week) || !unreadState(entry, user.id)) continue;
    entry.readAt = { ...entry.readAt, [user.id]: nowIso };
    changed = true;
  }
  return changed;
}

function present(entry) {
  if (!entry) return null;
  return {
    week: entry.week,
    userId: entry.userId,
    self: entry.self || "",
    selfRating: entry.selfRating || 0,
    dynamic: entry.dynamic || "",
    dynamicRating: entry.dynamicRating || 0,
    needs: entry.needs || "",
    requests: Array.isArray(entry.requests) ? entry.requests : [],
    requestNote: entry.requestNote || "",
    createdAt: entry.createdAt || "",
    updatedAt: entry.updatedAt || "",
    edited: Boolean(entry.updatedAt && entry.createdAt && entry.updatedAt !== entry.createdAt),
  };
}

function weekPair(db, viewer, partner, week, currentWeek) {
  const mine = entryFor(db, viewer.id, week);
  const theirs = entryFor(db, partner.id, week);
  const readable = theirs && canRead(db, viewer, theirs, currentWeek) ? theirs : null;
  return {
    week,
    weekEnd: shiftDay(week, 6),
    past: week < currentWeek,
    mine: present(mine),
    partner: present(readable),
    partnerSent: Boolean(theirs),
  };
}

const UNPAIRED = {
  available: false,
  state: "unpaired",
  mine: null,
  partner: null,
  partnerSent: false,
  unread: "",
  asks: null,
  history: [],
};

/**
 * What one person may see of the weekly check-ins right now.
 * Their partner's answers for a week stay sealed until their own are in, so
 * nobody writes theirs as a reply. Once a week is over it opens either way.
 * `open` adds one week in full, for the history page.
 */
export function weeklyView(db, user, clock = {}, { open } = {}) {
  const { today, week, weekEnd } = weekOf(clock);
  const mySide = user?.slashSide || "";
  const base = {
    today,
    week,
    weekEnd,
    earns: mySide === "leading" ? WEEKLY_CARE_POINTS : mySide === "following" ? WEEKLY_POINTS : 0,
    limits: { text: WEEKLY_LIMITS.text, note: WEEKLY_LIMITS.note },
    choices: REQUEST_CHOICES.map(({ id, label, ask, side }) => ({ id, label, ask, side: side || "" })),
  };
  const partner = partnerIn(db, user);
  if (!partner) return { ...base, ...UNPAIRED };

  const now = weekPair(db, user, partner, week, week);
  const theirsNow = entryFor(db, partner.id, week);
  const state = now.mine ? (now.partnerSent ? "both" : "mine-in") : now.partnerSent ? "partner-waiting" : "open";

  const lastWeek = shiftDay(week, -7);
  const latest = now.partner ? theirsNow : entryFor(db, partner.id, lastWeek);
  const asks = latest && ((latest.requests || []).length || latest.requestNote)
    ? { week: latest.week, thisWeek: latest.week === week, requests: latest.requests || [], note: latest.requestNote || "" }
    : null;

  const pastWeeks = [...new Set(entriesOf(db)
    .filter((item) => item.week < week && (item.userId === user.id || item.userId === partner.id))
    .map((item) => item.week))].sort().reverse();
  const history = pastWeeks.map((past) => {
    const mine = entryFor(db, user.id, past);
    const theirs = entryFor(db, partner.id, past);
    return {
      week: past,
      weekEnd: shiftDay(past, 6),
      mine: mine ? { selfRating: mine.selfRating || 0, dynamicRating: mine.dynamicRating || 0 } : null,
      partner: theirs ? { selfRating: theirs.selfRating || 0, dynamicRating: theirs.dynamicRating || 0 } : null,
    };
  });

  const view = {
    ...base,
    available: true,
    state,
    mine: now.mine,
    partner: now.partner,
    partnerSent: now.partnerSent,
    unread: state === "both" ? unreadState(theirsNow, user.id) : "",
    asks,
    history,
  };
  const opened = validDay(open);
  if (opened) {
    const pair = opened <= week && opened === weekStart(opened) ? weekPair(db, user, partner, opened, week) : null;
    view.opened = pair && (pair.mine || pair.partnerSent) ? pair : null;
  }
  return view;
}

function longestRun(weeks) {
  let best = 0;
  let run = 0;
  let previous = "";
  for (const week of [...weeks].sort()) {
    run = previous && shiftDay(previous, 7) === week ? run + 1 : 1;
    best = Math.max(best, run);
    previous = week;
  }
  return best;
}

/** A run still stands if the latest week in it is this week or last week: this week is not over yet. */
function currentRun(weeks, thisWeek) {
  const have = new Set(weeks);
  let cursor = have.has(thisWeek) ? thisWeek : shiftDay(thisWeek, -7);
  let run = 0;
  while (have.has(cursor)) {
    run += 1;
    cursor = shiftDay(cursor, -7);
  }
  return run;
}

/**
 * Counts for levels and achievements. Nothing here is the writing itself.
 *   weeksTogether  weeks where both of them checked in
 *   weeksBy        weeks each person checked in, by user id
 *   run            weeks in a row, up to now, where both checked in
 *   bestRun        the longest such run there has been
 *   runBy          each person's own run of weeks, by user id
 */
export function weeklyFacts(db, clock = {}) {
  const { week } = weekOf(clock);
  const members = Array.isArray(db?.pair?.members) ? db.pair.members : [];
  const byUser = new Map();
  for (const entry of entriesOf(db)) {
    if (!byUser.has(entry.userId)) byUser.set(entry.userId, new Set());
    byUser.get(entry.userId).add(entry.week);
  }
  const ids = members.length ? members : [...byUser.keys()];
  const sets = ids.map((id) => byUser.get(id) || new Set());
  const together = ids.length >= 2 ? [...sets[0]].filter((item) => sets.every((set) => set.has(item))) : [];
  const weeksBy = {};
  const runBy = {};
  ids.forEach((id, index) => {
    weeksBy[id] = sets[index].size;
    runBy[id] = currentRun(sets[index], week);
  });
  return {
    weeksTogether: together.length,
    weeksBy,
    run: currentRun(together, week),
    bestRun: longestRun(together),
    runBy,
  };
}

/**
 * The `/api/weekly` routes. Returns `{ status, save, extra }`: whether the
 * household changed, and what to add to the bundle that goes back.
 */
export function weeklyRoute(db, user, { method, parts, body, clientDate, now }, hooks = {}) {
  const clock = { clientDate, now };
  const verb = String(method || "GET").toUpperCase();
  const sub = parts[2] || "";
  if (parts[3]) fail(404, "That path is not part of SlashConnect.");

  if (verb === "POST" && !sub) {
    const saved = saveWeekly(db, user, body, clock, hooks);
    return {
      status: saved.created ? 201 : 200,
      save: true,
      extra: { weekly: weeklyView(db, user, clock), ...(saved.celebration ? { celebration: saved.celebration } : {}) },
    };
  }
  if (verb === "POST" && sub === "read") {
    const changed = markWeeklyRead(db, user, clock);
    return { status: 200, save: changed, extra: { weekly: weeklyView(db, user, clock) } };
  }
  if (verb === "GET" && !sub) {
    return { status: 200, save: false, extra: { weekly: weeklyView(db, user, clock) } };
  }
  if (verb === "GET") {
    if (!partnerIn(db, user)) fail(409, "The weekly check-in opens once the two of you are paired. It’ll be here.");
    const view = weeklyView(db, user, clock, { open: sub });
    if (!view.opened) fail(404, "There’s no check-in from that week.");
    return { status: 200, save: false, extra: { weekly: view } };
  }
  fail(404, "That path is not part of SlashConnect.");
}
