import { useId, type ReactNode } from "react";
import { blend } from "../blend.ts";
import { Blush, ButtonEyes, Floater, HappyEyes, Looks, Part, Shadow, Tuft } from "./bits.tsx";
import { paletteOf, type Palette, type Stuffie } from "./roll.ts";
import { HEART, INK, SPARKLE, STAR, STITCH, THREAD } from "./thread.ts";
import "./stuffie.css";

const GOLD = "#ffc14d";
const GOLD_DEEP = "#e39a1e";
const GUMDROP = "M60 26C80 26 91 44 91 70C91 93 84 109 60 109C36 109 29 93 29 70C29 44 40 26 60 26z";

/** Head and body sizes for each silhouette. The parts are drawn for `round` and shifted to fit the others. */
const SHAPES: Record<string, { head: { rx: number; ry: number; cy: number }; body: { rx: number; ry: number; cy: number }; onePiece?: boolean }> = {
  round: { head: { rx: 31, ry: 26, cy: 51 }, body: { rx: 23, ry: 21, cy: 88 } },
  squish: { head: { rx: 34.5, ry: 23.5, cy: 52.5 }, body: { rx: 25.5, ry: 19.5, cy: 89.5 } },
  pear: { head: { rx: 27, ry: 24, cy: 51 }, body: { rx: 27.5, ry: 22.5, cy: 86.5 } },
  gumdrop: { head: { rx: 29.5, ry: 26, cy: 52 }, body: { rx: 30, ry: 22, cy: 87 }, onePiece: true },
};

type Fit = {
  /** How far the ears move in towards the middle on a narrower head. */
  pinch: number;
  /** How far the top of the head sits below where `round` has it. */
  lift: number;
  /** How far the face sits below where `round` has it. */
  drop: number;
  /** How far the arms, wings and tail move out on a wider body. */
  widen: number;
};

/** Draws `children`, then again flipped left to right, each inside its own moving part. */
function Pair({ name, at, children }: { name: string; at: [number, number]; children: ReactNode }) {
  return (
    <>
      <Part name={`${name} ${name.split(" ")[0]}-l`} at={at}>
        {children}
      </Part>
      <Part name={`${name} ${name.split(" ")[0]}-r`} at={[120 - at[0], at[1]]}>
        <g transform="translate(120 0) scale(-1 1)">{children}</g>
      </Part>
    </>
  );
}

function Ears({ kind, tones, fit }: { kind: string; tones: Palette; fit: Fit }) {
  const inner = blend(tones.cream, "#ff8fa3", 0.4);
  const move = `translate(${fit.pinch} ${fit.lift})`;
  const at = (x: number, y: number): [number, number] => [x + fit.pinch, y + fit.lift];
  if (kind === "long") {
    return (
      <Pair name="ear" at={at(43, 33)}>
        <g transform={move}>
          <ellipse cx="42" cy="19" rx="7.4" ry="15.5" fill={tones.deep} transform="rotate(-9 42 30)" />
          <ellipse cx="42" cy="20" rx="3.4" ry="10" fill={inner} transform="rotate(-9 42 30)" />
        </g>
      </Pair>
    );
  }
  if (kind === "round") {
    return (
      <Pair name="ear" at={at(41, 35)}>
        <g transform={move}>
          <circle cx="38" cy="30" r="10.5" fill={tones.deep} />
          <circle cx="38" cy="30" r="5.6" fill={inner} />
        </g>
      </Pair>
    );
  }
  if (kind === "floppy") {
    return (
      <Pair name="ear" at={at(38, 32)}>
        <g transform={move}>
          <path d="M38 31C25 28 14 38 16 55C17 62 26 63.5 29.5 57C32 49 33.5 40 42 34z" fill={tones.deep} />
          <path d="M19.5 52c1 4 4.4 5.4 6.6 3" {...STITCH} />
        </g>
      </Pair>
    );
  }
  if (kind === "fin") {
    return (
      <Pair name="ear" at={at(33, 47)}>
        <g transform={move}>
          <Tuft x={34} y={44} turn={-58} length={20} fill={tones.pop} tip={tones.accent} />
          <Tuft x={33} y={48} turn={-88} length={23} fill={tones.pop} tip={tones.accent} />
          <Tuft x={34} y={52} turn={-118} length={19} fill={tones.pop} tip={tones.accent} />
        </g>
      </Pair>
    );
  }
  if (kind === "leaf") {
    return (
      <Pair name="ear" at={at(36, 36)}>
        <g transform={move}>
          <path d="M34 39C22 36 13 28 10 16C22 16 33 22 41 31z" fill={tones.deep} />
          <path d="M30.5 33.5C24 31 19 27 16 21.5C22.5 22.5 28.5 25.5 34.5 30z" fill={inner} />
        </g>
      </Pair>
    );
  }
  return (
    <Pair name="ear" at={at(43, 37)}>
      <g transform={move}>
        <path d="M31 40L34 11 55 27z" fill={tones.deep} stroke={tones.deep} strokeWidth="5" strokeLinejoin="round" />
        <path d="M37 33L38 19 49 28z" fill={inner} stroke={inner} strokeWidth="2" strokeLinejoin="round" />
      </g>
    </Pair>
  );
}

