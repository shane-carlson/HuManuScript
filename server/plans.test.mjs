import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { createHostedApp, createMemoryStore, errorBody } from "./hosted.mjs";
import { FEATURES, HISTORY_WEEKS, allows, earlyAccessFrom, limitOf, planOf, planView, previewPlan, refusal, throughPlan, usageOf } from "./plans.mjs";
import { createSlashApp } from "./slashconnect.mjs";
import { shiftDay, weekStart } from "./weekly.mjs";

const PHOTO = `data:image/jpeg;base64,${"A".repeat(200)}`;
const today = () => new Date().toISOString().slice(0, 10);
const day = (offset) => shiftDay(today(), offset);

function tempFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "slash-plans-")), "db.json");
}

const readDb = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

/** A demo pair on disk, changed by `edit` before the engine under test opens it. */
async function household(options = {}, edit) {
  const file = tempFile();
  await createSlashApp({ dataFile: file, seedDemo: true, earlyAccess: true }).dispatch({ method: "POST", url: "/api/demo/login", body: { who: "leading" } });
  if (edit) {
    const db = readDb(file);
    edit(db);
    fs.writeFileSync(file, JSON.stringify(db));
  }
  return { file, app: createSlashApp({ dataFile: file, seedDemo: true, ...options }) };
}

async function call(app, method, url, { token, body, clientDate, actor } = {}) {
  try {
    return await app.dispatch({ method, url, token, body: body || {}, clientDate, actor });
  } catch (error) {
    if (!error.status) throw error;
    return { status: error.status, body: { error: error.message, code: error.code, feature: error.feature } };
  }
}

async function signIn(app) {
  const rowan = await call(app, "POST", "/api/demo/login", { body: { who: "leading" } });
  const avery = await call(app, "POST", "/api/demo/login", { body: { who: "following" } });
  return { rowan: rowan.body.token, avery: avery.body.token, bundle: rowan.body };
}

const stuffie = (seed = 7, extra = {}) => ({ seed, body: "pear", ears: "long", horns: "nubs", wings: "moth", tail: "pom", snout: "button", pattern: "spots", palette: "mint", eyes: "starry", accessory: "bell", name: "Biscuit", species: "a moth-winged bunny", voice: "moss", ...extra });

const daily = (templateId) => ({ templateId, repeat: "daily" });
const own = (title, extra = {}) => ({ templateId: "own-task", title, ...extra });
const reward = (title) => ({ title, cost: 10 });

function assertPlus(result, feature) {
  assert.equal(result.status, 402, `expected a Plus refusal, got ${result.status}: ${result.body.error}`);
  assert.equal(result.body.code, "plus");
  assert.equal(result.body.feature, feature);
  assert.ok(result.body.error.length > 20, "the refusal says something a person can read");
  assert.doesNotMatch(result.body.error, /upgrade|unlock|premium|!/i);
}

/** Check-ins from both partners for each of the `weeks` weeks before this one. */
function olderWeeklies(db, weeks) {
  const thisWeek = weekStart(today());
  db.weeklies = [];
  for (let back = 1; back <= weeks; back += 1) {
    const week = shiftDay(thisWeek, -7 * back);
    for (const user of db.users) {
      const at = `${shiftDay(week, 2)}T12:00:00.000Z`;
      db.weeklies.push({ id: `${week}:${user.id}`, week, userId: user.id, self: `Week ${back} for ${user.displayName}`, selfRating: 4, dynamic: "Close.", dynamicRating: 5, needs: "", requests: [], requestNote: "", createdAt: at, updatedAt: at, readAt: {}, earned: 10 });
    }
  }
}

function doneWithPhoto(db, id, daysAgo) {
  const [rowan, avery] = db.users;
  db.tasks.push({
    id,
    templateId: "selfie",
    category: "fun",
    title: "Selfie",
    summary: "",
    note: "",
    prompt: "",
    points: 10,
    bonuses: [],
    assignedBy: rowan.id,
    assignedTo: avery.id,
    status: "done",
    dueDate: "",
    createdAt: `${day(-daysAgo)}T09:00:00.000Z`,
    completedAt: `${day(-daysAgo)}T10:00:00.000Z`,
    completionDate: day(-daysAgo),
    completion: { note: "Here you go.", bonuses: [], photos: [PHOTO], checklist: [], choice: "" },
    acknowledgedAt: `${day(-daysAgo)}T11:00:00.000Z`,
  });
}

test("the table has one line per feature, and the lines that are always free say so", () => {
  const ids = FEATURES.map((feature) => feature.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const feature of FEATURES) {
    assert.ok(feature.title && feature.line, feature.id);
    assert.equal(feature.plus, true, `${feature.id}: Plus has all of everything`);
    if (feature.free !== true) assert.ok(feature.freeSays && feature.plusSays, `${feature.id} says what each plan gets`);
  }
  for (const id of ["care", "loop", "catalog", "weekly", "shelf", "looks", "pairing"]) {
    assert.equal(FEATURES.find((feature) => feature.id === id).free, true, `${id} is never behind Plus`);
  }
});

