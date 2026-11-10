import type { ReactNode } from "react";
import { blend } from "../blend.ts";
import { useSession } from "../session.tsx";
import type { Person } from "../types.ts";
import { colorOf, lookOf, type Look } from "./looks.ts";
import "./avatar.css";

const INK = "#2a1b33";
const GOLD = "#ffc14d";
const GOLD_DEEP = "#e39a1e";
const HEAD = "M27 46C27 30.5 37 22 50 22C63 22 73 30.5 73 46C73 61.5 63.5 73 50 73C36.5 73 27 61.5 27 46z";
const EYE_Y = 48;
const LEFT = 40.5;
const RIGHT = 59.5;

type Tones = {
  skin: string;
  shade: string;
  line: string;
  hair: string;
  hairDeep: string;
  brow: string;
  fur: string;
  furLine: string;
  furInner: string;
  top: string;
  /** Thicker strokes for the small sizes, so features do not thin out to nothing. */
  bold: number;
};

function tonesOf(look: Look, size: number): Tones {
  const skin = colorOf("skin", look.skin);
  const hair = colorOf("hairColor", look.hairColor);
  const line = blend(skin, "#1c0f17", 0.9);
  const fur = look.hair === "bald" ? blend(skin, "#5a2f2a", 0.12) : hair;
  return {
    skin,
    shade: blend(skin, "#6b2f33", 0.2),
    line,
    hair,
    hairDeep: blend(hair, "#1c0f17", 0.24),
    brow: blend(hair, line, 0.45),
    fur,
    furLine: blend(fur, "#1c0f17", 0.3),
    furInner: blend(fur, "#ffd9e2", 0.78),
    top: colorOf("top", look.top),
    bold: size < 72 ? 1.35 : 1,
  };
}

/** Draws `children` again, flipped left to right, for the matching part on the other side. */
function Both({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <g transform="translate(100 0) scale(-1 1)">{children}</g>
    </>
  );
}

function ring(cx: number, cy: number, radius: number, size: number, from: number, to: number, step: number) {
  const dots = [];
  for (let angle = from; angle <= to; angle += step) {
    const turn = (angle * Math.PI) / 180;
    dots.push(<circle key={angle} cx={cx + Math.cos(turn) * radius} cy={cy + Math.sin(turn) * radius} r={size} />);
  }
  return dots;
}

const CAP = "M26 45C23.5 28.5 34 16.5 50 16.5C66 16.5 76.5 28.5 74 45C72.5 38.5 70 34 66.5 31C56 34.5 43 34.5 33.5 31C30 34 27.5 38.5 26 45z";
const SWEPT = "M26 46C23 28 33.5 16 50.5 16C67 16 77 28 74 46C73 40 71.5 35.5 68.5 32C58 38.5 44 36.5 37 26.5C32 31.5 27.5 38 26 46z";
const STUBBLE_CAP = "M27.3 43C27.6 30 37 21.6 50 21.6C63 21.6 72.4 30 72.7 43C70 34.5 62 29.6 50 29.6C38 29.6 30 34.5 27.3 43z";

