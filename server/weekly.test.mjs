import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSlashApp, emptyDb } from "./slashconnect.mjs";
import {
  REQUEST_CHOICES,
  WEEKLY_CARE_POINTS,
  WEEKLY_LIMITS,
  WEEKLY_POINTS,
  cleanWriting,
  markWeeklyRead,
  resolveDay,
  sanitiseWeekly,
  saveWeekly,
  shiftDay,
  weekOf,
  weekStart,
  weeklyFacts,
  weeklyRoute,
  weeklyView,
} from "./weekly.mjs";

// Wednesday 11 November 2026, mid-afternoon in UTC. Its week starts Monday the 9th.
const WED = Date.UTC(2026, 10, 11, 15);
const THIS_WEEK = "2026-11-09";
const at = (ms, clientDate) => ({ now: ms, clientDate });
const days = (count) => count * 86400000;

/** A paired household as it was stored before weekly check-ins existed: no `weeklies` at all. */
function household() {
  const rowan = { id: "rowan", displayName: "Rowan Hale", slashSide: "leading", points: 0, carePoints: 25 };
  const avery = { id: "avery", displayName: "Avery Quinn", slashSide: "following", points: 20, carePoints: 0 };
  return { db: { users: [rowan, avery], pair: { id: "pair", members: ["rowan", "avery"] }, tasks: [], checkins: [] }, rowan, avery };
}

function refused(run) {
  try {
    run();
  } catch (error) {
    return { status: error.status, message: error.message };
  }
  return null;
}

test("a week starts on Monday and is named by that Monday", () => {
  assert.equal(weekStart("2026-11-09"), "2026-11-09");
  assert.equal(weekStart("2026-11-11"), "2026-11-09");
  assert.equal(weekStart("2026-11-15"), "2026-11-09", "Sunday closes the week it is in");
  assert.equal(weekStart("2026-11-16"), "2026-11-16");
  assert.equal(weekStart("2028-02-29"), "2028-02-28", "a leap day");
  assert.equal(weekStart("2028-03-01"), "2028-02-28");
});

test("a week that runs over New Year stays one week", () => {
  assert.equal(weekStart("2026-12-31"), "2026-12-28");
  assert.equal(weekStart("2027-01-01"), "2026-12-28");
  assert.equal(weekStart("2027-01-03"), "2026-12-28");
  assert.equal(weekStart("2027-01-04"), "2027-01-04");
  assert.equal(weekStart("2026-01-01"), "2025-12-29");
  const newYearsDay = weekOf(at(Date.UTC(2027, 0, 1, 9), "2027-01-01"));
  assert.deepEqual([newYearsDay.week, newYearsDay.weekEnd], ["2026-12-28", "2027-01-03"]);
});

test("the day is the person's own, as long as some time zone could be on it", () => {
  // Monday 03:00 UTC is still Sunday evening in Honolulu, and Sunday belongs to last week.
  const mondayEarly = Date.UTC(2026, 10, 9, 3);
  assert.equal(resolveDay(at(mondayEarly, "2026-11-08")), "2026-11-08");
  assert.equal(weekOf(at(mondayEarly, "2026-11-08")).week, "2026-11-02");
  assert.equal(weekOf(at(mondayEarly)).week, "2026-11-09", "no client day: the server's day");

  // Sunday noon UTC is already Monday in Auckland, so their new week has started.
  const sundayNoon = Date.UTC(2026, 10, 8, 12);
  assert.equal(weekOf(at(sundayNoon, "2026-11-09")).week, "2026-11-09");
  assert.equal(weekOf(at(sundayNoon)).week, "2026-11-02");

  // A phone with the wrong date cannot reach into other weeks.
  assert.equal(resolveDay(at(WED, "2026-11-25")), "2026-11-11");
  assert.equal(resolveDay(at(WED, "2026-10-01")), "2026-11-11");
  assert.equal(resolveDay(at(WED, "2026-02-31")), "2026-11-11");
  assert.equal(resolveDay(at(WED, "tomorrow")), "2026-11-11");
  assert.equal(resolveDay(at(WED, "2026-11-12")), "2026-11-12");
  assert.equal(resolveDay(at(WED, "2026-11-10")), "2026-11-10");
  assert.equal(resolveDay({ now: new Date(WED) }), "2026-11-11", "a Date works as the clock too");
});

