import { GUIDES } from "./catalog.mjs";

/**
 * What a made stuffie is sewn from. The client rolls and draws these ids
 * (src/slash/stuffie/roll.ts keeps the same lists, and a test holds the two
 * together); the server only checks that what it stores is on the list.
 */
export const STUFFIE_PARTS = {
  body: ["round", "squish", "pear", "gumdrop"],
  ears: ["pointy", "long", "round", "floppy", "fin", "leaf"],
  horns: ["none", "nubs", "horn", "antlers", "feelers", "bobbles"],
  wings: ["none", "bat", "feather", "moth", "bee"],
  tail: ["fluff", "whip", "pom", "spade", "fan"],
  snout: ["button", "muzzle", "beak", "whiskers", "fang"],
  pattern: ["plain", "patches", "spots", "stripes", "stitches"],
  palette: ["apricot", "butter", "mint", "rose", "lilac", "sky", "cocoa", "oat", "ash", "coral", "matcha", "plum"],
  eyes: ["button", "sleepy", "starry", "stitched", "oval"],
  accessory: ["none", "ribbon", "scarf", "bell", "flower", "crown", "heart", "plaster"],
};

export const STUFFIE_VOICES = GUIDES.map((guide) => guide.id);

const NAME_MAX = 24;
const SPECIES_MAX = 48;

/** One line of plain text: no control characters or markup brackets, single spaces, cut to length. */
function tidy(value, max) {
  return String(value ?? "")
    .replace(/[\p{Cc}<>]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/**
 * A made stuffie, safe to store and to show to the partner, or null when what
 * was sent is not one. An unknown part falls back to the first of its list; a
 * stuffie with no name is not saved.
 */
export function cleanStuffie(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const name = tidy(input.name, NAME_MAX);
  if (!name) return null;
  const seed = Number(input.seed);
  const stuffie = { seed: Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) % 4294967296 : 0 };
  for (const [slot, allowed] of Object.entries(STUFFIE_PARTS)) {
    stuffie[slot] = typeof input[slot] === "string" && allowed.includes(input[slot]) ? input[slot] : allowed[0];
  }
  stuffie.name = name;
  stuffie.species = tidy(input.species, SPECIES_MAX) || "one-of-a-kind stuffie";
  stuffie.voice = STUFFIE_VOICES.includes(input.voice) ? input.voice : STUFFIE_VOICES[0];
  return stuffie;
}

const MADE_BLURBS = {
  lumen: (name) => `One of a kind, and smug about it. ${name} keeps count of every task you finish.`,
  pip: (name) => `One of a kind and loud about small wins. ${name} can’t sit still when you finish something.`,
  moss: (name) => `One of a kind, soft and slow. ${name} is good company when you need quiet.`,
  sol: (name) => `One of a kind and already proud of you. ${name} wants a streak to brag about.`,
};

const MADE_HUES = { apricot: 18, butter: 44, mint: 164, rose: 340, lilac: 256, sky: 208, cocoa: 24, oat: 34, ash: 250, coral: 6, matcha: 96, plum: 276 };

/** The stuffie this person made, shaped like an entry of GUIDES so it sits in the same lists. */
export function madeGuide(user) {
  const made = user?.stuffie;
  if (!made || !made.name) return null;
  const voice = STUFFIE_VOICES.includes(made.voice) ? made.voice : STUFFIE_VOICES[0];
  return {
    id: "custom",
    name: made.name,
    species: made.species || "one-of-a-kind stuffie",
    blurb: MADE_BLURBS[voice](made.name),
    hue: MADE_HUES[made.palette] ?? 12,
  };
}

/** The ready-made stuffies, plus the one this person made if they have made one. */
export function guidesFor(user) {
  const made = madeGuide(user);
  return made ? [...GUIDES, made] : GUIDES;
}

/**
 * A person's stuffie: what it is called, and which of the four written voices
 * (lumen, pip, moss, sol) it speaks in. A stuffie someone made themselves keeps
 * its own name and species and borrows one of those voices.
 */
export function stuffieOf(user) {
  const made = user?.guideId === "custom" && user.stuffie ? user.stuffie : null;
  const guide = GUIDES.find((item) => item.id === (made ? made.voice : user?.guideId)) || GUIDES[0];
  return { voice: guide.id, name: made?.name || guide.name, species: made?.species || guide.species };
}