function Horns({ kind, tones, fit }: { kind: string; tones: Palette; fit: Fit }) {
  const move = `translate(0 ${fit.lift})`;
  if (kind === "nubs") {
    return (
      <Pair name="topper" at={[54, 27 + fit.lift]}>
        <path d="M51.5 28C49.5 22 50.5 17 53.5 13.5C56 17.5 57 22.5 56.5 27z" fill={tones.accent} stroke={tones.accent} strokeWidth="1.6" strokeLinejoin="round" transform={move} />
        <path d="M52.4 20.5h3M52 24h4" stroke={blend(tones.accent, INK, 0.28)} strokeWidth="1.2" strokeLinecap="round" transform={move} />
      </Pair>
    );
  }
  if (kind === "horn") {
    const ridge = blend(tones.accent, INK, 0.28);
    return (
      <Part name="topper tp-mid" at={[60, 28 + fit.lift]}>
        <g transform={move}>
          <path d="M60 5l6.6 23.5h-13.2z" fill={tones.accent} stroke={tones.accent} strokeWidth="3" strokeLinejoin="round" />
          <path d="M56 23.4l7.8-3.2M57.4 16.6l5-2.2M58.8 10.6l2.4-1" stroke={ridge} strokeWidth="1.7" strokeLinecap="round" />
        </g>
      </Part>
    );
  }
  if (kind === "antlers") {
    return (
      <Pair name="topper" at={[52, 28 + fit.lift]}>
        <path
          d="M52 28C51 21 48.5 15.5 45 10M49.6 18.5C46.5 18.5 43.6 17 41.4 14.2M47 13.4C47.6 11 47.4 8.6 46.4 6.4"
          fill="none"
          stroke="#c9a178"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform={move}
        />
      </Pair>
    );
  }
  if (kind === "feelers") {
    return (
      <Pair name="topper" at={[54.5, 27.5 + fit.lift]}>
        <g transform={move} fill="none" stroke={tones.deep} strokeLinecap="round">
          <path d="M54.5 27.5C53 17 47 9.5 38 7.5" strokeWidth="2.3" />
          <path
            d="M53.6 21l-3.6.9M51.6 15.6l-3.4 1.8M48.2 11.6l-2.8 2.6M44.2 9l-1.8 3.2M53.6 21l3.2-1.6M51.6 15.6l2.8-2.4M48.2 11.6l2-3M44.2 9l.9-3.4M40.4 7.9l-.6 3.2M40.4 7.9l-.2-3.2"
            strokeWidth="1.7"
          />
        </g>
      </Pair>
    );
  }
  if (kind === "bobbles") {
    return (
      <Pair name="topper" at={[55, 27.5 + fit.lift]}>
        <g transform={move}>
          <path d="M55 27.5C54 19 51 13 47.5 9.5" fill="none" stroke={tones.deep} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="46.8" cy="8.6" r="4.4" fill={tones.pop} />
          <circle cx="45.6" cy="7.2" r="1.3" fill="#fff" opacity="0.8" />
        </g>
      </Pair>
    );
  }
  return null;
}

