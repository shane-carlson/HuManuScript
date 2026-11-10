import { LEVELS, levelFor, templateById } from "./catalog.mjs";

/**
 * Progress for one couple: embers and levels, the day streak and the week
 * streak, the bonuses for showing up, the leading partner's care, and the
 * trophy shelf the two of them share.
 *
 * Almost all of it is worked out from what is already on the record: finished
 * tasks and the day each was finished on, well dones, rewards. `db.progress`
 * holds only what cannot be worked out a second time:
 *
 *   boost    embers a couple from the old six-level ladder starts with
 *   legacy   their points and streak the first time this ran
 *   bonus    every bonus given, by key, so none is given twice
 *   xp       the most embers they have ever had, so a level never drops
 *   shelf    trophies already put on the shelf: when, and whose
 *   facts    things other features report (see `recordFact`)
 *
 * Every function takes the household and a clock, `{ today, now }`, where
 * `today` is the following partner's calendar day. Reading never writes.
 */

const DAY_MS = 86400000;

export const RULES = {
  /** With no daily tasks set, this many points in a day makes it a full day. */
  dayPoints: 15,
  fullDay: 5,
  /** A week (Monday to Sunday) is kept once this many of its days have a finished task. */
  weekDays: 4,
  weekEmbers: 15,
  /** One missed day is forgiven as long as the last forgiven one was this many days back. */
  restEvery: 7,
  streak: [
    { days: 3, embers: 10 },
    { days: 7, embers: 25 },
    { days: 14, embers: 40 },
    { days: 30, embers: 80 },
    { days: 60, embers: 120 },
    { days: 100, embers: 200 },
    { days: 200, embers: 300 },
    { days: 365, embers: 500 },
  ],
};

/** The leading partner's own ladder, climbed with care points. */
export const CARE_LEVELS = [
  { id: "kindling", name: "Kindling", min: 0 },
  { id: "tender", name: "Tender", min: 100 },
  { id: "keeper", name: "Keeper", min: 350 },
  { id: "hearthkeeper", name: "Hearthkeeper", min: 900 },
  { id: "lightkeeper", name: "Lightkeeper", min: 2000 },
  { id: "lodestar", name: "Lodestar", min: 4000 },
  { id: "north-star", name: "North Star", min: 7000 },
];

/** Where the six levels started before there were embers. */
const OLD_LADDER = [0, 40, 90, 160, 250, 400];

export function validDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
}

export function shiftDay(day, days) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dayGap(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** The Monday on or before a calendar day. A week is named by its Monday. */
export function weekStart(day) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return shiftDay(day, -((weekday + 6) % 7));
}

function utcDay(iso) {
  const time = Date.parse(String(iso || ""));
  return Number.isNaN(time) ? "" : new Date(time).toISOString().slice(0, 10);
}

function firstName(user) {
  return String(user?.displayName || "").trim().split(/\s+/)[0] || "Your partner";
}

function followerOf(db) {
  return (db.users || []).find((user) => user.slashSide === "following") || null;
}

function leaderOf(db) {
  return (db.users || []).find((user) => user.slashSide === "leading") || null;
}

function partnerOf(db, user) {
  const members = db.pair?.members;
  if (!user || !Array.isArray(members)) return null;
  const otherId = members.find((id) => id !== user.id);
  return (db.users || []).find((item) => item.id === otherId) || null;
}

function oldLevelIndex(points) {
  let index = 0;
  OLD_LADDER.forEach((min, at) => {
    if (points >= min) index = at;
  });
  return index;
}

/**
 * The embers a couple starts with, given the points they earned on the old
 * six-level ladder. They keep the level they had reached and how far through
 * it they were, so nobody opens the app to a smaller name than yesterday's.
 */
export function emberStart(points) {
  const score = Math.max(0, Number(points) || 0);
  const index = oldLevelIndex(score);
  const oldMin = OLD_LADDER[index];
  const oldNext = OLD_LADDER[index + 1];
  const newMin = LEVELS[index].min;
  if (oldNext == null) return Math.round(newMin + score - oldMin);
  return Math.round(newMin + ((score - oldMin) / (oldNext - oldMin)) * (LEVELS[index + 1].min - newMin));
}

export function careLevelFor(points) {
  const score = Math.max(0, Number(points) || 0);
  let index = 0;
  CARE_LEVELS.forEach((level, at) => {
    if (score >= level.min) index = at;
  });
  const current = CARE_LEVELS[index];
  const next = CARE_LEVELS[index + 1] || null;
  return {
    id: current.id,
    name: current.name,
    min: current.min,
    index,
    next: next ? next.name : null,
    nextMin: next ? next.min : null,
    progress: next ? Math.min(1, (score - current.min) / (next.min - current.min)) : 1,
  };
}

