import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { coachingFor, levelFor } from "./catalog.mjs";
import { createSlashApp } from "./slashconnect.mjs";

function tempApp(seedDemo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slashconnect-"));
  return createSlashApp({ dataFile: path.join(dir, "db.json"), seedDemo });
}

async function call(app, method, url, { token, body } = {}) {
  try {
    return await app.dispatch({ method, url, token, body: body || {} });
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
  assert.equal(levelFor(40).name, "Glow");
  assert.equal(levelFor(89).name, "Glow");
  assert.equal(levelFor(90).name, "Kindle");
  assert.equal(levelFor(400).progress, 1);
});

test("anal coaching follows experience and stays short", () => {
  const fresh = coachingFor("anal-training", "new");
  const practiced = coachingFor("anal-training", "experienced");
  assert.ok(fresh.length >= 3);
  assert.notDeepEqual(fresh, practiced);
  assert.equal(coachingFor("journal", "new").length, 0);
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
  assert.equal(leveled.body.stats.level.name, "Kindle");
  assert.equal(leveled.body.celebration.kind, "level");

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
