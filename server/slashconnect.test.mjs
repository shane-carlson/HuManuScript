import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { TEMPLATES, coachingFor, drawAdventureTasks, guideSpeech, levelFor } from "./catalog.mjs";
import { createSlashApp } from "./slashconnect.mjs";

function tempApp(seedDemo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slashconnect-"));
  return createSlashApp({ dataFile: path.join(dir, "db.json"), seedDemo });
}

// The demo pair is seeded on the real calendar, so the tests count days from today.
function day(offset) {
  return new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
}

async function call(app, method, url, { token, body, clientDate } = {}) {
  try {
    return await app.dispatch({ method, url, token, body: body || {}, clientDate });
  } catch (error) {
    return { status: error.status || 500, body: { error: error.message } };
  }
}

function nextDay(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

test("levels move at the published thresholds", () => {
  assert.equal(levelFor(0).name, "Spark");
  assert.equal(levelFor(300).name, "Glow");
  assert.equal(levelFor(799).name, "Glow");
  assert.equal(levelFor(800).name, "Flame");
  assert.equal(levelFor(13500).progress, 1);
});

test("anal coaching follows experience and stays short", () => {
  const fresh = coachingFor("anal-training", "new");
  const practiced = coachingFor("anal-training", "experienced");
  assert.ok(fresh.length >= 3);
  assert.notDeepEqual(fresh, practiced);
  assert.equal(coachingFor("journal", "new").length, 0);
});

test("a stuffie talks to each side of the slash and never counts a streak of zero", () => {
  const ctx = { name: "Avery", partner: "Rowan", streak: 4, points: 65, tick: 0 };
  const following = guideSpeech("lumen", "home", { ...ctx, side: "following" });
  const leading = guideSpeech("lumen", "home", { ...ctx, name: "Rowan", partner: "Avery", side: "leading" });
  assert.notEqual(following.text, leading.text);
  assert.match(leading.text, /Avery/);
  assert.match(guideSpeech("sol", "streak", { ...ctx, side: "following" }).text, /4/);
  for (const id of ["lumen", "pip", "moss", "sol"]) {
    const none = guideSpeech(id, "streak", { ...ctx, streak: 0, side: "following" }).text;
    assert.match(none, /No streak yet/);
    assert.doesNotMatch(none, /\d/);
    for (const event of ["home", "done", "streak", "ground", "nudge", "assign"]) {
      for (const side of ["leading", "following"]) {
        for (const tick of [0, 1, 2]) {
          const line = guideSpeech(id, event, { ...ctx, partner: "your partner", side, tick }).text;
          assert.doesNotMatch(line, /[{}]/);
          assert.match(line, /^[A-Z0-9]/);
        }
      }
    }
  }
  assert.equal(guideSpeech("nobody", "home", ctx).guideId, "lumen");
});

test("the stash note is worded for whoever is reading it", async () => {
  const app = tempApp(true);
  const avery = await call(app, "POST", "/api/demo/login", { body: { who: "following" } });
  const rowan = await call(app, "POST", "/api/demo/login", { body: { who: "leading" } });
  const mine = avery.body.tasks.find((task) => task.id === "task-shower");
  const theirs = rowan.body.tasks.find((task) => task.id === "task-shower");
  assert.match(mine.supplyNote, /^From your stash/);
  assert.match(theirs.supplyNote, /^In their stash/);
});

test("demo pair can be entered from either side and keeps pronouns", async () => {
  const app = tempApp(true);
  const leading = await call(app, "POST", "/api/demo/login", { body: { who: "leading" } });
  assert.equal(leading.status, 200);
  assert.equal(leading.body.me.displayName, "Rowan Hale");
  assert.equal(leading.body.me.pronouns.label, "she/her");
  assert.equal(leading.body.me.roleTitle, "Domme");
  assert.equal(leading.body.me.gender, "woman");
  assert.equal(leading.body.partner.pronouns.label, "they/them");
  assert.equal(leading.body.partner.roleTitle, "Little");
  assert.equal(leading.body.stats.streak, 4);
  assert.ok(leading.body.tasks.some((task) => task.status === "open"));

  const following = await call(app, "POST", "/api/demo/login", { body: { who: "following" } });
  assert.equal(following.body.me.displayName, "Avery Quinn");
  assert.equal(following.body.me.adultConfirmed, true);
});

test("a household holds exactly two people", async () => {
  const demo = tempApp(true);
  const blocked = await call(demo, "POST", "/api/auth/register", {
    body: { email: "third@example.com", password: "secret1", displayName: "Third", adultConfirmed: true },
  });
  assert.equal(blocked.status, 409);

  const app = tempApp(false);
  const underage = await call(app, "POST", "/api/auth/register", {
    body: { email: "a@example.com", password: "secret1", displayName: "A", adultConfirmed: false },
  });
  assert.equal(underage.status, 400);

  const first = await call(app, "POST", "/api/auth/register", {
    body: { email: "ada@example.com", password: "secret1", displayName: "Ada", adultConfirmed: true },
  });
  assert.equal(first.status, 201);
  const second = await call(app, "POST", "/api/auth/register", {
    body: { email: "boe@example.com", password: "secret1", displayName: "Boe", adultConfirmed: true },
  });
  assert.equal(second.status, 201);
  const third = await call(app, "POST", "/api/auth/register", {
    body: { email: "cy@example.com", password: "secret1", displayName: "Cy", adultConfirmed: true },
  });
  assert.equal(third.status, 409);
});

test("invite connects the pair and rejects a matching slash side", async () => {
  const app = tempApp(false);
  const host = await call(app, "POST", "/api/auth/register", {
    body: { email: "host@example.com", password: "secret1", displayName: "Host", adultConfirmed: true },
  });
  const hostToken = host.body.token;
  const profile = await call(app, "PATCH", "/api/profile", {
    token: hostToken,
    body: {
      pronouns: { label: "he/him", subject: "he", object: "him", possessive: "his", reflexive: "himself" },
      gender: "man",
      slashSide: "leading",
      roleTitle: "Daddy",
      goals: ["connection", "structure"],
      guideId: "lumen",
      onboardingComplete: true,
    },
  });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.me.roleTitle, "Daddy");
  assert.equal(profile.body.me.pronouns.subject, "he");

  const invite = await call(app, "POST", "/api/invites", { token: hostToken, body: { channel: "email", contact: "guest@example.com" } });
  assert.equal(invite.status, 201);
  const code = invite.body.invite.code;
  const preview = await call(app, "GET", `/api/invites/preview?code=${code}`);
  assert.equal(preview.body.fromName, "Host");
  assert.equal(preview.body.pronouns, "he/him");

  const clash = await call(app, "POST", "/api/auth/register", {
    body: {
      email: "guest@example.com",
      password: "secret1",
      displayName: "Guest",
      adultConfirmed: true,
      inviteCode: code,
      slashSide: "leading",
    },
  });
  assert.equal(clash.status, 201, clash.body.error);
  const forced = await call(app, "PATCH", "/api/profile", {
    token: clash.body.token,
    body: { slashSide: "leading" },
  });
  assert.equal(forced.status, 409);

  assert.equal(clash.body.partner.displayName, "Host");
  assert.equal(clash.body.me.slashSide, "following");
});