function earnedFrom(task) {
  const picked = new Set(task.completion?.bonuses || []);
  const extras = (task.bonuses || []).filter((bonus) => picked.has(bonus.id)).reduce((sum, bonus) => sum + (Number(bonus.points) || 0), 0);
  return (Number(task.points) || 0) + extras;
}

/** Points the following partner has ever earned: what they hold now plus what went on rewards. */
function lifetimePoints(db, follower) {
  const spent = (db.rewards || []).filter((reward) => reward.status === "granted").reduce((sum, reward) => sum + (Number(reward.cost) || 0), 0);
  return Math.max(0, Number(follower?.points) || 0) + spent;
}

/**
 * The day streak, walked forward from the first day anything was finished.
 * A single missed day rests the streak: it neither grows nor breaks. A second
 * missed day in a row, or another inside the same seven days, starts it over.
 * Today is never counted as missed, because it is not over.
 */
export function walkStreak(active, today) {
  const out = { days: 0, best: 0, rest: new Set(), lastRest: "", reached: new Map() };
  const sorted = [...active].sort();
  if (!sorted.length) return out;
  const last = sorted[sorted.length - 1];
  const end = last > today ? last : today;
  let run = 0;
  for (let day = sorted[0]; day <= end; day = shiftDay(day, 1)) {
    if (active.has(day)) {
      run += 1;
      if (run > out.best) out.best = run;
      if (!out.reached.has(run)) out.reached.set(run, day);
      continue;
    }
    if (day >= today) continue;
    if (run > 0 && (!out.lastRest || dayGap(out.lastRest, day) >= RULES.restEvery)) {
      out.lastRest = day;
      out.rest.add(day);
      continue;
    }
    // The day before was not a rest after all. It was the start of the gap.
    out.rest.delete(shiftDay(day, -1));
    out.lastRest = "";
    run = 0;
  }
  out.days = run;
  return out;
}

function savedState(db) {
  return db.progress && db.progress.v === 1 ? db.progress : null;
}

/**
 * Progress for a household that has none saved. A couple with history keeps
 * their place: embers to match their old level, streak bonuses they are already
 * past marked as given, and everything they have earned put on the shelf
 * quietly, so the first look is a full shelf and not thirty celebrations.
 */
function firstState(db, clock) {
  const follower = followerOf(db);
  const lifetime = lifetimePoints(db, follower);
  const start = emberStart(lifetime);
  const state = { v: 1, since: clock.now, boost: start - lifetime, xp: start, bonus: {}, shelf: {}, facts: {} };
  const streak = Number(follower?.streak) || 0;
  if (lifetime > 0 || streak > 0) {
    state.legacy = { points: lifetime, streak, lastActive: validDay(follower?.lastActiveDate) };
  }
  const measured = measure(db, state, clock);
  for (const stone of RULES.streak) {
    if (measured.streak.best >= stone.days) state.bonus[`streak:${stone.days}`] = 0;
  }
  for (const [id, got] of deriveTrophies(db, state, measured, clock)) state.shelf[id] = { ...got, quiet: true };
  return state;
}

function ensureState(db, clock) {
  if (!savedState(db)) db.progress = firstState(db, clock);
  const state = db.progress;
  if (!state.bonus || typeof state.bonus !== "object") state.bonus = {};
  if (!state.shelf || typeof state.shelf !== "object") state.shelf = {};
  if (!state.facts || typeof state.facts !== "object") state.facts = {};
  return state;
}