function Wings({ kind, tones, fit }: { kind: string; tones: Palette; fit: Fit }) {
  if (kind === "none") return null;
  const move = `translate(${-fit.widen} 0)`;
  const at: [number, number] = [39 - fit.widen, 78];
  if (kind === "feather") {
    return (
      <Pair name="wing" at={at}>
        <g transform={move}>
          <path
            d="M40 82C24 84 10 74 5 58C10 61 15 62 19 61C13 56 10 50 10 43C16 49 23 53 29 55C26 51 24 46 24 42C32 50 40 62 43 74z"
            fill="#ffffff"
            stroke={blend(tones.deep, "#ffffff", 0.15)}
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path d="M12 62c6 6 14 10 22 12M17 51c5 6 11 10 18 13" {...STITCH} />
        </g>
      </Pair>
    );
  }
  if (kind === "moth") {
    return (
      <Pair name="wing" at={at}>
        <g transform={move}>
          <ellipse cx="26" cy="84" rx="11.5" ry="9" fill={blend(tones.accent, "#ffffff", 0.35)} transform="rotate(24 26 84)" />
          <ellipse cx="21" cy="62" rx="17" ry="12.5" fill={tones.accent} transform="rotate(-28 21 62)" />
          <circle cx="16.5" cy="59" r="4.2" fill={tones.pop} />
          <circle cx="23.5" cy="85" r="2.6" fill={tones.pop} />
          <path d="M34 72C27 68 19 66 10 67" {...STITCH} />
        </g>
      </Pair>
    );
  }
  if (kind === "bee") {
    return (
      <Pair name="wing" at={at}>
        <g transform={move} fill="#ffffff" stroke={tones.accent} strokeWidth="1.5">
          <ellipse cx="27" cy="79" rx="9.5" ry="5.6" transform="rotate(-6 27 79)" opacity="0.92" />
          <ellipse cx="24" cy="65" rx="14.5" ry="8" transform="rotate(-34 24 65)" opacity="0.92" />
        </g>
      </Pair>
    );
  }
  return (
    <Pair name="wing" at={at}>
      <g transform={move}>
        <path d="M38 80C24 78 12 68 8 52c6 2 10 6 12 10 0-6 2-11 6-15 4 9 10 17 16 21z" fill={tones.accent} />
        <path d="M14 58c4 8 12 14 20 17" {...STITCH} />
      </g>
    </Pair>
  );
}

function Tail({ kind, tones, fit }: { kind: string; tones: Palette; fit: Fit }) {
  const move = `translate(${fit.widen} 0)`;
  if (kind === "whip") {
    return (
      <Part name="tail t1" at={[78 + fit.widen, 101]}>
        <g transform={move}>
          <path d="M78 101C92 107 107 99 106 85C105.5 78 99 76.5 97.5 82" fill="none" stroke={tones.deep} strokeWidth="7" strokeLinecap="round" />
          <circle cx="97.5" cy="82" r="4.6" fill={tones.pop} />
        </g>
      </Part>
    );
  }
  if (kind === "pom") {
    return (
      <Part name="tail t1" at={[80 + fit.widen, 100]}>
        <g transform={move}>
          <circle cx="85" cy="98.5" r="9.5" fill={blend(tones.main, "#ffffff", 0.55)} />
          <circle cx="85" cy="98.5" r="6.6" {...STITCH} />
        </g>
      </Part>
    );
  }
  if (kind === "spade") {
    return (
      <Part name="tail t1" at={[78 + fit.widen, 100]}>
        <g transform={move}>
          <path d="M78 100c13 5 25 0 28-13" fill="none" stroke={tones.main} strokeWidth="10" strokeLinecap="round" />
          <path d="M107 73l8 9-7 9-8-8z" fill={tones.accent} stroke={tones.accent} strokeWidth="2.4" strokeLinejoin="round" />
        </g>
      </Part>
    );
  }
  if (kind === "fan") {
    const x = 66 + fit.widen;
    return (
      <>
        <Part name="tail t1" at={[x, 101]}>
          <Tuft x={x} y={101} turn={50} length={40} fill={tones.pop} tip={blend(tones.pop, "#ffffff", 0.5)} />
        </Part>
        <Part name="tail t3" at={[x, 103]}>
          <Tuft x={x} y={103} turn={102} length={38} fill={tones.pop} tip={blend(tones.pop, "#ffffff", 0.5)} />
        </Part>
        <Part name="tail t2" at={[x, 102]}>
          <Tuft x={x} y={102} turn={76} length={43} fill={tones.accent} tip={blend(tones.accent, "#ffffff", 0.5)} />
        </Part>
      </>
    );
  }
  return (
    <Part name="tail t1" at={[72 + fit.widen, 102]}>
      <Tuft x={72 + fit.widen} y={102} turn={66} length={47} fill={tones.deep} tip={blend(tones.main, "#ffffff", 0.6)} />
    </Part>
  );
}