test("today's adventure stays sealed until the categories lock the tasks in", async () => {
  const app = tempApp(true);
  const avery = await call(app, "POST", "/api/demo/login", { body: { who: "following" } });
  const rowan = await call(app, "POST", "/api/demo/login", { body: { who: "leading" } });
  assert.equal(avery.body.meta.templates.length, 0);
  assert.ok(avery.body.meta.seals.length >= 4);
  assert.ok(avery.body.meta.seals.every((seal) => !seal.title));
  const sealed = avery.body.tasks.find((task) => task.id === "task-adventure");
  assert.equal(sealed.adventure.stage, "sealed");
  assert.deepEqual(sealed.adventure.locked, []);
  assert.equal(sealed.summary.includes("Hot shower"), false);

  const tooMany = await call(app, "POST", "/api/tasks/task-adventure/lock", {
    token: avery.body.token,
    body: { categories: ["self-care", "fun", "spicy", "grounding"], clientDate: day(0) },
  });
  assert.equal(tooMany.status, 400);

  const leader = await call(app, "POST", "/api/tasks/task-adventure/lock", {
    token: rowan.body.token,
    body: { categories: ["fun"], clientDate: day(0) },
  });
  assert.equal(leader.status, 403);

  const locked = await call(app, "POST", "/api/tasks/task-adventure/lock", {
    token: avery.body.token,
    body: { categories: ["fun", "grounding"], clientDate: day(0) },
  });
  assert.equal(locked.status, 200, locked.body.error);
  assert.equal(locked.body.celebration.title, "Locked in");
  const adventure = locked.body.tasks.find((task) => task.id === "task-adventure");
  assert.equal(adventure.status, "done");
  assert.equal(adventure.adventure.stage, "locked");
  assert.deepEqual(adventure.adventure.categories, ["fun", "grounding"]);
  assert.equal(adventure.adventure.locked.length, 2);
  for (const item of adventure.adventure.locked) {
    assert.ok(item.category === "fun" || item.category === "grounding");
    const task = locked.body.tasks.find((entry) => entry.id === item.taskId);
    assert.equal(task.status, "open");
    assert.equal(task.category, item.category);
    assert.equal(task.title, item.title);
  }
  const again = await call(app, "POST", "/api/tasks/task-adventure/lock", {
    token: avery.body.token,
    body: { categories: ["self-care"], clientDate: day(0) },
  });
  assert.equal(again.status, 409);
  const restart = await call(app, "POST", "/api/adventure/start", {
    token: avery.body.token,
    body: { clientDate: day(0) },
  });
  assert.equal(restart.status, 409);
});

