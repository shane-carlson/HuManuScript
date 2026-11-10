import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AVATAR_PARTS, DEMO_LOOKS, cleanAvatar, cleanLook } from "./looks.mjs";
import { createSlashApp } from "./slashconnect.mjs";
import { STUFFIE_PARTS, cleanStuffie, guidesFor, madeGuide, stuffieOf } from "./stuffie.mjs";

function tempApp(seedDemo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slashconnect-looks-"));
  return createSlashApp({ dataFile: path.join(dir, "db.json"), seedDemo });
}

async function call(app, method, url, { token, body } = {}) {
  try {
    return await app.dispatch({ method, url, token, body: body || {} });
  } catch (error) {
    return { status: error.status || 500, body: { error: error.message } };
  }
}

async function demoPair() {
  const app = tempApp(true);
  const rowan = (await call(app, "POST", "/api/demo/login", { body: { who: "leading" } })).body.token;
  const avery = (await call(app, "POST", "/api/demo/login", { body: { who: "following" } })).body.token;
  return { app, rowan, avery };
}

const LOOK = {
  skin: "cocoa",
  hair: "locs",
  hairColor: "black",
  eyes: "almond",
  brows: "thick",
  mouth: "smirk",
  cheeks: "none",
  facialHair: "goatee",
  glasses: "square",
  ears: "elf",
  earrings: "studs",
  neck: "choker",
  topper: "horns",
  top: "plum",
  backdrop: "teal",
};

const STUFFIE = {
  seed: 424242,
  body: "pear",
  ears: "long",
  horns: "feelers",
  wings: "moth",
  tail: "pom",
  snout: "whiskers",
  pattern: "patches",
  palette: "lilac",
  eyes: "stitched",
  accessory: "scarf",
  name: "Biscuit",
  species: "a moth-eared bunny",
  voice: "moss",
};

test("a look keeps only ids from the allowed lists", () => {
  assert.deepEqual(cleanLook(LOOK), LOOK);
  const mixed = cleanLook({ ...LOOK, hair: "<script>", ears: "dragon", top: 7, extra: "not a slot" });
  assert.equal(mixed.hair, AVATAR_PARTS.hair[0]);
  assert.equal(mixed.ears, AVATAR_PARTS.ears[0]);
  assert.equal(mixed.top, AVATAR_PARTS.top[0]);
  assert.equal(mixed.extra, undefined);
  assert.deepEqual(Object.keys(mixed).sort(), Object.keys(AVATAR_PARTS).sort());
  for (const [slot, value] of Object.entries(mixed)) assert.ok(AVATAR_PARTS[slot].includes(value), `${slot}: ${value}`);
});

test("a bad slot keeps what the person already had", () => {
  const kept = cleanLook({ hair: "nope", eyes: "wink" }, LOOK);
  assert.equal(kept.hair, "locs");
  assert.equal(kept.eyes, "wink");
  assert.equal(kept.backdrop, "teal");
});

test("something that is not a look at all is not stored as one", () => {
  for (const junk of [null, undefined, "curly", 4, [], ["bob"], {}, { hair: "nope" }, { nonsense: true }]) {
    assert.equal(cleanLook(junk), null);
  }
});

test("an avatar from before there were faces is still a valid avatar", () => {
  assert.deepEqual(cleanAvatar({ hue: 350, mark: "moon" }), { hue: 350, mark: "moon" });
  assert.deepEqual(cleanAvatar({ hue: 999, mark: "skull" }), { hue: 360, mark: "heart" });
  assert.deepEqual(cleanAvatar({ hue: -4, mark: "fox", look: "bob" }), { hue: 0, mark: "fox" });
  assert.deepEqual(cleanAvatar({ hue: "abc" }, { hue: 120, mark: "leaf" }), { hue: 120, mark: "leaf" });
});

test("an old client that sends only colour and mark does not wipe a saved face", () => {
  const next = cleanAvatar({ hue: 40, mark: "sun" }, { hue: 350, mark: "moon", look: LOOK });
  assert.deepEqual(next, { hue: 40, mark: "sun", look: LOOK });
});

test("the demo pair are seeded with two different, valid faces", async () => {
  const { app, rowan, avery } = await demoPair();
  assert.deepEqual(cleanLook(DEMO_LOOKS.rowan), DEMO_LOOKS.rowan);
  assert.deepEqual(cleanLook(DEMO_LOOKS.avery), DEMO_LOOKS.avery);
  assert.notDeepEqual(DEMO_LOOKS.rowan, DEMO_LOOKS.avery);
  const asRowan = (await call(app, "GET", "/api/session", { token: rowan })).body;
  assert.deepEqual(asRowan.me.avatar.look, DEMO_LOOKS.rowan);
  assert.deepEqual(asRowan.partner.avatar.look, DEMO_LOOKS.avery);
  const asAvery = (await call(app, "GET", "/api/session", { token: avery })).body;
  assert.deepEqual(asAvery.me.avatar.look, DEMO_LOOKS.avery);
});

