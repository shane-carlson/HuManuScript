import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LEVELS, LEVEL_STEPS, levelFor, levelStepMins } from "./catalog.mjs";
import {
  CARE_LEVELS,
  RULES,
  TROPHIES,
  beginProgress,
  careLevelFor,
  emberStart,
  finishProgress,
  followingDay,
  progressCheer,
  progressView,
  recordFact,
  shiftDay,
  walkStreak,
  weekStart,
} from "./progress.mjs";
import { createSlashApp } from "./slashconnect.mjs";

// Every date here is fixed. 3 March 2031 is a Monday.
const MONDAY = "2031-03-03";
const AVERY = "u-avery";
const ROWAN = "u-rowan";

function household({ points = 0, carePoints = 0, streak = 0, lastActiveDate = "", tasks = [], routines = [], rewards = [], weeklies = [] } = {}) {
  return {
    demo: false,
    users: [
      { id: ROWAN, displayName: "Rowan Hale", slashSide: "leading", points: 0, carePoints, streak: 0, lastActiveDate: "", createdAt: "2031-01-01T10:00:00.000Z" },
      { id: AVERY, displayName: "Avery Quinn", slashSide: "following", points, carePoints: 0, streak, lastActiveDate, createdAt: "2031-01-01T10:00:00.000Z" },
    ],
    sessions: [
      { token: "t-rowan", userId: ROWAN },
      { token: "t-avery", userId: AVERY },
    ],
    pair: { id: "pair", members: [ROWAN, AVERY], createdAt: "2031-01-01T10:00:00.000Z" },
    invites: [],
    tasks,
    routines,
    goals: [],
    rewards,
    checkins: [],
    weeklies,
  };
}

let counter = 0;
function finished(day, points = 10, extra = {}) {
  counter += 1;
  return {
    id: `done-${counter}`,
    templateId: "meds",
    category: "self-care",
    title: `Task ${counter}`,
    summary: "",
    note: "",
    prompt: "",
    points,
    bonuses: [],
    assignedBy: ROWAN,
    assignedTo: AVERY,
    status: "done",
    dueDate: "",
    createdAt: `${day}T08:00:00.000Z`,
    completedAt: `${day}T18:00:${String(counter % 60).padStart(2, "0")}.000Z`,
    completionDate: day,
    completion: { note: "", bonuses: [], photos: [], checklist: [], choice: "" },
    acknowledgedAt: null,
    ...extra,
  };
}

function open(id, points = 10, extra = {}) {
  return { ...finished(MONDAY, points), id, status: "open", completedAt: null, completionDate: "", completion: null, ...extra };
}

function routine(id, createdDay) {
  return { id, templateId: "meds", category: "self-care", title: id, summary: "", note: "", prompt: "", points: 5, bonuses: [], consent: false, target: 0, assignedBy: ROWAN, assignedTo: AVERY, createdAt: `${createdDay}T08:00:00.000Z`, stoppedAt: null };
}

const follower = (db) => db.users.find((user) => user.slashSide === "following");
const leader = (db) => db.users.find((user) => user.slashSide === "leading");
const at = (day) => `${day}T18:00:00.000Z`;
const view = (db, day, who = follower(db)) => progressView(db, who, { today: day, now: at(day) });

/** Finishes one task the way the engine does: mark, change the record, settle. */
function finish(db, day, points = 10, extra = {}) {
  const user = follower(db);
  const mark = beginProgress(db, { today: day, now: at(day) });
  user.points = (user.points || 0) + points;
  db.tasks.push(finished(day, points, extra));
  return finishProgress(db, mark, { actor: user, celebration: { kind: "task", title: "Task done", detail: `+${points} points`, points } });
}

function days(from, count) {
  return Array.from({ length: count }, (_, index) => shiftDay(from, index));
}

function engine(db) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slash-progress-"));
  const dataFile = path.join(dir, "db.json");
  fs.writeFileSync(dataFile, JSON.stringify(db));
  const app = createSlashApp({ dataFile, seedDemo: false });
  const call = async (method, url, token, body = {}, clientDate = MONDAY) => {
    try {
      return await app.dispatch({ method, url, token, body: { clientDate, ...body }, clientDate });
    } catch (error) {
      return { status: error.status || 500, body: { error: error.message } };
    }
  };
  return { app, call, dataFile };
}

test("the ladder only goes up, and every level is five steps that start quickly", () => {
  assert.equal(LEVELS.length, 12);
  assert.deepEqual(LEVELS.slice(0, 6).map((level) => level.name), ["Spark", "Glow", "Flame", "Hearth", "Beacon", "Constellation"]);
  LEVELS.forEach((level, index) => {
    if (index > 0) {
      const span = level.min - LEVELS[index - 1].min;
      assert.ok(span > 0, `${level.name} starts after ${LEVELS[index - 1].name}`);
      if (index > 1) assert.ok(span > LEVELS[index - 1].min - LEVELS[index - 2].min, "each level is longer than the one before");
    }
    const mins = levelStepMins(index);
    assert.equal(mins.length, LEVEL_STEPS.length);
    assert.equal(mins[0], level.min);
    for (let step = 1; step < mins.length; step += 1) {
      assert.ok(mins[step] > mins[step - 1]);
      assert.ok(mins[step] - mins[step - 1] >= (step > 1 ? mins[step - 1] - mins[step - 2] : 0), "steps get longer inside a level");
    }
    if (LEVELS[index + 1]) assert.ok(mins.at(-1) < LEVELS[index + 1].min);
  });

  let rank = -1;
  for (let embers = 0; embers <= 17000; embers += 5) {
    const level = levelFor(embers);
    assert.ok(level.rank >= rank, `rank never drops (${embers})`);
    assert.ok(level.rank - rank <= 1 || rank === -1, `no step is skipped (${embers})`);
    assert.ok(level.progress >= 0 && level.progress <= 1);
    assert.ok(level.step.progress >= 0 && level.step.progress <= 1);
    rank = level.rank;
  }
  assert.equal(rank, 59);
});