test("a daily task comes back each day of the following partner and a one-time task does not", async () => {
  const app = tempApp(true);
  const avery = (await call(app, "POST", "/api/demo/login", { body: { who: "following" } })).body.token;
  const rowan = (await call(app, "POST", "/api/demo/login", { body: { who: "leading" } })).body.token;
  const asAvery = (day) => call(app, "GET", "/api/session", { token: avery, clientDate: day });
  const vitamins = (bundle) => bundle.tasks.filter((task) => task.title === "Take your vitamins");

  const refused = await call(app, "POST", "/api/tasks", { token: avery, body: { templateId: "meds", repeat: "daily" } });
  assert.equal(refused.status, 403);
  const adventure = await call(app, "POST", "/api/tasks", { token: rowan, body: { templateId: "daily-adventure", repeat: "daily" } });
  assert.equal(adventure.status, 400);

  const once = await call(app, "POST", "/api/tasks", { token: rowan, body: { templateId: "walk" } });
  assert.equal(once.body.task.repeat, "once");
  const routinesBefore = once.body.routines.length;

  const given = await call(app, "POST", "/api/tasks", {
    token: rowan,
    body: { templateId: "meds", title: "Take your vitamins", note: "With breakfast.", repeat: "daily", dueDate: day(46) },
  });
  assert.equal(given.status, 201, given.body.error);
  assert.equal(given.body.task.repeat, "daily");
  assert.equal(given.body.task.dueDate, "");
  assert.equal(given.body.routines.length, routinesBefore + 1);

  const monday = await asAvery(day(0));
  assert.equal(vitamins(monday.body).length, 1);
  const first = vitamins(monday.body)[0];
  assert.equal(first.status, "open");
  assert.equal(first.note, "With breakfast.");

  const done = await call(app, "POST", `/api/tasks/${first.id}/complete`, { token: avery, body: { clientDate: day(0) } });
  assert.equal(done.status, 200, done.body.error);
  assert.equal(vitamins(done.body).length, 1);
  assert.equal(vitamins((await asAvery(day(0))).body).length, 1);

  // Rowan is a day ahead. Her clock does not hand Avery tomorrow's task early.
  const ahead = await call(app, "GET", "/api/session", { token: rowan, clientDate: day(1) });
  assert.equal(vitamins(ahead.body).filter((task) => task.status === "open").length, 0);
  assert.equal(ahead.body.routines.find((item) => item.title === "Take your vitamins").status, "done");

  const tuesday = await asAvery(day(1));
  assert.equal(vitamins(tuesday.body).length, 2);
  const second = vitamins(tuesday.body).find((task) => task.status === "open");
  assert.equal(second.day, day(1));
  assert.notEqual(second.id, first.id);

  // Left undone, it carries over as the same task. It does not pile up.
  const thursday = await asAvery(day(3));
  assert.equal(vitamins(thursday.body).length, 2);
  assert.equal(vitamins(thursday.body).find((task) => task.status === "open").id, second.id);

  const passed = await call(app, "POST", `/api/tasks/${second.id}/skip`, { token: avery, body: {}, clientDate: day(3) });
  assert.equal(vitamins(passed.body).find((task) => task.id === second.id).status, "skipped");
  assert.equal(vitamins((await asAvery(day(3))).body).length, 2);
  const friday = await asAvery(day(4));
  const third = vitamins(friday.body).find((task) => task.status === "open");
  assert.ok(third);

  const notHers = await call(app, "POST", `/api/tasks/${third.id}/stop`, { token: avery, clientDate: day(4) });
  assert.equal(notHers.status, 403);
  const stopped = await call(app, "POST", `/api/tasks/${third.id}/stop`, { token: rowan });
  assert.equal(stopped.status, 200, stopped.body.error);
  assert.equal(stopped.body.routines.some((item) => item.title === "Take your vitamins"), false);
  const later = await asAvery(day(11));
  assert.equal(vitamins(later.body).length, 2);
  assert.equal(vitamins(later.body).every((task) => task.status !== "open" && task.routineActive === false), true);

  const reloaded = createSlashApp({ dataFile: app.dataFile, seedDemo: false });
  const after = await call(reloaded, "GET", "/api/session", { token: avery, clientDate: day(12) });
  assert.equal(vitamins(after.body).length, 2);
  assert.ok(after.body.routines.some((item) => item.title === "Drink your water"));
});

