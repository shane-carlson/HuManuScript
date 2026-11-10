import { pick, pickWeighted, seedFrom, seeded } from "../seeded.ts";

export type Look = {
  skin: string;
  hair: string;
  hairColor: string;
  eyes: string;
  brows: string;
  mouth: string;
  cheeks: string;
  facialHair: string;
  glasses: string;
  ears: string;
  earrings: string;
  neck: string;
  topper: string;
  top: string;
  backdrop: string;
};

export type Slot = keyof Look;

/** A stored avatar. Ones saved before there were faces have only a colour and a mark. */
export type AvatarData = { hue: number; mark: string; look?: Partial<Look> | null };

export type Choice = { id: string; label: string; color?: string; hue?: number };

const SKIN: Choice[] = [
  { id: "porcelain", label: "Porcelain", color: "#ffe3d3" },
  { id: "peach", label: "Peach", color: "#f9d2b8" },
  { id: "sand", label: "Sand", color: "#eebf9c" },
  { id: "honey", label: "Honey", color: "#dfa77d" },
  { id: "almond", label: "Almond", color: "#c98f65" },
  { id: "caramel", label: "Caramel", color: "#b17850" },
  { id: "chestnut", label: "Chestnut", color: "#96613f" },
  { id: "cocoa", label: "Cocoa", color: "#7b4d34" },
  { id: "espresso", label: "Espresso", color: "#63402e" },
  { id: "ebony", label: "Ebony", color: "#523428" },
  { id: "snow", label: "Snow fur", color: "#f8f3ee" },
  { id: "marmalade", label: "Marmalade fur", color: "#f2a660" },
  { id: "lilac", label: "Lilac", color: "#cdbcf7" },
  { id: "mint", label: "Mint", color: "#aee5d2" },
  { id: "sky", label: "Sky", color: "#b1d8f7" },
  { id: "rose", label: "Rose", color: "#ffbccd" },
  { id: "moonlit", label: "Moonlit", color: "#d6d3e2" },
];

const HAIR: Choice[] = [
  { id: "bald", label: "Bald" },
  { id: "shaved", label: "Shaved" },
  { id: "crop", label: "Short" },
  { id: "swoop", label: "Swept" },
  { id: "quiff", label: "Quiff" },
  { id: "mohawk", label: "Mohawk" },
  { id: "bob", label: "Bob" },
  { id: "long", label: "Long" },
  { id: "wavy", label: "Wavy" },
  { id: "curly", label: "Curly" },
  { id: "coily", label: "Coily" },
  { id: "braids", label: "Braids" },
  { id: "locs", label: "Locs" },
  { id: "bun", label: "Bun" },
  { id: "ponytail", label: "Ponytail" },
];

const HAIR_COLOR: Choice[] = [
  { id: "black", label: "Black", color: "#2a2028" },
  { id: "espresso", label: "Dark brown", color: "#46302a" },
  { id: "brown", label: "Brown", color: "#6d4631" },
  { id: "auburn", label: "Auburn", color: "#8e4a30" },
  { id: "ginger", label: "Ginger", color: "#cf6a32" },
  { id: "blonde", label: "Blonde", color: "#e6bb68" },
  { id: "platinum", label: "Platinum", color: "#f1e2bf" },
  { id: "grey", label: "Grey", color: "#a7a3ae" },
  { id: "white", label: "White", color: "#f4f1f6" },
  { id: "pink", label: "Pink", color: "#ff8fb3" },
  { id: "red", label: "Red", color: "#e23e52" },
  { id: "purple", label: "Purple", color: "#8b62d6" },
  { id: "blue", label: "Blue", color: "#4f8fe0" },
  { id: "teal", label: "Teal", color: "#16b3a6" },
  { id: "green", label: "Green", color: "#62b86a" },
];

const EYES: Choice[] = [
  { id: "round", label: "Round" },
  { id: "soft", label: "Soft" },
  { id: "lashes", label: "Lashes" },
  { id: "almond", label: "Almond" },
  { id: "sleepy", label: "Sleepy" },
  { id: "smiling", label: "Smiling" },
  { id: "wink", label: "Wink" },
];

const BROWS: Choice[] = [
  { id: "soft", label: "Soft" },
  { id: "straight", label: "Straight" },
  { id: "arched", label: "Arched" },
  { id: "thick", label: "Bold" },
  { id: "raised", label: "One up" },
];

const MOUTH: Choice[] = [
  { id: "smile", label: "Smile" },
  { id: "grin", label: "Grin" },
  { id: "smirk", label: "Smirk" },
  { id: "soft", label: "Soft" },
  { id: "lips", label: "Lipstick" },
  { id: "cheeky", label: "Cheeky" },
];

const CHEEKS: Choice[] = [
  { id: "none", label: "Bare" },
  { id: "blush", label: "Blush" },
  { id: "freckles", label: "Freckles" },
  { id: "both", label: "Both" },
  { id: "mole", label: "Beauty mark" },
];