test("steps and levels change exactly at their thresholds", () => {
  assert.equal(levelFor(0).title, "Spark I");
  assert.equal(levelFor(14).title, "Spark I");
  assert.equal(levelFor(15).title, "Spark II");
  assert.equal(levelFor(50).title, "Spark III");
  assert.equal(levelFor(110).title, "Spark IV");
  assert.equal(levelFor(190).title, "Spark V");
  assert.equal(levelFor(299).title, "Spark V");
  assert.equal(levelFor(299).step.nextTitle, "Glow I");
  assert.equal(levelFor(299).step.toNext, 1);
  assert.equal(levelFor(300).title, "Glow I");
  assert.equal(levelFor(300).name, "Glow");
  assert.equal(levelFor(300).next, "Flame");
  assert.equal(levelFor(300).nextMin, 800);
  assert.equal(levelFor(300).step.nextTitle, "Glow II");
  assert.equal(levelFor(799).name, "Glow");
  assert.equal(levelFor(800).title, "Flame I");

  const top = levelFor(999999);
  assert.equal(top.title, "Everflame V");
  assert.equal(top.next, null);
  assert.equal(top.progress, 1);
  assert.equal(top.step.nextTitle, null);
  assert.equal(top.step.toNext, 0);
  assert.equal(levelFor(-5).title, "Spark I");
  assert.equal(levelFor("nonsense").title, "Spark I");
});

test("points from the old six levels land on the same level, the same way through it", () => {
  const oldNames = [[0, "Spark"], [39, "Spark"], [40, "Glow"], [89, "Glow"], [90, "Flame"], [159, "Flame"], [160, "Hearth"], [249, "Hearth"], [250, "Beacon"], [399, "Beacon"], [400, "Constellation"], [900, "Constellation"]];
  for (const [points, name] of oldNames) assert.equal(levelFor(emberStart(points)).name, name, `${points} old points`);
  let previous = -1;
  for (let points = 0; points <= 1000; points += 1) {
    const embers = emberStart(points);
    assert.ok(embers >= previous, "more points never means fewer embers");
    assert.ok(embers >= points, "nobody starts with less than they had");
    previous = embers;
  }
  assert.equal(emberStart(0), 0);
  assert.equal(emberStart(65), 550);
  assert.equal(levelFor(emberStart(65)).title, "Glow IV");
  assert.equal(emberStart(400), 3250);
  assert.equal(emberStart(460), 3310);
});

test("a couple from before embers keeps their level, and spending points never costs one", () => {
  const db = household({ points: 65, streak: 2, lastActiveDate: shiftDay(MONDAY, -8), tasks: [finished(shiftDay(MONDAY, -9), 30), finished(shiftDay(MONDAY, -8), 35)] });
  const before = view(db, MONDAY).progress;
  assert.equal(before.embers, 550);
  assert.equal(before.level.title, "Glow IV");
  assert.equal(db.progress, undefined, "looking never writes");

  finish(db, MONDAY, 20);
  assert.equal(view(db, MONDAY).progress.embers, 550 + 20 + RULES.fullDay);
  assert.equal(db.progress.boost, 485);

  // A 40 point reward is cashed in and granted.
  follower(db).points -= 40;
  db.rewards.push({ id: "r", title: "Movie", cost: 40, status: "granted", grantedAt: at(MONDAY), agreedBy: [AVERY, ROWAN] });
  const after = view(db, MONDAY).progress;
  assert.equal(follower(db).points, 45);
  assert.equal(after.embers, 575);
  assert.equal(after.level.title, "Glow IV");

  // Even if points vanish some other way, the level stays where it got to.
  follower(db).points = 0;
  assert.equal(view(db, MONDAY).progress.embers, 575);
});

test("a full day is every daily task, pays its bonus once, and never touches points", () => {
  const db = household({ routines: [routine("water", "2031-02-01"), routine("meds", "2031-02-01")] });
  const daily = (id) => ({ routineId: id, day: MONDAY });

  const first = finish(db, MONDAY, 5, daily("water"));
  let today = view(db, MONDAY).progress.today;
  assert.deepEqual([today.goal, today.dailyDone, today.dailyTotal, today.full], ["dailies", 1, 2, false]);
  assert.equal(first.celebration.embers, undefined);

  // A one-time task on top does not make the day full. The dailies do.
  finish(db, MONDAY, 30);
  assert.equal(view(db, MONDAY).progress.today.full, false);

  const second = finish(db, MONDAY, 5, daily("meds"));
  today = view(db, MONDAY).progress.today;
  assert.deepEqual([today.dailyDone, today.dailyTotal, today.full, today.progress], [2, 2, true, 1]);
  assert.equal(second.celebration.kind, "task");
  assert.equal(second.celebration.title, "Full day");
  assert.equal(second.celebration.embers, RULES.fullDay);
  assert.equal(second.celebration.points, 5);
  assert.deepEqual(second.celebration.also, ["+5 points"]);
  assert.equal(db.progress.bonus[`full:${MONDAY}`], RULES.fullDay);

  const points = follower(db).points;
  const embers = view(db, MONDAY).progress.embers;
  assert.equal(points, 40);
  assert.equal(embers, 40 + RULES.fullDay);

  // A third daily given after the day was already full: finishing it pays points, not a second bonus.
  db.routines.push(routine("bedtime", MONDAY));
  const third = finish(db, MONDAY, 5, daily("bedtime"));
  assert.equal(third.celebration.embers, undefined);
  assert.equal(view(db, MONDAY).progress.embers, embers + 5);
  assert.equal(view(db, MONDAY).progress.today.full, true);

  // Tomorrow starts empty, and yesterday still reads as full.
  const tomorrow = view(db, shiftDay(MONDAY, 1)).progress;
  assert.deepEqual([tomorrow.today.dailyDone, tomorrow.today.dailyTotal, tomorrow.today.full], [0, 3, false]);
  assert.equal(tomorrow.calendar.find((day) => day.date === MONDAY).state, "full");
});