test("the leading partner can write a task of their own", async () => {
  const app = tempApp(true);
  const avery = (await call(app, "POST", "/api/demo/login", { body: { who: "following" } })).body.token;
  const rowan = (await call(app, "POST", "/api/demo/login", { body: { who: "leading" } })).body.token;

  const nameless = await call(app, "POST", "/api/tasks", { token: rowan, body: { templateId: "own-task" } });
  assert.equal(nameless.status, 400);

  const own = await call(app, "POST", "/api/tasks", {
    token: rowan,
    body: { templateId: "own-task", title: "Text me good morning", category: "fun", repeat: "daily" },
  });
  assert.equal(own.status, 201, own.body.error);
  assert.equal(own.body.task.category, "fun");
  assert.equal(own.body.task.summary, "");
  assert.equal(own.body.task.consent, false);
  const sent = await call(app, "POST", `/api/tasks/${own.body.task.id}/complete`, { token: avery, body: { clientDate: day(0) } });
  assert.equal(sent.status, 200, sent.body.error);

  const spicy = await call(app, "POST", "/api/tasks", {
    token: rowan,
    body: { templateId: "own-task", title: "Wear the red set on our call", category: "spicy" },
  });
  assert.equal(spicy.body.task.consent, true);
  const unsaid = await call(app, "POST", `/api/tasks/${spicy.body.task.id}/complete`, { token: avery, body: { clientDate: day(0) } });
  assert.equal(unsaid.status, 400);
  const said = await call(app, "POST", `/api/tasks/${spicy.body.task.id}/complete`, { token: avery, body: { clientDate: day(0), consent: true } });
  assert.equal(said.status, 200, said.body.error);
});

test("today’s adventure never draws an everyday habit or a blank task", () => {
  const hidden = TEMPLATES.filter((item) => item.habit || item.custom).map((item) => item.id);
  assert.ok(hidden.includes("water") && hidden.includes("meds") && hidden.includes("own-task"));
  for (let step = 0; step < 40; step += 1) {
    const drawn = drawAdventureTasks(["self-care"], { random: () => step / 40 });
    assert.equal(hidden.includes(drawn[0].id), false);
  }
});

test("a well done waits for the following partner until their app has shown it", async () => {
  const app = tempApp(true);
  const avery = (await call(app, "POST", "/api/demo/login", { body: { who: "following" } })).body.token;
  const rowan = (await call(app, "POST", "/api/demo/login", { body: { who: "leading" } })).body.token;
  const session = (token) => call(app, "GET", "/api/session", { token });

  assert.equal((await session(avery)).body.cheer, null);
  const water = await call(app, "POST", "/api/tasks/task-water/log", { token: avery, body: { amount: 48, clientDate: day(0) } });
  assert.equal(water.body.celebration.kind, "task");
  await call(app, "POST", "/api/tasks/task-meds/complete", { token: avery, body: { clientDate: day(0) } });

  const selfPraise = await call(app, "POST", "/api/tasks/task-water/acknowledge", { token: avery });
  assert.equal(selfPraise.status, 403);
  assert.equal((await session(avery)).body.cheer, null);

  const said = await call(app, "POST", "/api/tasks/task-water/acknowledge", { token: rowan });
  assert.equal(said.status, 200, said.body.error);
  assert.equal(said.body.cheer, null);
  assert.equal(said.body.partner.cheers, undefined);
  await call(app, "POST", "/api/tasks/task-water/acknowledge", { token: rowan });

  const one = (await session(avery)).body.cheer;
  assert.equal(one.kind, "praise");
  assert.equal(one.from, "Rowan");
  assert.equal(one.title, "Well done");
  assert.equal(one.detail, "Rowan saw you finish “Drink your water”.");
  assert.equal(one.ids.length, 1);

  // A second well done joins the first, and it is still there after a restart.
  await call(app, "POST", "/api/tasks/task-meds/acknowledge", { token: rowan });
  const reloaded = createSlashApp({ dataFile: app.dataFile, seedDemo: false });
  const both = (await call(reloaded, "GET", "/api/session", { token: avery })).body.cheer;
  assert.equal(both.ids.length, 2);
  assert.equal(both.detail, "Rowan saw you finish “Drink your water” and “Take your meds”.");

  const notMine = await call(reloaded, "POST", "/api/cheers/seen", { token: rowan, body: { ids: both.ids } });
  assert.equal(notMine.status, 200);
  assert.equal((await call(reloaded, "GET", "/api/session", { token: avery })).body.cheer.ids.length, 2);

  const seen = await call(reloaded, "POST", "/api/cheers/seen", { token: avery, body: { ids: both.ids } });
  assert.equal(seen.body.cheer, null);
  assert.equal((await call(reloaded, "GET", "/api/session", { token: avery })).body.cheer, null);
});