/** Everything progress is built from, counted once. */
function measure(db, state, clock) {
  const { today } = clock;
  const follower = followerOf(db);
  const leader = leaderOf(db);
  const tasks = Array.isArray(db.tasks) ? db.tasks : [];
  const bonus = state.bonus || {};

  const done = [];
  if (follower) {
    for (const task of tasks) {
      if (task.status !== "done" || task.assignedTo !== follower.id) continue;
      const day = validDay(task.completionDate) || utcDay(task.completedAt);
      if (!day) continue;
      done.push({ task, day, at: String(task.completedAt || `${day}T12:00:00.000Z`), earned: earnedFrom(task) });
    }
  }
  done.sort((a, b) => a.at.localeCompare(b.at));

  const days = new Map();
  for (const item of done) {
    const entry = days.get(item.day) || { tasks: 0, points: 0, praised: 0 };
    entry.tasks += 1;
    entry.points += item.earned;
    if (item.task.acknowledgedAt) entry.praised += 1;
    days.set(item.day, entry);
  }
  const active = new Set(days.keys());
  const legacy = state.legacy;
  if (legacy && legacy.streak > 0 && validDay(legacy.lastActive)) {
    for (let back = 0; back < Math.min(legacy.streak, 400); back += 1) active.add(shiftDay(legacy.lastActive, -back));
  }
  const streak = walkStreak(active, today);

  const routines = follower ? (db.routines || []).filter((routine) => routine.assignedTo === follower.id) : [];
  const instances = new Map();
  for (const task of tasks) {
    if (!task.routineId || !task.day) continue;
    const key = `${task.routineId}|${task.day}`;
    const held = instances.get(key);
    if (!held || task.status === "done") instances.set(key, task);
  }
  const dailyMemo = new Map();
  const dailiesOn = (day) => {
    const known = dailyMemo.get(day);
    if (known) return known;
    const count = { done: 0, total: 0 };
    for (const routine of routines) {
      const instance = instances.get(`${routine.id}|${day}`);
      if (!instance) {
        const stopped = utcDay(routine.stoppedAt);
        if (stopped && stopped <= day) continue;
        // Given that same day, the task would have had a copy for it. No copy means it came later.
        if (!(utcDay(routine.createdAt) < day)) continue;
        count.total += 1;
      } else if (instance.status === "done") {
        count.total += 1;
        count.done += 1;
      } else if (instance.status === "skipped" && Boolean(instance.consent ?? templateById(instance.templateId)?.consent)) {
        // Passing on a task that asks for a yes is never held against the day.
        continue;
      } else {
        count.total += 1;
      }
    }
    dailyMemo.set(day, count);
    return count;
  };
  const fullOn = (day) => {
    if (bonus[`full:${day}`] != null) return true;
    if (!days.has(day)) return false;
    const daily = dailiesOn(day);
    return daily.total > 0 ? daily.done === daily.total : days.get(day).points >= RULES.dayPoints;
  };

  const perWeek = new Map();
  for (const day of active) perWeek.set(weekStart(day), [...(perWeek.get(weekStart(day)) || []), day]);
  const keptWeeks = [...perWeek].filter(([, list]) => list.length >= RULES.weekDays).map(([week]) => week).sort();
  const keptSet = new Set(keptWeeks);
  const thisWeek = weekStart(today);
  let weekRun = 0;
  for (let cursor = keptSet.has(thisWeek) ? thisWeek : shiftDay(thisWeek, -7); keptSet.has(cursor); cursor = shiftDay(cursor, -7)) weekRun += 1;
  let weekBest = 0;
  const weekReached = new Map();
  let run = 0;
  let previous = "";
  for (const week of keptWeeks) {
    run = previous && shiftDay(previous, 7) === week ? run + 1 : 1;
    if (run > weekBest) weekBest = run;
    if (!weekReached.has(run)) weekReached.set(run, perWeek.get(week).slice().sort()[RULES.weekDays - 1]);
    previous = week;
  }
  const daysThisWeek = (perWeek.get(thisWeek) || []).length;
  const daysLeft = Math.max(0, 6 - dayGap(thisWeek, today));

  const praised = done.filter((item) => item.task.acknowledgedAt).sort((a, b) => String(a.task.acknowledgedAt).localeCompare(String(b.task.acknowledgedAt)));
  const dayList = [...days.keys()].sort();
  const answered = (day) => days.get(day).praised === days.get(day).tasks;
  let cursor = dayList.length - 1;
  // The latest day may still be waiting on its well dones. That is not a miss yet.
  if (cursor >= 0 && !answered(dayList[cursor]) && dayGap(dayList[cursor], today) <= 1) cursor -= 1;
  let praiseRun = 0;
  for (; cursor >= 0 && answered(dayList[cursor]); cursor -= 1) praiseRun += 1;
  let praiseBest = 0;
  run = 0;
  for (const day of dayList) {
    run = answered(day) ? run + 1 : 0;
    if (run > praiseBest) praiseBest = run;
  }

  const lifetime = lifetimePoints(db, follower);
  const bonusSum = Object.values(bonus).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const embers = Math.max(Number(state.xp) || 0, lifetime + bonusSum + (Number(state.boost) || 0));
  const todayDaily = dailiesOn(today);
  const todayCount = days.get(today) || { tasks: 0, points: 0, praised: 0 };

  return {
    today,
    follower,
    leader,
    done,
    days,
    active,
    streak,
    fullOn,
    embers,
    level: levelFor(embers),
    todayDaily,
    todayCount,
    week: { start: thisWeek, days: daysThisWeek, daysLeft, kept: keptSet.has(thisWeek), run: weekRun, best: weekBest, reached: weekReached },
    praised,
    praiseRun,
    praiseBest,
    carePoints: Number(leader?.carePoints) || 0,
  };
}

function stampOf(item) {
  return { at: item.at, day: item.day };
}