function Snout({ kind, tones }: { kind: string; tones: Palette }) {
  if (kind === "muzzle") {
    return (
      <>
        <ellipse cx="60" cy="63" rx="16" ry="10.5" fill={tones.cream} />
        <circle cx="54.5" cy="60.5" r="1.5" fill={INK} opacity="0.7" />
        <circle cx="65.5" cy="60.5" r="1.5" fill={INK} opacity="0.7" />
        <path d="M53.5 66c4 3.4 9 3.4 13 0" {...THREAD} strokeWidth="1.9" />
      </>
    );
  }
  if (kind === "beak") {
    return (
      <>
        <path d="M53.5 57h13L60 66.5z" fill="#ff8a4c" stroke="#ff8a4c" strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M55 58.5h10" stroke="#e86a2c" strokeWidth="1.3" strokeLinecap="round" opacity="0.6" />
      </>
    );
  }
  if (kind === "whiskers") {
    return (
      <>
        <path d="M45.5 61.5l-10-2M45.5 64.5l-10 1.6M74.5 61.5l10-2M74.5 64.5l10 1.6" stroke={INK} strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
        <path d="M56.8 58.4h6.4l-3.2 3.8z" fill="#ff7f97" stroke="#ff7f97" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M60 63v2.2M60 65.2c-2 2.6-5 2.6-6.6.4M60 65.2c2 2.6 5 2.6 6.6.4" {...THREAD} strokeWidth="1.9" />
      </>
    );
  }
  if (kind === "fang") {
    return (
      <>
        <ellipse cx="60" cy="63.5" rx="12.5" ry="8.4" fill={tones.cream} />
        <ellipse cx="60" cy="59.4" rx="3.4" ry="2.3" fill={INK} />
        <path d="M53.6 64.6c3.8 3.2 9 3.2 12.8 0" {...THREAD} strokeWidth="1.9" />
        <path d="M62.4 66.6l1.6 3.8 1.9-4.6z" fill="#fff" stroke={INK} strokeWidth="0.8" strokeLinejoin="round" />
      </>
    );
  }
  return (
    <>
      <ellipse cx="60" cy="60.5" rx="3.8" ry="2.7" fill={INK} />
      <path d="M60 63v3M60 66c-2 2.6-5 2.6-6.6.4M60 66c2 2.6 5 2.6 6.6.4" {...THREAD} strokeWidth="1.9" />
    </>
  );
}