test("a household stored before weekly check-ins existed still works", () => {
  const { db, rowan, avery } = household();
  assert.equal(db.weeklies, undefined);
  const view = weeklyView(db, rowan, at(WED));
  assert.equal(view.available, true);
  assert.equal(view.state, "open");
  assert.deepEqual(view.history, []);
  assert.equal(markWeeklyRead(db, rowan, at(WED)), false);
  assert.deepEqual(weeklyFacts(db, at(WED)), { weeksTogether: 0, weeksBy: { rowan: 0, avery: 0 }, run: 0, bestRun: 0, runBy: { rowan: 0, avery: 0 } });
  saveWeekly(db, avery, { self: "Fine." }, at(WED));
  assert.equal(db.weeklies.length, 1);
  assert.deepEqual(weeklyFacts({}, at(WED)), { weeksTogether: 0, weeksBy: {}, run: 0, bestRun: 0, runBy: {} });
  assert.ok(Array.isArray(emptyDb().weeklies));
});

test("each person has one check-in a week and can change it until the week ends", () => {
  const { db, avery } = household();
  const first = saveWeekly(db, avery, { self: "Tired but okay.", selfRating: 3, requests: ["fun"] }, at(WED, "2026-11-11"));
  assert.equal(first.created, true);
  assert.equal(first.entry.week, THIS_WEEK);

  const edited = saveWeekly(db, avery, { self: "Tired but okay. Better after the call.", selfRating: 4, requests: ["fun", "praise"] }, at(WED + days(2), "2026-11-13"));
  assert.equal(edited.created, false);
  assert.equal(edited.celebration, null);
  assert.equal(db.weeklies.length, 1);
  assert.equal(db.weeklies[0].self, "Tired but okay. Better after the call.");
  assert.equal(db.weeklies[0].selfRating, 4);
  assert.deepEqual(db.weeklies[0].requests, ["fun", "praise"]);
  assert.notEqual(db.weeklies[0].updatedAt, db.weeklies[0].createdAt);
  assert.equal(weeklyView(db, avery, at(WED + days(2))).mine.edited, true);

  // Sunday is still this week. Monday is a new one, and last week's is left as it was.
  saveWeekly(db, avery, { self: "Sunday version." }, at(WED + days(4), "2026-11-15"));
  assert.equal(db.weeklies.length, 1);
  const monday = saveWeekly(db, avery, { self: "New week." }, at(WED + days(5), "2026-11-16"));
  assert.equal(monday.created, true);
  assert.equal(db.weeklies.length, 2);
  assert.equal(db.weeklies[0].self, "Sunday version.");
  assert.equal(db.weeklies[1].week, "2026-11-16");
});

test("sending the same answers again changes nothing", () => {
  const { db, avery } = household();
  const body = { self: "Same.", requests: ["rest"] };
  saveWeekly(db, avery, body, at(WED));
  const stamp = db.weeklies[0].updatedAt;
  saveWeekly(db, avery, body, at(WED + days(1)));
  assert.equal(db.weeklies[0].updatedAt, stamp);
  assert.equal(weeklyView(db, avery, at(WED + days(1))).mine.edited, false);
});

