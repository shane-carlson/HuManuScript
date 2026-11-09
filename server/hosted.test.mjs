import assert from "node:assert/strict";
import test from "node:test";
import { createHostedApp, createMemoryStore } from "./hosted.mjs";

const PHOTO = `data:image/jpeg;base64,${"A".repeat(400)}`;

function hosted(options = {}) {
  const store = createMemoryStore();
  return { store, app: createHostedApp({ store, ...options }) };
}

async function call(app, method, url, { token, body, clientDate } = {}) {
  try {
    return await app.dispatch({ method, url, token, body: body || {}, clientDate });
  } catch (error) {
    if (!error.status) throw error;
    return { status: error.status, body: { error: error.message } };
  }
}

const profile = (side, roleTitle) => ({
  pronouns: { label: "they/them", subject: "they", object: "them", possessive: "their", reflexive: "themself" },
  gender: "",
  slashSide: side,
  roleTitle,
  goals: ["connection", "self-care"],
  guideId: "moss",
  onboardingComplete: true,
});

async function signUp(app, name, extra = {}) {
  const made = await call(app, "POST", "/api/auth/register", {
    body: { email: `${name.toLowerCase()}@example.com`, password: "secret1", displayName: name, adultConfirmed: true, ...extra },
  });
  assert.equal(made.status, 201, made.body.error);
  return made.body.token;
}

/** One sets up and sends a code; the other signs up with it. */
async function couple(app, leadName, followName) {
  const lead = await signUp(app, leadName);
  await call(app, "PATCH", "/api/profile", { token: lead, body: profile("leading", "Daddy") });
  const code = (await call(app, "POST", "/api/invites", { token: lead, body: {} })).body.invite.code;
  const follow = await signUp(app, followName, { inviteCode: code });
  await call(app, "PATCH", "/api/profile", { token: follow, body: profile("following", "Little") });
  return { lead, follow, code };
}

const households = (store) => store.keys().filter((key) => /^households\/[a-f0-9]+$/.test(key));

test("a hosted server has no demo pair and says what it is", async () => {
  const { app } = hosted({ testerCode: "sunflower" });
  const health = await call(app, "GET", "/api/health");
  assert.deepEqual(health.body, { ok: true, demo: false, hosted: true, testerCode: true });
  assert.equal((await call(app, "POST", "/api/demo/login", { body: { who: "leading" } })).status, 404);
  assert.equal((await call(app, "POST", "/api/household/reset", { body: { confirm: "reset-demo" } })).status, 404);
  const meta = await call(app, "GET", "/api/meta");
  assert.ok(meta.body.guides.length >= 4);
  assert.equal((await call(app, "GET", "/api/session")).status, 401);
  assert.equal((await call(app, "GET", "/api/session", { token: "not-a-token" })).status, 401);
  assert.equal((await call(app, "GET", "/api/session", { token: `${"a".repeat(24)}.nope` })).status, 401);
});

test("two couples on one server never see each other", async () => {
  const { app, store } = hosted();
  const first = await couple(app, "Ada", "Bo");
  const second = await couple(app, "Cy", "Dee");
  assert.equal(households(store).length, 2);

  const given = await call(app, "POST", "/api/tasks", { token: first.lead, body: { templateId: "walk", note: "Round the block." } });
  assert.equal(given.status, 201, given.body.error);

  const bo = (await call(app, "GET", "/api/session", { token: first.follow })).body;
  assert.equal(bo.partner.displayName, "Ada");
  assert.equal(bo.hosted, true);
  assert.equal(bo.demo, false);
  assert.equal(bo.tasks.length, 1);

  const dee = (await call(app, "GET", "/api/session", { token: second.follow })).body;
  assert.equal(dee.partner.displayName, "Cy");
  assert.equal(dee.tasks.length, 0);

  const reach = await call(app, "POST", `/api/tasks/${given.body.task.id}/complete`, { token: second.follow, body: {} });
  assert.equal(reach.status, 404);

  const third = await call(app, "POST", "/api/auth/register", {
    body: { email: "eve@example.com", password: "secret1", displayName: "Eve", adultConfirmed: true, inviteCode: first.code },
  });
  assert.equal(third.status, 404, "an invite that was used is closed");
  assert.equal(households(store).length, 2);
});