test("planOf: free by default, early access opens everything, and only a preview turns it off", () => {
  assert.deepEqual(planOf({}), { tier: "free", earlyAccess: true, effective: "plus", preview: "" });
  assert.deepEqual(planOf(undefined, { earlyAccess: false }), { tier: "free", earlyAccess: false, effective: "free", preview: "" });
  assert.deepEqual(planOf({ plan: { tier: "plus", since: "2026-01-01" } }, { earlyAccess: false }), { tier: "plus", earlyAccess: false, effective: "plus", preview: "" });
  assert.deepEqual(planOf({ plan: { tier: "free", preview: "free" } }), { tier: "free", earlyAccess: false, effective: "free", preview: "free" });
  assert.deepEqual(planOf({ plan: { tier: "free", preview: "plus" } }, { earlyAccess: false }).effective, "plus");
  assert.equal(planOf({ plan: { tier: "free", preview: "plus" } }, { earlyAccess: false, hosted: true }).effective, "free", "a hosted household cannot preview its way to Plus");
  assert.equal(planOf({ plan: { tier: "gold" } }, { earlyAccess: false }).tier, "free");
  assert.equal(planOf({ plan: "plus" }, { earlyAccess: false }).effective, "free");

  assert.equal(earlyAccessFrom(undefined), true);
  assert.equal(earlyAccessFrom(""), true);
  assert.equal(earlyAccessFrom("1"), true);
  for (const off of ["0", "off", "false", "no", " OFF "]) assert.equal(earlyAccessFrom(off), false);
});

test("allows and limitOf read the table", () => {
  const free = planOf({}, { earlyAccess: false });
  const plus = planOf({ plan: { tier: "plus" } }, { earlyAccess: false });
  assert.equal(allows(free, "stuffie-keep"), false);
  assert.equal(allows(plus, "stuffie-keep"), true);
  assert.equal(allows(free, "deep-talk"), false);
  assert.equal(allows(free, "care"), true);
  assert.equal(allows(free, "dailies"), true);
  assert.equal(allows(free, "nothing-like-this"), false);
  assert.equal(limitOf(free, "dailies"), 3);
  assert.equal(limitOf(free, "own-tasks"), 3);
  assert.equal(limitOf(free, "rewards"), 3);
  assert.equal(limitOf(free, "history"), HISTORY_WEEKS);
  assert.equal(limitOf(free, "stuffie-keep"), 0);
  assert.equal(limitOf(free, "weekly"), Infinity);
  assert.equal(limitOf(plus, "dailies"), Infinity);
});

test("a household saved before there were plans has everything while early access is on", async () => {
  const kept = process.env.SLASH_EARLY_ACCESS;
  delete process.env.SLASH_EARLY_ACCESS;
  try {
    const { app, file } = await household({}, (db) => {
      delete db.plan;
      olderWeeklies(db, 8);
      doneWithPhoto(db, "task-old-photo", 60);
    });
    const { rowan, avery, bundle } = await signIn(app);
    assert.equal(readDb(file).plan, undefined);
    assert.deepEqual(
      { tier: bundle.plan.tier, earlyAccess: bundle.plan.earlyAccess, effective: bundle.plan.effective },
      { tier: "free", earlyAccess: true, effective: "plus" },
    );
    assert.equal(bundle.plan.note, "Everything is open while SlashConnect is in testing.");
    assert.ok(bundle.plan.features.every((feature) => feature.open));

    for (const id of ["meal", "walk", "bedtime", "phone-free-air"]) {
      const made = await call(app, "POST", "/api/tasks", { token: rowan, body: daily(id) });
      assert.equal(made.status, 201, `${id}: ${made.body.error}`);
    }
    for (let index = 0; index < 5; index += 1) {
      assert.equal((await call(app, "POST", "/api/tasks", { token: rowan, body: own(`Mine ${index}`) })).status, 201);
    }
    for (let index = 0; index < 3; index += 1) {
      assert.equal((await call(app, "POST", "/api/rewards", { token: avery, body: reward(`Treat ${index}`) })).status, 201);
    }
    assert.equal((await call(app, "PATCH", "/api/profile", { token: avery, body: { stuffie: stuffie(), guideId: "custom" } })).status, 200);
    assert.equal((await call(app, "POST", "/api/guide/ask", { token: avery, body: { topic: "us" } })).status, 200);
    assert.equal((await call(app, "POST", "/api/guide/ask", { token: rowan, body: { topic: "assign" } })).status, 200);

    const after = (await call(app, "GET", "/api/session", { token: avery })).body;
    assert.equal(after.weekly.history.length, 8);
    assert.equal(after.weekly.olderWeeks, undefined);
    assert.equal(after.progress.calendar.length, 12 * 7);
    assert.equal(after.tasks.find((task) => task.id === "task-old-photo").completion.photos.length, 1);
    const oldest = after.weekly.history.at(-1).week;
    assert.equal((await call(app, "GET", `/api/weekly/${oldest}`, { token: avery })).status, 200);
  } finally {
    if (kept === undefined) delete process.env.SLASH_EARLY_ACCESS;
    else process.env.SLASH_EARLY_ACCESS = kept;
  }
});