test("a granted reward is waiting for the partner who cashed it in", async () => {
  const app = tempApp(true);
  const avery = (await call(app, "POST", "/api/demo/login", { body: { who: "following" } })).body.token;
  const rowan = (await call(app, "POST", "/api/demo/login", { body: { who: "leading" } })).body.token;
  const made = await call(app, "POST", "/api/rewards", { token: avery, body: { title: "Movie night, my pick", cost: 20 } });
  const reward = made.body.rewards.find((item) => item.title === "Movie night, my pick");
  await call(app, "POST", `/api/rewards/${reward.id}/agree`, { token: rowan });
  await call(app, "POST", `/api/rewards/${reward.id}/request`, { token: avery });
  const granted = await call(app, "POST", `/api/rewards/${reward.id}/grant`, { token: rowan });
  assert.equal(granted.status, 200, granted.body.error);
  assert.equal(granted.body.celebration.kind, "reward");
  const waiting = (await call(app, "GET", "/api/session", { token: avery })).body.cheer;
  assert.equal(waiting.kind, "reward");
  assert.equal(waiting.title, "Movie night, my pick");
  assert.equal(waiting.detail, "Rowan said yes. Enjoy it.");
});

test("task text names the leading partner by the role title they chose", async () => {
  const app = tempApp(true);
  const avery = (await call(app, "POST", "/api/demo/login", { body: { who: "following" } })).body.token;
  const rowan = (await call(app, "POST", "/api/demo/login", { body: { who: "leading" } })).body.token;
  const taskFor = (bundle, id) => bundle.tasks.find((task) => task.id === id);

  const first = (await call(app, "GET", "/api/session", { token: avery })).body;
  assert.equal(first.partner.roleTitle, "Domme");
  assert.equal(taskFor(first, "task-water").summary, "Sip it through the day and log each drink as you go. Your Domme set the amount.");
  assert.equal(JSON.stringify(first).includes("D‑type"), false);
  assert.equal(JSON.stringify(first).includes("{lead}"), false);

  const leading = (await call(app, "GET", "/api/session", { token: rowan })).body;
  assert.equal(leading.meta.templates.find((item) => item.id === "selfie").photoLabel, "Up to three photos for your Domme");
  assert.equal(JSON.stringify(leading).includes("D‑type"), false);
  assert.equal(JSON.stringify(leading).includes("{lead}"), false);

  const spicy = await call(app, "POST", "/api/tasks", { token: rowan, body: { templateId: "anal-training" } });
  assert.equal(spicy.status, 201, spicy.body.error);
  assert.ok(spicy.body.task.coaching.some((line) => line.includes("your Domme")));

  // A new title shows up everywhere at once, on tasks given before the change too.
  await call(app, "PATCH", "/api/profile", { token: rowan, body: { roleTitle: "Daddy" } });
  const renamed = (await call(app, "GET", "/api/session", { token: avery })).body;
  assert.equal(taskFor(renamed, "task-water").summary, "Sip it through the day and log each drink as you go. Your Daddy set the amount.");
  assert.ok(taskFor(renamed, spicy.body.task.id).coaching.some((line) => line.includes("your Daddy")));

  await call(app, "PATCH", "/api/profile", { token: rowan, body: { roleTitle: "" } });
  const untitled = (await call(app, "GET", "/api/session", { token: avery })).body;
  assert.equal(taskFor(untitled, "task-water").summary, "Sip it through the day and log each drink as you go. Your partner set the amount.");
});

test("task text saved with the old wording picks up the role title", async () => {
  const app = tempApp(true);
  const avery = (await call(app, "POST", "/api/demo/login", { body: { who: "following" } })).body.token;
  const saved = JSON.parse(fs.readFileSync(app.dataFile, "utf8"));
  saved.tasks.find((task) => task.id === "task-water").summary = "Drink the amount your D‑type set for you.";
  saved.routines.find((item) => item.id === "routine-water").summary = "Drink the amount your D‑type set for you.";
  fs.writeFileSync(app.dataFile, JSON.stringify(saved));

  const reopened = createSlashApp({ dataFile: app.dataFile, seedDemo: false });
  const bundle = (await call(reopened, "GET", "/api/session", { token: avery, clientDate: day(0) })).body;
  assert.equal(bundle.tasks.find((task) => task.id === "task-water").summary, "Drink the amount your Domme set for you.");
  await call(reopened, "POST", "/api/tasks/task-water/log", { token: avery, body: { amount: 64, clientDate: day(0) } });
  const next = (await call(reopened, "GET", "/api/session", { token: avery, clientDate: day(1) })).body;
  const fresh = next.tasks.find((task) => task.title === "Drink your water" && task.status === "open");
  assert.equal(fresh.summary, "Drink the amount your Domme set for you.");
});