test("an email signs up once and signs back in to its own household", async () => {
  const { app } = hosted();
  const { lead } = await couple(app, "Ada", "Bo");
  const again = await call(app, "POST", "/api/auth/register", {
    body: { email: " ADA@example.com ", password: "secret1", displayName: "Ada Two", adultConfirmed: true },
  });
  assert.equal(again.status, 409);

  const back = await call(app, "POST", "/api/auth/login", { body: { email: "Ada@Example.com", password: "secret1" } });
  assert.equal(back.status, 200, back.body.error);
  assert.notEqual(back.body.token, lead);
  assert.equal(back.body.partner.displayName, "Bo");
  assert.equal((await call(app, "GET", "/api/session", { token: lead })).status, 200, "the first phone stays signed in");

  await call(app, "POST", "/api/auth/logout", { token: back.body.token });
  assert.equal((await call(app, "GET", "/api/session", { token: back.body.token })).status, 401);
  assert.equal((await call(app, "POST", "/api/auth/login", { body: { email: "nobody@example.com", password: "secret1" } })).status, 401);
});

test("eight wrong passwords lock sign-in for fifteen minutes", async () => {
  let clock = Date.parse("2026-11-09T18:00:00Z");
  const { app } = hosted({ now: () => clock });
  await signUp(app, "Ada");
  const tryIt = (password) => call(app, "POST", "/api/auth/login", { body: { email: "ada@example.com", password } });

  for (let i = 0; i < 7; i += 1) assert.equal((await tryIt("wrong")).status, 401);
  assert.equal((await tryIt("secret1")).status, 200, "a right password clears the count");
  for (let i = 0; i < 8; i += 1) assert.equal((await tryIt("wrong")).status, 401);
  assert.equal((await tryIt("secret1")).status, 429);
  clock += 14 * 60000;
  assert.equal((await tryIt("secret1")).status, 429);
  clock += 2 * 60000;
  assert.equal((await tryIt("secret1")).status, 200);
});

test("a tester code keeps strangers out but lets an invited partner in", async () => {
  const { app } = hosted({ testerCode: "Sunflower" });
  const base = { password: "secret1", adultConfirmed: true };
  assert.equal((await call(app, "POST", "/api/auth/register", { body: { ...base, email: "x@example.com", displayName: "X" } })).status, 403);
  assert.equal((await call(app, "POST", "/api/auth/register", { body: { ...base, email: "x@example.com", displayName: "X", testerCode: "tulip" } })).status, 403);

  const lead = await signUp(app, "Ada", { testerCode: " sunflower " });
  await call(app, "PATCH", "/api/profile", { token: lead, body: profile("leading", "Domme") });
  const code = (await call(app, "POST", "/api/invites", { token: lead, body: {} })).body.invite.code;
  const preview = await call(app, "GET", `/api/invites/preview?code=${code.toLowerCase()}`);
  assert.equal(preview.body.fromName, "Ada");
  await signUp(app, "Bo", { inviteCode: code });
  assert.equal((await call(app, "POST", "/api/auth/register", { body: { ...base, email: "y@example.com", displayName: "Y", inviteCode: "ZZZZZZZZ" } })).status, 404);
});

test("someone who signed up alone moves in with the partner whose code they enter", async () => {
  const { app, store } = hosted();
  const lead = await signUp(app, "Ada");
  await call(app, "PATCH", "/api/profile", { token: lead, body: profile("leading", "Mommy") });
  const code = (await call(app, "POST", "/api/invites", { token: lead, body: {} })).body.invite.code;

  const solo = await signUp(app, "Bo");
  await call(app, "PATCH", "/api/profile", { token: solo, body: { ...profile("following", "Babygirl"), goals: ["play"] } });
  await call(app, "POST", "/api/rewards", { token: solo, body: { title: "Movie night", cost: 30 } });
  await call(app, "POST", "/api/goals", { token: solo, body: { title: "Call twice a week", target: 8 } });
  const spare = (await call(app, "POST", "/api/invites", { token: solo, body: {} })).body.invite.code;
  assert.equal(households(store).length, 2);

  assert.equal((await call(app, "POST", "/api/invites/accept", { token: solo, body: { code: "NOPE1234" } })).status, 404);
  assert.equal((await call(app, "POST", "/api/invites/accept", { token: solo, body: { code: spare } })).status, 400, "your own code is not for you");

  const joined = await call(app, "POST", "/api/invites/accept", { token: solo, body: { code } });
  assert.equal(joined.status, 200, joined.body.error);
  assert.equal(joined.body.partner.displayName, "Ada");
  assert.equal(joined.body.me.roleTitle, "Babygirl");
  assert.ok(joined.body.token && joined.body.token !== solo);
  assert.equal(households(store).length, 1, "the empty household is gone");
  assert.equal(store.read(`invites/${code}`), null);
  assert.equal(store.read(`invites/${spare}`), null);

  assert.equal((await call(app, "GET", "/api/session", { token: solo })).status, 401, "the old token named the old household");
  const mine = (await call(app, "GET", "/api/session", { token: joined.body.token })).body;
  assert.deepEqual(mine.goals.map((goal) => goal.goalKey).sort(), ["connection", "custom", "play", "self-care"]);
  assert.equal(mine.rewards[0].title, "Movie night");

  const ada = (await call(app, "GET", "/api/session", { token: lead })).body;
  assert.equal(ada.partner.displayName, "Bo");
  const back = await call(app, "POST", "/api/auth/login", { body: { email: "bo@example.com", password: "secret1" } });
  assert.equal(back.body.partner.displayName, "Ada", "signing in finds the new household");

  const late = await signUp(app, "Cy");
  assert.equal((await call(app, "POST", "/api/invites/accept", { token: late, body: { code } })).status, 404);
});