test("SLASH_EARLY_ACCESS=0 ends early access without a code change", async () => {
  const kept = process.env.SLASH_EARLY_ACCESS;
  process.env.SLASH_EARLY_ACCESS = "0";
  try {
    const { app } = await household();
    const { bundle } = await signIn(app);
    assert.equal(bundle.plan.earlyAccess, false);
    assert.equal(bundle.plan.effective, "free");
    assert.equal(bundle.plan.note, "");
  } finally {
    if (kept === undefined) delete process.env.SLASH_EARLY_ACCESS;
    else process.env.SLASH_EARLY_ACCESS = kept;
  }
});

test("Free: a fourth daily task is refused, and the three before it are not", async () => {
  const { app } = await household({ earlyAccess: false });
  const { rowan, bundle } = await signIn(app);
  assert.equal(bundle.routines.length, 2, "the demo pair starts with two daily tasks");
  assert.equal(bundle.plan.features.find((feature) => feature.id === "dailies").usage, "2 of 3 daily tasks running");

  const third = await call(app, "POST", "/api/tasks", { token: rowan, body: daily("meal") });
  assert.equal(third.status, 201, third.body.error);
  assert.equal(third.body.plan.features.find((feature) => feature.id === "dailies").open, false);
  assertPlus(await call(app, "POST", "/api/tasks", { token: rowan, body: daily("walk") }), "dailies");

  const once = await call(app, "POST", "/api/tasks", { token: rowan, body: { templateId: "walk" } });
  assert.equal(once.status, 201, "catalog tasks given once are never counted");

  const running = once.body.tasks.find((task) => task.templateId === "meal" && task.repeat === "daily");
  assert.equal((await call(app, "POST", `/api/tasks/${running.id}/stop`, { token: rowan })).status, 200);
  assert.equal((await call(app, "POST", "/api/tasks", { token: rowan, body: daily("walk") })).status, 201, "stopping one makes room");
});

test("Free: three write-your-own tasks a week, catalog tasks without end", async () => {
  const { app } = await household({ earlyAccess: false });
  const { rowan } = await signIn(app);
  for (const title of ["Text me good morning", "Send me the view", "Wear the green jumper"]) {
    const made = await call(app, "POST", "/api/tasks", { token: rowan, body: own(title) });
    assert.equal(made.status, 201, made.body.error);
  }
  const refused = await call(app, "POST", "/api/tasks", { token: rowan, body: own("One more") });
  assertPlus(refused, "own-tasks");
  assertPlus(await call(app, "POST", "/api/tasks", { token: rowan, body: own("Every day one", { repeat: "daily" }) }), "own-tasks");

  for (const id of ["walk", "journal", "mirror", "feel-good-song", "selfie"]) {
    assert.equal((await call(app, "POST", "/api/tasks", { token: rowan, body: { templateId: id } })).status, 201, id);
  }
  const view = (await call(app, "GET", "/api/session", { token: rowan })).body.plan.features.find((feature) => feature.id === "own-tasks");
  assert.equal(view.used, 3);
  assert.equal(view.open, false);
  assert.equal(view.usage, "3 of 3 of your own written this week");
});

test("write-your-own tasks are counted by the week they were written in", () => {
  const monday = weekStart(today());
  const at = (date) => `${date}T12:00:00.000Z`;
  const db = {
    tasks: [
      { templateId: "own-task", createdAt: at(shiftDay(monday, -1)) },
      { templateId: "own-task", createdAt: at(monday) },
      { templateId: "own-task", createdAt: at(monday), routineId: "r1" },
      { templateId: "walk", createdAt: at(monday) },
    ],
    routines: [
      { id: "r1", templateId: "own-task", createdAt: at(monday), stoppedAt: null },
      { id: "r0", templateId: "own-task", createdAt: at(shiftDay(monday, -9)), stoppedAt: null },
    ],
  };
  assert.equal(usageOf(db, "own-tasks", { now: at(monday) }), 2, "this week’s one-off and this week’s daily task, once each");
  assert.equal(usageOf(db, "own-tasks", { now: at(shiftDay(monday, 7)) }), 0, "a new week starts from nothing");
  assert.equal(usageOf(db, "dailies"), 2);
  assert.equal(usageOf(db, "weekly"), null);
});

