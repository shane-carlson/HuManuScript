function channel(hex: string, at: number) {
  return parseInt(hex.slice(at, at + 2), 16);
}

/** `from` blended towards `to` by `amount` (0 keeps `from`, 1 gives `to`). Both are #rrggbb. */
export function blend(from: string, to: string, amount: number) {
  const part = (at: number) => Math.round(channel(from, at) + (channel(to, at) - channel(from, at)) * amount);
  return `#${[1, 3, 5].map((at) => part(at).toString(16).padStart(2, "0")).join("")}`;
}
