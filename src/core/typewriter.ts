/** How far to scroll so the caret sits on the typewriter line. */
export function typewriterScrollDelta(args: {
  caretTop: number;
  caretBottom: number;
  viewTop: number;
  viewBottom: number;
  /** Fraction of the visible page where the caret should rest. */
  anchorRatio?: number;
}): number {
  const viewHeight = args.viewBottom - args.viewTop;
  if (viewHeight <= 0) return 0;
  const ratio = args.anchorRatio ?? 0.42;
  const anchor = args.viewTop + viewHeight * ratio;
  const caretMid = (args.caretTop + args.caretBottom) / 2;
  return caretMid - anchor;
}