function Eyes({ kind, cheer }: { kind: string; cheer: boolean }) {
  const happy = <HappyEyes y={50} />;
  if (kind === "sleepy") {
    return <Looks cheer={cheer} idle={<path d="M41 48c3 4 9 4 12 0M67 48c3 4 9 4 12 0" {...THREAD} strokeWidth="2.6" />} happy={<ButtonEyes y={49.5} />} />;
  }
  if (kind === "starry") {
    const eye = (x: number) => (
      <g key={x}>
        <circle cx={x} cy="50" r="5.5" fill={INK} />
        <circle cx={x + 1.9} cy="48" r="2" fill="#fff" />
        <circle cx={x - 1.9} cy="52" r="1" fill="#fff" />
      </g>
    );
    return <Looks cheer={cheer} idle={[eye(47), eye(73)]} happy={happy} />;
  }
  if (kind === "stitched") {
    return (
      <Looks
        cheer={cheer}
        idle={
          <>
            <circle cx="47" cy="50" r="4.8" fill={INK} />
            <circle cx="48.6" cy="48.3" r="1.6" fill="#fff" />
            <path d="M69.4 46.4l7.2 7.2M76.6 46.4l-7.2 7.2" {...THREAD} strokeWidth="2.6" />
          </>
        }
        happy={happy}
      />
    );
  }
  if (kind === "oval") {
    const eye = (x: number) => (
      <g key={x}>
        <ellipse cx={x} cy="50" rx="4.1" ry="5.8" fill={INK} />
        <circle cx={x + 1.3} cy="47.6" r="1.5" fill="#fff" />
      </g>
    );
    return <Looks cheer={cheer} idle={[eye(47), eye(73)]} happy={happy} />;
  }
  return <Looks cheer={cheer} idle={<ButtonEyes y={50} />} happy={happy} />;
}

function Pattern({ kind, on, tones, shape }: { kind: string; on: "head" | "body"; tones: Palette; shape: (typeof SHAPES)[string] }) {
  const seam = { fill: "none", stroke: INK, strokeWidth: 1.5, strokeLinecap: "round" as const, opacity: 0.42 };
  if (kind === "spots") {
    return on === "head" ? (
      <g fill={tones.deep}>
        <circle cx="41" cy={shape.head.cy - 16} r="5.5" />
        <circle cx="50.5" cy={shape.head.cy - 21.5} r="3" />
        <circle cx="80" cy={shape.head.cy - 13} r="4.6" />
      </g>
    ) : (
      <g fill={tones.deep}>
        <circle cx={60 - shape.body.rx + 7} cy={shape.body.cy - 8} r="4.2" />
        <circle cx={60 + shape.body.rx - 7} cy={shape.body.cy + 9} r="5" />
        <circle cx={60 + shape.body.rx - 12} cy={shape.body.cy - 14} r="2.6" />
      </g>
    );
  }
  if (kind === "stripes") {
    const band = { fill: "none", stroke: tones.deep, strokeWidth: 3.6, strokeLinecap: "round" as const };
    if (on === "head") {
      const top = shape.head.cy - shape.head.ry;
      const edge = shape.head.rx;
      return (
        <path
          d={`M51 ${top - 2}v12M60 ${top - 3}v14M69 ${top - 2}v12M${60 - edge - 2} ${shape.head.cy - 3}h10M${60 - edge - 2} ${shape.head.cy + 3.5}h8M${60 + edge + 2} ${shape.head.cy - 3}h-10M${60 + edge + 2} ${shape.head.cy + 3.5}h-8`}
          {...band}
        />
      );
    }
    const edge = shape.body.rx;
    return (
      <path
        d={`M${60 - edge - 2} ${shape.body.cy - 5}h10M${60 - edge - 2} ${shape.body.cy + 2}h11M${60 + edge + 2} ${shape.body.cy - 5}h-10M${60 + edge + 2} ${shape.body.cy + 2}h-11`}
        {...band}
      />
    );
  }
  if (kind === "patches") {
    return on === "head" ? (
      <>
        <ellipse cx="47" cy={shape.head.cy - 1} rx="11" ry="10" fill={tones.cream} />
        <ellipse cx="47" cy={shape.head.cy - 1} rx="8.6" ry="7.6" {...STITCH} />
      </>
    ) : (
      <g transform={`rotate(-10 ${60 + shape.body.rx - 9} ${shape.body.cy + 9})`}>
        <rect x={60 + shape.body.rx - 15} y={shape.body.cy + 3} width="12" height="11" rx="2.4" fill={blend(tones.accent, "#ffffff", 0.3)} />
        <rect x={60 + shape.body.rx - 13} y={shape.body.cy + 5} width="8" height="7" rx="1.2" {...STITCH} />
      </g>
    );
  }
  if (kind === "stitches") {
    if (on === "head") {
      const top = shape.head.cy - shape.head.ry;
      return <path d={`M60 ${top}v16M57 ${top + 4.5}h6M57 ${top + 9}h6M57 ${top + 13.5}h6`} {...seam} />;
    }
    const x = 60 - shape.body.rx + 8;
    const y = shape.body.cy - 12;
    return (
      <path
        d={`M${x} ${y}l-2.6 13M${x - 3.6} ${y + 2.6}l5.6 1.2M${x - 4.4} ${y + 6.8}l5.6 1.2M${x - 5.2} ${y + 11}l5.6 1.2M${60 + shape.body.rx - 11} ${shape.body.cy + 6}l5 5M${60 + shape.body.rx - 6} ${shape.body.cy + 6}l-5 5`}
        {...seam}
      />
    );
  }
  return null;
}