test("saving a face cleans it, keeps it, and shows it to the partner", async () => {
  const { app, rowan, avery } = await demoPair();
  const saved = await call(app, "PATCH", "/api/profile", {
    token: avery,
    body: { avatar: { hue: 173, mark: "star", look: { ...LOOK, glasses: "monocle", sneaky: "<img>" } } },
  });
  assert.equal(saved.status, 200);
  // The unknown glasses fall back to what Avery was already wearing.
  const expected = { ...LOOK, glasses: DEMO_LOOKS.avery.glasses };
  assert.deepEqual(saved.body.me.avatar, { hue: 173, mark: "star", look: expected });
  const partnerView = (await call(app, "GET", "/api/session", { token: rowan })).body;
  assert.deepEqual(partnerView.partner.avatar.look, expected);

  const reopened = createSlashApp({ dataFile: app.dataFile, seedDemo: true });
  const again = (await call(reopened, "POST", "/api/demo/login", { body: { who: "following" } })).body;
  assert.deepEqual(again.me.avatar.look, expected);
});

test("a household saved before faces and made stuffies still opens", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slashconnect-looks-"));
  const file = path.join(dir, "db.json");
  const fresh = createSlashApp({ dataFile: file, seedDemo: true });
  await call(fresh, "POST", "/api/demo/login", { body: { who: "leading" } });
  const old = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const user of old.users) {
    delete user.avatar.look;
    delete user.stuffie;
  }
  fs.writeFileSync(file, JSON.stringify(old));

  const app = createSlashApp({ dataFile: file, seedDemo: true });
  const login = await call(app, "POST", "/api/demo/login", { body: { who: "following" } });
  assert.equal(login.status, 200);
  assert.deepEqual(login.body.me.avatar, { hue: 262, mark: "star" });
  assert.equal(login.body.me.stuffie, undefined);
  assert.deepEqual(login.body.meta.guides.map((guide) => guide.id), ["lumen", "pip", "moss", "sol"]);
  const renamed = await call(app, "PATCH", "/api/profile", { token: login.body.token, body: { displayName: "Avery Q" } });
  assert.equal(renamed.status, 200);
  assert.deepEqual(renamed.body.me.avatar, { hue: 262, mark: "star" });
});

test("a made stuffie keeps only allowed parts and a tidy name", () => {
  assert.deepEqual(cleanStuffie(STUFFIE), STUFFIE);
  const odd = cleanStuffie({
    ...STUFFIE,
    seed: -12.7,
    ears: "tentacles",
    wings: ["bat"],
    palette: "neon",
    name: "  <b>Sir\u0007 Fluffington</b> the Extremely Long-Named, Third of That Name ",
    species: "a\nvery\tstrange   thing ".repeat(8),
    voice: "villain",
    extra: "dropped",
  });
  assert.equal(odd.ears, STUFFIE_PARTS.ears[0]);
  assert.equal(odd.wings, STUFFIE_PARTS.wings[0]);
  assert.equal(odd.palette, STUFFIE_PARTS.palette[0]);
  assert.equal(odd.voice, "lumen");
  assert.equal(odd.seed, 12);
  assert.equal(odd.extra, undefined);
  assert.ok(odd.name.length <= 24, odd.name);
  assert.doesNotMatch(odd.name, /[\p{Cc}<>]|\s{2}|^\s|\s$/u);
  assert.ok(odd.species.length <= 48);
  assert.doesNotMatch(odd.species, /[\n\t]|\s{2}/);
  for (const part of Object.keys(STUFFIE_PARTS)) assert.ok(STUFFIE_PARTS[part].includes(odd[part]), part);
});

test("a stuffie with no name, or that is not a stuffie, is turned away", async () => {
  for (const junk of [null, "custom", 3, [], {}, { ...STUFFIE, name: "   " }, { ...STUFFIE, name: "<>" }]) {
    assert.equal(cleanStuffie(junk), null);
  }
  const { app, avery } = await demoPair();
  const nameless = await call(app, "PATCH", "/api/profile", { token: avery, body: { guideId: "custom", stuffie: { ...STUFFIE, name: "" } } });
  assert.equal(nameless.status, 400);
  const none = await call(app, "PATCH", "/api/profile", { token: avery, body: { guideId: "custom" } });
  assert.equal(none.status, 400);
  const still = (await call(app, "GET", "/api/session", { token: avery })).body;
  assert.equal(still.me.guideId, "pip");
  assert.equal(still.me.stuffie, undefined);
});