test("with no daily tasks, fifteen points in a day makes it full", () => {
  const db = household();
  const small = finish(db, MONDAY, 10);
  assert.equal(view(db, MONDAY).progress.today.goal, "points");
  assert.equal(view(db, MONDAY).progress.today.full, false);
  assert.equal(small.celebration.embers, undefined);
  const enough = finish(db, MONDAY, 5);
  assert.equal(enough.celebration.embers, RULES.fullDay);
  assert.equal(view(db, MONDAY).progress.today.full, true);
  assert.equal(finish(db, MONDAY, 20).celebration.embers, undefined);
});

test("passing on a daily that asks for a yes is never held against the day", () => {
  const db = household({ routines: [routine("meds", "2031-02-01"), routine("spicy", "2031-02-01")] });
  db.tasks.push({ ...open("passed"), routineId: "spicy", day: MONDAY, status: "skipped", consent: true, completedAt: at(MONDAY) });
  const done = finish(db, MONDAY, 5, { routineId: "meds", day: MONDAY });
  assert.equal(done.celebration.embers, RULES.fullDay);
  assert.deepEqual([view(db, MONDAY).progress.today.dailyDone, view(db, MONDAY).progress.today.dailyTotal], [1, 1]);

  // An ordinary daily that was passed on still counts as not done.
  const plain = household({ routines: [routine("meds", "2031-02-01"), routine("meal", "2031-02-01")] });
  plain.tasks.push({ ...open("passed"), routineId: "meal", day: MONDAY, status: "skipped", completedAt: at(MONDAY) });
  assert.equal(finish(plain, MONDAY, 5, { routineId: "meds", day: MONDAY }).celebration.embers, undefined);
  assert.equal(view(plain, MONDAY).progress.today.full, false);
});

test("a day streak counts days in a row, and today is never a miss", () => {
  const run = new Set(days(MONDAY, 5));
  assert.equal(walkStreak(run, shiftDay(MONDAY, 4)).days, 5);
  assert.equal(walkStreak(run, shiftDay(MONDAY, 5)).days, 5, "the next day has not been missed yet");
  assert.equal(walkStreak(new Set(), MONDAY).days, 0);
  assert.equal(walkStreak(run, shiftDay(MONDAY, 4)).reached.get(3), shiftDay(MONDAY, 2));
});

test("one rest day keeps the streak, and it neither grows nor breaks", () => {
  // Mon Tue Wed, Thursday off, Fri Sat.
  const active = new Set([...days(MONDAY, 3), ...days(shiftDay(MONDAY, 4), 2)]);
  const walked = walkStreak(active, shiftDay(MONDAY, 5));
  assert.equal(walked.days, 5);
  assert.deepEqual([...walked.rest], [shiftDay(MONDAY, 3)]);

  // The day after a rest day, with nothing done yet: still alive, and resting.
  const resting = walkStreak(new Set(days(MONDAY, 3)), shiftDay(MONDAY, 4));
  assert.equal(resting.days, 3);
  assert.ok(resting.rest.has(shiftDay(MONDAY, 3)));
});

test("two days off in a row, or two inside a week, start the streak again", () => {
  // Mon Tue Wed, Thu and Fri off, Sat.
  const gap = walkStreak(new Set([...days(MONDAY, 3), shiftDay(MONDAY, 5)]), shiftDay(MONDAY, 5));
  assert.equal(gap.days, 1);
  assert.equal(gap.best, 3);
  assert.equal(gap.rest.size, 0, "a gap is not a rest day");

  // Mon Tue, Wed off, Thu, Fri off, Sat: the second day off is inside the same seven days.
  const twice = walkStreak(new Set([MONDAY, shiftDay(MONDAY, 1), shiftDay(MONDAY, 3), shiftDay(MONDAY, 5)]), shiftDay(MONDAY, 5));
  assert.equal(twice.days, 1);
  assert.equal(twice.best, 3);

  // Days off a full week apart are both forgiven.
  const spaced = days(MONDAY, 16).filter((day) => day !== shiftDay(MONDAY, 3) && day !== shiftDay(MONDAY, 10));
  const kept = walkStreak(new Set(spaced), shiftDay(MONDAY, 15));
  assert.equal(kept.days, 14);
  assert.equal(kept.rest.size, 2);

  // Six days apart is one day too soon.
  const soon = days(MONDAY, 16).filter((day) => day !== shiftDay(MONDAY, 3) && day !== shiftDay(MONDAY, 9));
  assert.equal(walkStreak(new Set(soon), shiftDay(MONDAY, 15)).days, 6);
});