test("water ticked off before drinks were logged stays a plain finished task", async () => {
  const app = tempApp(true);
  const avery = (await call(app, "POST", "/api/demo/login", { body: { who: "following" } })).body.token;
  const saved = JSON.parse(fs.readFileSync(app.dataFile, "utf8"));
  const old = saved.tasks.find((task) => task.id === "task-water");
  delete old.progress;
  delete old.target;
  old.status = "done";
  old.day = day(0);
  old.completedAt = "2026-11-09T18:00:00.000Z";
  old.completion = { note: "", bonuses: [], photos: [], checklist: [], choice: "" };
  delete saved.routines.find((item) => item.id === "routine-water").target;
  fs.writeFileSync(app.dataFile, JSON.stringify(saved));

  const reopened = createSlashApp({ dataFile: app.dataFile, seedDemo: false });
  const today = (await call(reopened, "GET", "/api/session", { token: avery, clientDate: day(0) })).body;
  assert.equal(today.tasks.find((task) => task.id === "task-water").progress, null);
  const row = today.routines.find((item) => item.title === "Drink your water");
  assert.equal(row.status, "done");
  assert.equal(row.target, 0);

  const next = (await call(reopened, "GET", "/api/session", { token: avery, clientDate: day(1) })).body;
  const fresh = next.tasks.find((task) => task.title === "Drink your water" && task.status === "open");
  assert.equal(fresh.target, 64);
  assert.deepEqual(fresh.progress, { amount: 0, entries: [] });
});

test("water is a daily amount in ounces that the following partner logs as they go", async () => {
  const app = tempApp(true);
  const avery = (await call(app, "POST", "/api/demo/login", { body: { who: "following" } })).body.token;
  const rowan = (await call(app, "POST", "/api/demo/login", { body: { who: "leading" } })).body.token;
  const water = (bundle) => bundle.tasks.filter((task) => task.title === "Drink your water");
  const row = (bundle) => bundle.routines.find((item) => item.title === "Drink your water");
  const log = (id, amount, day, token = avery) => call(app, "POST", `/api/tasks/${id}/log`, { token, body: { amount, clientDate: day }, clientDate: day });

  const start = (await call(app, "GET", "/api/session", { token: avery, clientDate: day(0) })).body;
  const first = water(start)[0];
  assert.equal(first.completionKind, "amount");
  assert.equal(first.unit, "oz");
  assert.equal(first.target, 64);
  assert.equal(first.progress.amount, 16);
  assert.deepEqual(first.amountSteps, [8, 12, 16]);
  assert.deepEqual([row(start).amount, row(start).target, row(start).unit], [16, 64, "oz"]);

  assert.equal((await log(first.id, 8, day(0), rowan)).status, 403);
  assert.equal((await log(first.id, 0, day(0))).status, 400);
  assert.equal((await log(first.id, 500, day(0))).status, 400);
  assert.equal((await log("task-meds", 8, day(0))).status, 400);

  const sip = await log(first.id, 12, day(0));
  assert.equal(sip.status, 200, sip.body.error);
  assert.equal(sip.body.celebration, undefined);
  assert.equal(water(sip.body)[0].progress.amount, 28);
  assert.equal(water(sip.body)[0].progress.entries.length, 2);
  assert.equal(water(sip.body)[0].status, "open");

  // The leading partner sees the same count.
  const watching = (await call(app, "GET", "/api/session", { token: rowan })).body;
  assert.equal(row(watching).amount, 28);

  const early = await call(app, "POST", `/api/tasks/${first.id}/complete`, { token: avery, body: { clientDate: day(0) } });
  assert.equal(early.status, 400);
  assert.match(early.body.error, /28 of 64 oz/);

  const oops = await log(first.id, 30, day(0));
  assert.equal(water(oops.body)[0].progress.amount, 58);
  const undone = await call(app, "POST", `/api/tasks/${first.id}/unlog`, { token: avery });
  assert.equal(water(undone.body)[0].progress.amount, 28);
  assert.equal(water(undone.body)[0].progress.entries.length, 2);

  // A day that ends part way stays on the record, and the next day starts at zero.
  const tuesday = (await call(app, "GET", "/api/session", { token: avery, clientDate: day(1) })).body;
  const kept = water(tuesday).find((task) => task.id === first.id);
  assert.equal(kept.status, "skipped");
  assert.equal(kept.completion.note, "Got to 28 of 64 oz.");
  const second = water(tuesday).find((task) => task.status === "open");
  assert.equal(second.progress.amount, 0);
  assert.equal(second.day, day(1));
  assert.equal(row(tuesday).amount, 0);

  const before = tuesday.stats.points;
  await log(second.id, 40, day(1));
  const reached = await log(second.id, 24, day(1));
  assert.equal(reached.status, 200, reached.body.error);
  assert.ok(reached.body.celebration);
  assert.equal(reached.body.stats.points, before + 5);
  const done = water(reached.body).find((task) => task.id === second.id);
  assert.equal(done.status, "done");
  assert.equal(done.completion.note, "64 oz. The amount was 64.");
  assert.equal((await log(second.id, 8, day(1))).status, 409);
  assert.equal(row(reached.body).status, "done");
});