function NeckWear({ kind, tones }: { kind: string; tones: Palette }) {
  if (kind === "ribbon") {
    return (
      <>
        <path d="M60 78l-10-5.6v11.2zM60 78l10-5.6v11.2z" fill={tones.pop} stroke={tones.pop} strokeWidth="2" strokeLinejoin="round" />
        <circle cx="60" cy="78" r="3" fill={blend(tones.pop, INK, 0.22)} />
      </>
    );
  }
  if (kind === "scarf") {
    return (
      <>
        <path d="M66 82l4.6 13h-8.4l-2.2-12z" fill={tones.pop} />
        <path d="M63.2 91.5h6.4" stroke={tones.cream} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M39.5 75C48 81.5 72 81.5 80.5 75L81.5 80.5C72 87 48 87 38.5 80.5z" fill={tones.pop} />
        <path d="M47 81.4l-.6 3.6M56 83l-.2 3.6M65 82.6l.4 3.6M73.6 80.6l1 3.4" stroke={tones.cream} strokeWidth="1.6" strokeLinecap="round" />
      </>
    );
  }
  if (kind === "bell") {
    return (
      <>
        <path d="M41 76C50 82 70 82 79 76" fill="none" stroke={tones.pop} strokeWidth="3.6" strokeLinecap="round" />
        <circle cx="60" cy="83" r="4.6" fill={GOLD} stroke={GOLD_DEEP} strokeWidth="0.8" />
        <path d="M60 83.4v3M58.4 83.2h3.2" stroke={GOLD_DEEP} strokeWidth="1.1" strokeLinecap="round" />
      </>
    );
  }
  return null;
}

function HeadWear({ kind, fit }: { kind: string; fit: Fit }) {
  if (kind === "flower") {
    return (
      <g transform={`translate(${80 - fit.pinch} ${33 + fit.lift})`}>
        {[0, 72, 144, 216, 288].map((angle) => (
          <circle key={angle} cx="0" cy="-4.6" r="3.9" fill="#fff" stroke="#f3b9c8" strokeWidth="0.7" transform={`rotate(${angle})`} />
        ))}
        <circle r="2.9" fill={GOLD} />
      </g>
    );
  }
  if (kind === "crown") {
    return (
      <g transform={`translate(${45 + fit.pinch} ${26 + fit.lift}) rotate(-14)`}>
        <path d="M-7.5 3.5L-8.8 -5L-3.8 -1L0 -7.6L3.8 -1L8.8 -5L7.5 3.5z" fill={GOLD} stroke={GOLD_DEEP} strokeWidth="0.9" strokeLinejoin="round" />
        <circle cx="0" cy="0.4" r="1.5" fill="#ff5a7a" />
      </g>
    );
  }
  if (kind === "plaster") {
    return (
      <g transform={`translate(${76 - fit.pinch} ${35 + fit.lift}) rotate(-24)`}>
        <rect x="-7" y="-3" width="14" height="6" rx="3" fill="#ffe3c7" stroke="#e3bf9c" strokeWidth="0.7" />
        <rect x="-2.4" y="-3" width="4.8" height="6" fill="#f6cfa8" />
        <path d="M-5 -0.8v.1M-5 1v.1M5 -0.8v.1M5 1v.1" stroke="#c99d75" strokeWidth="0.9" strokeLinecap="round" />
      </g>
    );
  }
  return null;
}