test("the view says where the rest day stands, in time for it to matter", () => {
  const db = household({ tasks: days(MONDAY, 3).map((day) => finished(day)) });
  const wednesday = view(db, shiftDay(MONDAY, 2)).progress.streak;
  assert.deepEqual([wednesday.days, wednesday.doneToday, wednesday.rest], [3, true, "ready"]);
  const thursday = view(db, shiftDay(MONDAY, 3)).progress.streak;
  assert.deepEqual([thursday.days, thursday.doneToday, thursday.rest], [3, false, "ready"]);
  const friday = view(db, shiftDay(MONDAY, 4)).progress;
  assert.deepEqual([friday.streak.days, friday.streak.rest], [3, "resting"]);
  assert.equal(friday.calendar.find((day) => day.date === shiftDay(MONDAY, 3)).state, "rest");
  const saturday = view(db, shiftDay(MONDAY, 5)).progress.streak;
  assert.deepEqual([saturday.days, saturday.best, saturday.rest], [0, 3, "none"]);

  db.tasks.push(finished(shiftDay(MONDAY, 4)));
  const back = view(db, shiftDay(MONDAY, 4)).progress.streak;
  assert.deepEqual([back.days, back.rest, back.restReadyOn], [4, "used", shiftDay(MONDAY, 10)]);
  assert.deepEqual(back.next, { days: 7, embers: 25 });
});

test("streak milestones pay embers once ever, and still get their moment the second time", () => {
  const db = household();
  const first = finish(db, MONDAY, 5);
  assert.equal(first.celebration.kind, "trophy", "the very first task goes on the shelf");
  finish(db, shiftDay(MONDAY, 1), 5);
  const third = finish(db, shiftDay(MONDAY, 2), 5);
  assert.equal(third.celebration.kind, "streak");
  assert.equal(third.celebration.title, "3 days in a row");
  assert.equal(third.celebration.detail, "+10 embers for showing up.");
  assert.equal(third.celebration.embers, 10);
  assert.equal(follower(db).streak, 3);
  assert.equal(follower(db).lastActiveDate, shiftDay(MONDAY, 2));
  assert.equal(finish(db, shiftDay(MONDAY, 2), 5).celebration.kind, "task", "a second task that day is just a task");

  // A long gap, then three in a row again: the moment comes back, the embers do not.
  const later = shiftDay(MONDAY, 20);
  finish(db, later, 5);
  finish(db, shiftDay(later, 1), 5);
  const embers = view(db, shiftDay(later, 1)).progress.embers;
  const again = finish(db, shiftDay(later, 2), 5);
  assert.equal(again.celebration.kind, "streak");
  assert.equal(again.celebration.embers, undefined);
  assert.equal(view(db, shiftDay(later, 2)).progress.embers, embers + 5);
  assert.equal(follower(db).streak, 3);
});

test("a week is kept on its fourth day, across a month boundary too", () => {
  // 27 January 2031 is a Monday. That week runs into February.
  assert.equal(weekStart("2031-02-02"), "2031-01-27");
  assert.equal(weekStart("2031-01-27"), "2031-01-27");
  assert.equal(weekStart("2031-02-03"), "2031-02-03");
  assert.equal(weekStart("2031-12-31"), "2031-12-29");
  assert.equal(weekStart("2032-01-04"), "2031-12-29");

  const db = household();
  for (const day of ["2031-01-20", "2031-01-21", "2031-01-23", "2031-01-25"]) finish(db, day, 5);
  assert.equal(db.progress.bonus["week:2031-01-20"], RULES.weekEmbers);

  // Thu 30 Jan, Fri 31 Jan, Sat 1 Feb, then the fourth day on Sun 2 Feb.
  for (const day of ["2031-01-30", "2031-01-31", "2031-02-01"]) finish(db, day, 5);
  let week = view(db, "2031-02-01").progress.week;
  assert.deepEqual([week.start, week.days, week.kept, week.streak, week.daysLeft], ["2031-01-27", 3, false, 1, 1]);
  const fourth = finish(db, "2031-02-02", 5);
  assert.ok(fourth.celebration.also.includes(`Week kept: +${RULES.weekEmbers} embers`));
  week = view(db, "2031-02-02").progress.week;
  assert.deepEqual([week.days, week.kept, week.streak, week.best], [4, true, 2, 2]);

  // More done in a week that is already kept pays nothing more.
  const embers = view(db, "2031-02-02").progress.embers;
  assert.equal(finish(db, "2031-02-02", 5).celebration.also, undefined);
  assert.equal(view(db, "2031-02-02").progress.embers, embers + 5);
  assert.equal(db.progress.bonus["week:2031-01-27"], RULES.weekEmbers);

  // Monday of a new week: last week's run still stands while this one is open.
  const monday = view(db, "2031-02-03").progress.week;
  assert.deepEqual([monday.start, monday.days, monday.kept, monday.streak], ["2031-02-03", 0, false, 2]);
  // A whole week missed ends it.
  assert.equal(view(db, "2031-02-12").progress.week.streak, 0);
  assert.equal(view(db, "2031-02-12").progress.week.best, 2);
});