test("the leading partner sets the daily ounces", async () => {
  const app = tempApp(true);
  const avery = (await call(app, "POST", "/api/demo/login", { body: { who: "following" } })).body.token;
  const rowan = (await call(app, "POST", "/api/demo/login", { body: { who: "leading" } })).body.token;
  await call(app, "POST", "/api/tasks/task-water/stop", { token: rowan });

  const tooLittle = await call(app, "POST", "/api/tasks", { token: rowan, body: { templateId: "water", repeat: "daily", target: 2 } });
  assert.equal(tooLittle.status, 400);
  const given = await call(app, "POST", "/api/tasks", { token: rowan, body: { templateId: "water", repeat: "daily", target: 80 } });
  assert.equal(given.status, 201, given.body.error);
  assert.equal(given.body.task.target, 80);
  assert.equal(given.body.task.progress.amount, 0);

  const mine = (await call(app, "GET", "/api/session", { token: avery, clientDate: day(0) })).body;
  const open = mine.tasks.find((task) => task.title === "Drink your water" && task.status === "open");
  assert.equal(open.target, 80);
  await call(app, "POST", `/api/tasks/${open.id}/log`, { token: avery, body: { amount: 80, clientDate: day(0) } });
  const next = (await call(app, "GET", "/api/session", { token: avery, clientDate: day(1) })).body;
  assert.equal(next.tasks.find((task) => task.title === "Drink your water" && task.status === "open").target, 80);

  const plain = await call(app, "POST", "/api/tasks", { token: rowan, body: { templateId: "water" } });
  assert.equal(plain.body.task.target, 64);
  assert.equal(plain.body.task.repeat, "once");
});

test("the leading partner can change a task before giving it", async () => {
  const app = tempApp(true);
  const avery = (await call(app, "POST", "/api/demo/login", { body: { who: "following" } })).body.token;
  const rowan = (await call(app, "POST", "/api/demo/login", { body: { who: "leading" } })).body.token;
  const give = (body) => call(app, "POST", "/api/tasks", { token: rowan, body: { clientDate: day(0), ...body } });

  const asItComes = (await give({ templateId: "meds", repeat: "daily" })).body.task;
  const stock = (await call(app, "GET", "/api/session", { token: rowan })).body.meta.templates.find((item) => item.id === "meds");
  assert.equal(asItComes.summary, stock.summary);
  assert.equal(asItComes.points, stock.points);

  for (const points of [0, 51, "lots"]) {
    assert.equal((await give({ templateId: "meal", repeat: "daily", points })).status, 400);
  }

  const given = await give({
    templateId: "meal",
    repeat: "daily",
    title: "Eat lunch away from your desk",
    summary: "A real plate, sitting down. Send your Domme a picture if you feel like it.",
    points: 14,
  });
  assert.equal(given.status, 201, given.body.error);
  assert.equal(given.body.task.title, "Eat lunch away from your desk");
  assert.equal(given.body.task.summary, "A real plate, sitting down. Send your Domme a picture if you feel like it.");
  assert.equal(given.body.task.points, 14);
  assert.equal(given.body.task.repeat, "daily");

  const before = (await call(app, "GET", "/api/session", { token: avery, clientDate: day(0) })).body;
  const done = await call(app, "POST", `/api/tasks/${given.body.task.id}/complete`, { token: avery, body: { clientDate: day(0) }, clientDate: day(0) });
  assert.equal(done.status, 200, done.body.error);
  assert.equal(done.body.stats.points - before.stats.points, 14);

  await call(app, "PATCH", "/api/profile", { token: rowan, body: { roleTitle: "Mistress" } });
  const next = (await call(app, "GET", "/api/session", { token: avery, clientDate: day(1) })).body;
  const fresh = next.tasks.find((task) => task.title === "Eat lunch away from your desk" && task.status === "open");
  assert.equal(fresh.day, day(1));
  assert.equal(fresh.points, 14);
  assert.equal(fresh.summary, "A real plate, sitting down. Send your Mistress a picture if you feel like it.");
  assert.equal(next.routines.find((item) => item.title === "Eat lunch away from your desk").points, 14);

  const once = (await give({ templateId: "walk", summary: "", points: 3 })).body.task;
  assert.equal(once.summary, "");
  assert.equal(once.points, 3);
  assert.equal(once.repeat, "once");

  const own = (await give({ templateId: "own-task", title: "Text me good morning", category: "fun", points: 7, summary: "ignored" })).body.task;
  assert.equal(own.summary, "");
  assert.equal(own.points, 7);
});

