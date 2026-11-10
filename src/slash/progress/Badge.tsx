import type { ReactNode } from "react";
import type { TrophyTint } from "../types.ts";
import "./progress.css";

type Cloth = { fill: string; edge: string; thread: string; ink: string; pop: string };

const CLOTH: Record<TrophyTint, Cloth> = {
  coral: { fill: "#ff6f8a", edge: "#cf3a62", thread: "#ffe3ea", ink: "#fff7f2", pop: "#ffd166" },
  gold: { fill: "#ffc857", edge: "#d6961f", thread: "#fff6d9", ink: "#4a2a4f", pop: "#e23e68" },
  teal: { fill: "#2cc2b4", edge: "#0c8f85", thread: "#d6fbf5", ink: "#fff7f2", pop: "#ffd166" },
  lilac: { fill: "#b79cf0", edge: "#7c5fc4", thread: "#f1e9ff", ink: "#fff7f2", pop: "#ffd166" },
  plum: { fill: "#4a2a55", edge: "#2a1b33", thread: "#e7b9d0", ink: "#ffd9e3", pop: "#ffc14d" },
};

const MYSTERY: Cloth = { fill: "#f7e7df", edge: "#d9c2c9", thread: "#cdb0bd", ink: "#b79aa8", pop: "#b79aa8" };

const SERIF = "Newsreader, 'Source Serif 4', Georgia, serif";

const SHIELD = "M48 6 L84 17 V50 C84 70 68 84 48 91 C28 84 12 70 12 50 V17 Z";
const HEX = "M48 6 L85 27 V69 L48 90 L11 69 V27 Z";

/** The cut of the patch says what kind of thing it is: round for levels, a shield for firsts, six sides for care. */
function shapeOf(art: string | undefined, group: string | undefined) {
  const kind = (art || "").split(":")[0];
  if (kind === "level" || group === "levels") return "round";
  if (["needle", "door", "gift", "letters", "moon", "rings"].includes(kind) || group === "firsts") return "shield";
  if (kind === "heart" || group === "care") return "hex";
  return "square";
}

function Patch({ shape, cloth, soft }: { shape: string; cloth: Cloth; soft?: boolean }) {
  const stitch = {
    fill: "none",
    stroke: cloth.thread,
    strokeWidth: 1.6,
    strokeDasharray: "3.2 3",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
  };
  const body = { fill: cloth.fill, stroke: cloth.edge, strokeWidth: soft ? 1.4 : 2.4, strokeLinejoin: "round" as const };
  const inset = "translate(48 48) scale(0.84) translate(-48 -48)";
  if (shape === "round") {
    return (
      <>
        <circle cx="48" cy="48" r="42" {...body} />
        <circle cx="48" cy="48" r="35.5" {...stitch} />
      </>
    );
  }
  if (shape === "shield") {
    return (
      <>
        <path d={SHIELD} {...body} />
        <path d={SHIELD} transform={inset} {...stitch} />
      </>
    );
  }
  if (shape === "hex") {
    return (
      <>
        <path d={HEX} {...body} strokeWidth={soft ? 3 : 5} />
        <path d={HEX} transform={inset} {...stitch} />
      </>
    );
  }
  return (
    <>
      <rect x="7" y="7" width="82" height="82" rx="20" {...body} />
      <rect x="13.5" y="13.5" width="69" height="69" rx="14.5" {...stitch} />
    </>
  );
}

function flamePath(cx: number, top: number, size: number) {
  const s = size / 46;
  const x = (value: number) => (cx + value * s).toFixed(1);
  const y = (value: number) => (top + value * s).toFixed(1);
  return `M${x(0)} ${y(0)} C${x(8)} ${y(10)} ${x(18)} ${y(18)} ${x(18)} ${y(30)} A${(18 * s).toFixed(1)} ${(17 * s).toFixed(1)} 0 0 1 ${x(-18)} ${y(30)} C${x(-18)} ${y(22)} ${x(-12)} ${y(18)} ${x(-10)} ${y(10)} C${x(-6)} ${y(14)} ${x(-4)} ${y(16)} ${x(-3)} ${y(20)} C${x(-1)} ${y(14)} ${x(-1)} ${y(6)} ${x(0)} ${y(0)}Z`;
}

function Flame({ cx, top, size, cloth }: { cx: number; top: number; size: number; cloth: Cloth }) {
  return (
    <>
      <path d={flamePath(cx, top, size)} fill={cloth.ink} />
      <path d={flamePath(cx, top + size * 0.42, size * 0.5)} fill={cloth.pop} />
    </>
  );
}