/** What drifts around a made stuffie while it cheers. Each temperament has its own. */
function Flourish({ mood, tones }: { mood: string; tones: Palette }) {
  if (mood === "pip") {
    return (
      <>
        {[
          { x: 13, sway: -8, fill: tones.pop, r: 3.4 },
          { x: 30, sway: 6, fill: tones.accent, r: 2.7 },
          { x: 46, sway: -5, fill: GOLD, r: 3 },
          { x: 74, sway: 5, fill: tones.accent, r: 3 },
          { x: 90, sway: -6, fill: GOLD, r: 2.7 },
          { x: 107, sway: 8, fill: tones.pop, r: 3.4 },
        ].map((bit, index) => (
          <Floater key={bit.x} name="ember" x={bit.x} y={108} drift={[bit.sway, -84]} delay={-index * 0.31}>
            {index % 2 ? <circle r={bit.r} fill={bit.fill} /> : <path d={STAR} fill={bit.fill} transform="scale(0.5)" />}
          </Floater>
        ))}
      </>
    );
  }
  if (mood === "moss") {
    return (
      <>
        {[
          { drift: [-27, -58] as [number, number], fill: tones.accent },
          { drift: [3, -72] as [number, number], fill: tones.pop },
          { drift: [29, -56] as [number, number], fill: tones.accent },
        ].map((puff, index) => (
          <Floater key={puff.drift[0]} name="puff" x={60} y={56} drift={puff.drift} delay={-index * 0.8}>
            <path d={HEART} fill={puff.fill} />
          </Floater>
        ))}
      </>
    );
  }
  if (mood === "sol") {
    return (
      <>
        {[
          { x: 60, y: -5, size: 0.95, delay: 0 },
          { x: 22, y: 12, size: 0.7, delay: -0.4 },
          { x: 99, y: 14, size: 0.75, delay: -0.8 },
          { x: 8, y: 62, size: 0.55, delay: -0.2 },
          { x: 112, y: 66, size: 0.6, delay: -0.6 },
        ].map((star) => (
          <Floater key={`${star.x}-${star.y}`} name="twinkle" x={star.x} y={star.y} delay={star.delay}>
            <path d={SPARKLE} fill="#fff" stroke={GOLD} strokeWidth="1.6" strokeLinejoin="round" transform={`scale(${star.size})`} />
          </Floater>
        ))}
      </>
    );
  }
  return (
    <>
      {[
        { x: 8, y: 50, delay: 0, fill: tones.accent },
        { x: 112, y: 42, delay: -0.55, fill: tones.pop },
        { x: 60, y: -4, delay: -1.1, fill: GOLD },
      ].map((star) => (
        <Floater key={star.x} name="wisp" x={star.x} y={star.y} delay={star.delay}>
          <path d={STAR} fill={star.fill} transform="scale(0.95)" />
          <path d={STAR} fill="#fff" transform="scale(0.4)" />
        </Floater>
      ))}
    </>
  );
}

/**
 * A stuffie someone rolled, drawn from its parts on the same sitting plush the
 * four ready-made guides use, so it cheers with the same moving pieces: body,
 * head, ears, arms, wings, tail, and whatever it has on top.
 */