test("a made stuffie round-trips, joins the person's own guide list, and reaches the partner", async () => {
  const { app, rowan, avery } = await demoPair();
  const saved = await call(app, "PATCH", "/api/profile", { token: avery, body: { guideId: "custom", stuffie: { ...STUFFIE, horns: "tusks" } } });
  assert.equal(saved.status, 200);
  const expected = { ...STUFFIE, horns: "none" };
  assert.equal(saved.body.me.guideId, "custom");
  assert.deepEqual(saved.body.me.stuffie, expected);

  const mine = saved.body.meta.guides.find((guide) => guide.id === "custom");
  assert.equal(saved.body.meta.guides.length, 5);
  assert.equal(mine.name, "Biscuit");
  assert.equal(mine.species, "a moth-eared bunny");
  assert.match(mine.blurb, /Biscuit/);
  assert.equal(typeof mine.hue, "number");
  // The lookup the home screen already does.
  assert.equal(saved.body.meta.guides.find((guide) => guide.id === saved.body.me.guideId)?.name, "Biscuit");

  const partnerView = (await call(app, "GET", "/api/session", { token: rowan })).body;
  assert.equal(partnerView.partner.guideId, "custom");
  assert.deepEqual(partnerView.partner.stuffie, expected);
  // Rowan's own list is unchanged: Avery's stuffie is not one Rowan can pick.
  assert.deepEqual(partnerView.meta.guides.map((guide) => guide.id), ["lumen", "pip", "moss", "sol"]);

  const reopened = createSlashApp({ dataFile: app.dataFile, seedDemo: true });
  const again = (await call(reopened, "POST", "/api/demo/login", { body: { who: "following" } })).body;
  assert.deepEqual(again.me.stuffie, expected);
  assert.equal(again.me.guideId, "custom");
});

test("going back to a ready-made stuffie keeps the made one for later", async () => {
  const { app, avery } = await demoPair();
  await call(app, "PATCH", "/api/profile", { token: avery, body: { guideId: "custom", stuffie: STUFFIE } });
  const back = await call(app, "PATCH", "/api/profile", { token: avery, body: { guideId: "sol" } });
  assert.equal(back.body.me.guideId, "sol");
  assert.deepEqual(back.body.me.stuffie, STUFFIE);
  assert.ok(back.body.meta.guides.some((guide) => guide.id === "custom"));
  const again = await call(app, "PATCH", "/api/profile", { token: avery, body: { guideId: "custom" } });
  assert.equal(again.status, 200);
  assert.equal(again.body.me.guideId, "custom");
  const unknown = await call(app, "PATCH", "/api/profile", { token: avery, body: { guideId: "gremlin" } });
  assert.equal(unknown.body.me.guideId, "custom");
});

test("a made stuffie keeps its own name and borrows one of the four voices", () => {
  assert.deepEqual(stuffieOf({ guideId: "custom", stuffie: STUFFIE }), { voice: "moss", name: "Biscuit", species: "a moth-eared bunny" });
  assert.deepEqual(stuffieOf({ guideId: "pip", stuffie: STUFFIE }), { voice: "pip", name: "Pip", species: "baby phoenix" });
  assert.deepEqual(stuffieOf({ guideId: "custom" }), { voice: "lumen", name: "Lumen", species: "kitsune" });
  assert.equal(stuffieOf({ guideId: "custom", stuffie: { ...STUFFIE, voice: "villain" } }).voice, "lumen");
  assert.equal(madeGuide({ guideId: "pip" }), null);
  assert.equal(guidesFor(null).length, 4);
  for (const voice of ["lumen", "pip", "moss", "sol"]) {
    const guide = madeGuide({ stuffie: { ...STUFFIE, voice } });
    assert.equal(guide.id, "custom");
    assert.match(guide.blurb, /Biscuit/);
  }
});

test("someone new can finish setting up with a made face and a made stuffie", async () => {
  const app = tempApp(false);
  const signup = await call(app, "POST", "/api/auth/register", {
    body: { email: "ada@example.com", password: "secret1", displayName: "Ada", adultConfirmed: true },
  });
  assert.equal(signup.status, 201);
  const token = signup.body.token;
  const basics = {
    pronouns: { label: "she/her", subject: "she", object: "her", possessive: "her", reflexive: "herself" },
    slashSide: "following",
    roleTitle: "Pet",
    goals: ["connection"],
  };
  const halfway = await call(app, "PATCH", "/api/profile", { token, body: { ...basics, guideId: "custom", onboardingComplete: true } });
  assert.equal(halfway.status, 400);
  const done = await call(app, "PATCH", "/api/profile", {
    token,
    body: { ...basics, avatar: { hue: 277, mark: "heart", look: LOOK }, guideId: "custom", stuffie: STUFFIE, onboardingComplete: true },
  });
  assert.equal(done.status, 200);
  assert.equal(done.body.me.onboardingComplete, true);
  assert.deepEqual(done.body.me.avatar.look, LOOK);
  assert.deepEqual(done.body.me.stuffie, STUFFIE);
  assert.equal(done.body.meta.guides.at(-1).name, "Biscuit");
});
