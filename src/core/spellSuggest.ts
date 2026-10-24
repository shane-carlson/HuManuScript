import { SPELL_WORDS } from './spellWords.ts';

const RANK = new Map<string, number>();
const BY_LENGTH = new Map<number, string[]>();
for (let i = 0; i < SPELL_WORDS.length; i++) {
  const word = SPELL_WORDS[i]!;
  RANK.set(word, i);
  const bucket = BY_LENGTH.get(word.length);
  if (bucket) bucket.push(word);
  else BY_LENGTH.set(word.length, [word]);
}

function matchCase(source: string, suggestion: string): string {
  if (source.toLocaleUpperCase() === source) return suggestion.toLocaleUpperCase();
  const first = source[0];
  if (first && first === first.toLocaleUpperCase() && first !== first.toLocaleLowerCase()) {
    return suggestion[0]!.toLocaleUpperCase() + suggestion.slice(1);
  }
  return suggestion;
}

/** Damerau–Levenshtein, capped. Returns max + 1 when the distance is greater. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) rows[i]![0] = i;
  for (let j = 0; j <= b.length; j++) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = rows[i]![0]!;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, rows[i - 2]![j - 2]! + 1);
      }
      rows[i]![j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
  }
  return rows[a.length]![b.length]!;
}

/**
 * Suggestions for a word the page cannot ask the system dictionary about.
 * A word already in the list returns nothing. Casing follows the typed word.
 */
export function suggestSpellings(word: string, limit = 5): string[] {
  const trimmed = word.trim();
  const needle = trimmed.toLocaleLowerCase();
  if (needle.length < 2 || needle.length > 32) return [];
  if (!/^[a-z]+$/.test(needle)) return [];
  if (RANK.has(needle)) return [];
  const max = needle.length <= 4 ? 1 : 2;
  const hits: Array<{ word: string; dist: number; rank: number }> = [];
  for (let length = needle.length - max; length <= needle.length + max; length++) {
    const bucket = BY_LENGTH.get(length);
    if (!bucket) continue;
    for (const candidate of bucket) {
      const dist = editDistance(needle, candidate, max);
      if (dist <= max) hits.push({ word: candidate, dist, rank: RANK.get(candidate) ?? 1_000_000 });
    }
  }
  hits.sort((a, b) => a.dist - b.dist || a.rank - b.rank);
  return hits.slice(0, limit).map((hit) => matchCase(trimmed, hit.word));
}