function countOf(group, id, need, title, line, hint, art, tint) {
  return {
    id,
    group,
    title,
    line,
    hint,
    art,
    tint,
    who: "following",
    have: (m) => m.done.length,
    need,
    earned: (m) => (m.done.length >= need ? stampOf(m.done[need - 1]) : null),
  };
}

function streakOf(id, need, title, line, hint, tint) {
  return {
    id,
    group: "showing-up",
    title,
    line,
    hint,
    art: `flame:${need}`,
    tint,
    who: "following",
    have: (m) => m.streak.best,
    need,
    earned: (m) => (m.streak.best >= need ? { day: m.streak.reached.get(need) } : null),
  };
}

function weeksOf(id, need, title, line, hint, tint) {
  return {
    id,
    group: "showing-up",
    title,
    line,
    hint,
    art: `weeks:${need}`,
    tint,
    who: "following",
    have: (m) => m.week.best,
    need,
    earned: (m) => (m.week.best >= need ? { day: m.week.reached.get(need) } : null),
  };
}

function praiseOf(id, need, title, line, hint, art, tint) {
  return {
    id,
    group: "care",
    title,
    line,
    hint,
    art,
    tint,
    who: "leading",
    have: (m) => m.praised.length,
    need,
    earned: (m) => (m.praised.length >= need ? { at: String(m.praised[need - 1].task.acknowledgedAt) } : null),
  };
}

/** The first day that ends a run of `length` days in a row, or "" if there is none. */
function firstRun(days, length) {
  let run = 0;
  let previous = "";
  for (const day of [...days].sort()) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    if (run >= length) return day;
    previous = day;
  }
  return "";
}

function levelTrophy(level, index) {
  return {
    id: `level-${level.id}`,
    group: "levels",
    title: level.name,
    line: index === 0 ? "Where every fire starts." : `The two of you reached ${level.name}.`,
    hint: `Reach ${level.name}.`,
    art: `level:${level.id}`,
    tint: ["coral", "gold", "coral", "plum", "teal", "lilac"][index % 6],
    who: "both",
    level: index,
    have: (m) => m.embers,
    need: level.min,
    earned(m, db, state, clock) {
      if (m.level.index < index) return null;
      if (index === 0) return { at: String(m.follower?.createdAt || db.pair?.createdAt || clock.now) };
      // Levels reached on the old ladder are dated by the old ladder.
      const old = state.legacy && oldLevelIndex(state.legacy.points) >= index;
      const needed = old ? OLD_LADDER[index] : level.min - (Number(state.boost) || 0);
      let sum = 0;
      for (const item of m.done) {
        sum += item.earned;
        if (sum >= needed) return stampOf(item);
      }
      return { at: clock.now, day: clock.today };
    },
  };
}

/**
 * Everything that can sit on the shelf, in shelf order. `earned` reads the
 * record and returns when it happened, or null. A trophy with no `earned` is
 * fed from outside with `recordFact(db, id, { by })`.
 */