test("Free: a fourth reward is refused, and there is room again once one leaves the table", async () => {
  const { app } = await household({ earlyAccess: false });
  const { rowan, avery, bundle } = await signIn(app);
  assert.equal(bundle.rewards.length, 3);
  assertPlus(await call(app, "POST", "/api/rewards", { token: rowan, body: reward("A lie-in") }), "rewards");
  assertPlus(await call(app, "POST", "/api/rewards", { token: avery, body: reward("A lie-in") }), "rewards");

  assert.equal((await call(app, "POST", "/api/rewards/reward-breakfast/withdraw", { token: avery })).status, 200);
  const made = await call(app, "POST", "/api/rewards", { token: avery, body: reward("A lie-in") });
  assert.equal(made.status, 201, made.body.error);
  assertPlus(await call(app, "POST", "/api/rewards", { token: avery, body: reward("And another") }), "rewards");

  // A granted reward is a memory, not something on the table.
  assert.equal((await call(app, "POST", "/api/rewards/reward-note/request", { token: avery })).status, 200);
  assert.equal((await call(app, "POST", "/api/rewards/reward-note/grant", { token: rowan })).status, 200);
  assert.equal((await call(app, "POST", "/api/rewards", { token: avery, body: reward("And another") })).status, 201);
});

test("Free: a made stuffie can be rolled but not kept, and the rest of the profile still saves", async () => {
  const { app, file } = await household({ earlyAccess: false });
  const { avery } = await signIn(app);
  assertPlus(await call(app, "PATCH", "/api/profile", { token: avery, body: { displayName: "Avery Q", stuffie: stuffie(), guideId: "custom" } }), "stuffie-keep");
  const saved = readDb(file).users.find((user) => user.id === "demo-avery");
  assert.equal(saved.stuffie, undefined);
  assert.equal(saved.guideId, "pip");

  const plain = await call(app, "PATCH", "/api/profile", { token: avery, body: { displayName: "Avery Q", guideId: "moss" } });
  assert.equal(plain.status, 200);
  assert.equal(plain.body.me.displayName, "Avery Q", "the refused save left nothing half done, and this one went through");
  assert.equal(plain.body.me.guideId, "moss");
});

test("Free: everyday stuffie questions are answered, the reflective two are Plus", async () => {
  const { app } = await household({ earlyAccess: false });
  const { rowan, avery } = await signIn(app);
  for (const topic of ["status", "streak", "week", "next", "rewards", "nice", "ground"]) {
    const answer = await call(app, "POST", "/api/guide/ask", { token: avery, body: { topic } });
    assert.equal(answer.status, 200, topic);
    assert.ok(answer.body.line.text);
  }
  for (const topic of ["status", "partner", "waiting", "streak", "nice", "ground"]) {
    assert.equal((await call(app, "POST", "/api/guide/ask", { token: rowan, body: { topic } })).status, 200, topic);
  }
  assertPlus(await call(app, "POST", "/api/guide/ask", { token: avery, body: { topic: "us" } }), "deep-talk");
  assertPlus(await call(app, "POST", "/api/guide/ask", { token: rowan, body: { topic: "us" } }), "deep-talk");
  assertPlus(await call(app, "POST", "/api/guide/ask", { token: rowan, body: { topic: "assign" } }), "deep-talk");
  assertPlus(await call(app, "POST", "/api/guide/nudge", { token: rowan, body: { event: "assign" } }), "deep-talk");
  assert.equal((await call(app, "POST", "/api/guide/nudge", { token: avery, body: { event: "home" } })).status, 200);
});