test("a partner's answers stay sealed until yours are in", () => {
  const { db, rowan, avery } = household();
  saveWeekly(db, avery, { self: "Wobbly week.", dynamic: "I missed you.", needs: "An evening on the phone.", requests: ["fun", "date"], requestNote: "Saturday?" }, at(WED));

  const before = weeklyView(db, rowan, at(WED));
  assert.equal(before.state, "partner-waiting");
  assert.equal(before.partnerSent, true);
  assert.equal(before.partner, null);
  assert.equal(before.mine, null);
  assert.equal(before.asks, null, "what they asked for is sealed too");
  assert.doesNotMatch(JSON.stringify(before), /Wobbly|missed you|evening on the phone|Saturday/);
  assert.equal(weeklyView(db, rowan, at(WED), { open: THIS_WEEK }).opened.partner, null);
  assert.equal(markWeeklyRead(db, rowan, at(WED)), false, "nothing to have read yet");

  const mine = weeklyView(db, avery, at(WED));
  assert.equal(mine.state, "mine-in");
  assert.equal(mine.mine.self, "Wobbly week.");
  assert.equal(mine.partner, null);

  saveWeekly(db, rowan, { self: "Steady.", requests: ["feedback"] }, at(WED + days(1)));
  const after = weeklyView(db, rowan, at(WED + days(1)));
  assert.equal(after.state, "both");
  assert.equal(after.partner.self, "Wobbly week.");
  assert.equal(after.partner.userId, "avery");
  assert.deepEqual(after.asks, { week: THIS_WEEK, thisWeek: true, requests: ["fun", "date"], note: "Saturday?" });
  assert.equal(after.unread, "new");
  assert.equal(weeklyView(db, avery, at(WED + days(1))).partner.self, "Steady.");
  assert.equal(after.partner.readAt, undefined, "who read what stays on the server");
});

test("reading is remembered, and a later change shows up as a change", () => {
  const { db, rowan, avery } = household();
  saveWeekly(db, avery, { self: "First." }, at(WED));
  saveWeekly(db, rowan, { self: "Mine." }, at(WED + 1000));
  assert.equal(markWeeklyRead(db, rowan, at(WED + 2000)), true);
  assert.equal(weeklyView(db, rowan, at(WED + 2000)).unread, "");
  assert.equal(markWeeklyRead(db, rowan, at(WED + 3000)), false);
  assert.equal(weeklyView(db, avery, at(WED + 3000)).unread, "new", "Avery has not read Rowan’s yet");

  saveWeekly(db, avery, { self: "First, and a bit more." }, at(WED + days(1)));
  assert.equal(weeklyView(db, rowan, at(WED + days(1))).unread, "changed");
  markWeeklyRead(db, rowan, at(WED + days(1) + 1000));
  assert.equal(weeklyView(db, rowan, at(WED + days(1) + 1000)).unread, "");
});

test("points come once a week: points for the following partner, care points for the leading partner", () => {
  const { db, rowan, avery } = household();
  const sent = saveWeekly(db, avery, { self: "Here." }, at(WED));
  assert.equal(avery.points, 20 + WEEKLY_POINTS);
  assert.equal(avery.carePoints, 0);
  assert.equal(sent.celebration.kind, "weekly");
  assert.equal(sent.celebration.points, WEEKLY_POINTS);
  assert.match(sent.celebration.detail, /^\+10 points\. Rowan sees it once both of you have sent one\.$/);

  for (let index = 0; index < 4; index += 1) saveWeekly(db, avery, { self: `Edit ${index}` }, at(WED + days(1) + index));
  assert.equal(avery.points, 20 + WEEKLY_POINTS);

  const lead = saveWeekly(db, rowan, { needs: "More feedback." }, at(WED + days(1)));
  assert.equal(rowan.carePoints, 25 + WEEKLY_CARE_POINTS);
  assert.equal(rowan.points, 0);
  assert.match(lead.celebration.detail, /^\+10 care points\. Avery’s is in too\./);
  saveWeekly(db, rowan, { needs: "More feedback, please." }, at(WED + days(2)));
  assert.equal(rowan.carePoints, 25 + WEEKLY_CARE_POINTS);

  saveWeekly(db, avery, { self: "Next week." }, at(WED + days(7)));
  assert.equal(avery.points, 20 + WEEKLY_POINTS * 2);
  assert.equal(weeklyView(db, avery, at(WED)).earns, WEEKLY_POINTS);
  assert.equal(weeklyView(db, rowan, at(WED)).earns, WEEKLY_CARE_POINTS);
});

test("sending leaves levels and trophies to progress", () => {
  const { db, avery } = household();
  avery.points = 299;
  const sent = saveWeekly(db, avery, { self: "Here." }, at(WED));
  assert.equal(avery.points, 299 + WEEKLY_POINTS);
  assert.equal(sent.celebration.kind, "weekly");
  assert.equal(sent.celebration.title, "Check-in sent");
  assert.equal(db.progress, undefined);
});