test("history already on the record fills the shelf quietly, dated from the record", () => {
  const start = "2031-02-03";
  const tasks = days(start, 12).map((day, index) => finished(day, 10, index < 3 ? { acknowledgedAt: `${shiftDay(day, 1)}T09:00:00.000Z` } : {}));
  const db = household({
    points: 80,
    carePoints: 30,
    streak: 12,
    lastActiveDate: shiftDay(start, 11),
    tasks,
    rewards: [{ id: "r", title: "Movie", cost: 40, status: "granted", grantedAt: "2031-02-10T20:00:00.000Z", agreedBy: [AVERY, ROWAN] }],
  });
  const today = shiftDay(start, 12);
  const { shelf, progress } = view(db, today);
  const got = (id) => shelf.find((item) => item.id === id);

  assert.equal(shelf.length, TROPHIES.length);
  assert.deepEqual([got("first-task").earned, got("first-task").day, got("first-task").by], [true, start, AVERY]);
  assert.deepEqual([got("tasks-10").earned, got("tasks-10").day], [true, shiftDay(start, 9)]);
  assert.deepEqual([got("streak-7").earned, got("streak-7").day], [true, shiftDay(start, 6)]);
  assert.deepEqual([got("first-praise").earned, got("first-praise").day, got("first-praise").by], [true, shiftDay(start, 1), ROWAN]);
  assert.deepEqual([got("first-reward").earned, got("first-reward").day, got("first-reward").by], [true, "2031-02-10", "both"]);
  assert.deepEqual([got("paired-month").earned, got("paired-month").day], [true, "2031-01-31"]);
  assert.equal(got("level-spark").earned, true);
  // 120 points on the old ladder was Flame, reached with the ninth task (90 points).
  assert.equal(progress.level.name, "Flame");
  assert.deepEqual([got("level-flame").earned, got("level-flame").day], [true, shiftDay(start, 8)]);
  assert.deepEqual([got("level-glow").earned, got("level-glow").day], [true, shiftDay(start, 3)]);
  assert.ok(shelf.filter((item) => item.earned).every((item) => item.early), "all of it was there before the shelf");

  const locked = got("tasks-50");
  assert.deepEqual([locked.earned, locked.have, locked.need, locked.title, locked.hint], [false, 12, 50, undefined, "Finish fifty tasks."]);
  assert.equal(got("streak-30").have, 12);
  assert.equal(got("level-hearth").earned, false);
  assert.equal(got("first-checkin").earned, false);

  // The next finished task is celebrated for itself. Nothing old comes flooding out.
  const next = finish(db, today, 5);
  assert.equal(next.celebration.kind, "task");
  assert.equal(next.celebration.trophies, undefined);
  assert.deepEqual(next.cheers, []);
  assert.equal(db.progress.shelf["first-task"].quiet, true);
  assert.equal(db.progress.bonus["streak:7"], 0, "milestones already passed are not paid late");
  assert.equal(follower(db).streak, 13);
});

test("a stored streak from before is believed even where the record is thin", () => {
  const db = household({ points: 10, streak: 6, lastActiveDate: shiftDay(MONDAY, -1), tasks: [finished(shiftDay(MONDAY, -1))] });
  assert.equal(view(db, MONDAY).progress.streak.days, 6);
  finish(db, MONDAY, 5);
  assert.equal(follower(db).streak, 7);
  assert.equal(view(db, MONDAY).progress.streak.days, 7);
});

test("nothing is awarded twice, and settling again with nothing new says nothing", () => {
  const db = household({ routines: [routine("meds", "2031-02-01")] });
  const first = finish(db, MONDAY, 5, { routineId: "meds", day: MONDAY });
  assert.deepEqual(first.celebration.trophies.map((item) => item.id), ["first-task"]);
  assert.equal(first.celebration.embers, RULES.fullDay);
  const state = JSON.stringify(db.progress);

  const mark = beginProgress(db, { today: MONDAY, now: at(MONDAY) });
  const idle = finishProgress(db, mark, { actor: follower(db) });
  assert.deepEqual(idle, { celebration: null, cheers: [] });
  const leaderIdle = finishProgress(db, beginProgress(db, { today: MONDAY, now: at(MONDAY) }), { actor: leader(db) });
  assert.deepEqual(leaderIdle, { celebration: null, cheers: [] });
  assert.equal(JSON.stringify(db.progress), state);

  const second = finish(db, MONDAY, 5);
  assert.equal(second.celebration.trophies, undefined);
  assert.equal(second.celebration.embers, undefined);
  assert.equal(Object.keys(db.progress.bonus).length, 1);
});

