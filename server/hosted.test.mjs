import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { createHostedApp, createMemoryStore } from "./hosted.mjs";
import { createSlashApp } from "./slashconnect.mjs";

const PHOTO = `data:image/jpeg;base64,${"A".repeat(400)}`;

/**
 * Stands in for Firebase Authentication. A token is good only if it was handed
 * out here, and one account can hold several, as it does on two phones.
 */
function fakeFirebase() {
  const tokens = new Map();
  let made = 0;
  return {
    signIn(email, uid = `uid${(made += 1)}For${email.replace(/[^a-z]/gi, "")}`) {
      const token = `idtoken-${tokens.size + 1}-${uid}`;
      tokens.set(token, { uid, email, emailVerified: false });
      return token;
    },
    uidOf: (token) => tokens.get(token).uid,
    verifyToken: async (token) => tokens.get(token) || null,
  };
}

function hosted(options = {}) {
  const store = createMemoryStore();
  const firebase = fakeFirebase();
  return { store, firebase, app: createHostedApp({ store, verifyToken: firebase.verifyToken, ...options }) };
}

async function call(app, method, url, { token, body, clientDate } = {}) {
  try {
    return await app.dispatch({ method, url, token, body: body || {}, clientDate });
  } catch (error) {
    if (!error.status) throw error;
    return { status: error.status, body: { error: error.message, code: error.code } };
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

/** Signs in with Firebase, then signs up here. Returns the ID token every later request carries. */
async function signUp({ app, firebase }, name, extra = {}) {
  const token = firebase.signIn(`${name.toLowerCase()}@example.com`);
  const made = await call(app, "POST", "/api/auth/register", { token, body: { displayName: name, adultConfirmed: true, ...extra } });
  assert.equal(made.status, 201, made.body.error);
  assert.equal(made.body.token, undefined, "the server hands out no tokens of its own");
  return token;
}

/** One sets up and sends a code; the other signs up with it. */
async function couple(world, leadName, followName) {
  const { app } = world;
  const lead = await signUp(world, leadName);
  await call(app, "PATCH", "/api/profile", { token: lead, body: profile("leading", "Daddy") });
  const code = (await call(app, "POST", "/api/invites", { token: lead, body: {} })).body.invite.code;
  const follow = await signUp(world, followName, { inviteCode: code });
  await call(app, "PATCH", "/api/profile", { token: follow, body: profile("following", "Little") });
  return { lead, follow, code };
}

const households = (store) => store.keys().filter((key) => /^households\/[a-f0-9]+$/.test(key));
const accounts = (store) => store.keys().filter((key) => key.startsWith("accounts/"));

test("a hosted server has no demo pair and says what it is", async () => {
  const { app } = hosted({ testerCode: "sunflower" });
  const health = await call(app, "GET", "/api/health");
  assert.deepEqual(health.body, { ok: true, demo: false, hosted: true, testerCode: true });
  assert.equal((await call(app, "POST", "/api/demo/login", { body: { who: "leading" } })).status, 404);
  assert.equal((await call(app, "POST", "/api/household/reset", { body: { confirm: "reset-demo" } })).status, 404);
  const meta = await call(app, "GET", "/api/meta");
  assert.ok(meta.body.guides.length >= 4);

  const emulated = hosted({ authEmulator: "127.0.0.1:9099" });
  assert.equal((await call(emulated.app, "GET", "/api/health")).body.authEmulator, "127.0.0.1:9099");
  assert.throws(() => createHostedApp({ store: createMemoryStore() }), /who is signed in/);
});

test("nothing past the front door opens without a good Firebase token", async () => {
  const world = hosted();
  const { app, store, firebase } = world;
  const { lead } = await couple(world, "Ada", "Bo");
  const before = JSON.stringify([...store.records]);

  for (const token of [undefined, "", "not-a-token", `${"a".repeat(24)}.nope`, firebase.uidOf(lead)]) {
    assert.equal((await call(app, "GET", "/api/session", { token })).status, 401);
    assert.equal((await call(app, "POST", "/api/tasks", { token, body: { templateId: "walk" } })).status, 401);
    assert.equal((await call(app, "POST", "/api/invites/accept", { token, body: { code: "ABCD2345" } })).status, 401);
    assert.equal((await call(app, "GET", `/api/photos/${"a".repeat(24)}`, { token })).status, 401);
    const made = await call(app, "POST", "/api/auth/register", { token, body: { displayName: "Eve", adultConfirmed: true } });
    assert.equal(made.status, 401);
  }
  // The server's own password sign-in is gone, whatever is sent to it.
  assert.equal((await call(app, "POST", "/api/auth/login", { body: { email: "ada@example.com", password: "secret1" } })).status, 410);
  assert.equal(JSON.stringify([...store.records]), before);
});

test("who you are comes from the token, never from the request", async () => {
  const world = hosted();
  const { app, store, firebase } = world;
  const { lead } = await couple(world, "Ada", "Bo");
  const ada = (await call(app, "GET", "/api/session", { token: lead })).body.me;

  const eve = firebase.signIn("eve@example.com");
  const made = await call(app, "POST", "/api/auth/register", {
    token: eve,
    body: { displayName: "Eve", adultConfirmed: true, email: "ada@example.com", uid: firebase.uidOf(lead), actor: { userId: ada.id }, signedIn: true },
  });
  assert.equal(made.status, 201, made.body.error);
  assert.equal(made.body.me.email, "eve@example.com");
  assert.notEqual(made.body.me.id, ada.id);
  assert.equal(made.body.partner, null);
  assert.deepEqual(Object.keys(store.read(`accounts/${firebase.uidOf(eve)}`)).sort(), ["household", "user"]);

  // Something outside the hub naming a person gets nowhere.
  const forged = await app.dispatch({ method: "GET", url: "/api/session", token: "", body: {}, actor: { userId: ada.id } }).catch((error) => error);
  assert.equal(forged.status, 401);
  const asEve = await app.dispatch({ method: "GET", url: "/api/session", token: eve, body: {}, actor: { userId: ada.id } });
  assert.equal(asEve.body.me.displayName, "Eve");

  assert.equal(JSON.stringify(store.read(households(store)[0])).includes("passwordHash"), false, "no passwords are kept here");
  assert.equal(store.keys().some((key) => key.startsWith("emails/")), false);
});

test("a check that breaks is a server error, not a sign-out", async () => {
  const store = createMemoryStore();
  const app = createHostedApp({
    store,
    verifyToken: async () => {
      throw new Error("Could not fetch the signing keys.");
    },
  });
  const outcome = await app.dispatch({ method: "GET", url: "/api/session", token: "anything", body: {} }).catch((error) => error);
  assert.equal(outcome.status, undefined);
  assert.match(outcome.message, /signing keys/);

  const odd = createHostedApp({ store, verifyToken: async () => ({ uid: "../households/x", email: "x@example.com" }) });
  assert.equal((await call(odd, "GET", "/api/session", { token: "anything" })).status, 401, "a uid that would not be a plain record name is refused");
});

test("two couples on one server never see each other", async () => {
  const world = hosted();
  const { app, store } = world;
  const first = await couple(world, "Ada", "Bo");
  const second = await couple(world, "Cy", "Dee");
  assert.equal(households(store).length, 2);
  assert.equal(accounts(store).length, 4);

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

  const eve = world.firebase.signIn("eve@example.com");
  const third = await call(app, "POST", "/api/auth/register", { token: eve, body: { displayName: "Eve", adultConfirmed: true, inviteCode: first.code } });
  assert.equal(third.status, 404, "an invite that was used is closed");
  assert.equal(households(store).length, 2);
  assert.equal(accounts(store).length, 4);
});

test("a Firebase account signs up once and is found again from any phone", async () => {
  const world = hosted();
  const { app, store, firebase } = world;
  const { lead } = await couple(world, "Ada", "Bo");
  const uid = firebase.uidOf(lead);

  const again = await call(app, "POST", "/api/auth/register", { token: lead, body: { displayName: "Ada Two", adultConfirmed: true } });
  assert.equal(again.status, 200, "asking twice finds the same person");
  assert.equal(again.body.me.displayName, "Ada");
  assert.equal(households(store).length, 1);

  const otherPhone = firebase.signIn("ada@example.com", uid);
  const back = await call(app, "GET", "/api/session", { token: otherPhone });
  assert.equal(back.status, 200, back.body.error);
  assert.equal(back.body.partner.displayName, "Bo");
  assert.equal((await call(app, "GET", "/api/session", { token: lead })).status, 200, "the first phone stays signed in");
  assert.deepEqual((await call(app, "POST", "/api/auth/logout", { token: otherPhone })).body, { ok: true });

  const halfway = firebase.signIn("fay@example.com");
  const lost = await call(app, "GET", "/api/session", { token: halfway });
  assert.equal(lost.status, 404);
  assert.equal(lost.body.code, "no-profile");
  assert.equal((await call(app, "POST", "/api/invites/accept", { token: halfway, body: { code: "ABCD2345" } })).body.code, "no-profile");
  assert.equal((await call(app, "POST", "/api/auth/register", { token: halfway, body: { displayName: "Fay" } })).status, 400, "18+ still has to be confirmed");
  assert.equal((await call(app, "POST", "/api/auth/register", { token: halfway, body: { displayName: " ", adultConfirmed: true } })).status, 400);
  assert.equal((await call(app, "POST", "/api/auth/register", { token: halfway, body: { displayName: "Fay", adultConfirmed: true } })).status, 201);

  const noEmail = firebase.signIn("");
  assert.equal((await call(app, "POST", "/api/auth/register", { token: noEmail, body: { displayName: "Gus", adultConfirmed: true } })).status, 400);
});

test("a tester code keeps strangers out but lets an invited partner in", async () => {
  const world = hosted({ testerCode: "Sunflower" });
  const { app, store, firebase } = world;
  const stranger = firebase.signIn("x@example.com");
  const base = { displayName: "X", adultConfirmed: true };
  assert.equal((await call(app, "POST", "/api/auth/register", { token: stranger, body: base })).status, 403);
  assert.equal((await call(app, "POST", "/api/auth/register", { token: stranger, body: { ...base, testerCode: "tulip" } })).status, 403);
  assert.equal((await call(app, "GET", "/api/session", { token: stranger })).body.code, "no-profile", "a Firebase account alone gets nothing");
  assert.equal(store.keys().length, 0);

  const lead = await signUp(world, "Ada", { testerCode: " sunflower " });
  await call(app, "PATCH", "/api/profile", { token: lead, body: profile("leading", "Domme") });
  const code = (await call(app, "POST", "/api/invites", { token: lead, body: {} })).body.invite.code;
  const preview = await call(app, "GET", `/api/invites/preview?code=${code.toLowerCase()}`);
  assert.equal(preview.body.fromName, "Ada");
  await signUp(world, "Bo", { inviteCode: code });
  assert.equal((await call(app, "POST", "/api/auth/register", { token: stranger, body: { ...base, inviteCode: "ZZZZZZZZ" } })).status, 404);
});

test("the app can ask whether a sign-up will be let in before making an account", async () => {
  const world = hosted({ testerCode: "sunflower" });
  const { app, store } = world;
  const ask = (body) => call(app, "POST", "/api/auth/check", { body });
  const base = { displayName: "X", adultConfirmed: true };
  assert.equal((await ask(base)).status, 403);
  assert.equal((await ask({ ...base, testerCode: "tulip" })).status, 403);
  assert.equal((await ask({ displayName: "X", testerCode: "sunflower" })).status, 400);
  assert.equal((await ask({ ...base, displayName: "", testerCode: "sunflower" })).status, 400);
  assert.equal((await ask({ ...base, inviteCode: "ZZZZZZZZ" })).status, 404);
  assert.deepEqual((await ask({ ...base, testerCode: "Sunflower" })).body, { ok: true });
  assert.equal(store.keys().length, 0, "asking makes nothing");

  const lead = await signUp(world, "Ada", { testerCode: "sunflower" });
  await call(app, "PATCH", "/api/profile", { token: lead, body: profile("leading", "Domme") });
  const code = (await call(app, "POST", "/api/invites", { token: lead, body: {} })).body.invite.code;
  assert.equal((await ask({ ...base, inviteCode: code.toLowerCase() })).status, 200);
});

test("someone who signed up alone moves in with the partner whose code they enter", async () => {
  const world = hosted();
  const { app, store, firebase } = world;
  const lead = await signUp(world, "Ada");
  await call(app, "PATCH", "/api/profile", { token: lead, body: profile("leading", "Mommy") });
  const code = (await call(app, "POST", "/api/invites", { token: lead, body: {} })).body.invite.code;

  const solo = await signUp(world, "Bo");
  await call(app, "PATCH", "/api/profile", { token: solo, body: { ...profile("following", "Babygirl"), goals: ["play"] } });
  await call(app, "POST", "/api/rewards", { token: solo, body: { title: "Movie night", cost: 30 } });
  await call(app, "POST", "/api/goals", { token: solo, body: { title: "Call twice a week", target: 8 } });
  const spare = (await call(app, "POST", "/api/invites", { token: solo, body: {} })).body.invite.code;
  assert.equal(households(store).length, 2);
  const before = store.read(`accounts/${firebase.uidOf(solo)}`);

  assert.equal((await call(app, "POST", "/api/invites/accept", { token: solo, body: { code: "NOPE1234" } })).status, 404);
  assert.equal((await call(app, "POST", "/api/invites/accept", { token: solo, body: { code: spare } })).status, 400, "your own code is not for you");

  const joined = await call(app, "POST", "/api/invites/accept", { token: solo, body: { code } });
  assert.equal(joined.status, 200, joined.body.error);
  assert.equal(joined.body.partner.displayName, "Ada");
  assert.equal(joined.body.me.roleTitle, "Babygirl");
  assert.equal(households(store).length, 1, "the empty household is gone");
  assert.equal(store.read(`invites/${code}`), null);
  assert.equal(store.read(`invites/${spare}`), null);

  const after = store.read(`accounts/${firebase.uidOf(solo)}`);
  assert.equal(after.user, before.user);
  assert.notEqual(after.household, before.household);
  assert.equal(`households/${after.household}`, households(store)[0]);

  const mine = (await call(app, "GET", "/api/session", { token: solo })).body;
  assert.equal(mine.partner.displayName, "Ada", "the same sign-in now opens the shared household");
  assert.deepEqual(mine.goals.map((goal) => goal.goalKey).sort(), ["connection", "custom", "play", "self-care"]);
  assert.equal(mine.rewards[0].title, "Movie night");

  const ada = (await call(app, "GET", "/api/session", { token: lead })).body;
  assert.equal(ada.partner.displayName, "Bo");
  const otherPhone = firebase.signIn("bo@example.com", firebase.uidOf(solo));
  assert.equal((await call(app, "GET", "/api/session", { token: otherPhone })).body.partner.displayName, "Ada", "signing in again finds the new household");

  const late = await signUp(world, "Cy");
  assert.equal((await call(app, "POST", "/api/invites/accept", { token: late, body: { code } })).status, 404);
});

test("a couple cannot be joined by a third, and a paired person cannot leave by code", async () => {
  const world = hosted();
  const { app } = world;
  const first = await couple(world, "Ada", "Bo");
  const lone = await signUp(world, "Cy");
  await call(app, "PATCH", "/api/profile", { token: lone, body: profile("leading", "Sir") });
  const code = (await call(app, "POST", "/api/invites", { token: lone, body: {} })).body.invite.code;
  const hop = await call(app, "POST", "/api/invites/accept", { token: first.follow, body: { code } });
  assert.equal(hop.status, 409);
  assert.equal((await call(app, "GET", "/api/session", { token: first.follow })).body.partner.displayName, "Ada");

  const sameSide = await signUp(world, "Dee");
  await call(app, "PATCH", "/api/profile", { token: sameSide, body: profile("leading", "Ma’am") });
  assert.equal((await call(app, "POST", "/api/invites/accept", { token: sameSide, body: { code } })).status, 409);
  const still = await call(app, "GET", "/api/session", { token: sameSide });
  assert.equal(still.status, 200, "a refused pairing changes nothing");
  assert.equal(still.body.partner, null);
});

test("photos are kept beside the household and only its two people can open them", async () => {
  const world = hosted();
  const { app, store, firebase } = world;
  const first = await couple(world, "Ada", "Bo");
  const second = await couple(world, "Cy", "Dee");
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
  assert.equal((await call(app, "GET", `/api/photos/${id}`, { token: firebase.signIn("eve@example.com") })).body.code, "no-profile");
  assert.equal((await call(app, "GET", "/api/photos/..%2F..%2Faccounts", { token: first.lead })).status, 404);

  const later = (await call(app, "GET", "/api/session", { token: first.follow, clientDate: "2026-11-12" })).body.tasks.find((item) => item.id === task.id);
  assert.deepEqual(later.completion.photos, seen.completion.photos, "saving again keeps the same photos");
  assert.equal(store.keys().filter((key) => key.includes("/photos/")).length, 2);
});

test("a request that fails saves nothing", async () => {
  const world = hosted();
  const { app, store, firebase } = world;
  const { lead } = await couple(world, "Ada", "Bo");
  const before = JSON.stringify([...store.records]);
  assert.equal((await call(app, "POST", "/api/tasks", { token: lead, body: { templateId: "water", repeat: "daily", target: 2 } })).status, 400);
  const bad = firebase.signIn("not-an-email");
  assert.equal((await call(app, "POST", "/api/auth/register", { token: bad, body: { displayName: "Bad", adultConfirmed: true } })).status, 400);
  assert.equal(JSON.stringify([...store.records]), before);
});

test("the server on this computer never takes anyone’s word for who they are", async () => {
  let db = null;
  const local = createSlashApp({ seedDemo: true, store: { read: () => db, write: (next) => (db = next) } });
  const rowan = (await local.dispatch({ method: "POST", url: "/api/demo/login", body: { who: "leading" } })).body;
  const named = { userId: rowan.me.id, email: rowan.me.email };

  const direct = await local.dispatch({ method: "GET", url: "/api/session", token: "", body: {}, actor: named }).catch((error) => error);
  assert.equal(direct.status, 401, "only a hosted household listens to the hub");

  const sent = [];
  const body = Buffer.from(JSON.stringify({ actor: named, signedIn: true, displayName: "Eve", email: "eve@example.com", adultConfirmed: true }));
  const req = Object.assign(Readable.from([body]), { method: "POST", url: "/api/auth/register", headers: { "x-actor": JSON.stringify(named) }, actor: named });
  await local.handle(req, { writeHead: (status) => sent.push(status), end: (text) => sent.push(JSON.parse(text)) });
  assert.equal(sent[0], 400, "no password, no account");
  assert.match(sent[1].error, /6 characters/);

  const signIn = await local.dispatch({ method: "POST", url: "/api/auth/login", body: { email: rowan.me.email, password: "together" } });
  assert.equal(signIn.status, 200, "its own password sign-in still works");
});