test("whoever sent first is told once when the second one lands", () => {
  const { db, rowan, avery } = household();
  const cheers = [];
  const hooks = { queueCheer: (user, cheer) => cheers.push({ to: user.id, ...cheer }) };
  saveWeekly(db, avery, { self: "First in." }, at(WED), hooks);
  assert.equal(cheers.length, 0);
  saveWeekly(db, rowan, { self: "Second in." }, at(WED + days(1)), hooks);
  assert.deepEqual(cheers, [{ to: "avery", kind: "weekly", what: THIS_WEEK, from: "rowan" }]);
  saveWeekly(db, rowan, { self: "Second in, edited." }, at(WED + days(2)), hooks);
  saveWeekly(db, avery, { self: "First in, edited." }, at(WED + days(2)), hooks);
  assert.equal(cheers.length, 1);
});

test("past weeks are listed newest first, and say who skipped", () => {
  const { db, rowan, avery } = household();
  const weekOne = Date.UTC(2026, 9, 28, 12);
  const weekTwo = Date.UTC(2026, 10, 4, 12);
  saveWeekly(db, avery, { self: "Week one, Avery.", selfRating: 2, dynamicRating: 4 }, at(weekOne));
  saveWeekly(db, rowan, { self: "Week one, Rowan.", selfRating: 5 }, at(weekOne + days(1)));
  saveWeekly(db, avery, { self: "Week two, only Avery.", selfRating: 3, requests: ["spice"] }, at(weekTwo));
  saveWeekly(db, rowan, { self: "This week, Rowan." }, at(WED));

  const view = weeklyView(db, rowan, at(WED));
  assert.deepEqual(view.history.map((item) => item.week), ["2026-11-02", "2026-10-26"]);
  assert.deepEqual(view.history[0], { week: "2026-11-02", weekEnd: "2026-11-08", mine: null, partner: { selfRating: 3, dynamicRating: 0 } });
  assert.deepEqual(view.history[1].mine, { selfRating: 5, dynamicRating: 0 });
  assert.deepEqual(view.history[1].partner, { selfRating: 2, dynamicRating: 4 });
  assert.equal(view.opened, undefined);
  assert.doesNotMatch(JSON.stringify(view.history), /Week one|only Avery/, "the list carries no writing");

  const skipped = weeklyView(db, rowan, at(WED), { open: "2026-11-02" }).opened;
  assert.equal(skipped.past, true);
  assert.equal(skipped.mine, null);
  assert.equal(skipped.partner.self, "Week two, only Avery.", "a week that is over opens even if you skipped it");
  assert.equal(skipped.partnerSent, true);

  const both = weeklyView(db, avery, at(WED), { open: "2026-10-26" }).opened;
  assert.equal(both.mine.self, "Week one, Avery.");
  assert.equal(both.partner.self, "Week one, Rowan.");

  assert.equal(weeklyView(db, rowan, at(WED), { open: "2026-10-19" }).opened, null, "nobody wrote that week");
  assert.equal(weeklyView(db, rowan, at(WED), { open: "2026-11-16" }).opened, null, "a week that has not started");
  assert.equal(weeklyView(db, rowan, at(WED), { open: "2026-11-03" }).opened, null, "not a Monday");
  assert.equal(weeklyView(db, rowan, at(WED), { open: "nonsense" }).opened, undefined);

  // Last week's asks still stand until this week's can be read.
  assert.deepEqual(view.asks, { week: "2026-11-02", thisWeek: false, requests: ["spice"], note: "" });
});

test("a partner who is already in next week does not unseal anything early", () => {
  const { db, rowan, avery } = household();
  // Sunday noon UTC: Avery, in Auckland, is on Monday. Rowan, in London, is still on Sunday.
  const sundayNoon = Date.UTC(2026, 10, 15, 12);
  saveWeekly(db, avery, { self: "Monday already here." }, at(sundayNoon, "2026-11-16"));
  const rowanSunday = weeklyView(db, rowan, at(sundayNoon, "2026-11-15"));
  assert.equal(rowanSunday.week, THIS_WEEK);
  assert.equal(rowanSunday.state, "open");
  assert.deepEqual(rowanSunday.history, []);
  assert.doesNotMatch(JSON.stringify(rowanSunday), /Monday already/);
  assert.equal(weeklyView(db, rowan, at(sundayNoon, "2026-11-15"), { open: "2026-11-16" }).opened, null);

  const rowanMonday = weeklyView(db, rowan, at(sundayNoon + days(1), "2026-11-16"));
  assert.equal(rowanMonday.state, "partner-waiting");
  assert.equal(rowanMonday.partner, null);
});