test("Free: four weeks of looking back are shown, and everything older is still kept", async () => {
  const { app, file } = await household({ earlyAccess: false }, (db) => {
    olderWeeklies(db, 8);
    doneWithPhoto(db, "task-old-photo", 40);
    doneWithPhoto(db, "task-new-photo", 5);
  });
  const { avery } = await signIn(app);
  const bundle = (await call(app, "GET", "/api/session", { token: avery, clientDate: today() })).body;
  const thisWeek = weekStart(today());

  assert.equal(bundle.weekly.history.length, HISTORY_WEEKS);
  assert.equal(bundle.weekly.olderWeeks, 4);
  assert.deepEqual(bundle.weekly.history.map((item) => item.week), [1, 2, 3, 4].map((back) => shiftDay(thisWeek, -7 * back)));
  const recent = await call(app, "GET", `/api/weekly/${shiftDay(thisWeek, -28)}`, { token: avery, clientDate: today() });
  assert.equal(recent.status, 200);
  assert.match(recent.body.weekly.opened.mine.self, /Week 4/);
  assertPlus(await call(app, "GET", `/api/weekly/${shiftDay(thisWeek, -35)}`, { token: avery, clientDate: today() }), "history");
  assert.equal((await call(app, "GET", `/api/weekly/${shiftDay(thisWeek, -7 * 30)}`, { token: avery, clientDate: today() })).status, 402);

  assert.equal(bundle.progress.calendar.length, HISTORY_WEEKS * 7);
  assert.equal(bundle.progress.olderWeeks, 8);
  assert.equal(bundle.progress.calendar.at(-1).date, shiftDay(thisWeek, 6), "the calendar still ends with this week");

  const older = bundle.tasks.find((task) => task.id === "task-old-photo");
  assert.deepEqual(older.completion.photos, []);
  assert.equal(older.completion.photosKept, 1);
  assert.equal(older.completion.note, "Here you go.", "what was written is never held back");
  assert.equal(bundle.tasks.find((task) => task.id === "task-new-photo").completion.photos.length, 1);

  // Something that saves, so what is on disk is what the engine holds after presenting it.
  assert.equal((await call(app, "POST", "/api/checkins", { token: avery, body: { note: "Thinking of you." } })).status, 201);
  const kept = readDb(file);
  assert.equal(kept.weeklies.length, 16);
  assert.deepEqual(kept.tasks.find((task) => task.id === "task-old-photo").completion.photos, [PHOTO]);
  assert.equal(kept.tasks.find((task) => task.id === "task-old-photo").completion.photosKept, undefined);

  const plus = createSlashApp({ dataFile: file, earlyAccess: true });
  const again = (await call(plus, "GET", "/api/session", { token: avery, clientDate: today() })).body;
  assert.equal(again.weekly.history.length, 8, "it all comes back");
  assert.equal(again.progress.calendar.length, 12 * 7);
  assert.equal(again.tasks.find((task) => task.id === "task-old-photo").completion.photos.length, 1);
});

test("throughPlan never changes the household or the bundle it was given", () => {
  const db = { plan: { tier: "free", preview: "free" }, tasks: [], routines: [], rewards: [] };
  const task = { id: "t", completionDate: day(-90), completion: { note: "", photos: [PHOTO] } };
  const weekly = { week: weekStart(today()), history: [{ week: shiftDay(weekStart(today()), -70) }], opened: { week: shiftDay(weekStart(today()), -70) } };
  const body = { tasks: [task], weekly, progress: { calendar: Array.from({ length: 84 }, (_, index) => ({ date: String(index) })) } };
  const snapshot = JSON.stringify(body);
  const out = throughPlan(db, body, {});
  assert.equal(JSON.stringify(body), snapshot);
  assert.equal(out.tasks[0].completion.photos.length, 0);
  assert.equal(out.weekly.history.length, 0);
  assert.equal(out.weekly.opened, null);
  assert.equal(out.progress.calendar.length, 28);
  assert.equal(out.plan.effective, "free");
});

test("Plus: nothing is refused and nothing is trimmed", async () => {
  const { app } = await household({ earlyAccess: false }, (db) => {
    db.plan = { tier: "plus", since: new Date().toISOString() };
    olderWeeklies(db, 8);
    doneWithPhoto(db, "task-old-photo", 40);
  });
  const { rowan, avery, bundle } = await signIn(app);
  assert.deepEqual(
    { tier: bundle.plan.tier, earlyAccess: bundle.plan.earlyAccess, effective: bundle.plan.effective },
    { tier: "plus", earlyAccess: false, effective: "plus" },
  );
  for (const id of ["meal", "walk", "bedtime"]) assert.equal((await call(app, "POST", "/api/tasks", { token: rowan, body: daily(id) })).status, 201, id);
  for (let index = 0; index < 5; index += 1) assert.equal((await call(app, "POST", "/api/tasks", { token: rowan, body: own(`Mine ${index}`) })).status, 201);
  for (let index = 0; index < 3; index += 1) assert.equal((await call(app, "POST", "/api/rewards", { token: avery, body: reward(`Treat ${index}`) })).status, 201);
  assert.equal((await call(app, "PATCH", "/api/profile", { token: avery, body: { stuffie: stuffie(), guideId: "custom" } })).status, 200);
  assert.equal((await call(app, "POST", "/api/guide/ask", { token: avery, body: { topic: "us" } })).status, 200);
  assert.equal((await call(app, "POST", "/api/guide/ask", { token: rowan, body: { topic: "assign" } })).status, 200);
  const after = (await call(app, "GET", "/api/session", { token: avery, clientDate: today() })).body;
  assert.equal(after.weekly.history.length, 8);
  assert.equal(after.progress.calendar.length, 84);
  assert.equal(after.tasks.find((task) => task.id === "task-old-photo").completion.photos.length, 1);
  assert.equal((await call(app, "GET", `/api/weekly/${after.weekly.history.at(-1).week}`, { token: avery, clientDate: today() })).status, 200);
});

