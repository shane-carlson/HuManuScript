import { pick, pickWeighted, seeded } from "../seeded.ts";

/** A stuffie someone made: the parts it is sewn from, its name, and which of the four voices it talks in. */
export type Stuffie = {
  seed: number;
  body: string;
  ears: string;
  horns: string;
  wings: string;
  tail: string;
  snout: string;
  pattern: string;
  palette: string;
  eyes: string;
  accessory: string;
  name: string;
  species: string;
  voice: string;
};

export type StuffiePart = "body" | "ears" | "horns" | "wings" | "tail" | "snout" | "pattern" | "palette" | "eyes" | "accessory";

export const STUFFIE_PARTS: Record<StuffiePart, string[]> = {
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

export type Palette = { main: string; deep: string; cream: string; accent: string; pop: string; shadow: string };

export const PALETTES: Record<string, Palette> = {
  apricot: { main: "#ffb991", deep: "#ff9a6b", cream: "#fff1e3", accent: "#c5b0ff", pop: "#ff5a7a", shadow: "#ffd3c4" },
  butter: { main: "#ffd978", deep: "#ffbf47", cream: "#fff6d6", accent: "#ff8a4c", pop: "#12b5a8", shadow: "#ffe9b0" },
  mint: { main: "#8fdcc8", deep: "#63c9b3", cream: "#f3fff5", accent: "#ffc14d", pop: "#ff8fa3", shadow: "#d3f7ec" },
  rose: { main: "#ffb7cc", deep: "#ff94b4", cream: "#fff0f5", accent: "#ffc14d", pop: "#9f8cf0", shadow: "#ffd6e2" },
  lilac: { main: "#c9b6ff", deep: "#a993f5", cream: "#f6f0ff", accent: "#ffc14d", pop: "#ff8fa3", shadow: "#e4dbff" },
  sky: { main: "#a6d5fa", deep: "#7fbdf0", cream: "#f2f9ff", accent: "#ffc14d", pop: "#ff8fa3", shadow: "#d6ebfd" },
  cocoa: { main: "#c99a7a", deep: "#ad7c5c", cream: "#fbead8", accent: "#ff8fa3", pop: "#12b5a8", shadow: "#ecd6c6" },
  oat: { main: "#f3dcc0", deep: "#e3c19b", cream: "#fffaf0", accent: "#ff8a4c", pop: "#7fd8c6", shadow: "#f0e2cf" },
  ash: { main: "#b9b6c9", deep: "#9b97b0", cream: "#f5f3fa", accent: "#ff8fa3", pop: "#ffc14d", shadow: "#dddbe8" },
  coral: { main: "#ff9f93", deep: "#f77f76", cream: "#fff0e8", accent: "#12b5a8", pop: "#ffc14d", shadow: "#ffd4cd" },
  matcha: { main: "#b7d99a", deep: "#98c476", cream: "#f8fdea", accent: "#ff8fa3", pop: "#ffc14d", shadow: "#dcecc9" },
  plum: { main: "#a98cc6", deep: "#8e6fb0", cream: "#f3e9fb", accent: "#ffc14d", pop: "#ff8fa3", shadow: "#ddd0ea" },
};

export function paletteOf(stuffie: Pick<Stuffie, "palette">) {
  return PALETTES[stuffie.palette] || PALETTES.apricot;
}

/** The four temperaments. Each is one of the written voices, so a made stuffie talks like the guide it takes after. */
export const TEMPERAMENTS = [
  { voice: "lumen", title: "Smug and proud of you", line: "Keeps count of every task you finish and looks pleased about it." },
  { voice: "pip", title: "Loud and excitable", line: "Shouts about small wins. Bad at sitting still." },
  { voice: "moss", title: "Sleepy and gentle", line: "Soft, slow, and good company when you need quiet." },
  { voice: "sol", title: "Sparkly and encouraging", line: "Already proud of you, and wants a streak to brag about." },
] as const;

const NAMES = [
  "Biscuit", "Mochi", "Pudding", "Clover", "Nimbus", "Pebble", "Waffle", "Tofu", "Sprout", "Juniper",
  "Fig", "Dumpling", "Marble", "Thimble", "Button", "Pickle", "Noodle", "Bramble", "Comet", "Maple",
  "Sorrel", "Twig", "Truffle", "Peaches", "Bumble", "Tansy", "Ember", "Willow", "Pippin", "Quill",
  "Fennel", "Honey", "Pumpkin", "Cricket", "Nutmeg", "Olive", "Basil", "Hazel", "Echo", "Orbit",
  "Velvet", "Domino", "Jellybean", "Crumpet", "Toffee", "Mallow", "Dandy", "Poppy", "Figgy", "Bao",
  "Sesame", "Plum", "Kiwi", "Pesto", "Gnocchi", "Tater", "Chai", "Boba", "Miso", "Yuzu",
  "Fable", "Rune", "Wisp", "Dusk", "Lark", "Moth", "Fern", "Reed", "Sable", "Onyx",
  "Pom", "Bean", "Tumble", "Scout", "Mango", "Peanut", "Ziggy", "Momo", "Taro", "Nori",
  "Cocoa", "Pretzel", "Radish", "Sorbet", "Macaron", "Brioche", "Churro", "Puddle", "Pinto", "Squish",
  "Bobbin", "Tassel", "Calico", "Corduroy", "Flannel", "Gingham", "Tweed", "Paisley", "Velour", "Fleece",
  "Nova", "Luna", "Vesper", "Halley", "Juno", "Pluto", "Sirius", "Lyra", "Cosmo", "Astra",
];

const NOUNS: Record<string, string> = {
  pointy: "cat",
  long: "bunny",
  round: "bear",
  floppy: "pup",
  fin: "axolotl",
  leaf: "deer",
};

const DESCRIPTORS: Partial<Record<StuffiePart, Record<string, string>>> = {
  horns: { nubs: "little-horned", horn: "one-horned", antlers: "antlered", feelers: "moth-eared", bobbles: "bobble-topped" },
  wings: { bat: "bat-winged", feather: "feather-winged", moth: "moth-winged", bee: "bee-winged" },
  tail: { fluff: "fluffy-tailed", whip: "long-tailed", pom: "pom-tailed", spade: "dragon-tailed", fan: "fan-tailed" },
  snout: { beak: "beaky", fang: "snaggle-toothed", whiskers: "whiskery" },
  pattern: { patches: "patchwork", spots: "spotted", stripes: "stripy", stitches: "hand-stitched" },
};

/** “a moth-eared bunny”: the creature its ears say it is, plus the one thing you would notice first. */
function speciesLine(parts: Record<StuffiePart, string>, random: () => number) {
  const noun = NOUNS[parts.ears] || "critter";
  const found: string[] = [];
  for (const part of ["horns", "wings", "tail", "snout", "pattern"] as StuffiePart[]) {
    const word = DESCRIPTORS[part]?.[parts[part]];
    // Horns and wings are the showiest, so they are twice as likely to be the word that gets used.
    if (word) found.push(word, ...(part === "horns" || part === "wings" ? [word] : []));
  }
  const word = found.length ? pick(random, found) : "plain and perfect";
  // “one-horned” starts with a vowel letter but not a vowel sound.
  return `${/^[aeiou]/i.test(word) && !word.startsWith("one") ? "an" : "a"} ${word} ${noun}`;
}

/**
 * Rolls a whole stuffie from one number. The same seed always gives the same
 * plush, name and species, so a roll can be shown again anywhere.
 */
export function rollStuffie(seed: number, voice = "lumen"): Stuffie {
  const random = seeded(seed);
  const parts: Record<StuffiePart, string> = {
    body: pick(random, STUFFIE_PARTS.body),
    ears: pick(random, STUFFIE_PARTS.ears),
    horns: pickWeighted(random, STUFFIE_PARTS.horns, { none: 2.5 }),
    wings: pickWeighted(random, STUFFIE_PARTS.wings, { none: 2 }),
    tail: pick(random, STUFFIE_PARTS.tail),
    snout: pick(random, STUFFIE_PARTS.snout),
    pattern: pick(random, STUFFIE_PARTS.pattern),
    palette: pick(random, STUFFIE_PARTS.palette),
    eyes: pickWeighted(random, STUFFIE_PARTS.eyes, { button: 2 }),
    accessory: pickWeighted(random, STUFFIE_PARTS.accessory, { none: 2 }),
  };
  const name = pick(random, NAMES);
  const species = speciesLine(parts, random);
  return { seed: seed >>> 0, ...parts, name, species, voice } as Stuffie;
}

/** A stored stuffie with every part checked against the lists, so an odd or old record still draws. */
export function soundStuffie(input: Partial<Stuffie> | null | undefined): Stuffie | null {
  if (!input || typeof input !== "object") return null;
  const stuffie = { ...rollStuffie(Number(input.seed) || 0), name: String(input.name || "Your stuffie"), species: String(input.species || "one-of-a-kind stuffie") };
  for (const part of Object.keys(STUFFIE_PARTS) as StuffiePart[]) {
    const value = input[part];
    if (typeof value === "string" && STUFFIE_PARTS[part].includes(value)) stuffie[part] = value;
  }
  stuffie.voice = TEMPERAMENTS.some((item) => item.voice === input.voice) ? String(input.voice) : "lumen";
  return stuffie;
}