test("everything written is tidied and kept to a sensible length", () => {
  const long = "x".repeat(5000);
  const clean = sanitiseWeekly({
    self: `  Hello\u0000 there\r\n\r\n\r\n\r\nsecond\tparagraph \u202Ebackwards  `,
    selfRating: "4",
    dynamic: long,
    dynamicRating: 9,
    needs: { not: "text" },
    requests: ["praise", "fun", "fun", "made-up", 7, null, "<script>"],
    requestNote: long,
    week: "1999-01-04",
    userId: "someone-else",
    earned: 5000,
  });
  assert.equal(clean.self, "Hello there\n\nsecond paragraph backwards");
  assert.equal(clean.selfRating, 4);
  assert.equal(clean.dynamic.length, WEEKLY_LIMITS.text);
  assert.equal(clean.dynamicRating, 0);
  assert.equal(clean.needs, "");
  assert.deepEqual(clean.requests, ["fun", "praise"], "known choices only, once each, in the list’s order");
  assert.equal(clean.requestNote.length, WEEKLY_LIMITS.note);
  assert.deepEqual(Object.keys(clean).sort(), ["dynamic", "dynamicRating", "needs", "requestNote", "requests", "self", "selfRating"]);

  assert.equal(cleanWriting("🧸".repeat(10), 4), "🧸🧸🧸🧸", "cut between characters, never through one");
  assert.equal(cleanWriting("<b>bold</b> & “quotes”", 100), "<b>bold</b> & “quotes”", "kept as plain text; the page never renders it as markup");
  for (const rating of [0, 6, -1, 2.6, "three", null, undefined, Number.NaN]) {
    const value = sanitiseWeekly({ selfRating: rating }).selfRating;
    assert.ok(value === 0 || value === 3, `${rating} became ${value}`);
  }
  assert.deepEqual(sanitiseWeekly(null), sanitiseWeekly({}));
  assert.deepEqual(sanitiseWeekly("text").requests, []);

  const { db, avery } = household();
  saveWeekly(db, avery, { self: "Real.", week: "1999-01-04", userId: "rowan", earned: 5000, readAt: { rowan: "x" } }, at(WED));
  assert.equal(db.weeklies[0].week, THIS_WEEK);
  assert.equal(db.weeklies[0].userId, "avery");
  assert.equal(db.weeklies[0].earned, WEEKLY_POINTS);
  assert.deepEqual(db.weeklies[0].readAt, {});
});

test("nothing is required except saying something", () => {
  const { db, avery } = household();
  for (const empty of [{}, { self: "   \n  " }, { requests: ["made-up"] }, { selfRating: 0 }, null]) {
    const no = refused(() => saveWeekly(db, avery, empty, at(WED)));
    assert.equal(no.status, 400);
    assert.match(no.message, /One line is plenty/);
  }
  assert.equal(avery.points, 20);
  for (const [index, enough] of [{ selfRating: 3 }, { requests: ["rest"] }, { requestNote: "A call?" }, { needs: "You." }].entries()) {
    const { db: fresh, avery: person } = household();
    assert.equal(saveWeekly(fresh, person, enough, at(WED + index)).created, true);
  }
});

test("someone who is not paired yet is turned away kindly", () => {
  const solo = { id: "solo", displayName: "Sam", slashSide: "leading", points: 0, carePoints: 0 };
  const db = { users: [solo], pair: null };
  const no = refused(() => saveWeekly(db, solo, { self: "Hello?" }, at(WED)));
  assert.equal(no.status, 409);
  assert.match(no.message, /opens once the two of you are paired/);
  assert.equal(db.weeklies, undefined);
  assert.equal(solo.carePoints, 0);
  const view = weeklyView(db, solo, at(WED));
  assert.equal(view.available, false);
  assert.equal(view.state, "unpaired");
  assert.equal(view.week, THIS_WEEK);
  assert.equal(refused(() => weeklyRoute(db, solo, { method: "GET", parts: ["api", "weekly", THIS_WEEK], now: WED })).status, 409);
});

