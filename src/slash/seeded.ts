/** A small repeatable random source: the same seed always gives the same run of numbers in [0, 1). */
export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable number for a piece of text, for seeding from an id or a name. */
export function seedFrom(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function freshSeed() {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

export function pick<T>(random: () => number, list: readonly T[]): T {
  return list[Math.floor(random() * list.length) % list.length];
}

/** Picks by weight. Anything not named in `weights` counts as 1. */
export function pickWeighted<T extends string>(random: () => number, list: readonly T[], weights: Partial<Record<string, number>> = {}): T {
  const total = list.reduce((sum, item) => sum + (weights[item] ?? 1), 0);
  let roll = random() * total;
  for (const item of list) {
    roll -= weights[item] ?? 1;
    if (roll < 0) return item;
  }
  return list[list.length - 1];
}