/** The part of the hair that sits behind the head and shoulders. */
function HairBack({ style, tones }: { style: string; tones: Tones }) {
  const deep = tones.hairDeep;
  if (style === "bob") {
    return <path d="M21.5 50C19 26 33 13.5 50 13.5C67 13.5 81 26 78.5 50C78.5 60 77.5 67 74.5 73.5L25.5 73.5C22.5 67 21.5 60 21.5 50z" fill={deep} />;
  }
  if (style === "long") {
    return <path d="M20.5 50C18 25.5 33 13 50 13C67 13 82 25.5 79.5 50C80 68 83 84 86 101L14 101C17 84 20 68 20.5 50z" fill={deep} />;
  }
  if (style === "wavy") {
    return (
      <path
        d="M20 50C17 25 33 12.5 50 12.5C67 12.5 83 25 80 50C84 56 78 62 82.5 68C86 75 80 80 84.5 87C87 92 86 97 88 101L12 101C14 97 13 92 15.5 87C20 80 14 75 17.5 68C22 62 16 56 20 50z"
        fill={deep}
      />
    );
  }
  if (style === "curly") {
    return (
      <g fill={deep}>
        <circle cx="50" cy="40" r="25" />
        {ring(50, 42, 25, 9.5, -200, 20, 27.5)}
        <circle cx="23.5" cy="59" r="8" />
        <circle cx="76.5" cy="59" r="8" />
        <circle cx="25.5" cy="68" r="6.5" />
        <circle cx="74.5" cy="68" r="6.5" />
      </g>
    );
  }
  if (style === "coily") {
    return (
      <g fill={tones.hair}>
        <circle cx="50" cy="36" r="28" />
        {ring(50, 36, 27, 5.2, -210, 30, 20)}
      </g>
    );
  }
  if (style === "locs") {
    return (
      <g fill={deep}>
        {[17.5, 22.7, 27.9, 33.1, 66.9, 72.1, 77.3, 82.5].map((x, index) => (
          <rect key={x} x={x - 2.5} y="28" width="5" height={[46, 58, 52, 56, 56, 52, 58, 46][index]} rx="2.5" />
        ))}
      </g>
    );
  }
  if (style === "bun") {
    return (
      <>
        <circle cx="50" cy="13.5" r="9" fill={tones.hair} />
        <path d="M44.5 11.5c2-3.4 8-4 11-1" fill="none" stroke={deep} strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
      </>
    );
  }
  if (style === "ponytail") {
    return <path d="M66 22C80 20 90 32 86.5 50C85 60 81 68 77 72C76 62 78.5 52 76 42C74.5 35 70.5 30 65 27z" fill={deep} />;
  }
  return null;
}