test("the choices say which side of the slash they are for", () => {
  const { db, rowan, avery } = household();
  const choices = weeklyView(db, rowan, at(WED)).choices;
  assert.deepEqual(choices, weeklyView(db, avery, at(WED)).choices);
  assert.equal(choices.length, REQUEST_CHOICES.length);
  assert.equal(choices.find((item) => item.id === "firm").side, "following");
  assert.equal(choices.find((item) => item.id === "feedback").side, "leading");
  for (const id of ["fun", "spice", "structure", "soft", "praise", "rest", "checkins", "date", "new"]) {
    assert.equal(choices.find((item) => item.id === id).side, "", id);
  }
  for (const choice of choices) {
    assert.ok(choice.label && choice.ask, choice.id);
    assert.doesNotMatch(choice.ask, /^[A-Z]/, "it finishes the sentence “Avery asked for …”");
  }
  assert.equal(new Set(choices.map((item) => item.id)).size, choices.length);
});

test("only the last year of weeks is kept", () => {
  const { db, avery } = household();
  const start = Date.UTC(2025, 0, 8, 12);
  for (let index = 0; index < 60; index += 1) saveWeekly(db, avery, { self: `Week ${index}` }, at(start + days(7 * index)));
  assert.equal(db.weeklies.length, WEEKLY_LIMITS.weeksKept);
  assert.equal(db.weeklies[0].self, "Week 8");
  assert.equal(avery.points, 20 + 60 * WEEKLY_POINTS);
});

test("weeklyFacts counts weeks and runs without touching the writing", () => {
  const { db, rowan, avery } = household();
  const monday = (weeksAgo) => at(WED - days(7 * weeksAgo));
  // Five weeks ago both, four weeks ago only Avery, then both for the last three weeks and this one.
  saveWeekly(db, avery, { self: "a" }, monday(5));
  saveWeekly(db, rowan, { self: "r" }, monday(5));
  saveWeekly(db, avery, { self: "a" }, monday(4));
  for (const weeksAgo of [3, 2, 1]) {
    saveWeekly(db, avery, { self: "a" }, monday(weeksAgo));
    saveWeekly(db, rowan, { self: "r" }, monday(weeksAgo));
  }
  assert.deepEqual(weeklyFacts(db, at(WED)), {
    weeksTogether: 4,
    weeksBy: { rowan: 4, avery: 5 },
    run: 3,
    bestRun: 3,
    runBy: { rowan: 3, avery: 5 },
  });

  // This week counts as soon as both are in, and an unfinished week does not break the run.
  saveWeekly(db, avery, { self: "a" }, at(WED));
  assert.equal(weeklyFacts(db, at(WED)).run, 3);
  assert.equal(weeklyFacts(db, at(WED)).runBy.avery, 6);
  saveWeekly(db, rowan, { self: "r" }, at(WED));
  assert.equal(weeklyFacts(db, at(WED)).run, 4);
  assert.equal(weeklyFacts(db, at(WED)).bestRun, 4);

  // Two weeks on with nothing new, the run is over. The best run stays.
  const later = weeklyFacts(db, at(WED + days(14)));
  assert.equal(later.run, 0);
  assert.equal(later.bestRun, 4);
  assert.equal(later.weeksTogether, 5);
  assert.doesNotMatch(JSON.stringify(later), /"self"/);
});

// From here on the engine is used as the app uses it. It keeps its own clock, so days count from today.
function tempApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slashconnect-weekly-"));
  const dataFile = path.join(dir, "db.json");
  return { app: createSlashApp({ dataFile, seedDemo: true }), dataFile };
}

async function call(app, method, url, { token, body } = {}) {
  const clientDate = new Date().toISOString().slice(0, 10);
  try {
    return await app.dispatch({ method, url, token, body: body || {}, clientDate });
  } catch (error) {
    return { status: error.status || 500, body: { error: error.message } };
  }
}

