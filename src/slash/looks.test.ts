import assert from "node:assert/strict";
import test from "node:test";
import { AVATAR_PARTS, DEMO_LOOKS, cleanLook } from "../../server/looks.mjs";
import { STUFFIE_PARTS as SERVER_STUFFIE_PARTS, STUFFIE_VOICES, cleanStuffie } from "../../server/stuffie.mjs";
import { CHOICES, LOOK_TABS, SLOT_LABELS, hueOf, lookOf, randomLook, starterLook, type Slot } from "./avatar/looks.ts";
import { blend } from "./blend.ts";
import { seeded } from "./seeded.ts";
import { PALETTES, STUFFIE_PARTS, TEMPERAMENTS, rollStuffie, soundStuffie } from "./stuffie/roll.ts";

const MARKS = ["heart", "star", "moon", "spark", "leaf", "sun", "fox", "flower"];

test("the app draws exactly the avatar parts the server accepts", () => {
  assert.deepEqual(Object.keys(CHOICES).sort(), Object.keys(AVATAR_PARTS).sort());
  for (const slot of Object.keys(CHOICES) as Slot[]) {
    assert.deepEqual(CHOICES[slot].map((choice) => choice.id), AVATAR_PARTS[slot], slot);
    assert.ok(SLOT_LABELS[slot], slot);
  }
  const shown = LOOK_TABS.flatMap((tab) => tab.slots).sort();
  assert.deepEqual(shown, Object.keys(CHOICES).sort());
});

test("the app rolls exactly the stuffie parts the server accepts", () => {
  assert.deepEqual(STUFFIE_PARTS, SERVER_STUFFIE_PARTS);
  assert.deepEqual(TEMPERAMENTS.map((mood) => mood.voice), STUFFIE_VOICES);
  assert.deepEqual(Object.keys(PALETTES), STUFFIE_PARTS.palette);
});

test("an old colour-and-mark avatar always turns into the same whole face", () => {
  for (let hue = 0; hue <= 360; hue += 7) {
    for (const mark of MARKS) {
      const look = starterLook(hue, mark);
      assert.deepEqual(look, starterLook(hue, mark));
      assert.deepEqual(look, lookOf({ hue, mark }));
      assert.deepEqual(cleanLook(look), look, `${hue} ${mark} uses only allowed parts`);
    }
  }
  assert.notDeepEqual(starterLook(18, "heart"), starterLook(200, "star"));
  assert.deepEqual(lookOf(null), lookOf(undefined));
});

test("the demo pair look the same from their old avatars as from the seed", () => {
  assert.deepEqual(starterLook(350, "moon"), DEMO_LOOKS.rowan);
  assert.deepEqual(starterLook(262, "star"), DEMO_LOOKS.avery);
});

test("a saved face is drawn as saved, and gaps or unknown parts fall back to the starter face", () => {
  const starter = starterLook(120, "leaf");
  const saved = { ...starter, hair: "mohawk", topper: "halo" };
  assert.deepEqual(lookOf({ hue: 120, mark: "leaf", look: saved }), saved);
  const patchy = lookOf({ hue: 120, mark: "leaf", look: { hair: "bun", ears: "dragon" } });
  assert.equal(patchy.hair, "bun");
  assert.equal(patchy.ears, starter.ears);
  assert.equal(patchy.skin, starter.skin);
});

test("surprise me gives whole, allowed faces, and the same dice give the same face", () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 300; seed += 1) {
    const look = randomLook(seeded(seed));
    assert.deepEqual(cleanLook(look), look);
    assert.deepEqual(look, randomLook(seeded(seed)));
    assert.notEqual(CHOICES.top.find((item) => item.id === look.top)?.color, CHOICES.backdrop.find((item) => item.id === look.backdrop)?.color);
    assert.ok(hueOf(look) >= 0 && hueOf(look) <= 360);
    seen.add(JSON.stringify(look));
  }
  assert.ok(seen.size > 290, `only ${seen.size} different faces in 300 rolls`);
});

test("the same seed rolls the same stuffie, and the server keeps a roll as it is", () => {
  const seen = new Set<string>();
  const used: Record<string, Set<string>> = {};
  for (let seed = 0; seed < 600; seed += 1) {
    const stuffie = rollStuffie(seed, "sol");
    assert.deepEqual(stuffie, rollStuffie(seed, "sol"));
    assert.deepEqual(cleanStuffie(stuffie), stuffie);
    assert.match(stuffie.species, /^an? [a-z-]+( [a-z-]+)* [a-z]+$/);
    assert.doesNotMatch(stuffie.species, /^an one|^a [aeiu]/);
    assert.ok(stuffie.name.length > 0 && stuffie.name.length <= 24);
    const { name, species, seed: rolled, voice, ...parts } = stuffie;
    assert.equal(rolled, seed);
    assert.equal(voice, "sol");
    assert.ok(name && species);
    seen.add(JSON.stringify(parts));
    for (const [part, id] of Object.entries(parts)) (used[part] ||= new Set()).add(id);
  }
  assert.ok(seen.size > 590, `only ${seen.size} different stuffies in 600 rolls`);
  // Every part on the list can actually come up.
  for (const [part, list] of Object.entries(STUFFIE_PARTS)) assert.deepEqual([...used[part]].sort(), [...list].sort(), part);
  assert.equal(rollStuffie(-1).seed, 4294967295);
});

test("a stored stuffie with an odd part still draws", () => {
  const good = rollStuffie(99, "moss");
  assert.deepEqual(soundStuffie(good), good);
  const odd = soundStuffie({ ...good, ears: "tentacles", voice: "villain", name: "" });
  assert.ok(odd && STUFFIE_PARTS.ears.includes(odd.ears));
  assert.equal(odd?.voice, "lumen");
  assert.ok(odd?.name);
  assert.equal(soundStuffie(null), null);
  assert.equal(soundStuffie(undefined), null);
});

test("colours blend between two hex values", () => {
  assert.equal(blend("#000000", "#ffffff", 0), "#000000");
  assert.equal(blend("#000000", "#ffffff", 1), "#ffffff");
  assert.equal(blend("#102030", "#304050", 0.5), "#203040");
});
