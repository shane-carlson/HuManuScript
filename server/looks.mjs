/**
 * What a character avatar can be made of. The client draws these ids
 * (src/slash/avatar/looks.ts keeps the same lists, and a test holds the two
 * together); the server only checks that what it stores is on the list.
 */
export const AVATAR_PARTS = {
  skin: ["porcelain", "peach", "sand", "honey", "almond", "caramel", "chestnut", "cocoa", "espresso", "ebony", "snow", "marmalade", "lilac", "mint", "sky", "rose", "moonlit"],
  hair: ["bald", "shaved", "crop", "swoop", "quiff", "mohawk", "bob", "long", "wavy", "curly", "coily", "braids", "locs", "bun", "ponytail"],
  hairColor: ["black", "espresso", "brown", "auburn", "ginger", "blonde", "platinum", "grey", "white", "pink", "red", "purple", "blue", "teal", "green"],
  eyes: ["round", "soft", "lashes", "almond", "sleepy", "smiling", "wink"],
  brows: ["soft", "straight", "arched", "thick", "raised"],
  mouth: ["smile", "grin", "smirk", "soft", "lips", "cheeky"],
  cheeks: ["none", "blush", "freckles", "both", "mole"],
  facialHair: ["none", "stubble", "moustache", "goatee", "beard"],
  glasses: ["none", "round", "square", "cateye", "shades"],
  ears: ["human", "elf", "cat", "fox", "bunny", "bear", "pup"],
  earrings: ["none", "studs", "hoops", "drops"],
  neck: ["none", "choker", "collar", "pendant"],
  topper: ["none", "bow", "flower", "horns", "halo", "crown"],
  top: ["coral", "teal", "plum", "ink", "gold", "lilac", "cream", "sky", "forest", "rose"],
  backdrop: ["blush", "peach", "butter", "mint", "sky", "lilac", "coral", "teal", "plum", "gold"],
};

export const AVATAR_MARKS = ["heart", "star", "moon", "spark", "leaf", "sun", "fox", "flower"];

/** The demo pair's faces. The client keeps the same two for their old colour-and-mark avatars. */
export const DEMO_LOOKS = {
  rowan: {
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
  avery: {
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

/**
 * A look with every slot filled from the allowed lists, or null when nothing usable
 * was sent. A slot that is missing or unknown keeps what was there before, and
 * falls back to the first choice for someone who never had a look.
 */
export function cleanLook(input, previous) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const look = {};
  let known = 0;
  for (const [slot, allowed] of Object.entries(AVATAR_PARTS)) {
    if (typeof input[slot] === "string" && allowed.includes(input[slot])) {
      look[slot] = input[slot];
      known += 1;
    } else {
      look[slot] = previous && allowed.includes(previous[slot]) ? previous[slot] : allowed[0];
    }
  }
  return known > 0 ? look : null;
}

/**
 * What gets stored as a person's avatar. Avatars from before there were faces
 * are only a colour and a mark, and stay valid: the client draws a face from those.
 */
export function cleanAvatar(input, previous) {
  const before = previous && typeof previous === "object" ? previous : {};
  const hueGiven = Number(input?.hue);
  const hue = Number.isFinite(hueGiven) ? Math.max(0, Math.min(360, Math.round(hueGiven))) : Number(before.hue) || 0;
  const mark = AVATAR_MARKS.includes(input?.mark) ? input.mark : AVATAR_MARKS.includes(before.mark) ? before.mark : "heart";
  const avatar = { hue, mark };
  const look = cleanLook(input?.look, before.look) || cleanLook(before.look);
  if (look) avatar.look = look;
  return avatar;
}