test("moving to Free keeps everything a couple already made, and only stops more being added", async () => {
  const { app: open, file } = await household({ earlyAccess: true });
  const first = await signIn(open);
  for (const id of ["meal", "walk", "bedtime"]) assert.equal((await call(open, "POST", "/api/tasks", { token: first.rowan, body: daily(id) })).status, 201, id);
  for (let index = 0; index < 2; index += 1) assert.equal((await call(open, "POST", "/api/rewards", { token: first.avery, body: reward(`Treat ${index}`) })).status, 201);
  assert.equal((await call(open, "PATCH", "/api/profile", { token: first.avery, body: { stuffie: stuffie(), guideId: "custom" } })).status, 200);

  const free = createSlashApp({ dataFile: file, earlyAccess: false });
  const { rowan, avery } = first;
  const bundle = (await call(free, "GET", "/api/session", { token: avery, clientDate: today() })).body;
  assert.equal(bundle.plan.effective, "free");
  assert.equal(bundle.routines.length, 5);
  assert.equal(bundle.rewards.length, 5);
  assert.equal(bundle.me.guideId, "custom");
  assert.equal(bundle.me.stuffie.name, "Biscuit");
  assert.equal(bundle.guide.name, "Biscuit", "the kept stuffie still does the talking");
  assert.equal(bundle.plan.features.find((feature) => feature.id === "dailies").usage, "5 daily tasks running. They all stay.");

  // All five come back tomorrow, as daily tasks do.
  const tomorrow = (await call(free, "GET", "/api/session", { token: avery, clientDate: day(1) })).body;
  assert.equal(tomorrow.tasks.filter((task) => task.repeat === "daily" && task.status === "open").length, 5);

  assertPlus(await call(free, "POST", "/api/tasks", { token: rowan, body: daily("phone-free-air") }), "dailies");
  assertPlus(await call(free, "POST", "/api/rewards", { token: rowan, body: reward("One more") }), "rewards");

  // The extra rewards still work all the way through.
  const extra = bundle.rewards.find((item) => item.title === "Treat 1");
  assert.equal((await call(free, "POST", `/api/rewards/${extra.id}/agree`, { token: rowan })).status, 200);
  assert.equal((await call(free, "POST", `/api/rewards/${extra.id}/request`, { token: avery })).status, 200);
  assert.equal((await call(free, "POST", `/api/rewards/${extra.id}/grant`, { token: rowan })).status, 200);

  // The kept stuffie can be renamed, given a new temperament, set aside and picked again. A different one cannot be kept.
  const renamed = await call(free, "PATCH", "/api/profile", { token: avery, body: { stuffie: stuffie(7, { name: "Crumpet", voice: "sol" }), guideId: "custom" } });
  assert.equal(renamed.status, 200, renamed.body.error);
  assert.equal(renamed.body.me.stuffie.name, "Crumpet");
  assert.equal((await call(free, "PATCH", "/api/profile", { token: avery, body: { guideId: "lumen" } })).status, 200);
  assert.equal((await call(free, "PATCH", "/api/profile", { token: avery, body: { guideId: "custom" } })).body.me.guideId, "custom");
  const swapped = await call(free, "PATCH", "/api/profile", { token: avery, body: { stuffie: stuffie(99, { ears: "leaf" }), guideId: "custom" } });
  assertPlus(swapped, "stuffie-keep");
  assert.match(swapped.body.error, /Crumpet/);
  assert.equal(readDb(file).users.find((user) => user.id === "demo-avery").stuffie.seed, 7);
});

test("on this computer either partner can try Free, and it is one plan for the two of them", async () => {
  const { app, file } = await household({ earlyAccess: true });
  const { rowan, avery, bundle } = await signIn(app);
  assert.equal(bundle.plan.canSwitch, true);

  const toFree = await call(app, "POST", "/api/plan", { token: avery, body: { plan: "free" } });
  assert.equal(toFree.status, 200);
  assert.deepEqual(
    { tier: toFree.body.plan.tier, earlyAccess: toFree.body.plan.earlyAccess, effective: toFree.body.plan.effective, preview: toFree.body.plan.preview },
    { tier: "free", earlyAccess: false, effective: "free", preview: "free" },
  );
  assert.equal(toFree.body.plan.note, "");
  const partner = (await call(app, "GET", "/api/session", { token: rowan })).body;
  assert.equal(partner.plan.effective, "free", "Rowan is on the plan Avery switched to");
  assertPlus(await call(app, "POST", "/api/rewards", { token: rowan, body: reward("A lie-in") }), "rewards");

  const back = await call(app, "POST", "/api/plan", { token: rowan, body: { plan: "plus" } });
  assert.equal(back.status, 200);
  assert.deepEqual(
    { tier: back.body.plan.tier, earlyAccess: back.body.plan.earlyAccess, effective: back.body.plan.effective, preview: back.body.plan.preview },
    { tier: "free", earlyAccess: true, effective: "plus", preview: "" },
  );
  assert.equal((await call(app, "POST", "/api/rewards", { token: avery, body: reward("A lie-in") })).status, 201);
  assert.equal(readDb(file).plan.tier, "free", "trying a plan out never writes a paid tier");

  assert.equal((await call(app, "POST", "/api/plan", { token: rowan, body: { plan: "gold" } })).status, 400);
  assert.equal((await call(app, "POST", "/api/plan", { token: rowan, body: { tier: "plus" } })).status, 400);
  assert.equal((await call(app, "POST", "/api/plan", { body: { plan: "free" } })).status, 401);
});