export const TROPHIES = [
  ...LEVELS.map(levelTrophy),
  {
    id: "first-task",
    group: "firsts",
    title: "First stitch",
    line: "The very first task, finished.",
    hint: "Finish one task.",
    art: "needle",
    tint: "coral",
    who: "following",
    earned: (m) => (m.done.length ? stampOf(m.done[0]) : null),
  },
  {
    id: "first-adventure",
    group: "firsts",
    title: "Behind the door",
    line: "A whole adventure, every task of it.",
    hint: "Finish every task from one adventure.",
    art: "door",
    tint: "gold",
    who: "following",
    earned(m) {
      const byId = new Map(m.done.map((item) => [item.task.id, item]));
      let first = null;
      for (const item of m.done) {
        const locked = item.task.templateId === "daily-adventure" ? item.task.adventure?.locked || [] : [];
        if (!locked.length || !locked.every((entry) => byId.has(entry.taskId))) continue;
        const last = locked.map((entry) => byId.get(entry.taskId)).sort((a, b) => a.at.localeCompare(b.at)).at(-1);
        if (!first || last.at < first.at) first = last;
      }
      return first ? stampOf(first) : null;
    },
  },
  {
    id: "first-reward",
    group: "firsts",
    title: "First reward",
    line: "Earned, cashed in, and granted.",
    hint: "Cash in a reward and have it granted.",
    art: "gift",
    tint: "teal",
    who: "both",
    earned(m, db) {
      const granted = (db.rewards || []).filter((reward) => reward.status === "granted").map((reward) => String(reward.grantedAt || "")).sort();
      return granted.length ? { at: granted[0] } : null;
    },
  },
  {
    id: "first-checkin",
    group: "firsts",
    title: "Side by side",
    line: "The first week you both checked in.",
    hint: "Both send a weekly check-in in the same week.",
    art: "letters",
    tint: "lilac",
    who: "both",
    earned(m, db) {
      const members = db.pair?.members || [];
      if (members.length < 2) return null;
      const weeks = new Map();
      for (const entry of Array.isArray(db.weeklies) ? db.weeklies : []) {
        if (!members.includes(entry.userId)) continue;
        weeks.set(entry.week, { ...(weeks.get(entry.week) || {}), [entry.userId]: String(entry.createdAt || "") });
      }
      const both = [...weeks.values()].filter((sent) => members.every((id) => id in sent)).map((sent) => Object.values(sent).sort().at(-1)).sort();
      return both.length ? { at: both[0] } : null;
    },
  },
  {
    id: "paired-month",
    group: "firsts",
    title: "A month of us",
    line: "Thirty days paired.",
    hint: "Stay paired for thirty days.",
    art: "moon",
    tint: "plum",
    who: "both",
    earned: (m, db, state, clock) => pairedFor(db, clock, 30),
  },
  {
    id: "paired-year",
    group: "firsts",
    title: "A year of us",
    line: "Three hundred and sixty-five days paired.",
    hint: "Stay paired for a year.",
    art: "rings",
    tint: "gold",
    who: "both",
    earned: (m, db, state, clock) => pairedFor(db, clock, 365),
  },
  countOf("showing-up", "tasks-10", 10, "Ten down", "Ten tasks finished.", "Finish ten tasks.", "count:10", "teal"),
  countOf("showing-up", "tasks-50", 50, "Fifty", "Fifty tasks finished.", "Finish fifty tasks.", "count:50", "coral"),
  countOf("showing-up", "tasks-100", 100, "The hundred", "A hundred tasks finished.", "Finish a hundred tasks.", "count:100", "gold"),
  countOf("showing-up", "tasks-250", 250, "Two-fifty", "Two hundred and fifty tasks finished.", "Finish two hundred and fifty tasks.", "count:250", "plum"),
  streakOf("streak-7", 7, "Seven-day flame", "Seven days in a row.", "Seven days in a row.", "coral"),
  streakOf("streak-30", 30, "Thirty-day flame", "Thirty days in a row.", "Thirty days in a row.", "gold"),
  streakOf("streak-100", 100, "Hundred-day flame", "A hundred days in a row.", "A hundred days in a row.", "plum"),
  streakOf("streak-365", 365, "A year of days", "Three hundred and sixty-five days in a row.", "A whole year of days in a row.", "lilac"),
  weeksOf("weeks-4", 4, "Four weeks running", "Four kept weeks in a row.", "Keep four weeks in a row.", "teal"),
  weeksOf("weeks-12", 12, "A season of weeks", "Twelve kept weeks in a row.", "Keep twelve weeks in a row.", "lilac"),
  {
    id: "water-week",
    group: "showing-up",
    title: "Seven days of water",
    line: "The full amount, seven days running.",
    hint: "Hit your water seven days running.",
    art: "drop",
    tint: "teal",
    who: "following",
    earned(m) {
      const day = firstRun(new Set(m.done.filter((item) => item.task.templateId === "water").map((item) => item.day)), 7);
      return day ? { day } : null;
    },
  },
  {
    id: "full-week",
    group: "showing-up",
    title: "The full week",
    line: "Seven full days in a row.",
    hint: "Seven full days in a row.",
    art: "sun",
    tint: "gold",
    who: "following",
    earned(m) {
      const day = firstRun(new Set([...m.active].filter((item) => m.fullOn(item))), 7);
      return day ? { day } : null;
    },
  },
  praiseOf("first-praise", 1, "First well done", "The first well done, said out loud.", "Say well done once.", "heart", "coral"),
  praiseOf("praise-25", 25, "Twenty-five well dones", "Twenty-five well dones given.", "Say well done twenty-five times.", "heart:25", "plum"),
  praiseOf("praise-100", 100, "A hundred well dones", "A hundred well dones given.", "Say well done a hundred times.", "heart:100", "gold"),
];

function pairedFor(db, clock, days) {
  const since = Date.parse(String(db.pair?.createdAt || ""));
  const now = Date.parse(String(clock.now || ""));
  if (Number.isNaN(since) || Number.isNaN(now) || now - since < days * DAY_MS) return null;
  return { at: new Date(since + days * DAY_MS).toISOString() };
}

function trophyById(id) {
  return TROPHIES.find((item) => item.id === id) || null;
}

/** What the client needs to draw a trophy. */
function badgeOf(def) {
  return { id: def.id, title: def.title, art: def.art, tint: def.tint };
}