const FACIAL_HAIR: Choice[] = [
  { id: "none", label: "None" },
  { id: "stubble", label: "Stubble" },
  { id: "moustache", label: "Moustache" },
  { id: "goatee", label: "Goatee" },
  { id: "beard", label: "Beard" },
];

const GLASSES: Choice[] = [
  { id: "none", label: "None" },
  { id: "round", label: "Round" },
  { id: "square", label: "Square" },
  { id: "cateye", label: "Cat-eye" },
  { id: "shades", label: "Shades" },
];

const EARS: Choice[] = [
  { id: "human", label: "Human" },
  { id: "elf", label: "Elf" },
  { id: "cat", label: "Cat" },
  { id: "fox", label: "Fox" },
  { id: "bunny", label: "Bunny" },
  { id: "bear", label: "Bear" },
  { id: "pup", label: "Pup" },
];

const EARRINGS: Choice[] = [
  { id: "none", label: "None" },
  { id: "studs", label: "Studs" },
  { id: "hoops", label: "Hoops" },
  { id: "drops", label: "Drops" },
];

const NECK: Choice[] = [
  { id: "none", label: "Bare" },
  { id: "choker", label: "Choker" },
  { id: "collar", label: "Collar" },
  { id: "pendant", label: "Pendant" },
];

const TOPPER: Choice[] = [
  { id: "none", label: "Nothing" },
  { id: "bow", label: "Bow" },
  { id: "flower", label: "Flower" },
  { id: "horns", label: "Little horns" },
  { id: "halo", label: "Halo" },
  { id: "crown", label: "Crown" },
];

const TOP: Choice[] = [
  { id: "coral", label: "Coral", color: "#ff5a7a" },
  { id: "teal", label: "Teal", color: "#12b5a8" },
  { id: "plum", label: "Plum", color: "#6b3f86" },
  { id: "ink", label: "Ink", color: "#2a1b33" },
  { id: "gold", label: "Gold", color: "#ffc14d" },
  { id: "lilac", label: "Lilac", color: "#b8a2f5" },
  { id: "cream", label: "Cream", color: "#fff4e6" },
  { id: "sky", label: "Sky", color: "#6fb1ee" },
  { id: "forest", label: "Forest", color: "#2f7d62" },
  { id: "rose", label: "Rose", color: "#ff9fb7" },
];

const BACKDROP: Choice[] = [
  { id: "blush", label: "Blush", color: "#ffd6de", hue: 348 },
  { id: "peach", label: "Peach", color: "#ffd8bf", hue: 24 },
  { id: "butter", label: "Butter", color: "#ffe9a8", hue: 52 },
  { id: "mint", label: "Mint", color: "#bfeedd", hue: 158 },
  { id: "sky", label: "Sky", color: "#c6e2ff", hue: 211 },
  { id: "lilac", label: "Lilac", color: "#ddd0ff", hue: 262 },
  { id: "coral", label: "Coral", color: "#ff8fa1", hue: 350 },
  { id: "teal", label: "Teal", color: "#6fd3c6", hue: 173 },
  { id: "plum", label: "Plum", color: "#7a5591", hue: 277 },
  { id: "gold", label: "Gold", color: "#ffc95e", hue: 40 },
];

export const CHOICES: Record<Slot, Choice[]> = {
  skin: SKIN,
  hair: HAIR,
  hairColor: HAIR_COLOR,
  eyes: EYES,
  brows: BROWS,
  mouth: MOUTH,
  cheeks: CHEEKS,
  facialHair: FACIAL_HAIR,
  glasses: GLASSES,
  ears: EARS,
  earrings: EARRINGS,
  neck: NECK,
  topper: TOPPER,
  top: TOP,
  backdrop: BACKDROP,
};

export const SLOT_LABELS: Record<Slot, string> = {
  skin: "Skin or fur",
  hair: "Hair",
  hairColor: "Hair colour",
  eyes: "Eyes",
  brows: "Brows",
  mouth: "Mouth",
  cheeks: "Cheeks",
  facialHair: "Facial hair",
  glasses: "Glasses",
  ears: "Ears",
  earrings: "Earrings",
  neck: "Around your neck",
  topper: "On top",
  top: "Top",
  backdrop: "Backdrop",
};

/** How the builder groups the slots into tabs. */
export const LOOK_TABS: { id: string; label: string; slots: Slot[] }[] = [
  { id: "skin", label: "Skin", slots: ["skin", "ears"] },
  { id: "hair", label: "Hair", slots: ["hair", "hairColor", "facialHair"] },
  { id: "face", label: "Face", slots: ["eyes", "brows", "mouth", "cheeks"] },
  { id: "extras", label: "Extras", slots: ["glasses", "earrings", "neck", "topper"] },
  { id: "colours", label: "Colours", slots: ["top", "backdrop"] },
];

export function colorOf(slot: Slot, id: string) {
  const list = CHOICES[slot];
  return (list.find((item) => item.id === id) || list[0]).color || "#000000";
}