export function MadeStuffie({ stuffie, className, cheer }: { stuffie: Stuffie; className: string; cheer: boolean }) {
  const tones = paletteOf(stuffie);
  const shape = SHAPES[stuffie.body] || SHAPES.round;
  const clip = `plush${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const fit: Fit = {
    pinch: (31 - shape.head.rx) * 0.75,
    lift: shape.head.cy - shape.head.ry - 25,
    drop: shape.head.cy - 51,
    widen: (shape.body.rx - 23) * 0.8,
  };
  const cheek = shape.head.rx - 7.5;
  const head = <ellipse cx="60" cy={shape.head.cy} rx={shape.head.rx} ry={shape.head.ry} />;
  const body = shape.onePiece ? <path d={GUMDROP} /> : <ellipse cx="60" cy={shape.body.cy} rx={shape.body.rx} ry={shape.body.ry} />;
  const glow = cheer && stuffie.voice === "sol";

  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true" data-guide="custom" data-mood={stuffie.voice} data-ears={stuffie.ears}>
      <defs>
        <clipPath id={`${clip}h`}>{shape.onePiece ? body : head}</clipPath>
        <clipPath id={`${clip}b`}>{body}</clipPath>
        <clipPath id={`${clip}t`}>
          <rect width="120" height="71" />
        </clipPath>
      </defs>
      <Shadow cx={61} rx={32 + fit.widen} fill={tones.shadow} />
      {glow ? <circle className="gp gp-glow" cx="60" cy="52" r="34" fill="#fff0b8" style={{ transformOrigin: "60px 52px" }} /> : null}
      <Part name="body" at={[60, 111]}>
        <Wings kind={stuffie.wings} tones={tones} fit={fit} />
        <Tail kind={stuffie.tail} tones={tones} fit={fit} />
        <ellipse cx={46 - fit.widen * 0.5} cy="106" rx="10.5" ry="6.5" fill={tones.deep} />
        <ellipse cx={74 + fit.widen * 0.5} cy="106" rx="10.5" ry="6.5" fill={tones.deep} />
        <g fill={tones.main}>{body}</g>
        <g clipPath={`url(#${clip}b)`}>
          <Pattern kind={stuffie.pattern} on="body" tones={tones} shape={shape} />
        </g>
        <ellipse cx="60" cy={shape.body.cy + 5} rx="13.5" ry="13" fill={tones.cream} />
        <ellipse cx="60" cy={shape.body.cy + 5} rx="10.5" ry="10" {...STITCH} />
        <Pair name="arm" at={[41 - fit.widen, 79]}>
          <ellipse cx={38.5 - fit.widen} cy="87" rx="7" ry="11" fill={tones.deep} transform={`rotate(16 ${38.5 - fit.widen} 87)`} />
        </Pair>
        {stuffie.accessory === "heart" ? (
          <g transform={`translate(${60 + shape.body.rx - 12} ${shape.body.cy - 8}) rotate(10)`}>
            <path d={HEART} fill={tones.pop} transform="scale(0.82)" />
            <path d="M-3.4 -1.6l2.4 2.4M3.4 -1.6l-2.4 2.4" {...STITCH} opacity="0.5" />
          </g>
        ) : null}
        <Part name="head" at={[60, 76]}>
          <Horns kind={stuffie.horns} tones={tones} fit={fit} />
          <Ears kind={stuffie.ears} tones={tones} fit={fit} />
          {/* A one-piece plush has no separate head to hide where the ears join, so its top half is drawn again here. */}
          <g fill={tones.main} clipPath={shape.onePiece ? `url(#${clip}t)` : undefined}>
            {shape.onePiece ? body : head}
          </g>
          <g clipPath={`url(#${clip}h)`}>
            <Pattern kind={stuffie.pattern} on="head" tones={tones} shape={shape} />
          </g>
          <HeadWear kind={stuffie.accessory} fit={fit} />
          <g transform={`translate(0 ${fit.drop})`}>
            <Snout kind={stuffie.snout} tones={tones} />
            <Eyes kind={stuffie.eyes} cheer={cheer} />
            <Blush y={60} left={60 - cheek} right={60 + cheek} />
          </g>
        </Part>
        <NeckWear kind={stuffie.accessory} tones={tones} />
      </Part>
      {cheer ? <Flourish mood={stuffie.voice} tones={tones} /> : null}
    </svg>
  );
}