test("the adventure keeps its own wording and points", async () => {
  const seeded = tempApp(true);
  const lead = (await call(seeded, "POST", "/api/demo/login", { body: { who: "leading" } })).body.token;
  const saved = JSON.parse(fs.readFileSync(seeded.dataFile, "utf8"));
  saved.tasks = saved.tasks.filter((task) => task.id !== "task-adventure");
  fs.writeFileSync(seeded.dataFile, JSON.stringify(saved));
  const app = createSlashApp({ dataFile: seeded.dataFile, seedDemo: false });
  const stock = (await call(app, "GET", "/api/session", { token: lead })).body.meta.templates.find((item) => item.id === "daily-adventure");
  const given = await call(app, "POST", "/api/tasks", { token: lead, body: { templateId: "daily-adventure", summary: "Peek all you like.", points: 50 } });
  assert.equal(given.status, 201, given.body.error);
  assert.equal(given.body.task.summary, stock.summary);
  assert.equal(given.body.task.points, stock.points);
});

test("tasks, streaks, goals, and agreed rewards persist", async () => {
  const app = tempApp(true);
  const rowan = await call(app, "POST", "/api/demo/login", { body: { who: "leading" } });
  const avery = await call(app, "POST", "/api/demo/login", { body: { who: "following" } });
  const lead = rowan.body.token;
  const follow = avery.body.token;

  const denied = await call(app, "POST", "/api/tasks", { token: follow, body: { templateId: "walk" } });
  assert.equal(denied.status, 403);

  const scene = avery.body.tasks.find((task) => task.id === "task-scene");
  const needsConsent = await call(app, "POST", `/api/tasks/${scene.id}/complete`, {
    token: follow,
    body: { note: "Lights low, aftercare on the couch, and a clear stop word.", consent: false },
  });
  assert.equal(needsConsent.status, 400);

  const assigned = await call(app, "POST", "/api/tasks", {
    token: lead,
    body: { templateId: "journal", note: "Keep it short.", prompt: "What felt close between you this week?" },
  });
  assert.equal(assigned.status, 201);
  const created = assigned.body.tasks.find((task) => task.prompt === "What felt close between you this week?");
  assert.ok(created);
  assert.equal(created.assignedTo, avery.body.me.id);

  const today = nextDay(avery.body.me.lastActiveDate);
  const done = await call(app, "POST", `/api/tasks/${created.id}/complete`, {
    token: follow,
    body: { note: "I felt close when we talked after dinner.", clientDate: today },
  });
  assert.equal(done.status, 200, done.body.error);
  assert.equal(done.body.me.streak, 5);
  assert.ok(done.body.me.points > avery.body.me.points);
  assert.equal(done.body.celebration.kind, "task");
  const connection = done.body.goals.find((goal) => goal.goalKey === "connection");
  assert.equal(connection.progress, 4);

  const shower = done.body.tasks.find((task) => task.id === "task-shower");
  const leveled = await call(app, "POST", `/api/tasks/${shower.id}/complete`, {
    token: follow,
    body: { note: "Long bath, used the bubble bath.", bonuses: ["bubbles"], clientDate: today },
  });
  assert.equal(leveled.status, 200, leveled.body.error);
  assert.equal(leveled.body.stats.level.name, "Glow");
  assert.equal(leveled.body.stats.level.title, "Glow IV");
  assert.equal(leveled.body.celebration.kind, "task");

  const ack = await call(app, "POST", `/api/tasks/${shower.id}/acknowledge`, { token: lead });
  assert.equal(ack.status, 200);
  assert.ok(ack.body.me.carePoints > rowan.body.me.carePoints);

  const movie = ack.body.rewards.find((reward) => reward.id === "reward-movie");
  assert.equal(movie.status, "agreed");
  const tooSoon = await call(app, "POST", `/api/rewards/${movie.id}/grant`, { token: lead });
  assert.equal(tooSoon.status, 409);
  const ask = await call(app, "POST", `/api/rewards/${movie.id}/request`, { token: follow });
  assert.equal(ask.status, 200, ask.body.error);
  const before = ask.body.me.points;
  const grant = await call(app, "POST", `/api/rewards/${movie.id}/grant`, { token: lead });
  assert.equal(grant.status, 200, grant.body.error);
  assert.equal(grant.body.celebration.kind, "reward");
  const follower = grant.body.partner.slashSide === "following" ? grant.body.partner : grant.body.me;
  assert.equal(follower.points, before - movie.cost);

  const again = await call(app, "GET", "/api/session", { token: follow });
  assert.equal(again.body.me.points, follower.points);
  assert.equal(again.body.tasks.find((task) => task.id === shower.id).status, "done");
});