test("a step up is a small celebration and a new level is a big one that waits for the partner", async () => {
  // 24 points on the old ladder is 180 embers: Spark IV, ten short of Spark V.
  const db = household({
    points: 24,
    tasks: [finished("2031-02-03", 12, { acknowledgedAt: at("2031-02-03") }), finished("2031-02-04", 12), open("a", 12), open("b", 50), open("c", 50), open("d", 10)],
  });
  const { call, dataFile } = engine(db);
  const start = (await call("GET", "/api/session", "t-avery")).body;
  assert.equal(start.stats.level.title, "Spark IV");
  assert.equal(start.stats.embers, 180);
  assert.equal(start.stats.points, 24);

  const step = (await call("POST", "/api/tasks/a/complete", "t-avery")).body;
  assert.equal(step.celebration.kind, "step");
  assert.equal(step.celebration.eyebrow, "Step up");
  assert.equal(step.celebration.title, "Spark V");
  // The stuffie adds a line of its own after ours.
  assert.ok(step.celebration.detail.startsWith("Step 5 of 5: blazing."));
  assert.deepEqual(step.celebration.also, ["+12 points"]);
  assert.equal(step.celebration.points, 12);
  assert.deepEqual(step.celebration.level, { id: "spark", name: "Spark", title: "Spark V", step: 4, major: false });
  assert.equal(step.stats.level.title, "Spark V");
  assert.equal(step.stats.points, 36);
  assert.equal((await call("GET", "/api/session", "t-rowan")).body.cheer, null, "a step is not news for the partner");

  const full = (await call("POST", "/api/tasks/b/complete", "t-avery")).body;
  assert.equal(full.celebration.title, "Full day");
  await call("POST", "/api/tasks/c/complete", "t-avery");
  const major = (await call("POST", "/api/tasks/d/complete", "t-avery")).body;
  assert.equal(major.stats.embers, 180 + 12 + 50 + 50 + 10 + RULES.fullDay);
  assert.equal(major.celebration.kind, "level");
  assert.equal(major.celebration.title, "Glow");
  assert.ok(major.celebration.detail.startsWith("You made it to Glow."));
  assert.deepEqual(major.celebration.also, ["+10 points"]);
  assert.deepEqual(major.celebration.trophies, [{ id: "level-glow", title: "Glow", art: "level:glow", tint: "gold" }]);
  assert.equal(major.celebration.level.major, true);
  assert.equal(major.stats.level.title, "Glow I");
  assert.equal(major.shelf.find((item) => item.id === "level-glow").early, false);

  // It is waiting for Rowan, survives a restart, and goes once she has seen it.
  const reopened = createSlashApp({ dataFile, seedDemo: false });
  const waiting = (await reopened.dispatch({ method: "GET", url: "/api/session", token: "t-rowan", body: {}, clientDate: MONDAY })).body.cheer;
  assert.equal(waiting.kind, "level");
  assert.equal(waiting.from, "Avery");
  assert.equal(waiting.title, "Glow");
  assert.equal(waiting.detail, "Avery made it to Glow. Go make a fuss.");
  assert.deepEqual(waiting.trophies.map((item) => item.id), ["level-glow"]);
  assert.equal(waiting.ids.length, 1);
  const seen = (await call("POST", "/api/cheers/seen", "t-rowan", { ids: waiting.ids })).body;
  assert.equal(seen.cheer, null);
  assert.equal(seen.stats.level.title, "Glow I", "both partners see the same level");
});

test("a trophy is celebrated by whoever earned it and waits for the other one", async () => {
  const { call } = engine(household({ tasks: [open("a", 12), open("b", 12)] }));
  const empty = (await call("GET", "/api/session", "t-avery")).body;
  assert.deepEqual(empty.shelf.filter((item) => item.earned).map((item) => item.id), ["level-spark"]);
  assert.equal(empty.cheer, null);

  const done = (await call("POST", "/api/tasks/a/complete", "t-avery")).body;
  assert.equal(done.celebration.kind, "trophy");
  assert.equal(done.celebration.eyebrow, "For the shelf");
  assert.equal(done.celebration.title, "First stitch");
  assert.ok(done.celebration.detail.startsWith("The very first task, finished."));
  assert.deepEqual(done.celebration.also, ["+12 points"]);
  assert.deepEqual(done.celebration.trophies, [{ id: "first-task", title: "First stitch", art: "needle", tint: "coral" }]);
  const mine = done.shelf.find((item) => item.id === "first-task");
  assert.deepEqual([mine.earned, mine.by, mine.day, mine.early], [true, AVERY, MONDAY, false]);

  const rowan = (await call("GET", "/api/session", "t-rowan")).body;
  assert.equal(rowan.cheer.kind, "trophy");
  assert.equal(rowan.cheer.title, "First stitch");
  assert.equal(rowan.cheer.detail, "The very first task, finished. Avery earned it. It’s on the shelf you share.");
  assert.deepEqual(rowan.cheer.trophies.map((item) => item.id), ["first-task"]);
  assert.equal(rowan.shelf.find((item) => item.id === "first-task").by, AVERY, "the shelf is the same for both");
  await call("POST", "/api/cheers/seen", "t-rowan", { ids: rowan.cheer.ids });

  // Rowan's first well done is hers: she gets the moment, Avery finds it waiting behind the well done.
  const praised = (await call("POST", "/api/tasks/a/acknowledge", "t-rowan")).body;
  assert.equal(praised.celebration.kind, "trophy");
  assert.equal(praised.celebration.title, "First well done");
  assert.equal(praised.shelf.find((item) => item.id === "first-praise").by, ROWAN);
  assert.equal((await call("POST", "/api/tasks/a/acknowledge", "t-rowan")).body.celebration, undefined, "saying it twice is not a second trophy");

  const first = (await call("GET", "/api/session", "t-avery")).body.cheer;
  assert.equal(first.kind, "praise");
  const second = (await call("POST", "/api/cheers/seen", "t-avery", { ids: first.ids })).body.cheer;
  assert.equal(second.kind, "trophy");
  assert.equal(second.title, "First well done");
  assert.equal(second.detail, "The first well done, said out loud. Rowan earned it. It’s on the shelf you share.");
  assert.equal((await call("POST", "/api/cheers/seen", "t-avery", { ids: second.ids })).body.cheer, null);

  // Finishing another task earns nothing new, so nothing new waits.
  const again = (await call("POST", "/api/tasks/b/complete", "t-avery")).body;
  assert.equal(again.celebration.trophies, undefined);
  assert.equal((await call("GET", "/api/session", "t-rowan")).body.cheer, null);
});