async function demoPair(app) {
  const avery = await call(app, "POST", "/api/demo/login", { body: { who: "following" } });
  const rowan = await call(app, "POST", "/api/demo/login", { body: { who: "leading" } });
  return { avery: avery.body.token, rowan: rowan.body.token, first: avery.body };
}

test("the app sends, seals, opens and celebrates a week", async () => {
  const { app, dataFile } = tempApp();
  const { avery, rowan, first } = await demoPair(app);
  const today = new Date().toISOString().slice(0, 10);
  const week = weekStart(today);
  assert.equal(first.weekly.available, true);
  assert.equal(first.weekly.state, "open");
  assert.equal(first.weekly.week, week);

  const sent = await call(app, "POST", "/api/weekly", {
    token: avery,
    body: { self: "A bit flat.", selfRating: 2, dynamic: "Good, when we talk.", dynamicRating: 4, needs: "More of your voice.", requests: ["fun", "praise"], requestNote: "A call on Saturday?" },
  });
  assert.equal(sent.status, 201);
  assert.equal(sent.body.celebration.kind, "weekly");
  assert.equal(sent.body.celebration.title, "Check-in sent");
  assert.equal(sent.body.me.points, 65 + WEEKLY_POINTS);
  assert.equal(sent.body.weekly.state, "mine-in");
  assert.equal(sent.body.weekly.mine.needs, "More of your voice.");

  const waiting = await call(app, "GET", "/api/session", { token: rowan });
  assert.equal(waiting.body.weekly.state, "partner-waiting");
  assert.equal(waiting.body.weekly.partner, null);
  assert.doesNotMatch(JSON.stringify(waiting.body.weekly), /flat|your voice|Saturday/);
  const peek = await call(app, "GET", `/api/weekly/${week}`, { token: rowan });
  assert.equal(peek.status, 200);
  assert.equal(peek.body.weekly.opened.partner, null);
  assert.equal(peek.body.weekly.opened.partnerSent, true);

  const again = await call(app, "POST", "/api/weekly", { token: avery, body: { self: "A bit flat, but lifting.", requests: ["fun"] } });
  assert.equal(again.status, 200);
  assert.equal(again.body.celebration, undefined);
  assert.equal(again.body.me.points, 65 + WEEKLY_POINTS);

  const answered = await call(app, "POST", "/api/weekly", { token: rowan, body: { self: "Stretched thin at work.", requests: ["feedback"] } });
  assert.equal(answered.status, 201);
  assert.equal(answered.body.me.carePoints, 25 + WEEKLY_CARE_POINTS);
  assert.equal(answered.body.stats.carePoints, 25 + WEEKLY_CARE_POINTS);
  assert.match(answered.body.celebration.detail, /Avery’s is in too/);
  assert.equal(answered.body.weekly.state, "both");
  assert.equal(answered.body.weekly.partner.self, "A bit flat, but lifting.");
  assert.equal(answered.body.weekly.unread, "new");
  assert.deepEqual(answered.body.weekly.asks.requests, ["fun"]);

  const read = await call(app, "POST", "/api/weekly/read", { token: rowan });
  assert.equal(read.body.weekly.unread, "");

  const told = await call(app, "GET", "/api/session", { token: avery });
  assert.equal(told.body.cheer.kind, "weekly");
  assert.equal(told.body.cheer.from, "Rowan");
  assert.equal(told.body.cheer.title, "Both check-ins are in");
  assert.match(told.body.cheer.detail, /^Rowan’s is in too\./);
  assert.equal(told.body.weekly.partner.self, "Stretched thin at work.");
  // The first week with both in is also a trophy for the shelf they share. It waits its turn.
  assert.equal(answered.body.celebration.kind, "weekly");
  assert.ok(answered.body.celebration.also.includes("On the shelf: Side by side"));
  const cleared = await call(app, "POST", "/api/cheers/seen", { token: avery, body: { ids: told.body.cheer.ids } });
  assert.equal(cleared.body.cheer.kind, "trophy");
  assert.equal(cleared.body.cheer.title, "Side by side");
  const quiet = await call(app, "POST", "/api/cheers/seen", { token: avery, body: { ids: cleared.body.cheer.ids } });
  assert.equal(quiet.body.cheer, null);

  const stored = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  assert.equal(stored.weeklies.length, 2);
  assert.ok(stored.users.every((user) => !("weekly" in user)));
});