function sparkle(cx: number, cy: number, r: number) {
  const k = r * 0.16;
  return `M${cx} ${cy - r} C${cx + k} ${cy - k * 2.4} ${cx + k * 2.4} ${cy - k} ${cx + r} ${cy} C${cx + k * 2.4} ${cy + k} ${cx + k} ${cy + k * 2.4} ${cx} ${cy + r} C${cx - k} ${cy + k * 2.4} ${cx - k * 2.4} ${cy + k} ${cx - r} ${cy} C${cx - k * 2.4} ${cy - k} ${cx - k} ${cy - k * 2.4} ${cx} ${cy - r}Z`;
}

function rays(cx: number, cy: number, from: number, to: number, count: number, turn = 0, step = (Math.PI * 2) / count) {
  let d = "";
  for (let index = 0; index < count; index += 1) {
    const angle = turn + index * step;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    d += `M${(cx + cos * from).toFixed(1)} ${(cy + sin * from).toFixed(1)}L${(cx + cos * to).toFixed(1)} ${(cy + sin * to).toFixed(1)}`;
  }
  return d;
}

function Numeral({ value, y, size, fill }: { value: string; y: number; size: number; fill: string }) {
  return (
    <text x="48" y={y} textAnchor="middle" fontFamily={SERIF} fontWeight={600} fontSize={size} letterSpacing="-0.02em" fill={fill}>
      {value}
    </text>
  );
}

