import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { BEATS, GREETINGS, VOICES } from "./guideLines.mjs";
import { GUIDE_TOPICS, addGuideSource, guideAnswer, guideBeatIds, guideBundle, guideFacts, guideMoment, guideSay } from "./guideTalk.mjs";
import { createSlashApp } from "./slashconnect.mjs";

/* Thursday afternoon. Nothing below reads the real clock. */
const NOW = Date.parse("2026-03-12T15:30:00.000Z");
const TODAY = "2026-03-12";
const CLOCK = { now: NOW, today: TODAY, tz: 0 };

function day(offset) {
  return new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
}

function at(offset, time = "12:00") {
  return `${day(offset)}T${time}:00.000Z`;
}

function person(id, name, side, more = {}) {
  return {
    id,
    displayName: name,
    slashSide: side,
    roleTitle: side === "leading" ? "Domme" : "Little",
    pronouns: { label: "they/them", subject: "they", object: "them", possessive: "their", reflexive: "themself" },
    goals: [],
    supplies: [],
    guideId: "lumen",
    points: 0,
    carePoints: 0,
    streak: 0,
    lastActiveDate: "",
    lastSeenDay: TODAY,
    cheers: [],
    ...more,
  };
}

function task(id, title, more = {}) {
  return {
    id,
    templateId: "custom",
    category: "self-care",
    title,
    note: "",
    points: 10,
    bonuses: [],
    assignedBy: "rowan",
    assignedTo: "avery",
    status: "open",
    dueDate: "",
    createdAt: at(-20),
    completedAt: null,
    completionDate: "",
    completion: null,
    acknowledgedAt: null,
    ...more,
  };
}

function finished(id, title, offset, time, more = {}) {
  return task(id, title, { status: "done", completedAt: at(offset, time), completionDate: day(offset), completion: { note: "", bonuses: [] }, ...more });
}

function emptyHouse(users, paired = true) {
  return {
    users,
    pair: paired ? { id: "pair", members: users.map((user) => user.id), createdAt: at(0, "09:00") } : null,
    tasks: [],
    routines: [],
    goals: [],
    rewards: [],
    checkins: [],
    invites: [],
    sessions: [],
  };
}

const SECRET_DIARY = "I cried in the car and nobody knows";
const UNSEEN_NOTE = "Proud of you, starlight";
const SEEN_NOTE = "Thinking about your hands";

/** Three weeks in: a three-day streak, things finished today, a well done owed, a note not read yet. */
function seeded() {
  const avery = person("avery", "Avery Quinn", "following", {
    guideId: "moss",
    goals: ["structure", "self-care"],
    supplies: ["face mask", "journal"],
    points: 65,
    streak: 3,
    lastActiveDate: TODAY,
  });
  const rowan = person("rowan", "Rowan Hale", "leading", { guideId: "lumen", carePoints: 18 });
  const db = emptyHouse([rowan, avery]);
  db.pair.createdAt = at(-21, "18:00");
  db.routines = [
    { id: "r-water", templateId: "water", category: "self-care", title: "Drink your water", target: 64, assignedBy: "rowan", assignedTo: "avery", createdAt: at(-20), stoppedAt: null },
    { id: "r-meds", templateId: "meds", category: "self-care", title: "Take your meds", target: 0, assignedBy: "rowan", assignedTo: "avery", createdAt: at(-20), stoppedAt: null },
  ];
  db.tasks = [
    finished("t-selfie", "Cute selfie shoot", -2, "19:00", { templateId: "selfie", category: "fun", acknowledgedAt: at(-2, "20:00") }),
    finished("t-walk", "Go for a walk", -1, "17:00", { templateId: "walk", acknowledgedAt: at(-1, "21:00"), completion: { note: SECRET_DIARY, bonuses: [] } }),
    finished("t-meds", "Take your meds", 0, "08:05", { templateId: "meds", points: 5, routineId: "r-meds", day: TODAY }),
    finished("t-shower", "Hot shower or bath", 0, "09:10", { templateId: "shower" }),
    task("t-water", "Drink your water", { templateId: "water", points: 5, routineId: "r-water", day: TODAY, target: 64, progress: { amount: 24, entries: [] } }),
    task("t-desk", "Tidy your desk", { dueDate: day(-1), createdAt: at(-3) }),
    task("t-three", "Write three good things", { dueDate: day(2), createdAt: at(-1) }),
  ];
  db.checkins = [
    { id: "c-1", fromUserId: "avery", kind: "hello", note: SEEN_NOTE, createdAt: at(-1, "22:00"), seenBy: ["avery", "rowan"] },
    { id: "c-2", fromUserId: "rowan", kind: "hello", note: UNSEEN_NOTE, createdAt: at(0, "07:00"), seenBy: ["rowan"] },
  ];
  db.rewards = [
    { id: "w-movie", title: "You pick the movie", cost: 40, proposedBy: "rowan", status: "agreed", agreedBy: ["rowan", "avery"], grantedAt: "" },
    { id: "w-trip", title: "A day trip, your choice", cost: 100, proposedBy: "avery", status: "agreed", agreedBy: ["rowan", "avery"], grantedAt: "" },
    { id: "w-dessert", title: "Extra dessert", cost: 20, proposedBy: "rowan", status: "granted", agreedBy: ["rowan", "avery"], grantedAt: at(-4) },
  ];
  db.goals = [
    { id: "g-structure", goalKey: "structure", title: "Structure", target: 10, progress: 7, createdBy: "rowan" },
    { id: "g-care", goalKey: "self-care", title: "Self-care", target: 6, progress: 1, createdBy: "avery" },
  ];
  return { db, avery, rowan };
}

