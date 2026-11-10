export const INK = "#2a1b33";

/** A dashed seam, as if sewn. */
export const STITCH = {
  fill: "none",
  stroke: INK,
  strokeWidth: 1.3,
  strokeLinecap: "round" as const,
  strokeDasharray: "2.6 3.2",
  opacity: 0.38,
};

/** A solid embroidered line, for mouths and closed eyes. */
export const THREAD = { fill: "none", stroke: INK, strokeWidth: 2.2, strokeLinecap: "round" as const };

export const FLAME = "M0 -11C6 -4 7 1 5 5.5C3.6 9 -3.6 9 -5 5.5C-7 1 -6 -4 0 -11z";
export const HEART = "M0 7C-9 0.5 -8 -7 -3.6 -7C-1.4 -7 0 -5.4 0 -4C0 -5.4 1.4 -7 3.6 -7C8 -7 9 0.5 0 7z";
export const STAR = "M0 -9l2.6 5.6 6.1.7-4.5 4.2 1.2 6L0 3.6l-5.4 2.9 1.2-6-4.5-4.2 6.1-.7z";
export const SPARKLE = "M0 -9C1 -2.4 2.4 -1 9 0C2.4 1 1 2.4 0 9C-1 2.4 -2.4 1 -9 0C-2.4 -1 -1 -2.4 0 -9z";