test("a granted reward stays the headline and brings its trophy with it", async () => {
  const db = household({ points: 60, tasks: [finished("2031-02-03", 60)], rewards: [{ id: "movie", title: "Movie night", detail: "", cost: 30, proposedBy: AVERY, status: "requested", agreedBy: [AVERY, ROWAN], requestedBy: AVERY, grantedBy: "", createdAt: at("2031-02-03"), grantedAt: "" }] });
  const { call } = engine(db);
  const before = (await call("GET", "/api/session", "t-avery")).body.stats;
  const granted = (await call("POST", "/api/rewards/movie/grant", "t-rowan")).body;
  assert.equal(granted.celebration.kind, "reward");
  assert.equal(granted.celebration.title, "Movie night");
  assert.equal(granted.celebration.points, 30);
  assert.deepEqual(granted.celebration.also, ["On the shelf: First reward"]);
  assert.deepEqual(granted.celebration.trophies.map((item) => item.id), ["first-reward"]);
  const after = (await call("GET", "/api/session", "t-avery")).body;
  assert.equal(after.stats.points, before.points - 30);
  assert.equal(after.stats.embers, before.embers, "spending does not cost embers");
  assert.equal(after.cheer.kind, "reward");
  const next = (await call("POST", "/api/cheers/seen", "t-avery", { ids: after.cheer.ids })).body.cheer;
  assert.deepEqual([next.kind, next.title], ["trophy", "First reward"]);
  assert.match(next.detail, /belongs to both of you/);
});

test("logging and unlogging water mints nothing", async () => {
  const water = { ...open("water", 5), templateId: "water", title: "Drink your water", routineId: "r-water", day: MONDAY, target: 64, progress: { amount: 0, entries: [] } };
  const db = household({ tasks: [finished("2031-02-03", 10), water], routines: [{ ...routine("r-water", "2031-02-01"), templateId: "water", target: 64 }] });
  const { call } = engine(db);
  const before = (await call("GET", "/api/session", "t-avery")).body;
  const snapshot = (body) => JSON.stringify([body.stats.points, body.stats.embers, body.stats.streak, body.shelf.filter((item) => item.earned).length, body.progress.today]);

  for (let round = 0; round < 6; round += 1) {
    const logged = await call("POST", "/api/tasks/water/log", "t-avery", { amount: 60 });
    assert.equal(logged.status, 200);
    assert.equal(logged.body.celebration, undefined);
    const undone = await call("POST", "/api/tasks/water/unlog", "t-avery");
    assert.equal(snapshot(undone.body), snapshot(before));
  }
  assert.equal((await call("POST", "/api/tasks/water/complete", "t-avery")).status, 400, "ticking it off early is refused");

  await call("POST", "/api/tasks/water/log", "t-avery", { amount: 60 });
  const reached = (await call("POST", "/api/tasks/water/log", "t-avery", { amount: 8 })).body;
  assert.equal(reached.stats.points, before.stats.points + 5);
  assert.equal(reached.stats.embers, before.stats.embers + 5 + RULES.fullDay);
  assert.equal(reached.progress.today.full, true);

  // Once it is done there is nothing left to undo or redo.
  assert.equal((await call("POST", "/api/tasks/water/unlog", "t-avery")).status, 409);
  assert.equal((await call("POST", "/api/tasks/water/log", "t-avery", { amount: 8 })).status, 409);
  assert.equal((await call("POST", "/api/tasks/water/complete", "t-avery")).status, 409);
  const end = (await call("GET", "/api/session", "t-avery")).body;
  assert.equal(end.stats.embers, reached.stats.embers);

  // Stopping the daily and giving it again the same day cannot buy a second full-day bonus.
  await call("POST", "/api/tasks/water/stop", "t-rowan");
  const given = (await call("POST", "/api/tasks", "t-rowan", { templateId: "meds", repeat: "daily" })).body.task;
  const redo = (await call("POST", `/api/tasks/${given.id}/complete`, "t-avery")).body;
  assert.equal(redo.stats.embers, end.stats.embers + 5);
});

test("the leading partner grows too: care levels and a run of answered days", () => {
  CARE_LEVELS.forEach((level, index) => {
    assert.equal(careLevelFor(level.min).name, level.name);
    if (index > 0) {
      assert.ok(level.min > CARE_LEVELS[index - 1].min);
      assert.equal(careLevelFor(level.min - 1).name, CARE_LEVELS[index - 1].name);
    }
  });
  assert.equal(careLevelFor(100).next, "Keeper");
  assert.equal(careLevelFor(99999).progress, 1);

  // Mon and Tue fully answered, Wed half answered, Thu (today) not yet.
  const yes = (day) => ({ acknowledgedAt: `${day}T21:00:00.000Z` });
  const [mon, tue, wed, thu] = days(MONDAY, 4);
  const db = household({ carePoints: 120, tasks: [finished(mon, 5, yes(mon)), finished(tue, 5, yes(tue)), finished(wed, 5, yes(wed)), finished(wed, 5), finished(thu, 5)] });
  let care = view(db, thu, leader(db)).progress.care;
  assert.deepEqual([care.level.name, care.points, care.given, care.waiting], ["Tender", 120, 3, 2]);
  assert.equal(care.streak, 0, "Wednesday still has one waiting, so the run stops there");
  assert.equal(care.best, 2);
  assert.deepEqual([care.finished7, care.answered7], [5, 3]);

  // Catching up later mends the run. Today's is still allowed to be waiting.
  db.tasks.find((task) => task.completionDate === wed && !task.acknowledgedAt).acknowledgedAt = at(thu);
  care = view(db, thu, leader(db)).progress.care;
  assert.deepEqual([care.streak, care.best, care.waiting], [3, 3, 1]);
  assert.deepEqual(view(db, thu, follower(db)).progress.care, care, "both partners see the same numbers");
});