test("with early access switched off, the switch still shows both plans", async () => {
  const { app, file } = await household({ earlyAccess: false });
  const { rowan } = await signIn(app);
  const plus = await call(app, "POST", "/api/plan", { token: rowan, body: { plan: "plus" } });
  assert.deepEqual(
    { tier: plus.body.plan.tier, earlyAccess: plus.body.plan.earlyAccess, effective: plus.body.plan.effective, preview: plus.body.plan.preview },
    { tier: "free", earlyAccess: false, effective: "plus", preview: "plus" },
  );
  assert.equal(readDb(file).plan.tier, "free");
  const free = await call(app, "POST", "/api/plan", { token: rowan, body: { plan: "free" } });
  assert.equal(free.body.plan.effective, "free");

  const db = { plan: { tier: "plus", since: "2026-01-01T00:00:00.000Z" } };
  assert.equal(previewPlan(db, "plus", { earlyAccess: false }), true);
  assert.deepEqual(db.plan, { tier: "plus", since: "2026-01-01T00:00:00.000Z" }, "a household that holds Plus keeps it through a preview");
  assert.equal(previewPlan(db, "", {}), false);
});

test("a hosted household cannot switch plans, and each household has its own", async () => {
  const kept = process.env.SLASH_EARLY_ACCESS;
  process.env.SLASH_EARLY_ACCESS = "0";
  try {
    const store = createMemoryStore();
    const tokens = new Map();
    const hosted = createHostedApp({ store, verifyToken: async (token) => tokens.get(token) || null });
    const profile = (side, roleTitle) => ({
      pronouns: { label: "they/them", subject: "they", object: "them", possessive: "their", reflexive: "themself" },
      slashSide: side,
      roleTitle,
      goals: ["connection"],
      guideId: "moss",
      onboardingComplete: true,
    });
    const join = async (name, inviteCode) => {
      const token = `token-${name}`;
      tokens.set(token, { uid: `uid${name}`, email: `${name.toLowerCase()}@example.com`, emailVerified: true });
      const made = await call(hosted, "POST", "/api/auth/register", { token, body: { displayName: name, adultConfirmed: true, inviteCode } });
      assert.equal(made.status, 201, made.body.error);
      return token;
    };
    const couple = async (leadName, followName) => {
      const lead = await join(leadName);
      await call(hosted, "PATCH", "/api/profile", { token: lead, body: profile("leading", "Sir") });
      const code = (await call(hosted, "POST", "/api/invites", { token: lead, body: {} })).body.invite.code;
      const follow = await join(followName, code);
      await call(hosted, "PATCH", "/api/profile", { token: follow, body: profile("following", "Pet") });
      return { lead, follow };
    };
    const first = await couple("Ash", "Bea");
    const second = await couple("Cal", "Dee");

    const mine = (await call(hosted, "GET", "/api/session", { token: first.lead })).body;
    assert.equal(mine.plan.canSwitch, false);
    assert.equal(mine.plan.effective, "free");
    for (const body of [{ plan: "plus" }, { plan: "free" }]) {
      const tried = await call(hosted, "POST", "/api/plan", { token: first.lead, body });
      assert.equal(tried.status, 404);
    }
    const sneaky = await call(hosted, "PATCH", "/api/profile", { token: first.lead, body: { plan: { tier: "plus" }, tier: "plus" } });
    assert.equal(sneaky.body.plan.effective, "free", "no route takes a tier from the app");

    // What a verified purchase will do one day: the server writes the household's plan.
    const key = store.keys().find((item) => /^households\/[a-f0-9]+$/.test(item) && store.read(item).users.some((user) => user.displayName === "Ash"));
    store.records.set(key, JSON.stringify({ ...store.read(key), plan: { tier: "plus", since: new Date().toISOString() } }));

    assert.equal((await call(hosted, "GET", "/api/session", { token: first.lead })).body.plan.effective, "plus");
    assert.equal((await call(hosted, "GET", "/api/session", { token: first.follow })).body.plan.effective, "plus", "one Plus covers both partners");
    assert.equal((await call(hosted, "GET", "/api/session", { token: second.lead })).body.plan.effective, "free", "and nobody else");
    assert.equal((await call(hosted, "POST", "/api/guide/ask", { token: first.follow, body: { topic: "us" } })).status, 200);

    // What the app is sent when a hosted household meets a limit.
    let thrown = null;
    try {
      await hosted.dispatch({ method: "POST", url: "/api/guide/ask", token: second.follow, body: { topic: "us" } });
    } catch (error) {
      thrown = error;
    }
    assert.equal(thrown.status, 402);
    const sent = errorBody(thrown);
    assert.equal(sent.code, "plus");
    assert.match(sent.error, /Plus/);

    // A preview of Plus left in a record is not Plus on a hosted server.
    const other = store.keys().find((item) => /^households\/[a-f0-9]+$/.test(item) && item !== key);
    store.records.set(other, JSON.stringify({ ...store.read(other), plan: { tier: "free", preview: "plus" } }));
    assert.equal((await call(hosted, "GET", "/api/session", { token: second.lead })).body.plan.effective, "free");
  } finally {
    if (kept === undefined) delete process.env.SLASH_EARLY_ACCESS;
    else process.env.SLASH_EARLY_ACCESS = kept;
  }
});

