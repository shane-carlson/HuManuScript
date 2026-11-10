import type { CSSProperties, ReactNode } from "react";
import { INK, STITCH, THREAD } from "./thread.ts";

/** A piece of the plush that turns or stretches around `at`, given in the drawing's own units. */
export function Part({ name, at, children }: { name: string; at: [number, number]; children: ReactNode }) {
  return (
    <g className={`gp gp-${name}`} style={{ transformOrigin: `${at[0]}px ${at[1]}px` }}>
      {children}
    </g>
  );
}

export function Shadow({ cx, rx, fill }: { cx: number; rx: number; fill: string }) {
  return <ellipse className="gp gp-shadow" cx={cx} cy="112" rx={rx} ry="5" fill={fill} style={{ transformOrigin: `${cx}px 112px` }} />;
}

/** The everyday face, plus the celebrating face that swaps in while the plush cheers. */
export function Looks({ idle, happy, cheer }: { idle: ReactNode; happy: ReactNode; cheer: boolean }) {
  return (
    <>
      <g className="gp-look-idle">{idle}</g>
      {cheer ? <g className="gp-look-cheer">{happy}</g> : null}
    </>
  );
}

export function ButtonEyes({ y, left = 47, right = 73 }: { y: number; left?: number; right?: number }) {
  return (
    <>
      <circle cx={left} cy={y} r="4.8" fill={INK} />
      <circle cx={right} cy={y} r="4.8" fill={INK} />
      <circle cx={left + 1.6} cy={y - 1.7} r="1.6" fill="#fff" />
      <circle cx={right + 1.6} cy={y - 1.7} r="1.6" fill="#fff" />
    </>
  );
}

export function HappyEyes({ y, left = 47, right = 73 }: { y: number; left?: number; right?: number }) {
  const arc = (x: number) => `M${x - 5.4} ${y + 2.4}q5.4 -8.2 10.8 0`;
  return <path d={arc(left) + arc(right)} {...THREAD} strokeWidth="2.9" />;
}

export function Blush({ y, left = 37, right = 83 }: { y: number; left?: number; right?: number }) {
  return (
    <g className="gp-blush">
      <ellipse cx={left} cy={y} rx="4.6" ry="3.2" fill="#ff8fa3" opacity="0.7" />
      <ellipse cx={right} cy={y} rx="4.6" ry="3.2" fill="#ff8fa3" opacity="0.7" />
    </g>
  );
}

/** A soft teardrop that starts at 0,0 and points up, for tails, flames, and manes. */
export function Tuft({ x, y, turn, length, fill, tip }: { x: number; y: number; turn: number; length: number; fill: string; tip?: string }) {
  const half = length * 0.3;
  const body = `M0 0C${-half} ${-length * 0.25} ${-half} ${-length * 0.7} 0 ${-length}C${half} ${-length * 0.7} ${half} ${-length * 0.25} 0 0z`;
  const cap = `M0 ${-length}C${-half * 0.62} ${-length * 0.84} ${-half * 0.78} ${-length * 0.72} ${-half * 0.8} ${-length * 0.62}C${-half * 0.3} ${-length * 0.7} ${half * 0.3} ${-length * 0.7} ${half * 0.8} ${-length * 0.62}C${half * 0.78} ${-length * 0.72} ${half * 0.62} ${-length * 0.84} 0 ${-length}z`;
  return (
    <g transform={`translate(${x} ${y}) rotate(${turn})`}>
      <path d={body} fill={fill} />
      {tip ? <path d={cap} fill={tip} /> : null}
      <path d={`M0 ${-length * 0.2}V${-length * 0.62}`} {...STITCH} />
    </g>
  );
}

/** A small extra that floats near the plush while it cheers. `drift` is where it travels to. */
export function Floater({ name, x, y, drift, delay, children }: { name: string; x: number; y: number; drift?: [number, number]; delay: number; children: ReactNode }) {
  const style = {
    transformOrigin: `${x}px ${y}px`,
    animationDelay: `${delay}s`,
    "--dx": `${drift?.[0] ?? 0}px`,
    "--dy": `${drift?.[1] ?? 0}px`,
  } as CSSProperties;
  return (
    <g className={`gp gp-${name}`} style={style}>
      <g transform={`translate(${x} ${y})`}>{children}</g>
    </g>
  );
}