function freshPair() {
  const avery = person("avery", "Avery Quinn", "following", { guideId: "pip" });
  const rowan = person("rowan", "Rowan Hale", "leading", { guideId: "sol" });
  return { db: emptyHouse([rowan, avery]), avery, rowan };
}

const MOMENTS = [
  ["task", {}],
  ["streak", {}],
  ["level", {}],
  ["step", {}],
  ["trophy", {}],
  ["pair", {}],
  ["reward", {}],
  ["praise", { from: "partner" }],
  ["reward", { from: "partner" }],
];

function assertReadsWell(text, where) {
  assert.equal(typeof text, "string", where);
  assert.ok(text.trim().length > 12, `${where}: too short: “${text}”`);
  assert.doesNotMatch(text, /[{}]/, `${where}: unfilled placeholder in “${text}”`);
  assert.doesNotMatch(text, /undefined|null|NaN|\[object/, `${where}: “${text}”`);
  assert.doesNotMatch(text, /\b(0|zero) (days?|tasks?|things?|points?|embers?|times?|oz)\b/i, `${where}: awkward zero in “${text}”`);
  assert.doesNotMatch(text, /\b(one|1) (days|tasks|things|points|embers|times)\b/i, `${where}: wrong plural in “${text}”`);
  assert.doesNotMatch(text, /‘’|“”| {2}|\s[.,!?]|[.!?]{2}|,\./, `${where}: stray punctuation in “${text}”`);
  assert.doesNotMatch(text, /['"]/, `${where}: straight quote in “${text}”`);
  assert.match(text, /^[A-Z0-9‘“+]/, `${where}: starts lower case: “${text}”`);
  assert.match(text, /[.!?…’”]$/, `${where}: no ending: “${text}”`);
  assert.ok((text.match(/!/g) || []).length <= 2, `${where}: shouting: “${text}”`);
}

/** Every line this viewer can be given: each topic at a run of ticks, and each moment. */
function everyLine(db, viewer, voice, opts = CLOCK) {
  const facts = guideFacts(db, viewer, opts);
  const out = [];
  for (const topic of ["home", "nudge", "done", ...GUIDE_TOPICS[facts.side]]) {
    for (let tick = 0; tick < 14; tick += 1) out.push({ where: `${voice}/${facts.side}/${topic}/${tick}`, text: guideSay(facts, voice, topic, { tick }).text });
  }
  for (const [kind, how] of MOMENTS) {
    const withCheer = how.from ? guideFacts(db, viewer, { ...opts, extras: { cheer: { kind, what: ["Go for a walk"] } } }) : facts;
    for (let tick = 0; tick < 4; tick += 1) {
      const moment = guideMoment(withCheer, voice, kind, { ...how, tick });
      if (moment) out.push({ where: `${voice}/${facts.side}/moment:${kind}/${tick}`, text: moment.text });
    }
  }
  return out;
}

test("the facts match the history, for the following partner", () => {
  const { db, avery } = seeded();
  const facts = guideFacts(db, avery, CLOCK);

  assert.equal(facts.day, TODAY);
  assert.equal(facts.weekday, "Thursday");
  assert.equal(facts.part, "afternoon");
  assert.equal(facts.side, "following");
  assert.equal(facts.paired, true);
  assert.equal(facts.me.name, "Avery");
  assert.equal(facts.partner.name, "Rowan");
  assert.equal(facts.partner.role, "Domme");
  assert.equal(facts.pair.days, 21);

  assert.deepEqual(facts.streak, { days: 3, live: true, doneToday: true, best: 3, isBest: true });
  assert.equal(facts.points.total, 65);
  assert.match(facts.points.level, /^[A-Z][a-z]+ [IV]+$/);
  assert.match(facts.points.nextLevel, /^[A-Z][a-z]+ [IV]+$/);
  assert.ok(facts.points.toNext > 0);
  assert.equal(facts.points.care, 18);

  assert.deepEqual(facts.done.today.map((item) => item.title), ["Take your meds", "Hot shower or bath"]);
  assert.equal(facts.done.week.length, 4);
  assert.equal(facts.done.weekPoints, 35);
  assert.deepEqual(facts.done.weekByCategory, [
    { id: "self-care", label: "Self-care", count: 3 },
    { id: "fun", label: "Fun", count: 1 },
  ]);
  assert.equal(facts.done.last.title, "Hot shower or bath");
  assert.equal(facts.done.first.title, "Cute selfie shoot");
  assert.equal(facts.done.total, 4);

  assert.equal(facts.open.count, 2);
  assert.equal(facts.open.next.title, "Tidy your desk");
  assert.deepEqual(facts.open.overdue.map((item) => item.title), ["Tidy your desk"]);
  assert.equal(facts.open.dueToday.length, 0);

  assert.equal(facts.daily.total, 2);
  assert.deepEqual(facts.daily.done.map((item) => item.title), ["Take your meds"]);
  assert.deepEqual(facts.daily.left.map((item) => item.title), ["Drink your water"]);
  assert.deepEqual(facts.water, { amount: 24, target: 64, unit: "oz", left: 40, done: false });

  assert.equal(facts.praise.said, 2);
  assert.deepEqual(facts.praise.waiting.map((item) => item.title), ["Hot shower or bath", "Take your meds"]);
  assert.equal(facts.praise.latest.title, "Go for a walk");

  assert.equal(facts.notes.theirs.seen, false);
  assert.equal(facts.notes.theirs.text, "", "a note not yet on this screen is not repeated");

  assert.equal(facts.rewards.ready.title, "You pick the movie");
  assert.equal(facts.rewards.close.title, "A day trip, your choice");
  assert.equal(facts.rewards.close.short, 35);
  assert.equal(facts.rewards.granted.title, "Extra dessert");
  assert.equal(facts.goals.closest.title, "Structure");
  assert.equal(facts.quiet, null);
});

test("the leading partner gets the same history from their side", () => {
  const { db, rowan } = seeded();
  const facts = guideFacts(db, rowan, CLOCK);
  assert.equal(facts.side, "leading");
  assert.equal(facts.me.name, "Rowan");
  assert.equal(facts.partner.name, "Avery");
  assert.equal(facts.streak.days, 3);
  assert.equal(facts.done.today.length, 2);
  assert.equal(facts.praise.waiting.length, 2);
  assert.equal(facts.praise.said, 2);
  assert.equal(facts.notes.theirs.seen, true);
  assert.equal(facts.notes.theirs.text, SEEN_NOTE);
  assert.ok(facts.assign.ideas.length > 3);
  assert.ok(facts.assign.ideas.some((idea) => idea.supply === "face mask"), "an idea that uses something Avery owns");
  assert.deepEqual(facts.assign.quiet.map((entry) => entry.id), ["grounding"], "nothing grounding has ever been given; fun was done two days ago");
});

test("answers name real things from the history", () => {
  const { db, avery, rowan } = seeded();
  const mine = guideFacts(db, avery, CLOCK);
  const theirs = guideFacts(db, rowan, CLOCK);

  const home = guideSay(mine, "moss", "home", { tick: 0 }).text;
  assert.match(home, /Rowan/);
  assert.match(home, /note/);

  const week = [0, 1, 2].map((tick) => guideSay(mine, "lumen", "week", { tick }).text).join(" ");
  assert.match(week, /four things/);
  assert.match(week, /Hot shower or bath|Go for a walk/);

  const next = guideSay(mine, "sol", "next", { tick: 0 }).text;
  assert.match(next, /‘Tidy your desk’/);
  assert.match(next, /yesterday/);

  const streak = guideSay(mine, "pip", "streak", { tick: 0 }).text;
  assert.match(streak, /three/i);

  const status = [0, 1, 2, 3].map((tick) => guideSay(mine, "moss", "status", { tick }).text).join(" ");
  assert.match(status, /well done/);

  const waiting = guideSay(theirs, "lumen", "waiting", { tick: 0 }).text;
  assert.match(waiting, /Avery/);
  assert.match(waiting, /well done/);
  assert.match(waiting, /‘Hot shower or bath’/);

  const assign = [0, 1, 2, 3].map((tick) => guideSay(theirs, "sol", "assign", { tick }).text).join(" ");
  assert.match(assign, /Avery/);
  assert.match(assign, /‘[^’]+’/, "suggests a task by name");

  const partner = guideSay(theirs, "moss", "partner", { tick: 0 }).text;
  assert.match(partner, /Avery/);
  assert.match(partner, /‘Hot shower or bath’|meds/);
});

test("every voice, side and situation gives a line that reads well", () => {
  const houses = {
    seeded: seeded(),
    fresh: freshPair(),
  };
  const quiet = seeded();
  quiet.db.tasks = quiet.db.tasks.filter((item) => item.status !== "open" || item.routineId);
  houses.quiet = quiet;

  let checked = 0;
  for (const [name, { db, avery, rowan }] of Object.entries(houses)) {
    for (const voice of VOICES) {
      for (const viewer of [avery, rowan]) {
        for (const opts of [CLOCK, { now: NOW, today: TODAY }, { now: NOW + 9 * 86400000, today: day(9), tz: -600 }]) {
          for (const line of everyLine(db, viewer, voice, opts)) {
            assertReadsWell(line.text, `${name}/${line.where}`);
            checked += 1;
          }
        }
      }
    }
  }
  assert.ok(checked > 3000, `only ${checked} lines checked`);
});

test("every beat is written in all four voices and can be reached", () => {
  const reachable = new Set(guideBeatIds());
  for (const id of Object.keys(BEATS)) assert.ok(reachable.has(id), `${id} has lines but nothing ever says them`);
  for (const id of reachable) assert.ok(BEATS[id], `${id} is planned but has no lines`);
  for (const [id, beat] of Object.entries(BEATS)) {
    for (const voice of VOICES) {
      assert.ok(Array.isArray(beat[voice]) && beat[voice].length >= 2, `${id} needs at least two ${voice} lines`);
      for (const line of beat[voice]) {
        assert.doesNotMatch(line, /['"]/, `${id}/${voice}: straight quote in “${line}”`);
        assert.ok((line.match(/!/g) || []).length <= 2, `${id}/${voice}: shouting in “${line}”`);
      }
    }
  }
  for (const voice of VOICES) {
    for (const part of ["morning", "afternoon", "evening", "late", "any"]) assert.ok(GREETINGS[voice][part].length >= 2, `${voice} greeting for ${part}`);
  }
});

test("a brand new pair still has something good to say, and never counts to zero", () => {
  const { db, avery, rowan } = freshPair();
  for (const voice of VOICES) {
    for (const viewer of [avery, rowan]) {
      const facts = guideFacts(db, viewer, CLOCK);
      assert.equal(facts.streak.days, 0);
      assert.equal(facts.done.total, 0);
      for (const topic of ["home", ...GUIDE_TOPICS[facts.side]]) {
        const text = guideSay(facts, voice, topic, { tick: 1 }).text;
        assertReadsWell(text, `fresh/${voice}/${facts.side}/${topic}`);
        assert.doesNotMatch(text, /\b0\b/, `fresh/${voice}/${facts.side}/${topic}: “${text}”`);
      }
      const hello = guideSay(facts, voice, "home", { tick: 0 }).text;
      assert.match(hello, viewer === avery ? /Rowan/ : /Avery/, `the first greeting names the partner: “${hello}”`);
    }
  }
});

test("someone with no partner yet hears only about themselves", () => {
  const solo = person("solo", "Jules Park", "following", { guideId: "sol" });
  const stranger = person("stranger", "Morgan Vale", "leading", { guideId: "lumen", carePoints: 40 });
  const db = emptyHouse([solo, stranger], false);
  db.tasks = [finished("t-other", "Polish the silver", 0, "08:00", { assignedTo: "stranger", assignedBy: "stranger" })];
  db.checkins = [{ id: "c-x", fromUserId: "stranger", kind: "hello", note: "Morgan’s private line", createdAt: at(0, "08:00"), seenBy: [] }];
  db.rewards = [{ id: "w-x", title: "Silver spoon", cost: 5, proposedBy: "stranger", status: "agreed", agreedBy: ["stranger"] }];
  db.goals = [{ id: "g-x", title: "Polish everything", target: 4, progress: 2, createdBy: "stranger" }];

  const facts = guideFacts(db, solo, CLOCK);
  assert.equal(facts.paired, false);
  assert.equal(facts.partner, null);
  assert.equal(facts.done.total, 0);
  assert.equal(facts.notes.count, 0);
  assert.equal(facts.rewards.agreedCount, 0);
  assert.equal(facts.goals.closest, null);
  assert.equal(facts.points.care, 0);

  for (const voice of VOICES) {
    for (const line of everyLine(db, solo, voice)) {
      assertReadsWell(line.text, `solo/${line.where}`);
      assert.doesNotMatch(line.text, /Morgan|silver|Polish|spoon/i, `solo/${line.where} leaks: “${line.text}”`);
    }
  }
  const bundle = guideBundle(db, solo, {}, CLOCK);
  assert.match(bundle.guide.text, /invite|partner/i);
});

test("private words stay private", () => {
  const { db, avery, rowan } = seeded();
  const all = (viewer) => VOICES.flatMap((voice) => everyLine(db, viewer, voice)).map((line) => line.text).join("\n");

  const averyHears = all(avery);
  assert.ok(!averyHears.includes(UNSEEN_NOTE), "a note Avery has not opened is not read out");
  assert.ok(!averyHears.includes(SECRET_DIARY), "what was written on a finished task is never repeated");
  assert.match(averyHears, /note from Rowan|Rowan left you a note/, "but the stuffie does say a note is waiting");

  const rowanHears = all(rowan);
  assert.ok(!rowanHears.includes(SECRET_DIARY));
  assert.ok(rowanHears.includes(SEEN_NOTE), "a note already on Rowan’s screen can be mentioned");
  assert.ok(!JSON.stringify(guideFacts(db, avery, CLOCK)).includes(UNSEEN_NOTE));
  assert.ok(!JSON.stringify(guideFacts(db, rowan, CLOCK)).includes(SECRET_DIARY));

  db.checkins[1].seenBy.push("avery");
  assert.ok(all(avery).includes(UNSEEN_NOTE), "once Avery has seen it, it can be");
});

test("asking again gets different words", () => {
  const { db, avery, rowan } = seeded();
  for (const viewer of [avery, rowan]) {
    const facts = guideFacts(db, viewer, CLOCK);
    for (const voice of VOICES) {
      for (const topic of ["nudge", ...GUIDE_TOPICS[facts.side]]) {
        let last = "";
        let lastKey = "";
        const seen = new Set();
        for (let tick = 0; tick < 6; tick += 1) {
          const reply = guideSay(facts, voice, topic, { tick, last, lastKey });
          assert.notEqual(reply.text, last, `${voice}/${facts.side}/${topic} repeated itself at ${tick}`);
          seen.add(reply.text);
          last = reply.text;
          lastKey = reply.key;
        }
        assert.ok(seen.size >= 2, `${voice}/${facts.side}/${topic} has one answer`);
      }
      const taps = new Set();
      for (let tick = 0; tick < 10; tick += 1) taps.add(guideSay(facts, voice, "nudge", { tick }).key);
      assert.ok(taps.size >= 6, `${voice}/${facts.side}: taps cover ${taps.size} subjects`);
    }
  }
  const lead = guideFacts(db, rowan, CLOCK);
  let before = guideSay(lead, "lumen", "nice", { tick: 0 });
  for (let tick = 1; tick < 6; tick += 1) {
    const reply = guideSay(lead, "lumen", "nice", { tick, last: before.text, lastKey: before.key });
    assert.notEqual(reply.key, "l.nice.plain", `there is plenty of their own to be nice about: “${reply.text}”`);
    assert.notEqual(reply.key, before.key, "and it is not the same compliment twice running");
    before = reply;
  }
  const same = guideFacts(db, avery, CLOCK);
  assert.equal(guideSay(same, "moss", "status", { tick: 4 }).text, guideSay(same, "moss", "status", { tick: 4 }).text);
});

test("moments say what was finished and who noticed", () => {
  const { db, avery, rowan } = seeded();
  const facts = guideFacts(db, avery, CLOCK);
  for (const voice of VOICES) {
    const done = guideMoment(facts, voice, "task", { tick: 0 });
    assert.match(done.text, /‘Hot shower or bath’/, done.text);
    const streak = guideMoment(facts, voice, "streak", { tick: 0 });
    assert.match(streak.text, /three/i, streak.text);

    const praised = guideFacts(db, avery, { ...CLOCK, extras: { cheer: { kind: "praise", what: ["Go for a walk"] } } });
    const praise = guideMoment(praised, voice, "praise", { from: "partner", tick: 0 });
    assert.match(praise.text, /Rowan/, praise.text);
    assert.match(praise.text, /‘Go for a walk’/, praise.text);
  }
  assert.equal(guideMoment(guideFacts(db, rowan, CLOCK), "lumen", "task", {}), null, "the leading partner’s stuffie does not claim the task");

  const party = { kind: "task", title: "Task done", detail: "+10 points", points: 10 };
  const bundle = guideBundle(db, avery, { celebration: party }, CLOCK);
  assert.equal(bundle.celebration.kind, "task");
  assert.equal(bundle.celebration.points, 10);
  assert.match(bundle.celebration.detail, /^\+10 points\. .*‘Hot shower or bath’/);
  assert.equal(party.detail, "+10 points", "the engine’s own celebration is left as it was");

  avery.cheers = [{ id: "ch-1", at: at(0, "15:00"), kind: "praise", what: "Hot shower or bath", from: "rowan" }];
  const cheered = guideBundle(db, avery, {}, CLOCK);
  assert.equal(cheered.guide.event, "praise");
  assert.match(cheered.guide.text, /Rowan/);
  assert.match(cheered.guide.text, /‘Hot shower or bath’/);
  assert.equal(cheered.guide.name, "Moss");
  assert.equal(cheered.celebration, undefined);
});

test("other features can teach the stuffie without touching it", () => {
  const { db, avery } = seeded();
  const beat = { id: "x.weekly", topics: ["us"], sides: ["following"], lines: ["You and {partner} have checked in {weeksIn} weeks running."] };
  const facts = guideFacts(db, avery, { ...CLOCK, extras: { weekly: { run: 3 }, words: { weeksIn: "three" }, beats: [beat] } });
  assert.deepEqual(facts.extras.weekly, { run: 3 });
  const us = [0, 1, 2, 3, 4, 5].map((tick) => guideSay(facts, "moss", "us", { tick }).text).join(" ");
  assert.match(us, /You and Rowan have checked in three weeks running\./);

  const remove = addGuideSource((household, viewer) => ({ trophies: 2, words: { shelfN: "two" }, beats: [{ id: "x.shelf", topics: ["nice"], lines: [`${viewer.displayName.split(" ")[0]}, there are {shelfN} trophies on the shelf.`] }] }));
  try {
    const asked = [0, 1, 2, 3, 4, 5, 6, 7].map((tick) => guideAnswer(db, avery, { topic: "nice", tick }, CLOCK).line.text).join(" ");
    assert.match(asked, /Avery, there are two trophies on the shelf\./);
  } finally {
    remove();
  }
  const after = [0, 1, 2, 3, 4, 5, 6, 7].map((tick) => guideAnswer(db, avery, { topic: "nice", tick }, CLOCK).line.text).join(" ");
  assert.doesNotMatch(after, /trophies on the shelf/);

  const throws = addGuideSource(() => {
    throw new Error("broken feature");
  });
  try {
    assertReadsWell(guideAnswer(db, avery, { topic: "status", tick: 1 }, CLOCK).line.text, "with a broken source");
  } finally {
    throws();
  }
});

test("a household from before any of this still gets a greeting", () => {
  const bare = { id: "old", displayName: "Sam", slashSide: "following" };
  for (const db of [{}, { users: [bare] }, { users: [bare], pair: { members: ["old", "gone"] }, tasks: [{}, null], checkins: [null], rewards: [{}], goals: [{}] }]) {
    const bundle = guideBundle(db, bare, {}, CLOCK);
    assertReadsWell(bundle.guide.text, "bare household");
    assert.equal(bundle.guide.guideId, "lumen");
    assertReadsWell(guideAnswer(db, bare, { event: "streak", tick: 2 }, CLOCK).line.text, "bare household, old event");
  }
  assertReadsWell(guideBundle({}, undefined, {}, CLOCK).guide.text, "nobody at all");
});

test("the engine serves the greeting, the questions and the moments", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slash-guide-"));
  const app = createSlashApp({ dataFile: path.join(dir, "household.json"), seedDemo: true });
  const call = async (method, url, token, body) => app.dispatch({ method, url, token, body, clientDate: new Date().toISOString().slice(0, 10) });
  const avery = (await call("POST", "/api/demo/login", "", { who: "following" })).body;
  const rowan = (await call("POST", "/api/demo/login", "", { who: "leading" })).body;
  assert.ok(avery.token && rowan.token);

  const home = (await call("GET", "/api/session", avery.token)).body;
  assertReadsWell(home.guide.text, "demo home");
  assert.equal(home.guide.event, "home");
  assert.match(home.guide.text, /Rowan|Avery|‘/);
  assert.ok(home.guide.name);

  for (const [who, side] of [[avery, "following"], [rowan, "leading"]]) {
    for (const topic of GUIDE_TOPICS[side]) {
      const reply = await call("POST", "/api/guide/ask", who.token, { topic, tick: 3, tz: 300 });
      assert.equal(reply.status, 200);
      assertReadsWell(reply.body.line.text, `demo ${side} ${topic}`);
      assert.equal(reply.body.line.topic, topic);
    }
  }
  const old = await call("POST", "/api/guide/nudge", avery.token, { event: "streak", tick: 1 });
  assert.equal(old.status, 200);
  assert.equal(old.body.line.event, "streak");
  assertReadsWell(old.body.line.text, "demo old nudge");
  assert.equal((await call("GET", "/api/session", avery.token)).body.guide.tz, 300, "the phone’s clock is remembered");

  const open = home.tasks.find((item) => item.status === "open" && item.templateId === "meds");
  assert.ok(open, "the demo has meds to take");
  const done = (await call("POST", `/api/tasks/${open.id}/complete`, avery.token, {})).body;
  assert.ok(done.celebration);
  assertReadsWell(done.celebration.detail, "demo celebration");
  assert.match(done.celebration.detail, /meds/i, done.celebration.detail);

  const seen = (await call("POST", `/api/tasks/${open.id}/acknowledge`, rowan.token, {})).body;
  assertReadsWell(seen.guide.text, "demo after a well done, leading");
  const cheered = (await call("GET", "/api/session", avery.token)).body;
  assert.equal(cheered.cheer.kind, "praise");
  assert.equal(cheered.guide.event, "praise");
  assert.match(cheered.guide.text, /Rowan/);
  assert.match(cheered.guide.text, /meds/i);
});