/** The demo pair, whose old avatars were exactly these colour-and-mark pairs. The server seeds the same two faces. */
const STARTERS: Record<string, Look> = {
  "350:moon": {
    skin: "honey",
    hair: "wavy",
    hairColor: "auburn",
    eyes: "lashes",
    brows: "arched",
    mouth: "lips",
    cheeks: "mole",
    facialHair: "none",
    glasses: "none",
    ears: "human",
    earrings: "hoops",
    neck: "pendant",
    topper: "none",
    top: "ink",
    backdrop: "coral",
  },
  "262:star": {
    skin: "chestnut",
    hair: "curly",
    hairColor: "purple",
    eyes: "round",
    brows: "soft",
    mouth: "grin",
    cheeks: "freckles",
    facialHair: "none",
    glasses: "round",
    ears: "cat",
    earrings: "studs",
    neck: "collar",
    topper: "none",
    top: "teal",
    backdrop: "butter",
  },
};

const NATURAL_SKIN = SKIN.slice(0, 10).map((item) => item.id);
const NATURAL_HAIR_COLORS = HAIR_COLOR.slice(0, 9).map((item) => item.id);
const ids = (slot: Slot) => CHOICES[slot].map((item) => item.id);

function nearestBackdrop(hue: number) {
  let best = BACKDROP[0];
  let gap = 999;
  for (const item of BACKDROP) {
    const raw = Math.abs((item.hue ?? 0) - hue) % 360;
    const distance = Math.min(raw, 360 - raw);
    if (distance < gap) {
      gap = distance;
      best = item;
    }
  }
  return best.id;
}

/**
 * The face for an avatar that only has a colour and a mark. It is worked out
 * from those two, so the same person gets the same face every time, everywhere.
 */
export function starterLook(hue: number, mark: string): Look {
  const key = `${Math.round(Number(hue) || 0)}:${mark || "heart"}`;
  if (STARTERS[key]) return { ...STARTERS[key] };
  const random = seeded(seedFrom(key));
  const look: Look = {
    skin: pick(random, NATURAL_SKIN),
    hair: pick(random, ids("hair")),
    hairColor: pick(random, NATURAL_HAIR_COLORS),
    eyes: pick(random, ["round", "soft", "lashes", "almond"]),
    brows: pick(random, ["soft", "straight", "arched"]),
    mouth: pick(random, ["smile", "smile", "soft", "grin"]),
    cheeks: pick(random, ["none", "blush", "freckles"]),
    facialHair: "none",
    glasses: pickWeighted(random, ["none", "round", "square"], { none: 4 }),
    ears: mark === "fox" ? "fox" : mark === "leaf" ? "elf" : "human",
    earrings: "none",
    neck: "none",
    topper: mark === "flower" ? "flower" : mark === "sun" ? "halo" : "none",
    top: pick(random, ids("top")),
    backdrop: nearestBackdrop(Number(hue) || 0),
  };
  if (colorOf("top", look.top) === colorOf("backdrop", look.backdrop)) look.top = "ink";
  return look;
}

/** The full look to draw for an avatar: what was saved, with anything missing or unknown filled from the starter face. */
export function lookOf(avatar: AvatarData | null | undefined): Look {
  const base = starterLook(avatar?.hue ?? 16, avatar?.mark || "heart");
  const saved = avatar?.look;
  if (!saved || typeof saved !== "object") return base;
  const look = { ...base };
  for (const slot of Object.keys(CHOICES) as Slot[]) {
    const value = saved[slot];
    if (typeof value === "string" && CHOICES[slot].some((item) => item.id === value)) look[slot] = value;
  }
  return look;
}

/** A roll of the dice for “Surprise me”. Leans towards faces that read well, with the odd pair of fox ears. */
export function randomLook(random: () => number): Look {
  const hair = pick(random, ids("hair"));
  const look: Look = {
    skin: pickWeighted(random, ids("skin"), { snow: 0.4, marmalade: 0.4, lilac: 0.4, mint: 0.4, sky: 0.4, rose: 0.4, moonlit: 0.4 }),
    hair,
    hairColor: pick(random, ids("hairColor")),
    eyes: pick(random, ids("eyes")),
    brows: pick(random, ids("brows")),
    mouth: pick(random, ids("mouth")),
    cheeks: pickWeighted(random, ids("cheeks"), { none: 2 }),
    facialHair: pickWeighted(random, ids("facialHair"), { none: 9 }),
    glasses: pickWeighted(random, ids("glasses"), { none: 7 }),
    ears: pickWeighted(random, ids("ears"), { human: 8 }),
    earrings: pickWeighted(random, ids("earrings"), { none: 3 }),
    neck: pickWeighted(random, ids("neck"), { none: 3 }),
    topper: pickWeighted(random, ids("topper"), { none: 10 }),
    top: pick(random, ids("top")),
    backdrop: pick(random, ids("backdrop")),
  };
  if (colorOf("top", look.top) === colorOf("backdrop", look.backdrop)) look.top = look.backdrop === "plum" ? "cream" : "ink";
  return look;
}

/** The colour kept beside a look, so anything that still reads only the old colour stays close to the backdrop. */
export function hueOf(look: Look) {
  return BACKDROP.find((item) => item.id === look.backdrop)?.hue ?? 16;
}