test("the day is the following partner's, even when the leading partner is the one looking", () => {
  const db = household();
  follower(db).lastSeenDay = "2031-03-04";
  assert.equal(followingDay(db, follower(db), { today: "2031-03-05" }), "2031-03-05");
  assert.equal(followingDay(db, leader(db), { today: "2031-03-05" }), "2031-03-04", "a day behind is believed");
  assert.equal(followingDay(db, leader(db), { today: "2031-03-04" }), "2031-03-04");
  assert.equal(followingDay(db, leader(db), { today: "2031-03-03" }), "2031-03-04", "a day ahead too");
  assert.equal(followingDay(db, leader(db), { today: "2031-03-09" }), "2031-03-09", "a stale day is not");
  delete follower(db).lastSeenDay;
  assert.equal(followingDay(db, leader(db), { today: "2031-03-09" }), "2031-03-09");
  assert.equal(followingDay(db, leader(db), { now: "2031-03-09T10:00:00.000Z" }), "2031-03-09");
});

test("another feature can put a trophy on the shelf with one fact", () => {
  const db = household({ tasks: [finished("2031-02-03")], points: 10 });
  assert.equal(view(db, MONDAY).shelf.find((item) => item.id === "first-checkin").earned, false);
  assert.equal(recordFact(db, "no-such-trophy", { by: "both" }), false);
  assert.equal(recordFact(db, "first-checkin", { at: at(MONDAY), by: "both" }), true);
  assert.equal(recordFact(db, "first-checkin", { at: at(shiftDay(MONDAY, 3)), by: "both" }), false);

  const news = finishProgress(db, beginProgress(db, { today: MONDAY, now: at(MONDAY) }), { actor: leader(db) });
  assert.equal(news.celebration.kind, "trophy");
  assert.equal(news.celebration.title, "Side by side");
  assert.deepEqual(news.cheers.map((item) => [item.to, item.cheer.kind, item.cheer.trophy, item.cheer.by]), [[AVERY, "trophy", "first-checkin", "both"]]);
  const got = view(db, MONDAY).shelf.find((item) => item.id === "first-checkin");
  assert.deepEqual([got.earned, got.day, got.by], [true, MONDAY, "both"]);
});

test("a week where both checked in is read straight off the weekly check-ins", () => {
  const sent = (userId, week, when) => ({ id: `${week}:${userId}`, week, userId, createdAt: when });
  const db = household({ weeklies: [sent(AVERY, "2031-02-24", "2031-02-25T10:00:00.000Z"), sent(ROWAN, "2031-03-03", "2031-03-04T10:00:00.000Z")] });
  assert.equal(view(db, "2031-03-05").shelf.find((item) => item.id === "first-checkin").earned, false, "different weeks do not count");
  db.weeklies.push(sent(AVERY, "2031-03-03", "2031-03-05T19:00:00.000Z"));
  const got = view(db, "2031-03-05").shelf.find((item) => item.id === "first-checkin");
  assert.deepEqual([got.earned, got.day, got.by], [true, "2031-03-05", "both"]);
});

test("waiting news is folded per kind and left alone when it is not ours", () => {
  const db = household();
  const byId = (id) => db.users.find((user) => user.id === id);
  assert.equal(progressCheer([{ id: "1", kind: "praise", what: "Walk", from: ROWAN }], follower(db), byId), null);
  assert.equal(progressCheer([], follower(db), byId), null);

  const two = progressCheer(
    [
      { id: "1", kind: "trophy", what: "Ten down", trophy: "tasks-10", by: AVERY, from: AVERY },
      { id: "2", kind: "level", what: "Glow", level: "glow", from: AVERY },
      { id: "3", kind: "trophy", what: "Seven-day flame", trophy: "streak-7", by: AVERY, from: AVERY },
    ],
    leader(db),
    byId,
  );
  assert.deepEqual(two.ids, ["1", "3"]);
  assert.equal(two.title, "New on the shelf");
  assert.equal(two.detail, "“Ten down” and “Seven-day flame”. Go and look.");
  assert.deepEqual(two.trophies.map((item) => item.id), ["tasks-10", "streak-7"]);

  const mine = progressCheer([{ id: "9", kind: "level", what: "Flame", level: "flame", from: ROWAN }], follower(db), byId);
  assert.equal(mine.detail, "You made it to Flame. Rowan was there to see it.");
});

test("the demo pair opens on a shelf that is already started, with no fuss", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slash-progress-demo-"));
  const app = createSlashApp({ dataFile: path.join(dir, "db.json"), seedDemo: true });
  const today = new Date().toISOString().slice(0, 10);
  const avery = (await app.dispatch({ method: "POST", url: "/api/demo/login", body: { who: "following" } })).body;
  const rowan = (await app.dispatch({ method: "POST", url: "/api/demo/login", body: { who: "leading" } })).body;
  assert.equal(avery.stats.level.title, "Glow IV");
  assert.equal(avery.stats.points, 65);
  assert.equal(avery.stats.embers, 550);
  assert.equal(avery.stats.streak, 4);
  assert.deepEqual(avery.stats.level, rowan.stats.level);
  assert.equal(avery.progress.calendar.length, 84);
  assert.equal(avery.progress.ladder.length, 12);
  assert.deepEqual(avery.shelf.filter((item) => item.earned).map((item) => item.id), ["level-spark", "level-glow", "first-task", "first-praise"]);
  assert.equal(avery.cheer, null);
  assert.equal(rowan.cheer, null);
  assert.equal(rowan.progress.care.streak, 4);

  const done = (await app.dispatch({ method: "POST", url: "/api/tasks/task-meds/complete", token: avery.token, body: { clientDate: today }, clientDate: today })).body;
  assert.equal(done.celebration.title, "Task done");
  assert.equal(done.celebration.trophies, undefined);
  assert.equal(done.stats.streak, 5);
  assert.equal((await app.dispatch({ method: "GET", url: "/api/session", token: rowan.token, body: {}, clientDate: today })).body.cheer, null);
});