test("a couple cannot be joined by a third, and a paired person cannot leave by code", async () => {
  const { app } = hosted();
  const first = await couple(app, "Ada", "Bo");
  const lone = await signUp(app, "Cy");
  await call(app, "PATCH", "/api/profile", { token: lone, body: profile("leading", "Sir") });
  const code = (await call(app, "POST", "/api/invites", { token: lone, body: {} })).body.invite.code;
  const hop = await call(app, "POST", "/api/invites/accept", { token: first.follow, body: { code } });
  assert.equal(hop.status, 409);
  assert.equal((await call(app, "GET", "/api/session", { token: first.follow })).body.partner.displayName, "Ada");

  const sameSide = await signUp(app, "Dee");
  await call(app, "PATCH", "/api/profile", { token: sameSide, body: profile("leading", "Ma’am") });
  assert.equal((await call(app, "POST", "/api/invites/accept", { token: sameSide, body: { code } })).status, 409);
  assert.equal((await call(app, "GET", "/api/session", { token: sameSide })).status, 200, "a refused pairing changes nothing");
});

test("photos are kept beside the household and only its two people can open them", async () => {
  const { app, store } = hosted();
  const first = await couple(app, "Ada", "Bo");
  const second = await couple(app, "Cy", "Dee");
  const task = (await call(app, "POST", "/api/tasks", { token: first.lead, body: { templateId: "plush-adventure" } })).body.task;
  const done = await call(app, "POST", `/api/tasks/${task.id}/complete`, { token: first.follow, body: { note: "We went to the park.", photos: [PHOTO, PHOTO] } });
  assert.equal(done.status, 200, done.body.error);

  const seen = (await call(app, "GET", "/api/session", { token: first.lead })).body.tasks.find((item) => item.id === task.id);
  assert.equal(seen.completion.photos.length, 2);
  assert.ok(seen.completion.photos.every((ref) => /^photo:[a-f0-9]{24}$/.test(ref)));
  const household = households(store).find((key) => JSON.stringify(store.read(key)).includes(task.id));
  assert.equal(JSON.stringify(store.read(household)).includes("base64"), false, "the household record holds no image data");
  assert.equal(store.keys().filter((key) => key.includes("/photos/")).length, 2);

  const id = seen.completion.photos[0].slice("photo:".length);
  assert.equal((await call(app, "GET", `/api/photos/${id}`, { token: first.lead })).body.data, PHOTO);
  assert.equal((await call(app, "GET", `/api/photos/${id}`, { token: first.follow })).body.data, PHOTO);
  assert.equal((await call(app, "GET", `/api/photos/${id}`, { token: second.lead })).status, 404);
  assert.equal((await call(app, "GET", `/api/photos/${id}`)).status, 401);
  assert.equal((await call(app, "GET", `/api/photos/${id}`, { token: `${household.split("/")[1]}.forged` })).status, 401);
  assert.equal((await call(app, "GET", "/api/photos/..%2F..%2Femails", { token: first.lead })).status, 404);

  const later = (await call(app, "GET", "/api/session", { token: first.follow, clientDate: "2026-11-12" })).body.tasks.find((item) => item.id === task.id);
  assert.deepEqual(later.completion.photos, seen.completion.photos, "saving again keeps the same photos");
  assert.equal(store.keys().filter((key) => key.includes("/photos/")).length, 2);
});

test("a request that fails saves nothing", async () => {
  const { app, store } = hosted();
  const { lead } = await couple(app, "Ada", "Bo");
  const before = JSON.stringify([...store.records]);
  assert.equal((await call(app, "POST", "/api/tasks", { token: lead, body: { templateId: "water", repeat: "daily", target: 2 } })).status, 400);
  assert.equal((await call(app, "POST", "/api/auth/register", { body: { email: "bad", password: "secret1", displayName: "Bad", adultConfirmed: true } })).status, 400);
  assert.equal(JSON.stringify([...store.records]), before);
});