/** The fringe, the top, and anything that falls in front of the face or shoulders. */
function HairFront({ style, tones }: { style: string; tones: Tones }) {
  const hair = tones.hair;
  const deep = tones.hairDeep;
  if (style === "bald") return null;
  if (style === "shaved") return <path d={STUBBLE_CAP} fill={hair} opacity="0.62" />;
  if (style === "crop") return <path d={CAP} fill={hair} />;
  if (style === "swoop") return <path d={SWEPT} fill={hair} />;
  if (style === "quiff") {
    return (
      <>
        <path d={STUBBLE_CAP} fill={hair} opacity="0.62" />
        <path d="M32.5 31C28.5 17 41 8.5 55 10.5C67 12 73.5 21.5 69.5 31.5C61 26 44.5 25.5 32.5 31z" fill={hair} />
      </>
    );
  }
  if (style === "mohawk") {
    return (
      <>
        <path d={STUBBLE_CAP} fill={hair} opacity="0.62" />
        <path d="M40.5 30C37.5 20 40 11 44 7.5L46.5 11.5L50 4.5L53.5 11.5L56 7.5C60 11 62.5 20 59.5 30C54 27.5 46 27.5 40.5 30z" fill={hair} stroke={hair} strokeWidth="1.4" strokeLinejoin="round" />
      </>
    );
  }
  if (style === "bob") {
    return (
      <path
        d="M25.5 47C23 28.5 34 16 50 16C66 16 77 28.5 74.5 47C74.8 56 74 63 72.5 69C70.5 60 70.5 48 69 38C60 37.5 49 34.5 42.5 27.5C40 33 35.5 37 31 38.5C29.5 48 29.5 60 27.5 69C26 63 25.2 56 25.5 47z"
        fill={hair}
      />
    );
  }
  if (style === "long") {
    return (
      <path
        d="M25.5 47C23 28.5 34 16 50 16C66 16 77 28.5 74.5 47C75 60 76 72 78.5 84L71.5 84C70.5 70 70.5 52 69 38C60 37.5 49 34.5 42.5 27.5C40 33 35.5 37 31 38.5C29.5 52 29.5 70 28.5 84L21.5 84C24 72 25 60 25.5 47z"
        fill={hair}
      />
    );
  }
  if (style === "wavy") {
    return (
      <path
        d="M25.5 47C23 28.5 34 16 50 16C66 16 77 28.5 74.5 47C78.5 54 73.5 60 77 66C80.5 72 76 77 79.5 84L72 85C69 78 73.5 73 70.5 67C67.5 60 71.5 52 69 38C60 37.5 49 34.5 42.5 27.5C40 33 35.5 37 31 38.5C28.5 52 32.5 60 29.5 67C26.5 73 31 78 28 85L20.5 84C24 77 19.5 72 23 66C26.5 60 21.5 54 25.5 47z"
        fill={hair}
      />
    );
  }
  if (style === "curly") {
    return (
      <g fill={hair}>
        {[
          [33, 30.5, 6.6],
          [41.5, 27, 6.8],
          [50, 25.8, 6.8],
          [58.5, 27, 6.8],
          [67, 30.5, 6.6],
          [28, 38, 5.2],
          [72, 38, 5.2],
        ].map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
    );
  }
  if (style === "coily") {
    return (
      <>
        <path d="M26.6 45C26 30 37 21 50 21C63 21 74 30 73.4 45C70 36.5 62 32 50 32C38 32 30 36.5 26.6 45z" fill={hair} />
        <path d="M30.5 38.5C34.5 34 41.5 32 50 32C58.5 32 65.5 34 69.5 38.5" fill="none" stroke={deep} strokeWidth="1.1" strokeLinecap="round" strokeDasharray="0.2 3.2" opacity="0.8" />
      </>
    );
  }
  if (style === "braids") {
    return (
      <>
        <path d="M25.5 48C23 28.5 34 16 50 16C66 16 77 28.5 74.5 48C73 41 70 35.5 65 32C59 30.5 53 28 50 23.5C47 28 41 30.5 35 32C30 35.5 27 41 25.5 48z" fill={hair} />
        <Both>
          {[52, 59.5, 67, 74.5, 82].map((y, index) => (
            <ellipse key={y} cx="23.5" cy={y} rx="5.4" ry="4.6" fill={index % 2 ? deep : hair} transform={`rotate(${index % 2 ? 18 : -18} 23.5 ${y})`} />
          ))}
          <rect x="20.7" y="85.6" width="5.6" height="2.8" rx="1.2" fill="#ff5a7a" />
          <ellipse cx="23.5" cy="91.4" rx="3.2" ry="3.8" fill={hair} />
        </Both>
      </>
    );
  }
  if (style === "locs") {
    return (
      <>
        <path d={CAP} fill={hair} />
        <path d="M50 17.5v13M42 19l-2.4 12M58 19l2.4 12M34.5 23l-3.6 9.5M65.5 23l3.6 9.5" stroke={deep} strokeWidth="1.1" strokeLinecap="round" fill="none" opacity="0.7" />
        <Both>
          <rect x="20.2" y="36" width="5" height="48" rx="2.5" fill={hair} />
          <rect x="25.4" y="34" width="5" height="40" rx="2.5" fill={hair} />
          <path d="M22.7 44v36M27.9 42v28" stroke={deep} strokeWidth="0.9" strokeLinecap="round" strokeDasharray="0.2 4" fill="none" opacity="0.8" />
          <rect x="20.2" y="70" width="5" height="2.6" fill={GOLD} />
        </Both>
      </>
    );
  }
  if (style === "bun") {
    return <path d="M27 45C26 29.5 36.5 20.5 50 20.5C63.5 20.5 74 29.5 73 45C70 35.5 62 29.5 50 29.5C38 29.5 30 35.5 27 45z" fill={hair} />;
  }
  if (style === "ponytail") {
    return (
      <>
        <path d={SWEPT} fill={hair} />
        <rect x="65.5" y="21.4" width="5.4" height="3.2" rx="1.4" fill="#ff5a7a" transform="rotate(32 68.2 23)" />
      </>
    );
  }
  return null;
}

function SideEars({ kind, tones }: { kind: string; tones: Tones }) {
  if (kind === "human") {
    return (
      <Both>
        <ellipse cx="27.6" cy="49" rx="4.3" ry="5.5" fill={tones.skin} />
        <path d="M26.2 47c-1.2 1.3-1.1 3.1.3 4.1" fill="none" stroke={tones.shade} strokeWidth="1.1" strokeLinecap="round" />
      </Both>
    );
  }
  if (kind === "elf") {
    return (
      <Both>
        <path d="M30 43L14 35.5C16.5 45 21.5 52.5 29.5 55z" fill={tones.skin} stroke={tones.skin} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M27.5 46.5L19.5 41.2" fill="none" stroke={tones.shade} strokeWidth="1.1" strokeLinecap="round" />
      </Both>
    );
  }
  return null;
}

/** Ears that sit up through the hair. They take the hair colour, or the fur tone on a bare head. */
function TopEars({ kind, tones }: { kind: string; tones: Tones }) {
  const outline = { stroke: tones.furLine, strokeWidth: 1, strokeLinejoin: "round" as const };
  if (kind === "cat") {
    return (
      <Both>
        <path d="M27.5 33L26 11L44.5 22.5z" fill={tones.fur} {...outline} />
        <path d="M30.6 27.5L29.8 16.5L39.4 22.5z" fill={tones.furInner} />
      </Both>
    );
  }
  if (kind === "fox") {
    return (
      <Both>
        <path d="M25.5 34L24.5 8.5L45.5 21.5z" fill={tones.fur} {...outline} />
        <path d="M29 28.5L28.4 15.5L40 22.5z" fill="#fff6ec" />
        <path d="M24.5 8.5L24.9 17L31.6 12.9z" fill={tones.furLine} stroke={tones.furLine} strokeWidth="1" strokeLinejoin="round" />
      </Both>
    );
  }
  if (kind === "bunny") {
    return (
      <Both>
        <ellipse cx="37" cy="17.5" rx="6" ry="12.5" fill={tones.fur} transform="rotate(-8 37 17.5)" {...outline} />
        <ellipse cx="37" cy="18.5" rx="2.8" ry="8.4" fill={tones.furInner} transform="rotate(-8 37 17.5)" />
      </Both>
    );
  }
  if (kind === "bear") {
    return (
      <Both>
        <circle cx="31.5" cy="23.5" r="8.6" fill={tones.fur} {...outline} />
        <circle cx="31.5" cy="23.5" r="4.6" fill={tones.furInner} />
      </Both>
    );
  }
  if (kind === "pup") {
    return (
      <Both>
        <path d="M31 25C22 23 14.5 31 15.5 45C16 52 22 54.5 25.5 50C28.5 44 29 34 35 28z" fill={tones.fur} {...outline} />
        <path d="M19.5 44c.6 2.6 2.4 3.6 4 2.4" fill="none" stroke={tones.furLine} strokeWidth="1" strokeLinecap="round" opacity="0.6" />
      </Both>
    );
  }
  return null;
}

function openEye(x: number, kind: string, tones: Tones, outer: -1 | 1) {
  const lash = { fill: "none", stroke: tones.line, strokeWidth: 1.4 * tones.bold, strokeLinecap: "round" as const };
  const shine = <circle cx={x + 0.9} cy={EYE_Y - 1.1} r="1" fill="#fff" />;
  if (kind === "soft") {
    return (
      <g key={x}>
        <ellipse cx={x} cy={EYE_Y} rx="3.5" ry="4.4" fill="#fff" />
        <ellipse cx={x} cy={EYE_Y + 0.2} rx="2.7" ry="3.5" fill={tones.line} />
        {shine}
      </g>
    );
  }
  if (kind === "almond") {
    const lid = `M${x - 4.6} ${EYE_Y + 0.6}C${x - 2.6} ${EYE_Y - 4} ${x + 2.6} ${EYE_Y - 4} ${x + 4.6} ${EYE_Y + 0.6}`;
    return (
      <g key={x}>
        <path d={`${lid}C${x + 2.4} ${EYE_Y + 3.8} ${x - 2.4} ${EYE_Y + 3.8} ${x - 4.6} ${EYE_Y + 0.6}z`} fill="#fff" />
        <circle cx={x} cy={EYE_Y} r="2.6" fill={tones.line} />
        {shine}
        <path d={`${lid}M${x + outer * 4.6} ${EYE_Y + 0.6}l${outer * 1.9} -1.7`} {...lash} />
      </g>
    );
  }
  if (kind === "sleepy") {
    return (
      <g key={x}>
        <path d={`M${x - 3.8} ${EYE_Y - 0.4}h7.6c0 5.6-7.6 5.6-7.6 0z`} fill="#fff" />
        <path d={`M${x - 2.7} ${EYE_Y - 0.4}h5.4c0 4.2-5.4 4.2-5.4 0z`} fill={tones.line} />
        <path d={`M${x - 4.6} ${EYE_Y - 0.4}h9.2`} {...lash} strokeWidth={1.7 * tones.bold} />
      </g>
    );
  }
  return (
    <g key={x}>
      <ellipse cx={x} cy={EYE_Y} rx="3.8" ry="4" fill="#fff" />
      <circle cx={x} cy={EYE_Y} r="2.9" fill={tones.line} />
      {shine}
      {kind === "lashes" ? (
        <path d={`M${x - 4.3} ${EYE_Y - 1.4}q4.3 -5 8.6 0M${x + outer * 4.3} ${EYE_Y - 1.4}l${outer * 2.1} -1.5M${x + outer * 3.3} ${EYE_Y - 3}l${outer * 1.5} -1.9`} {...lash} />
      ) : null}
    </g>
  );
}

function closedEye(x: number, tones: Tones) {
  return <path key={x} d={`M${x - 3.8} ${EYE_Y + 1.6}q3.8 -5.4 7.6 0`} fill="none" stroke={tones.line} strokeWidth={2 * tones.bold} strokeLinecap="round" />;
}

function Eyes({ kind, tones }: { kind: string; tones: Tones }) {
  if (kind === "smiling") return <>{[closedEye(LEFT, tones), closedEye(RIGHT, tones)]}</>;
  if (kind === "wink") return <>{[openEye(LEFT, "round", tones, -1), closedEye(RIGHT, tones)]}</>;
  return <>{[openEye(LEFT, kind, tones, -1), openEye(RIGHT, kind, tones, 1)]}</>;
}

function Brows({ kind, tones }: { kind: string; tones: Tones }) {
  const stroke = { fill: "none", stroke: tones.brow, strokeLinecap: "round" as const, strokeWidth: (kind === "thick" ? 2.7 : 1.7) * tones.bold };
  if (kind === "straight") return <path d="M36.3 41.2h8.2M55.5 41.2h8.2" {...stroke} />;
  if (kind === "arched") return <path d="M36 42.4q3.8 -4.6 8.8 -1.6M64 42.4q-3.8 -4.6 -8.8 -1.6" {...stroke} />;
  if (kind === "raised") return <path d="M36 40.2q3.8 -4.4 8.8 -1.4M55.4 41.6q4.2 -1.6 8.4 0" {...stroke} />;
  return <path d="M36.2 41.8q4.2 -2.8 8.4 -0.6M63.8 41.8q-4.2 -2.8 -8.4 -0.6" {...stroke} />;
}

function Mouth({ kind, tones }: { kind: string; tones: Tones }) {
  const stroke = { fill: "none", stroke: tones.line, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 1.9 * tones.bold };
  if (kind === "grin") {
    return (
      <>
        <path d="M43.8 59.6h12.4c0 4.4-2.9 7-6.2 7s-6.2-2.6-6.2-7z" fill="#5c1a2b" />
        <path d="M45 59.6h10v1.2c0 .8-.6 1.2-1.4 1.2h-7.2c-.8 0-1.4-.4-1.4-1.2z" fill="#fff" />
        <path d="M46.8 65c1.8-1.6 4.6-1.6 6.4 0c-1.6 1.9-4.8 1.9-6.4 0z" fill="#ff8fa3" />
      </>
    );
  }
  if (kind === "smirk") return <path d="M45 61.6q5.4 2.4 10.4 -2.6" {...stroke} />;
  if (kind === "soft") return <path d="M46.4 61q3.6 2 7.2 0" {...stroke} />;
  if (kind === "lips") {
    const lip = blend("#d6456b", tones.skin, 0.12);
    return (
      <>
        <path d="M44.2 60.8q2.9 -2.6 5.8 -0.9q2.9 -1.7 5.8 0.9q-5.8 1.3 -11.6 0z" fill={blend(lip, "#3a0f1f", 0.22)} />
        <path d="M44.2 60.8q5.8 6.2 11.6 0q-5.8 1.3 -11.6 0z" fill={lip} />
      </>
    );
  }
  if (kind === "cheeky") {
    return (
      <>
        <path d="M44.5 60q5.5 5 11 0" {...stroke} />
        <path d="M49.4 62.5h4.4v1.5a2.2 2.2 0 0 1 -4.4 0z" fill="#ff7f97" />
      </>
    );
  }
  return <path d="M44.5 60q5.5 5 11 0" {...stroke} />;
}

function Cheeks({ kind, tones }: { kind: string; tones: Tones }) {
  const blush = kind === "blush" || kind === "both";
  const freckles = kind === "freckles" || kind === "both";
  const fleck = blend(tones.skin, "#6e2f17", 0.5);
  return (
    <>
      {blush ? (
        <Both>
          <ellipse cx="35.2" cy="56" rx="4.4" ry="2.8" fill="#ff5f84" opacity="0.4" />
        </Both>
      ) : null}
      {freckles ? (
        <Both>
          <g fill={fleck}>
            <circle cx="33.4" cy="54.4" r="0.85" />
            <circle cx="36.2" cy="55.6" r="0.85" />
            <circle cx="38.8" cy="54" r="0.85" />
            <circle cx="35" cy="57.6" r="0.75" />
          </g>
        </Both>
      ) : null}
      {kind === "mole" ? <circle cx="62.6" cy="57.6" r="0.9" fill={tones.line} /> : null}
    </>
  );
}

function FacialHair({ kind, tones }: { kind: string; tones: Tones }) {
  const tash = "M41 58.6C44 55.8 48 56.3 50 57.8C52 56.3 56 55.8 59 58.6C56 60.4 52.4 59.9 50 59.2C47.6 59.9 44 60.4 41 58.6z";
  if (kind === "stubble") {
    return (
      <path
        d="M28.6 52C29.5 65 38 73 50 73C62 73 70.5 65 71.4 52C68.5 58 63 60.5 58 58.5C54.5 56.4 51.8 56.6 50 57.8C48.2 56.6 45.5 56.4 42 58.5C37 60.5 31.5 58 28.6 52z"
        fill={tones.hair}
        opacity="0.26"
      />
    );
  }
  if (kind === "moustache") return <path d={tash} fill={tones.hair} />;
  if (kind === "goatee") {
    return (
      <>
        <path d={tash} fill={tones.hair} />
        <path d="M44.6 66.4C46.4 64.9 53.6 64.9 55.4 66.4C55.4 70.8 53 73.4 50 73.4C47 73.4 44.6 70.8 44.6 66.4z" fill={tones.hair} />
      </>
    );
  }
  if (kind === "beard") {
    return (
      <>
        <path
          d="M27.4 49C27.6 64.5 36.5 76 50 76C63.5 76 72.4 64.5 72.6 49C70.6 55.5 66 58.4 61 57.6C57 55.6 53 55.8 50 57.6C47 55.8 43 55.6 39 57.6C34 58.4 29.4 55.5 27.4 49z"
          fill={tones.hair}
        />
        <ellipse cx="50" cy="62" rx="6.6" ry="3.6" fill={tones.skin} />
      </>
    );
  }
  return null;
}

function Glasses({ kind, tones }: { kind: string; tones: Tones }) {
  if (kind === "none") return null;
  const frame = { fill: "rgba(255, 255, 255, 0.22)", stroke: INK, strokeWidth: 1.5 * tones.bold, strokeLinejoin: "round" as const };
  const arms = <path d="M33.6 46.6L28 45.2M66.4 46.6L72 45.2M46.8 47.2q3.2 -1.8 6.4 0" fill="none" stroke={INK} strokeWidth={1.4 * tones.bold} strokeLinecap="round" />;
  if (kind === "round") {
    return (
      <>
        <circle cx={LEFT} cy={EYE_Y} r="6.6" {...frame} />
        <circle cx={RIGHT} cy={EYE_Y} r="6.6" {...frame} />
        {arms}
      </>
    );
  }
  if (kind === "square") {
    return (
      <>
        <rect x="33.6" y="42.4" width="13.6" height="11" rx="3" {...frame} />
        <rect x="52.8" y="42.4" width="13.6" height="11" rx="3" {...frame} />
        {arms}
      </>
    );
  }
  if (kind === "cateye") {
    const lens = "M33.4 44.2C33 42.4 34 41.4 36 41.8L46 43.4C47.4 43.6 47.8 44.6 47.6 46.2C47 51 44.6 53.6 40.6 53.6C36.6 53.6 34 50 33.4 44.2z";
    return (
      <>
        <Both>
          <path d={lens} {...frame} stroke="#b0284f" />
        </Both>
        <path d="M33.4 43.8L28 45.2M66.6 43.8L72 45.2M47.4 46q2.6 -1.4 5.2 0" fill="none" stroke="#b0284f" strokeWidth={1.4 * tones.bold} strokeLinecap="round" />
      </>
    );
  }
  return (
    <>
      <rect x="33.2" y="42.6" width="14.2" height="10.4" rx="4.6" fill={INK} stroke={INK} strokeWidth="1.2" />
      <rect x="52.6" y="42.6" width="14.2" height="10.4" rx="4.6" fill={INK} stroke={INK} strokeWidth="1.2" />
      <path d="M35.6 46.4l3.4 -2.2M55 46.4l3.4 -2.2" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" opacity="0.55" />
      {arms}
    </>
  );
}

const LOBES: Record<string, [number, number]> = {
  human: [26.4, 53.8],
  elf: [27.4, 54.6],
  cat: [27.2, 26.5],
  fox: [25.6, 27],
  bunny: [31.4, 25.5],
  bear: [23.8, 26.5],
  pup: [17.6, 47],
};

function Earrings({ kind, ears }: { kind: string; ears: string }) {
  if (kind === "none") return null;
  const [x, y] = LOBES[ears] || LOBES.human;
  const onTop = ears !== "human" && ears !== "elf";
  return (
    <Both>
      {kind === "studs" ? <circle cx={x} cy={y} r="1.7" fill={GOLD} stroke={GOLD_DEEP} strokeWidth="0.5" /> : null}
      {kind === "hoops" ? <circle cx={x} cy={y + (onTop ? 1.6 : 2.6)} r={onTop ? 2.2 : 3} fill="none" stroke={GOLD} strokeWidth="1.5" /> : null}
      {kind === "drops" ? (
        <>
          <path d={`M${x} ${y}v2.4`} stroke={GOLD} strokeWidth="1" strokeLinecap="round" />
          <path d={`M${x} ${y + 2.2}c2.2 2.6 1.8 5.2 0 5.2s-2.2-2.6 0-5.2z`} fill="#ff5a7a" />
        </>
      ) : null}
    </Both>
  );
}

function Neckwear({ kind }: { kind: string }) {
  if (kind === "choker") {
    return (
      <>
        <path d="M43.5 74.4q6.5 2.6 13 0v2.5q-6.5 2.6-13 0z" fill={INK} />
        <path d="M50 78.2c-1.9-1.4-1.7-3-.8-3c.5 0 .8.3.8.6c0-.3.3-.6.8-.6c.9 0 1.1 1.6-.8 3z" fill={GOLD} transform="translate(0 1.6)" />
      </>
    );
  }
  if (kind === "collar") {
    return (
      <>
        <path d="M43.5 73.6q6.5 2.8 13 0v3.9q-6.5 2.8-13 0z" fill="#e23e68" />
        <circle cx="46.2" cy="76.5" r="0.8" fill={GOLD} />
        <circle cx="53.8" cy="76.5" r="0.8" fill={GOLD} />
        <circle cx="50" cy="80.4" r="2.1" fill="none" stroke={GOLD} strokeWidth="1.2" />
      </>
    );
  }
  if (kind === "pendant") {
    return (
      <>
        <path d="M44 75.4Q50 85.4 56 75.4" fill="none" stroke={GOLD} strokeWidth="0.9" strokeLinecap="round" />
        <path d="M50 86.2c-3.2-2.3-2.9-5-1.3-5c.8 0 1.3.5 1.3 1c0-.5.5-1 1.3-1c1.6 0 1.9 2.7-1.3 5z" fill={GOLD} stroke={GOLD_DEEP} strokeWidth="0.4" />
      </>
    );
  }
  return null;
}

function Topper({ kind }: { kind: string }) {
  if (kind === "bow") {
    return (
      <g transform="translate(66.5 22.5) rotate(18)">
        <path d="M0 0C-3.6 -6.4 -10.4 -6.6 -10.6 0C-10.4 6.6 -3.6 6.4 0 0z" fill="#ff5a7a" />
        <path d="M0 0C3.6 -6.4 10.4 -6.6 10.6 0C10.4 6.6 3.6 6.4 0 0z" fill="#ff5a7a" />
        <circle r="2.5" fill="#d63d68" />
      </g>
    );
  }
  if (kind === "flower") {
    return (
      <g transform="translate(32.5 26)">
        {[0, 72, 144, 216, 288].map((angle) => (
          <circle key={angle} cx="0" cy="-4.1" r="3.4" fill="#fff" stroke="#f3b9c8" strokeWidth="0.6" transform={`rotate(${angle})`} />
        ))}
        <circle r="2.5" fill={GOLD} />
      </g>
    );
  }
  if (kind === "horns") {
    return (
      <Both>
        <path d="M41.2 24.2C39.2 19.6 39.3 14.6 42 10.4C44.6 14 46.6 18.2 47 22.8z" fill="#e23e68" stroke="#e23e68" strokeWidth="1" strokeLinejoin="round" />
        <path d="M42 14.4c.9 1.6 1.6 3.2 2 4.8" fill="none" stroke="#ff9fb1" strokeWidth="1" strokeLinecap="round" />
      </Both>
    );
  }
  if (kind === "halo") {
    return (
      <>
        <ellipse cx="50" cy="9.6" rx="13" ry="3.7" fill="none" stroke={GOLD_DEEP} strokeWidth="3.6" />
        <ellipse cx="50" cy="9.6" rx="13" ry="3.7" fill="none" stroke="#ffe08a" strokeWidth="2" />
      </>
    );
  }
  if (kind === "crown") {
    return (
      <>
        <path d="M41 21.4L39.4 11.6L45 16.2L50 9L55 16.2L60.6 11.6L59 21.4z" fill={GOLD} stroke={GOLD_DEEP} strokeWidth="0.9" strokeLinejoin="round" />
        <circle cx="50" cy="17" r="1.5" fill="#ff5a7a" />
        <circle cx="44.4" cy="18.6" r="0.9" fill="#12b5a8" />
        <circle cx="55.6" cy="18.6" r="0.9" fill="#12b5a8" />
      </>
    );
  }
  return null;
}

/** A head-and-shoulders character, drawn in a round frame. `look` must be complete: see `lookOf`. */
export function AvatarFace({ look, size = 52, className = "" }: { look: Look; size?: number; className?: string }) {
  const tones = tonesOf(look, size);
  const topper = look.topper;
  return (
    <span className={`avatar face ${className}`.trim()} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <rect width="100" height="100" fill={colorOf("backdrop", look.backdrop)} />
        <HairBack style={look.hair} tones={tones} />
        <path d="M43.5 64h13v15c0 5-13 5-13 0z" fill={tones.shade} />
        <path d="M12 101C12 86 25 79.5 40.5 78C44 83.5 56 83.5 59.5 78C75 79.5 88 86 88 101z" fill={tones.top} />
        <path d="M40.5 78C44 83.5 56 83.5 59.5 78" fill="none" stroke={blend(tones.top, "#1c0f17", 0.22)} strokeWidth="1.5" strokeLinecap="round" />
        <Neckwear kind={look.neck} />
        <SideEars kind={look.ears} tones={tones} />
        <path d={HEAD} fill={tones.skin} />
        <Cheeks kind={look.cheeks} tones={tones} />
        <FacialHair kind={look.facialHair} tones={tones} />
        <Mouth kind={look.mouth} tones={tones} />
        <path d="M48.9 54.6q1.2 1.5 2.6 0.2" fill="none" stroke={tones.line} strokeWidth={1.2 * tones.bold} strokeLinecap="round" opacity="0.55" />
        {look.glasses === "shades" ? null : <Eyes kind={look.eyes} tones={tones} />}
        <Brows kind={look.brows} tones={tones} />
        <HairFront style={look.hair} tones={tones} />
        <Earrings kind={look.earrings} ears={look.ears} />
        <Glasses kind={look.glasses} tones={tones} />
        <TopEars kind={look.ears} tones={tones} />
        <Topper kind={topper} />
      </svg>
    </span>
  );
}

/**
 * The avatar for a person. A few screens still hand over only the old colour
 * and mark; when that matches someone in this household, their saved face is
 * used, and otherwise the face is worked out from the colour and mark.
 */
export function PersonAvatar({ person, size = 52 }: { person: Pick<Person, "displayName" | "avatar">; size?: number }) {
  const { data } = useSession();
  let avatar = person.avatar;
  if (!avatar?.look && data) {
    const known = [data.me, data.partner].find(
      (other) => other?.avatar?.look && other.displayName === person.displayName && other.avatar.hue === avatar?.hue && other.avatar.mark === avatar?.mark,
    );
    if (known) avatar = known.avatar;
  }
  return <AvatarFace look={lookOf(avatar)} size={size} />;
}