/** Every trophy the record says is earned: id → `{ at, day, by }`. */
function deriveTrophies(db, state, measured, clock) {
  const earned = new Map();
  for (const def of TROPHIES) {
    const fact = state.facts?.[def.id];
    const got = fact || (def.earned ? def.earned(measured, db, state, clock) : null);
    if (!got) continue;
    const at = String(got.at || (got.day ? `${got.day}T12:00:00.000Z` : clock.now));
    const owner = def.who === "following" ? measured.follower?.id : def.who === "leading" ? measured.leader?.id : "both";
    earned.set(def.id, { at, day: validDay(got.day) || utcDay(at), by: got.by || owner || "both" });
  }
  return earned;
}

/**
 * Something another feature wants on the shelf. Add a trophy to TROPHIES with
 * no `earned`, then call this once the thing has happened. Calling it again
 * changes nothing. The next `finishProgress` celebrates it.
 */
export function recordFact(db, id, { at, by } = {}) {
  if (!trophyById(id)) return false;
  const state = ensureState(db, { today: utcDay(at) || new Date().toISOString().slice(0, 10), now: at || new Date().toISOString() });
  if (state.facts[id]) return false;
  state.facts[id] = { at: String(at || new Date().toISOString()), by: by || "both" };
  return true;
}

/**
 * The following partner's day, as near as the person asking can know it. The
 * two may be in different time zones, so the leading partner's own date is not
 * it: the day the following partner's phone last gave is, unless that is stale.
 */
export function followingDay(db, viewer, clock = {}) {
  const mine = validDay(clock.today) || validDay(viewer?.lastSeenDay) || utcDay(clock.now) || new Date().toISOString().slice(0, 10);
  const follower = followerOf(db);
  if (!follower || !viewer || follower.id === viewer.id) return mine;
  const theirs = validDay(follower.lastSeenDay);
  return theirs && theirs >= shiftDay(mine, -1) ? theirs : mine;
}

/**
 * Call before anything that can move progress (a task finished, a well done,
 * a reward granted). Returns a mark to hand to `finishProgress` afterwards.
 */
export function beginProgress(db, clock) {
  const now = clock.now || new Date().toISOString();
  const today = validDay(clock.today) || utcDay(now);
  const state = ensureState(db, { today, now });
  const measured = measure(db, state, { today, now });
  return { today, now, rank: measured.level.rank, levelIndex: measured.level.index };
}

/**
 * Call after the change. Gives the bonuses that are now due, moves the level,
 * puts new trophies on the shelf, and returns the celebration for whoever acted
 * plus the cheers to leave waiting for their partner.
 *
 * `celebration` is what the action would have shown on its own. A plain task
 * celebration gives way to bigger news; anything else (a granted reward) stays
 * in front and the news is listed under it.
 */