test("the app turns away bad paths, empty check-ins and people on their own", async () => {
  const { app } = tempApp();
  const { avery } = await demoPair(app);
  const week = weekStart(new Date().toISOString().slice(0, 10));
  assert.equal((await call(app, "POST", "/api/weekly", { token: avery, body: {} })).status, 400);
  assert.equal((await call(app, "GET", `/api/weekly/${shiftDay(week, -7)}`, { token: avery })).status, 404);
  assert.equal((await call(app, "GET", `/api/weekly/${shiftDay(week, 7)}`, { token: avery })).status, 404);
  assert.equal((await call(app, "GET", "/api/weekly/everything", { token: avery })).status, 404);
  assert.equal((await call(app, "DELETE", "/api/weekly", { token: avery })).status, 404);
  assert.equal((await call(app, "POST", "/api/weekly/read/extra", { token: avery })).status, 404);
  assert.equal((await call(app, "POST", "/api/weekly", { body: { self: "No token." } })).status, 401);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slashconnect-weekly-solo-"));
  const own = createSlashApp({ dataFile: path.join(dir, "db.json"), seedDemo: false });
  const signedUp = await call(own, "POST", "/api/auth/register", { body: { email: "sam@example.com", password: "secret1", displayName: "Sam", adultConfirmed: true } });
  assert.equal(signedUp.status, 201);
  assert.equal(signedUp.body.weekly.available, false);
  const alone = await call(own, "POST", "/api/weekly", { token: signedUp.body.token, body: { self: "Anyone there?" } });
  assert.equal(alone.status, 409);
  assert.match(alone.body.error, /opens once the two of you are paired/);
});

test("the app opens a household that was saved before weekly check-ins", async () => {
  const { app, dataFile } = tempApp();
  await demoPair(app);
  const old = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  delete old.weeklies;
  let record = old;
  const reopened = createSlashApp({ seedDemo: false, store: { read: () => record, write: (next) => { record = next; } } });
  const avery = await call(reopened, "POST", "/api/demo/login", { body: { who: "following" } });
  assert.equal(avery.status, 200);
  assert.equal(avery.body.weekly.state, "open");
  assert.deepEqual(avery.body.weekly.history, []);
  const sent = await call(reopened, "POST", "/api/weekly", { token: avery.body.token, body: { selfRating: 4 } });
  assert.equal(sent.status, 201);
  assert.equal(record.weeklies.length, 1);
});

test("the app lists a past week and opens it", async () => {
  const { app, dataFile } = tempApp();
  await demoPair(app);
  const week = weekStart(new Date().toISOString().slice(0, 10));
  const lastWeek = shiftDay(week, -7);
  const saved = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  saved.weeklies = [{
    id: `${lastWeek}:demo-avery`, week: lastWeek, userId: "demo-avery", self: "Last week was loud.", selfRating: 2, dynamic: "", dynamicRating: 3,
    needs: "", requests: ["rest"], requestNote: "", createdAt: `${lastWeek}T10:00:00.000Z`, updatedAt: `${lastWeek}T10:00:00.000Z`, readAt: {}, earned: 10,
  }];
  fs.writeFileSync(dataFile, JSON.stringify(saved));
  const reopened = createSlashApp({ dataFile, seedDemo: true });
  const rowan = await call(reopened, "POST", "/api/demo/login", { body: { who: "leading" } });
  assert.deepEqual(rowan.body.weekly.history, [{ week: lastWeek, weekEnd: shiftDay(lastWeek, 6), mine: null, partner: { selfRating: 2, dynamicRating: 3 } }]);
  assert.deepEqual(rowan.body.weekly.asks.requests, ["rest"]);
  const opened = await call(reopened, "GET", `/api/weekly/${lastWeek}`, { token: rowan.body.token });
  assert.equal(opened.status, 200);
  assert.equal(opened.body.weekly.opened.mine, null);
  assert.equal(opened.body.weekly.opened.partner.self, "Last week was loud.");
  assert.equal(opened.body.me.displayName, "Rowan Hale");
});