test("a hosted household is in early access by default", async () => {
  const kept = process.env.SLASH_EARLY_ACCESS;
  delete process.env.SLASH_EARLY_ACCESS;
  try {
    let db = { users: [{ id: "u1", displayName: "Ash", slashSide: "leading", goals: [] }], sessions: [], pair: null, invites: [], tasks: [], routines: [], goals: [], rewards: [], checkins: [], weeklies: [] };
    const engine = createSlashApp({ hosted: true, store: { read: () => db, write(next) { db = next; } } });
    const bundle = (await call(engine, "GET", "/api/session", { actor: { userId: "u1" } })).body;
    assert.deepEqual(
      { tier: bundle.plan.tier, earlyAccess: bundle.plan.earlyAccess, effective: bundle.plan.effective, canSwitch: bundle.plan.canSwitch },
      { tier: "free", earlyAccess: true, effective: "plus", canSwitch: false },
    );
    assert.equal((await call(engine, "POST", "/api/plan", { actor: { userId: "u1" }, body: { plan: "free" } })).status, 404);
    assert.equal(db.plan, undefined);
  } finally {
    if (kept !== undefined) process.env.SLASH_EARLY_ACCESS = kept;
  }
});

test("the local server sends the code and the feature with a refusal", async () => {
  const { app } = await household({ earlyAccess: false });
  const { avery } = await signIn(app);
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify({ topic: "us" }))]), {
    method: "POST",
    url: "/api/guide/ask",
    headers: { authorization: `Bearer ${avery}`, "content-type": "application/json" },
  });
  const sent = await new Promise((resolve) => {
    const res = {
      status: 0,
      writeHead(status) {
        this.status = status;
      },
      end(payload) {
        resolve({ status: this.status, body: JSON.parse(payload) });
      },
    };
    void app.handle(req, res);
  });
  assert.equal(sent.status, 402);
  assert.equal(sent.body.code, "plus");
  assert.equal(sent.body.feature, "deep-talk");
  assert.match(sent.body.error, /heart-to-heart/);
});

test("planView counts usage for whoever is looking, and refusal is quiet when there is room", () => {
  const db = { routines: [{ stoppedAt: null }, { stoppedAt: "2026-01-01" }], rewards: [{ status: "agreed" }, { status: "granted" }], tasks: [] };
  const view = planView(db, { earlyAccess: false });
  const line = (id) => view.features.find((feature) => feature.id === id);
  assert.equal(line("dailies").usage, "1 of 3 daily tasks running");
  assert.equal(line("rewards").usage, "1 of 3 rewards on the table");
  assert.equal(line("own-tasks").usage, "0 of 3 of your own written this week");
  assert.equal(line("stuffie-keep").open, false);
  assert.equal(line("history").open, false);
  assert.equal(line("care").always, true);
  assert.equal(line("care").open, true);
  const free = planOf(db, { earlyAccess: false });
  assert.equal(refusal(db, free, "dailies"), null);
  assert.equal(refusal(db, free, "rewards"), null);
  assert.equal(refusal(db, free, "deep-talk", { user: { slashSide: "following" }, topic: "assign" }), null);
  assert.equal(refusal(db, free, "stuffie-keep", { user: {}, stuffie: undefined }), null);
  assert.equal(refusal(db, free, "history", { week: "read" }), null);
  assert.equal(refusal(db, free, "care"), null);
});