export function finishProgress(db, mark, { actor, celebration = null } = {}) {
  const clock = { today: mark.today, now: mark.now };
  const state = ensureState(db, clock);
  const follower = followerOf(db);
  const bonusLines = [];
  let embers = 0;
  let stone = null;
  let landed = 0;
  let fullDay = false;
  let measured = measure(db, state, clock);

  if (follower && actor && actor.id === follower.id) {
    if (measured.fullOn(clock.today) && state.bonus[`full:${clock.today}`] == null) {
      state.bonus[`full:${clock.today}`] = RULES.fullDay;
      embers += RULES.fullDay;
      fullDay = true;
    }
    if (measured.week.kept && state.bonus[`week:${measured.week.start}`] == null) {
      state.bonus[`week:${measured.week.start}`] = RULES.weekEmbers;
      embers += RULES.weekEmbers;
      bonusLines.push(`Week kept: +${RULES.weekEmbers} embers`);
    }
    for (const item of RULES.streak) {
      if (measured.streak.days < item.days || state.bonus[`streak:${item.days}`] != null) continue;
      state.bonus[`streak:${item.days}`] = item.embers;
      embers += item.embers;
      stone = item;
    }
    if (measured.active.has(clock.today)) {
      // The first task of a day is what moves the streak, so that is when a milestone lands.
      if (measured.todayCount.tasks === 1 && RULES.streak.some((item) => item.days === measured.streak.days)) landed = measured.streak.days;
      follower.streak = measured.streak.days;
      follower.lastActiveDate = clock.today;
    }
    if (embers) measured = measure(db, state, clock);
  }
  state.xp = Math.max(Number(state.xp) || 0, measured.embers);

  const level = measured.level;
  const majorUp = level.index > mark.levelIndex;
  const stepUp = level.rank > mark.rank;

  const fresh = [];
  const derived = deriveTrophies(db, state, measured, clock);
  for (const def of TROPHIES) {
    const got = derived.get(def.id);
    if (!got || state.shelf[def.id]) continue;
    state.shelf[def.id] = got;
    fresh.push({ def, got });
  }

  const cheers = [];
  const partner = partnerOf(db, actor);
  if (partner) {
    if (majorUp) cheers.push({ to: partner.id, cheer: { kind: "level", what: level.name, level: level.id, from: actor.id } });
    for (const { def, got } of fresh) {
      if (majorUp && def.level != null) continue;
      cheers.push({ to: partner.id, cheer: { kind: "trophy", what: def.title, trophy: def.id, by: got.by, from: actor.id } });
    }
  }

  const base = celebration ? { ...celebration } : null;
  const plain = !base || base.kind === "task";
  const shown = fresh.find((item) => item.def.level == null) || fresh[0] || null;
  let main = base;
  if (plain && majorUp) {
    const mine = follower && actor && actor.id === follower.id;
    main = { kind: "level", eyebrow: "Level up", title: level.name, detail: mine ? `You made it to ${level.name}.` : `${firstName(follower)} made it to ${level.name}.` };
  } else if (plain && shown) {
    main = { kind: "trophy", eyebrow: "For the shelf", title: shown.def.title, detail: shown.def.line };
  } else if (plain && (landed || stone)) {
    const days = landed || stone.days;
    main = {
      kind: "streak",
      title: `${days} days in a row`,
      detail: stone && stone.days === days ? `+${stone.embers} embers for showing up.` : "Right back where you were, and still counting.",
    };
  } else if (plain && stepUp) {
    main = {
      kind: "step",
      eyebrow: "Step up",
      title: level.title,
      detail: level.step.nextTitle ? `Step ${level.step.index + 1} of ${level.step.of}: ${level.step.name}.` : "That’s the very top. Look at you two.",
    };
  } else if (plain && fullDay) {
    main = { kind: "task", title: "Full day", detail: `Everything for today, done. +${RULES.fullDay} embers.` };
  }
  if (!main) return { celebration: null, cheers };

  const also = [];
  if (base && main !== base) also.push(base.title === "Task done" ? base.detail : `${base.title}: ${base.detail}`);
  if (fullDay && main.title !== "Full day") also.push(`Full day: +${RULES.fullDay} embers`);
  also.push(...bonusLines);
  if (stone && main.kind !== "streak") also.push(`${stone.days} days in a row: +${stone.embers} embers`);
  if (majorUp && main.kind !== "level") also.push(`Level up: ${level.name}`);
  else if (stepUp && !majorUp && main.kind !== "step") also.push(`Up a step: ${level.title}`);
  for (const { def } of fresh) {
    if (main.kind === "trophy" && def === shown.def) continue;
    if (main.kind === "level" && def.level != null) continue;
    also.push(`On the shelf: ${def.title}`);
  }

  const result = { ...main };
  if (base && base.points != null) result.points = base.points;
  if (embers) result.embers = embers;
  if (also.length) result.also = also;
  if (fresh.length) result.trophies = fresh.map(({ def }) => badgeOf(def));
  if (stepUp) result.level = { id: level.id, name: level.name, title: level.title, step: level.step.index, major: majorUp };
  return { celebration: result, cheers };
}

/**
 * What a waiting level-up or trophy says to the partner who was not there.
 * `waiting` is their queue; this answers only when the oldest thing in it is
 * one of ours, and returns null otherwise.
 */
export function progressCheer(waiting, viewer, userById) {
  const kind = waiting[0]?.kind;
  if (kind !== "level" && kind !== "trophy") return null;
  const group = waiting.filter((item) => item.kind === kind);
  const ids = group.map((item) => item.id);
  const from = firstName(userById(waiting[0].from));
  if (kind === "level") {
    const top = group[group.length - 1];
    const def = trophyById(`level-${top.level}`);
    return {
      ids,
      kind: "level",
      from,
      eyebrow: "Level up",
      title: top.what,
      detail: viewer?.slashSide === "following" ? `You made it to ${top.what}. ${from} was there to see it.` : `${from} made it to ${top.what}. Go make a fuss.`,
      ...(def ? { trophies: [badgeOf(def)] } : {}),
    };
  }
  const found = group.map((item) => ({ item, def: trophyById(item.trophy) })).filter((entry) => entry.def);
  const trophies = found.map((entry) => badgeOf(entry.def));
  if (found.length === 1) {
    const by = found[0].item.by;
    const whose = by === "both" ? "That one belongs to both of you." : by === viewer?.id ? `${from} saw it land. It’s yours.` : `${from} earned it. It’s on the shelf you share.`;
    return { ids, kind: "trophy", from, eyebrow: "For the shelf", title: found[0].def.title, detail: `${found[0].def.line} ${whose}`, trophies };
  }
  const names = group.map((item) => `“${item.what}”`);
  const listed = names.length > 2 ? `${names.slice(0, 2).join(", ")}, and ${names.length - 2} more` : names.join(" and ");
  return { ids, kind: "trophy", from, eyebrow: "For the shelf", title: "New on the shelf", detail: `${listed}. Go and look.`, trophies };
}