function LevelEmblem({ id, cloth }: { id: string; cloth: Cloth }) {
  const line = { fill: "none", stroke: cloth.ink, strokeWidth: 2.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const pop = { ...line, stroke: cloth.pop };
  switch (id) {
    case "spark":
      return (
        <>
          <path d={sparkle(48, 48, 20)} fill={cloth.ink} />
          <path d={sparkle(66, 31, 6)} fill={cloth.pop} />
          <circle cx="30" cy="66" r="2.4" fill={cloth.pop} />
        </>
      );
    case "glow":
      return (
        <>
          <circle cx="48" cy="48" r="11" fill={cloth.ink} />
          <circle cx="48" cy="48" r="17.5" {...pop} strokeWidth={2} strokeDasharray="1 5" />
          <path d={rays(48, 48, 22, 26, 8, Math.PI / 8)} {...line} strokeWidth={2.2} />
        </>
      );
    case "flame":
      return <Flame cx={48} top={24} size={46} cloth={cloth} />;
    case "hearth":
      return (
        <>
          <path d="M27 70 V47 A21 21 0 0 1 69 47 V70 Z" fill={cloth.ink} />
          <path d="M35 70 V50 A13 13 0 0 1 61 50 V70 Z" fill={cloth.edge} />
          <path d={flamePath(48, 46, 24)} fill={cloth.pop} />
          <path d="M23 70 H73" {...line} />
        </>
      );
    case "beacon":
      return (
        <>
          <path d="M41 71 L44.5 43 H51.5 L55 71 Z" fill={cloth.ink} />
          <rect x="43" y="33" width="10" height="9" rx="1.5" fill={cloth.pop} />
          <path d="M41 33 L48 25 L55 33 Z" fill={cloth.ink} />
          <path d="M39 36 L24 31 M39 39 L24 44 M57 36 L72 31 M57 39 L72 44" {...pop} strokeWidth={2} />
          <path d="M36 71 H60" {...line} />
          <path d="M43.5 53 H52.5 M42.5 62 H53.5" stroke={cloth.fill} strokeWidth={2.4} />
        </>
      );
    case "constellation":
      return (
        <>
          <path d="M28 60 L40 44 L52 54 L62 32 L71 44" {...line} strokeWidth={1.6} strokeDasharray="2.5 3" />
          <path d={sparkle(28, 60, 5)} fill={cloth.ink} />
          <path d={sparkle(40, 44, 6)} fill={cloth.pop} />
          <path d={sparkle(52, 54, 5)} fill={cloth.ink} />
          <path d={sparkle(62, 32, 8)} fill={cloth.pop} />
          <path d={sparkle(71, 44, 4.5)} fill={cloth.ink} />
          <circle cx="34" cy="30" r="1.6" fill={cloth.ink} />
          <circle cx="62" cy="66" r="1.6" fill={cloth.ink} />
        </>
      );
    case "aurora":
      return (
        <>
          <path d="M24 46 C34 30 42 54 52 40 S66 30 72 38" {...line} strokeWidth={4.5} />
          <path d="M24 56 C34 40 42 64 52 50 S66 40 72 48" {...pop} strokeWidth={4.5} />
          <path d="M26 66 C36 52 44 72 54 60 S66 52 70 58" {...line} strokeWidth={3} opacity={0.75} />
          <path d={sparkle(62, 26, 4.5)} fill={cloth.ink} />
          <circle cx="36" cy="28" r="1.8" fill={cloth.ink} />
        </>
      );
    case "comet":
      return (
        <>
          <path d="M57 39 L28 62 M61 46 L36 68 M50 36 L26 52" {...line} strokeWidth={2.4} />
          <circle cx="61" cy="36" r="10" fill={cloth.pop} />
          <circle cx="61" cy="36" r="5" fill={cloth.ink} />
          <circle cx="32" cy="32" r="1.8" fill={cloth.ink} />
          <circle cx="66" cy="62" r="1.8" fill={cloth.ink} />
        </>
      );
    case "solstice":
      return (
        <>
          <path d="M32 58 A16 16 0 0 1 64 58 Z" fill={cloth.pop} />
          <path d={rays(48, 58, 20, 26, 7, Math.PI, Math.PI / 6)} {...line} strokeWidth={2.2} />
          <path d="M24 58 H72" {...line} />
          <path d="M32 65 H64 M39 71 H57" {...line} strokeWidth={2} opacity={0.8} />
        </>
      );
    case "daystar":
      return (
        <>
          <path d={sparkle(48, 48, 15)} fill={cloth.pop} transform="rotate(45 48 48)" />
          <path d={sparkle(48, 48, 23)} fill={cloth.ink} />
          <circle cx="48" cy="48" r="4" fill={cloth.pop} />
        </>
      );
    case "supernova":
      return (
        <>
          <path d={rays(48, 48, 13, 24, 12)} {...line} strokeWidth={2.4} />
          <path d={rays(48, 48, 15, 19, 12, Math.PI / 12)} {...pop} strokeWidth={2.2} />
          <circle cx="48" cy="48" r="9" fill={cloth.pop} />
          <circle cx="48" cy="48" r="4" fill={cloth.ink} />
        </>
      );
    case "everflame":
      return (
        <>
          <Flame cx={48} top={22} size={34} cloth={cloth} />
          <path d="M48 66 C42 58 30 58 30 66 C30 74 42 74 48 66 C54 58 66 58 66 66 C66 74 54 74 48 66 Z" {...line} strokeWidth={2.8} />
        </>
      );
    default:
      return <path d={sparkle(48, 48, 18)} fill={cloth.ink} />;
  }
}

function Emblem({ art, cloth }: { art: string; cloth: Cloth }): ReactNode {
  const [kind, detail = ""] = art.split(":");
  const line = { fill: "none", stroke: cloth.ink, strokeWidth: 2.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const pop = { ...line, stroke: cloth.pop };
  switch (kind) {
    case "level":
      return <LevelEmblem id={detail} cloth={cloth} />;
    case "needle":
      return (
        <>
          <path d="M33 62 C24 50 30 36 42 38 C54 40 50 56 40 54 C34 53 36 44 44 45" {...pop} strokeWidth={2.2} strokeDasharray="3.5 3" />
          <path d="M34 66 L64 30" {...line} strokeWidth={3.4} />
          <path d="M61.5 29 L66.5 33" stroke={cloth.fill} strokeWidth={1.6} strokeLinecap="round" />
          <path d="M34 66 L31 69" {...line} strokeWidth={1.6} />
        </>
      );
    case "door":
      return (
        <>
          <path d="M33 68 V40 A15 15 0 0 1 63 40 V68 Z" fill={cloth.ink} />
          <path d="M48 26 V68 H63 V40 A15 15 0 0 0 48 26 Z" fill={cloth.pop} />
          <circle cx="43.5" cy="50" r="2.2" fill={cloth.fill} />
          <path d="M28 68 H68" {...line} />
          <path d={sparkle(56, 44, 4)} fill={cloth.ink} />
        </>
      );
    case "gift":
      return (
        <>
          <rect x="30" y="45" width="36" height="24" rx="3" fill={cloth.ink} />
          <rect x="27" y="38" width="42" height="9" rx="3" fill={cloth.ink} />
          <path d="M48 38 V69" {...pop} strokeWidth={4} />
          <path d="M27 42.5 H69" stroke={cloth.fill} strokeWidth={1.2} strokeDasharray="2.5 2.5" />
          <path d="M48 37 C40 26 31 30 36 36 C39 39 45 38 48 37 C56 26 65 30 60 36 C57 39 51 38 48 37 Z" {...pop} strokeWidth={2.6} />
        </>
      );
    case "letters":
      return (
        <>
          <g transform="rotate(-10 40 44)">
            <rect x="24" y="33" width="32" height="22" rx="3" fill={cloth.pop} />
            <path d="M25 35 L40 46 L55 35" fill="none" stroke={cloth.fill} strokeWidth={2} strokeLinejoin="round" />
          </g>
          <g transform="rotate(8 56 56)">
            <rect x="40" y="45" width="32" height="22" rx="3" fill={cloth.ink} />
            <path d="M41 47 L56 58 L71 47" fill="none" stroke={cloth.fill} strokeWidth={2} strokeLinejoin="round" />
          </g>
        </>
      );
    case "moon":
      return (
        <>
          <path d="M56 28 A21 21 0 1 0 68 60 A17 17 0 0 1 56 28 Z" fill={cloth.ink} />
          <path d={sparkle(63, 40, 6)} fill={cloth.pop} />
          <circle cx="70" cy="52" r="1.8" fill={cloth.pop} />
        </>
      );
    case "rings":
      return (
        <>
          <circle cx="40" cy="50" r="13" {...line} strokeWidth={4} />
          <circle cx="56" cy="50" r="13" {...pop} strokeWidth={4} />
          <path d="M48 39.8 A13 13 0 0 1 53 50" {...line} strokeWidth={4} />
          <path d={sparkle(48, 28, 5)} fill={cloth.ink} />
        </>
      );
    case "count":
      return (
        <>
          <Numeral value={detail} y={detail.length > 2 ? 56 : 58} size={detail.length > 2 ? 28 : 34} fill={cloth.ink} />
          <path d="M34 67 L39 72 L47 63" {...pop} strokeWidth={3} />
          <path d="M52 68 H63" {...pop} strokeWidth={3} />
        </>
      );
    case "flame":
      return (
        <>
          <Flame cx={48} top={20} size={30} cloth={cloth} />
          <Numeral value={detail} y={72} size={detail.length > 2 ? 19 : 22} fill={cloth.ink} />
        </>
      );
    case "weeks": {
      const lit = Math.min(7, Number(detail) || 0);
      return (
        <>
          <Numeral value={detail} y={54} size={32} fill={cloth.ink} />
          {[0, 1, 2, 3, 4, 5, 6].map((index) => (
            <rect key={index} x={24.5 + index * 7} y="62" width="5" height="5" rx="1.4" fill={index < lit || lit === 7 ? cloth.pop : cloth.ink} opacity={index < lit || lit === 7 ? 1 : 0.55} />
          ))}
        </>
      );
    }
    case "drop":
      return (
        <>
          <path d="M48 24 C56 36 64 44 64 55 A16 16 0 0 1 32 55 C32 44 40 36 48 24 Z" fill={cloth.ink} />
          <path d="M40 55 A8 8 0 0 0 46 63" fill="none" stroke={cloth.fill} strokeWidth={2.6} strokeLinecap="round" />
          <path d={sparkle(66, 32, 4.5)} fill={cloth.pop} />
        </>
      );
    case "sun":
      return (
        <>
          <path d={rays(48, 48, 17, 24, 10)} {...line} strokeWidth={2.8} />
          <circle cx="48" cy="48" r="12" fill={cloth.pop} />
          <path d="M43 50 A5.5 5.5 0 0 0 53 50" fill="none" stroke={cloth.ink} strokeWidth={2.2} strokeLinecap="round" />
        </>
      );
    case "heart":
      return (
        <>
          <path d="M48 70 C28 56 24 44 30 36 C36 28 46 32 48 40 C50 32 60 28 66 36 C72 44 68 56 48 70 Z" fill={cloth.ink} />
          {detail ? (
            <Numeral value={detail} y={56} size={detail.length > 2 ? 15 : 18} fill={cloth.fill} />
          ) : (
            <path d="M37 42 C38 38 41 37 43 38" fill="none" stroke={cloth.fill} strokeWidth={2.2} strokeLinecap="round" />
          )}
        </>
      );
    default:
      return <path d={sparkle(48, 48, 18)} fill={cloth.ink} />;
  }
}

/**
 * A stitched patch. `art` picks the picture ("level:glow", "flame:7", "needle");
 * leave it out for a trophy nobody has earned yet.
 */
export function Badge({ art, tint, size = 72, label, group }: { art?: string; tint: TrophyTint; size?: number; label?: string; group?: string }) {
  const locked = !art;
  const cloth = locked ? MYSTERY : CLOTH[tint] || CLOTH.coral;
  return (
    <svg
      className={locked ? "pg-badge locked" : "pg-badge"}
      viewBox="0 0 96 96"
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Patch shape={shapeOf(art, group)} cloth={cloth} soft={locked} />
      {locked ? (
        <text x="48" y="60" textAnchor="middle" fontFamily={SERIF} fontWeight={600} fontSize="34" fill={cloth.ink}>
          ?
        </text>
      ) : (
        <Emblem art={art} cloth={cloth} />
      )}
    </svg>
  );
}

export function FlameMark({ size = 16 }: { size?: number }) {
  return (
    <svg className="pg-flame" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={flamePath(12, 1.5, 21)} fill="currentColor" />
    </svg>
  );
}