function calendarOf(measured, weeks) {
  const start = shiftDay(weekStart(measured.today), -7 * (weeks - 1));
  const out = [];
  for (let index = 0; index < weeks * 7; index += 1) {
    const date = shiftDay(start, index);
    const count = measured.days.get(date);
    let state = "none";
    if (date > measured.today) state = "ahead";
    else if (measured.active.has(date)) state = measured.fullOn(date) ? "full" : "active";
    else if (measured.streak.rest.has(date)) state = "rest";
    out.push({ date, state, tasks: count?.tasks || 0, points: count?.points || 0 });
  }
  return out;
}

/**
 * What both partners see: `progress` for the Home card and the Progress page,
 * `shelf` for the gallery. The numbers are the couple's, so they are the same
 * for both; the client words them for whoever is looking.
 */
export function progressView(db, viewer, clock = {}) {
  const now = clock.now || new Date().toISOString();
  const today = followingDay(db, viewer, { today: clock.today, now });
  const state = savedState(db) || firstState(db, { today, now });
  const bonus = state.bonus || {};
  const measured = measure(db, state, { today, now });
  const { level, streak, week, todayDaily, todayCount } = measured;

  const dailies = todayDaily.total > 0;
  const full = measured.fullOn(today);
  const restReadyOn = streak.lastRest ? shiftDay(streak.lastRest, RULES.restEvery) : "";
  let rest = "none";
  if (streak.days > 0) {
    if (streak.rest.has(shiftDay(today, -1)) && !measured.active.has(today)) rest = "resting";
    else rest = restReadyOn && restReadyOn > today ? "used" : "ready";
  }
  const nextStone = RULES.streak.find((item) => item.days > streak.days) || null;

  const recent = [];
  let finished = 0;
  let answered = 0;
  for (let back = 0; back < 7; back += 1) {
    const count = measured.days.get(shiftDay(today, -back));
    finished += count?.tasks || 0;
    answered += count?.praised || 0;
  }
  recent.push(finished, answered);

  const progress = {
    day: today,
    embers: measured.embers,
    level,
    ladder: LEVELS.map((item, index) => ({ id: item.id, name: item.name, min: item.min, state: index < level.index ? "done" : index === level.index ? "here" : "ahead" })),
    today: {
      goal: dailies ? "dailies" : "points",
      dailyDone: todayDaily.done,
      dailyTotal: todayDaily.total,
      points: todayCount.points,
      pointsGoal: RULES.dayPoints,
      tasks: todayCount.tasks,
      progress: full ? 1 : dailies ? todayDaily.done / todayDaily.total : Math.min(1, todayCount.points / RULES.dayPoints),
      full,
      bonus: RULES.fullDay,
    },
    streak: {
      days: streak.days,
      best: streak.best,
      doneToday: measured.active.has(today),
      rest,
      restReadyOn: rest === "used" ? restReadyOn : "",
      next: nextStone ? { days: nextStone.days, embers: bonus[`streak:${nextStone.days}`] == null ? nextStone.embers : 0 } : null,
    },
    week: {
      start: week.start,
      days: week.days,
      need: RULES.weekDays,
      kept: week.kept,
      daysLeft: week.daysLeft,
      streak: week.run,
      best: week.best,
      bonus: RULES.weekEmbers,
    },
    calendar: calendarOf(measured, 12),
    care: {
      points: measured.carePoints,
      level: careLevelFor(measured.carePoints),
      given: measured.praised.length,
      waiting: measured.done.length - measured.praised.length,
      streak: measured.praiseRun,
      best: measured.praiseBest,
      finished7: recent[0],
      answered7: recent[1],
    },
    rules: RULES,
  };

  const derived = deriveTrophies(db, state, measured, { today, now });
  const shelf = TROPHIES.map((def) => {
    const got = state.shelf?.[def.id] || derived.get(def.id);
    if (got) {
      return { id: def.id, group: def.group, earned: true, title: def.title, line: def.line, art: def.art, tint: def.tint, at: got.at, day: got.day, by: got.by, early: Boolean(got.quiet) };
    }
    const locked = { id: def.id, group: def.group, earned: false, hint: def.hint, tint: def.tint };
    if (def.need > 1 && def.have) {
      locked.have = Math.min(def.need, Math.max(0, def.have(measured)));
      locked.need = def.need;
    }
    return locked;
  });

  return { progress, shelf };
}
