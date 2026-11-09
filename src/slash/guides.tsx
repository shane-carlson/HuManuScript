import type { CSSProperties, ReactNode } from "react";

export function Mark({ className = "mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="24" cy="34" r="16" fill="#ff5a7a" />
      <circle cx="42" cy="30" r="14" fill="#12b5a8" />
      <path d="M30 12l6 40" stroke="#2a1b33" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

const INK = "#2a1b33";
const STITCH = {
  fill: "none",
  stroke: INK,
  strokeWidth: 1.3,
  strokeLinecap: "round" as const,
  strokeDasharray: "2.6 3.2",
  opacity: 0.38,
};
const THREAD = { fill: "none", stroke: INK, strokeWidth: 2.2, strokeLinecap: "round" as const };

type GuideProps = { className: string; cheer: boolean };

/**
 * Each guide is a sitting plush: button eyes, stitched seams, a belly patch.
 * With `cheer` the same plush celebrates. Its parts move from styles.css, and
 * it gains the extras only that guide has (foxfire, embers, puffs, a rainbow).
 */
export function GuideFace({ id, className = "guide-face", cheer = false }: { id: string; className?: string; cheer?: boolean }) {
  const classes = cheer ? `${className} cheering` : className;
  if (id === "pip") return <Pip className={classes} cheer={cheer} />;
  if (id === "moss") return <Moss className={classes} cheer={cheer} />;
  if (id === "sol") return <Sol className={classes} cheer={cheer} />;
  return <Lumen className={classes} cheer={cheer} />;
}

/** A piece of the plush that turns or stretches around `at`, given in the drawing's own units. */
function Part({ name, at, children }: { name: string; at: [number, number]; children: ReactNode }) {
  return (
    <g className={`gp gp-${name}`} style={{ transformOrigin: `${at[0]}px ${at[1]}px` }}>
      {children}
    </g>
  );
}

function Shadow({ cx, rx, fill }: { cx: number; rx: number; fill: string }) {
  return <ellipse className="gp gp-shadow" cx={cx} cy="112" rx={rx} ry="5" fill={fill} style={{ transformOrigin: `${cx}px 112px` }} />;
}

/** The everyday face, plus the celebrating face that swaps in while the plush cheers. */
function Looks({ idle, happy, cheer }: { idle: ReactNode; happy: ReactNode; cheer: boolean }) {
  return (
    <>
      <g className="gp-look-idle">{idle}</g>
      {cheer ? <g className="gp-look-cheer">{happy}</g> : null}
    </>
  );
}

function ButtonEyes({ y, left = 47, right = 73 }: { y: number; left?: number; right?: number }) {
  return (
    <>
      <circle cx={left} cy={y} r="4.8" fill={INK} />
      <circle cx={right} cy={y} r="4.8" fill={INK} />
      <circle cx={left + 1.6} cy={y - 1.7} r="1.6" fill="#fff" />
      <circle cx={right + 1.6} cy={y - 1.7} r="1.6" fill="#fff" />
    </>
  );
}

function HappyEyes({ y, left = 47, right = 73 }: { y: number; left?: number; right?: number }) {
  const arc = (x: number) => `M${x - 5.4} ${y + 2.4}q5.4 -8.2 10.8 0`;
  return <path d={arc(left) + arc(right)} {...THREAD} strokeWidth="2.9" />;
}

function Blush({ y, left = 37, right = 83 }: { y: number; left?: number; right?: number }) {
  return (
    <g className="gp-blush">
      <ellipse cx={left} cy={y} rx="4.6" ry="3.2" fill="#ff8fa3" opacity="0.7" />
      <ellipse cx={right} cy={y} rx="4.6" ry="3.2" fill="#ff8fa3" opacity="0.7" />
    </g>
  );
}

/** A soft teardrop that starts at 0,0 and points up, for tails, flames, and manes. */
function Tuft({ x, y, turn, length, fill, tip }: { x: number; y: number; turn: number; length: number; fill: string; tip?: string }) {
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

const FLAME = "M0 -11C6 -4 7 1 5 5.5C3.6 9 -3.6 9 -5 5.5C-7 1 -6 -4 0 -11z";
const HEART = "M0 7C-9 0.5 -8 -7 -3.6 -7C-1.4 -7 0 -5.4 0 -4C0 -5.4 1.4 -7 3.6 -7C8 -7 9 0.5 0 7z";
const STAR = "M0 -9l2.6 5.6 6.1.7-4.5 4.2 1.2 6L0 3.6l-5.4 2.9 1.2-6-4.5-4.2 6.1-.7z";
const SPARKLE = "M0 -9C1 -2.4 2.4 -1 9 0C2.4 1 1 2.4 0 9C-1 2.4 -2.4 1 -9 0C-2.4 -1 -1 -2.4 0 -9z";

/** A small extra that floats near the plush while it cheers. `drift` is where it travels to. */
function Floater({ name, x, y, drift, delay, children }: { name: string; x: number; y: number; drift?: [number, number]; delay: number; children: ReactNode }) {
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

function Lumen({ className, cheer }: GuideProps) {
  const fur = "#ffb085";
  const deep = "#ff9466";
  const cream = "#fff1e3";
  const tip = "#ffd3b0";
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true" data-guide="lumen">
      <Shadow cx={62} rx={34} fill="#ffd0c2" />
      <Part name="body" at={[60, 111]}>
        <Part name="tail t1" at={[70, 98]}>
          <Tuft x={70} y={98} turn={36} length={52} fill={deep} tip={tip} />
        </Part>
        <Part name="tail t2" at={[72, 101]}>
          <Tuft x={72} y={101} turn={63} length={47} fill={fur} tip={tip} />
        </Part>
        <Part name="tail t3" at={[72, 104]}>
          <Tuft x={72} y={104} turn={90} length={43} fill={deep} tip={tip} />
        </Part>
        <ellipse cx="46" cy="106" rx="10.5" ry="6.5" fill={deep} />
        <ellipse cx="74" cy="106" rx="10.5" ry="6.5" fill={deep} />
        <ellipse cx="60" cy="88" rx="23" ry="21" fill={fur} />
        <ellipse cx="60" cy="93" rx="13.5" ry="13" fill={cream} />
        <ellipse cx="60" cy="93" rx="10.5" ry="10" {...STITCH} />
        <Part name="arm arm-l" at={[41, 79]}>
          <ellipse cx="38.5" cy="87" rx="7" ry="11" fill={deep} transform="rotate(16 38.5 87)" />
        </Part>
        <Part name="arm arm-r" at={[79, 79]}>
          <ellipse cx="81.5" cy="87" rx="7" ry="11" fill={deep} transform="rotate(-16 81.5 87)" />
        </Part>
        <Part name="head" at={[60, 76]}>
          <Part name="ear ear-l" at={[43, 37]}>
            <path d="M31 40L34 11 55 27z" fill={deep} stroke={deep} strokeWidth="5" strokeLinejoin="round" />
            <path d="M37 33L38 19 49 28z" fill="#ffd9cf" stroke="#ffd9cf" strokeWidth="2" strokeLinejoin="round" />
          </Part>
          <Part name="ear ear-r" at={[77, 37]}>
            <path d="M89 40L86 11 65 27z" fill={deep} stroke={deep} strokeWidth="5" strokeLinejoin="round" />
            <path d="M83 33L82 19 71 28z" fill="#ffd9cf" stroke="#ffd9cf" strokeWidth="2" strokeLinejoin="round" />
          </Part>
          <ellipse cx="60" cy="51" rx="31" ry="26" fill={fur} />
          <path d="M31 56c4 13 15 21 29 21s25-8 29-21c-9 2-16-1-21-7-2 4-5 6-8 6s-6-2-8-6c-5 6-12 9-21 7z" fill={cream} />
          <path d="M60 27l3.4 5.4L60 38l-3.4-5.6z" fill="#ff5a7a" />
          <Looks cheer={cheer} idle={<ButtonEyes y={50} />} happy={<HappyEyes y={50} />} />
          <Blush y={61} />
          <ellipse cx="60" cy="60.5" rx="3.8" ry="2.7" fill={INK} />
          <path d="M60 63v3M60 66c-2 2.6-5 2.6-6.6.4M60 66c2 2.6 5 2.6 6.6.4" {...THREAD} strokeWidth="1.9" />
        </Part>
      </Part>
      {cheer
        ? [
            { x: 7, y: 52, delay: 0 },
            { x: 113, y: 44, delay: -0.55 },
            { x: 60, y: -5, delay: -1.1 },
          ].map((wisp) => (
            <Floater key={wisp.x} name="wisp" x={wisp.x} y={wisp.y} delay={wisp.delay}>
              <path d={FLAME} fill="#c5b0ff" />
              <path d={FLAME} fill="#fff" transform="translate(0 2.4) scale(0.46)" />
            </Floater>
          ))
        : null}
    </svg>
  );
}

function Pip({ className, cheer }: GuideProps) {
  const down = "#ffc94f";
  const deep = "#ffa63d";
  const cream = "#fff4c8";
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true" data-guide="pip">
      <Shadow cx={60} rx={30} fill="#ffe3a3" />
      <Part name="body" at={[60, 111]}>
        <Part name="tail t1" at={[60, 100]}>
          <Tuft x={60} y={100} turn={-80} length={50} fill="#ff5a7a" tip="#ff8a4c" />
        </Part>
        <Part name="tail t2" at={[60, 100]}>
          <Tuft x={60} y={100} turn={80} length={50} fill="#ff5a7a" tip="#ff8a4c" />
        </Part>
        <Part name="tail t3" at={[60, 98]}>
          <Tuft x={60} y={98} turn={-52} length={54} fill="#ff8a4c" tip="#ff5a7a" />
        </Part>
        <Part name="tail t4" at={[60, 98]}>
          <Tuft x={60} y={98} turn={52} length={54} fill="#ff8a4c" tip="#ff5a7a" />
        </Part>
        <path d="M40 104h16l-3 6h-4l-1-3-1 3h-4z" fill="#ff8a4c" stroke="#ff8a4c" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M64 104h16l-3 6h-4l-1-3-1 3h-4z" fill="#ff8a4c" stroke="#ff8a4c" strokeWidth="2.4" strokeLinejoin="round" />
        <ellipse cx="60" cy="87" rx="24" ry="21" fill={down} />
        <ellipse cx="60" cy="92" rx="13.5" ry="12.5" fill={cream} />
        <ellipse cx="60" cy="92" rx="10.5" ry="9.5" {...STITCH} />
        <Part name="arm arm-l" at={[41, 75]}>
          <ellipse cx="36.5" cy="85" rx="8" ry="13.5" fill={deep} transform="rotate(20 36.5 85)" />
          <path d="M33 80c1 5 3 9 6 12" {...STITCH} />
        </Part>
        <Part name="arm arm-r" at={[79, 75]}>
          <ellipse cx="83.5" cy="85" rx="8" ry="13.5" fill={deep} transform="rotate(-20 83.5 85)" />
          <path d="M87 80c-1 5-3 9-6 12" {...STITCH} />
        </Part>
        <rect x="71" y="77" width="9" height="9" rx="2" fill="#c5b0ff" transform="rotate(14 75.5 81.5)" />
        <rect x="72.6" y="78.6" width="5.8" height="5.8" rx="1" transform="rotate(14 75.5 81.5)" {...STITCH} />
        <Part name="head" at={[60, 76]}>
          <Part name="crest" at={[60, 33]}>
            <Tuft x={60} y={32} turn={-34} length={24} fill="#ff8a4c" />
            <Tuft x={60} y={32} turn={34} length={24} fill="#ff8a4c" />
            <Tuft x={60} y={33} turn={0} length={30} fill="#ff5a7a" tip="#ff8a4c" />
          </Part>
          <ellipse cx="60" cy="52" rx="29" ry="25" fill={down} />
          <Looks cheer={cheer} idle={<ButtonEyes y={50} left={46} right={74} />} happy={<HappyEyes y={50} left={46} right={74} />} />
          <Blush y={60} left={38} right={82} />
          <path d="M53.5 57h13L60 66.5z" fill="#ff8a4c" stroke="#ff8a4c" strokeWidth="2.6" strokeLinejoin="round" />
          <path d="M55 58.5h10" stroke="#e86a2c" strokeWidth="1.3" strokeLinecap="round" opacity="0.6" />
        </Part>
      </Part>
      {cheer
        ? [
            { x: 14, sway: -8, fill: "#ff8a4c", r: 3.6 },
            { x: 30, sway: 6, fill: "#ffc14d", r: 2.8 },
            { x: 46, sway: -5, fill: "#ff5a7a", r: 3.1 },
            { x: 74, sway: 5, fill: "#ffc14d", r: 3.1 },
            { x: 90, sway: -6, fill: "#ff5a7a", r: 2.8 },
            { x: 106, sway: 8, fill: "#ff8a4c", r: 3.6 },
          ].map((ember, index) => (
            <Floater key={ember.x} name="ember" x={ember.x} y={108} drift={[ember.sway, -84]} delay={-index * 0.31}>
              <circle r={ember.r} fill={ember.fill} />
            </Floater>
          ))
        : null}
    </svg>
  );
}

function Moss({ className, cheer }: GuideProps) {
  const scale = "#7fd8c6";
  const deep = "#5cc7b4";
  const cream = "#fff1c9";
  const wing = "M38 80C24 78 12 68 8 52c6 2 10 6 12 10 0-6 2-11 6-15 4 9 10 17 16 21z";
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true" data-guide="moss">
      <Shadow cx={62} rx={34} fill="#d8fff4" />
      <Part name="body" at={[60, 111]}>
        <Part name="wing wing-l" at={[39, 78]}>
          <path d={wing} fill="#c5b0ff" />
          <path d="M14 58c4 8 12 14 20 17" {...STITCH} />
        </Part>
        <Part name="wing wing-r" at={[81, 78]}>
          <path d={wing} fill="#c5b0ff" transform="translate(120 0) scale(-1 1)" />
          <path d="M106 58c-4 8-12 14-20 17" {...STITCH} />
        </Part>
        <Part name="tail t1" at={[78, 100]}>
          <path d="M78 100c13 5 25 0 28-13" fill="none" stroke={scale} strokeWidth="10" strokeLinecap="round" />
          <path d="M107 73l8 9-7 9-8-8z" fill="#ffc14d" stroke="#ffc14d" strokeWidth="2.4" strokeLinejoin="round" />
        </Part>
        <ellipse cx="46" cy="106" rx="10.5" ry="6.5" fill={deep} />
        <ellipse cx="74" cy="106" rx="10.5" ry="6.5" fill={deep} />
        <path d="M40 107.5v2.6M46 108v2.6M52 107.5v2.6M68 107.5v2.6M74 108v2.6M80 107.5v2.6" stroke={cream} strokeWidth="2.2" strokeLinecap="round" />
        <ellipse cx="60" cy="88" rx="23" ry="21" fill={scale} />
        <ellipse cx="60" cy="93" rx="13.5" ry="13.5" fill={cream} />
        <path d="M49.5 87h21M47.5 93h25M49.5 99h21" stroke="#d9b25f" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="2.6 3.2" opacity="0.8" />
        <Part name="arm arm-l" at={[41, 79]}>
          <ellipse cx="38.5" cy="87" rx="7" ry="11" fill={deep} transform="rotate(16 38.5 87)" />
        </Part>
        <Part name="arm arm-r" at={[79, 79]}>
          <ellipse cx="81.5" cy="87" rx="7" ry="11" fill={deep} transform="rotate(-16 81.5 87)" />
        </Part>
        <rect x="67" y="79" width="9" height="9" rx="2" fill="#ff8fa3" transform="rotate(-12 71.5 83.5)" />
        <rect x="68.6" y="80.6" width="5.8" height="5.8" rx="1" transform="rotate(-12 71.5 83.5)" {...STITCH} />
        <Part name="head" at={[60, 75]}>
          <path d="M41 33c-5-7-5-14-1-20 5 4 9 10 9 17z" fill={cream} stroke={cream} strokeWidth="2" strokeLinejoin="round" />
          <path d="M79 33c5-7 5-14 1-20-5 4-9 10-9 17z" fill={cream} stroke={cream} strokeWidth="2" strokeLinejoin="round" />
          <Part name="ear ear-l" at={[33, 47]}>
            <path d="M31 50c-9-2-15-8-17-15 8-1 15 2 20 8z" fill={deep} />
          </Part>
          <Part name="ear ear-r" at={[87, 47]}>
            <path d="M89 50c9-2 15-8 17-15-8-1-15 2-20 8z" fill={deep} />
          </Part>
          <ellipse cx="60" cy="51" rx="31" ry="25" fill={scale} />
          <path d="M53 28l7-10 7 10z" fill="#ffc14d" stroke="#ffc14d" strokeWidth="2.4" strokeLinejoin="round" />
          <ellipse cx="60" cy="62" rx="17" ry="11" fill="#b3ecdf" />
          <circle cx="54.5" cy="58.5" r="1.6" fill={INK} opacity="0.75" />
          <circle cx="65.5" cy="58.5" r="1.6" fill={INK} opacity="0.75" />
          <path d="M53 65.5c4.4 3.4 9.6 3.4 14 0" {...THREAD} strokeWidth="1.9" />
          <Looks
            cheer={cheer}
            idle={<path d="M40 47.5c3 4 9 4 12 0M68 47.5c3 4 9 4 12 0" {...THREAD} strokeWidth="2.6" />}
            happy={<ButtonEyes y={46.5} left={46} right={74} />}
          />
          <Blush y={56} left={35} right={85} />
        </Part>
      </Part>
      {cheer
        ? [
            { drift: [-26, -58] as [number, number], fill: "#c5b0ff" },
            { drift: [3, -72] as [number, number], fill: "#ff8fa3" },
            { drift: [28, -56] as [number, number], fill: "#c5b0ff" },
          ].map((puff, index) => (
            <Floater key={puff.drift[0]} name="puff" x={60} y={56} drift={puff.drift} delay={-index * 0.8}>
              <path d={HEART} fill={puff.fill} />
            </Floater>
          ))
        : null}
    </svg>
  );
}

function Sol({ className, cheer }: GuideProps) {
  const coat = "#ffc2d6";
  const deep = "#ffa3c1";
  const cream = "#fff0f5";
  const gold = "#ffc14d";
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true" data-guide="sol">
      <Shadow cx={62} rx={34} fill="#ffd0e0" />
      {cheer ? (
        <g className="gp-bow" fill="none" strokeWidth="6.4" strokeLinecap="round">
          <path d="M1 86A59 59 0 0 1 119 86" stroke={gold} pathLength="100" />
          <path d="M8 86A52 52 0 0 1 112 86" stroke="#ff8a4c" pathLength="100" />
          <path d="M15 86A45 45 0 0 1 105 86" stroke="#c5b0ff" pathLength="100" />
        </g>
      ) : null}
      <Part name="body" at={[60, 111]}>
        <Part name="tail t1" at={[78, 101]}>
          <Tuft x={78} y={101} turn={50} length={36} fill={gold} />
        </Part>
        <Part name="tail t2" at={[79, 103]}>
          <Tuft x={79} y={103} turn={76} length={38} fill="#ff8a4c" />
        </Part>
        <Part name="tail t3" at={[78, 105]}>
          <Tuft x={78} y={105} turn={100} length={34} fill="#c5b0ff" />
        </Part>
        <Part name="mane m1" at={[36, 45]}>
          <ellipse cx="29" cy="45" rx="10" ry="13" fill={gold} />
        </Part>
        <Part name="mane m2" at={[33, 61]}>
          <ellipse cx="25" cy="61" rx="9" ry="12" fill="#ff8a4c" />
        </Part>
        <Part name="mane m3" at={[36, 76]}>
          <ellipse cx="29" cy="76" rx="8" ry="10" fill="#c5b0ff" />
        </Part>
        <ellipse cx="46" cy="106" rx="10.5" ry="6.5" fill={gold} />
        <ellipse cx="74" cy="106" rx="10.5" ry="6.5" fill={gold} />
        <ellipse cx="60" cy="88" rx="23" ry="21" fill={coat} />
        <ellipse cx="60" cy="93" rx="13.5" ry="13" fill={cream} />
        <ellipse cx="60" cy="93" rx="10.8" ry="10.3" {...STITCH} />
        <Part name="sun" at={[60, 93]}>
          <circle cx="60" cy="93" r="4" fill={gold} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
            <path key={angle} d="M60 86.4v-2.4" stroke={gold} strokeWidth="1.8" strokeLinecap="round" transform={`rotate(${angle} 60 93)`} />
          ))}
        </Part>
        <Part name="arm arm-l" at={[41, 79]}>
          <ellipse cx="38.5" cy="87" rx="7" ry="11" fill={deep} transform="rotate(16 38.5 87)" />
        </Part>
        <Part name="arm arm-r" at={[79, 79]}>
          <ellipse cx="81.5" cy="87" rx="7" ry="11" fill={deep} transform="rotate(-16 81.5 87)" />
        </Part>
        <Part name="head" at={[60, 76]}>
          <Part name="ear ear-l" at={[42, 33]}>
            <path d="M36 36L33 16 50 27z" fill={deep} stroke={deep} strokeWidth="5" strokeLinejoin="round" />
            <path d="M39 31L38 22 46 27z" fill={cream} stroke={cream} strokeWidth="2" strokeLinejoin="round" />
          </Part>
          <Part name="ear ear-r" at={[78, 33]}>
            <path d="M84 36L87 16 70 27z" fill={deep} stroke={deep} strokeWidth="5" strokeLinejoin="round" />
            <path d="M81 31L82 22 74 27z" fill={cream} stroke={cream} strokeWidth="2" strokeLinejoin="round" />
          </Part>
          <ellipse cx="60" cy="52" rx="30" ry="25" fill={coat} />
          {cheer ? <circle className="gp gp-glow" cx="60" cy="11" r="15" fill="#fff0b8" style={{ transformOrigin: "60px 11px" }} /> : null}
          <path d="M60 3l7.5 26h-15z" fill={gold} stroke={gold} strokeWidth="3" strokeLinejoin="round" />
          <path d="M55.6 23.5l8.8-3.6M57.2 16l5.6-2.4M58.6 9.4l2.6-1.2" stroke="#e39a1e" strokeWidth="1.7" strokeLinecap="round" />
          <ellipse cx="48" cy="31" rx="11" ry="6.5" fill="#ff8a4c" transform="rotate(-20 48 31)" />
          <ellipse cx="70" cy="30.5" rx="9" ry="5.5" fill="#c5b0ff" transform="rotate(18 70 30.5)" />
          <ellipse cx="60" cy="63" rx="16" ry="10.5" fill={cream} />
          <circle cx="54.5" cy="60.5" r="1.5" fill={INK} opacity="0.7" />
          <circle cx="65.5" cy="60.5" r="1.5" fill={INK} opacity="0.7" />
          <path d="M53.5 66c4 3.4 9 3.4 13 0" {...THREAD} strokeWidth="1.9" />
          <Looks cheer={cheer} idle={<ButtonEyes y={49} left={45} right={75} />} happy={<HappyEyes y={49} left={45} right={75} />} />
          <path d="M39.6 45.4l-3-2.4M80.4 45.4l3-2.4" {...THREAD} strokeWidth="1.7" />
          <Blush y={58} left={35} right={85} />
          {cheer
            ? [
                { x: 60, y: -6, size: 0.95, delay: 0 },
                { x: 43, y: 5, size: 0.6, delay: -0.4 },
                { x: 78, y: 8, size: 0.7, delay: -0.8 },
              ].map((star) => (
                <Floater key={star.x} name="twinkle" x={star.x} y={star.y} delay={star.delay}>
                  <path d={SPARKLE} fill="#fff" stroke={gold} strokeWidth="1.6" strokeLinejoin="round" transform={`scale(${star.size})`} />
                </Floater>
              ))
            : null}
        </Part>
      </Part>
    </svg>
  );
}

const BURSTS: Record<string, { shape: string; colors: string[]; count: number; arc: [number, number] }> = {
  task: { shape: SPARKLE, colors: ["#ffc14d", "#12b5a8", "#ff5a7a"], count: 9, arc: [0, 360] },
  praise: { shape: HEART, colors: ["#ff5a7a", "#ff8fa3", "#e23e68"], count: 11, arc: [188, 352] },
  level: { shape: STAR, colors: ["#ffc14d", "#ff8a4c", "#c5b0ff"], count: 12, arc: [0, 360] },
  streak: { shape: FLAME, colors: ["#ff8a4c", "#ff5a7a", "#ffc14d"], count: 10, arc: [192, 348] },
  reward: { shape: STAR, colors: ["#ffc14d", "#12b5a8"], count: 9, arc: [0, 360] },
  pair: { shape: HEART, colors: ["#ff5a7a", "#12b5a8"], count: 10, arc: [0, 360] },
};

/** What flies out from behind the plush. The shape says what is being celebrated. */
function Burst({ kind }: { kind: string }) {
  const plan = BURSTS[kind] || BURSTS.task;
  const [from, to] = plan.arc;
  return (
    <svg className="cheer-burst" viewBox="-120 -100 240 200" aria-hidden="true">
      {Array.from({ length: plan.count }, (_, index) => {
        const angle = ((from + ((to - from) * (index + 0.5)) / plan.count) * Math.PI) / 180;
        const reach = [88, 106, 74][index % 3];
        const style = {
          "--x": Math.round(Math.cos(angle) * reach * 1.06),
          "--y": Math.round(Math.sin(angle) * reach * 0.84),
          "--r": `${((index * 47) % 50) - 25}deg`,
          "--s": [1, 0.72, 1.25][(index + 1) % 3],
          animationDelay: `${(index % 5) * 0.13}s`,
        } as CSSProperties;
        return <path key={index} className="burst-bit" d={plan.shape} fill={plan.colors[index % plan.colors.length]} style={style} />;
      })}
    </svg>
  );
}

/** The guide, celebrating. `kind` is the celebration: task, praise, level, streak, reward, or pair. */
export function GuideCheer({ id, kind }: { id: string; kind: string }) {
  return (
    <div className={`cheer-stage cheer-${kind}`} aria-hidden="true">
      <span className="cheer-halo" />
      {kind === "level" ? (
        <svg className="cheer-rays" viewBox="-100 -100 200 200">
          {Array.from({ length: 12 }, (_, index) => (
            <path key={index} d="M0 0L-8 -98L8 -98z" fill="#ffc14d" transform={`rotate(${index * 30})`} />
          ))}
        </svg>
      ) : null}
      <Burst kind={kind} />
      <div className="cheer-hop">
        <GuideFace id={id} className="guide-face xl" cheer />
      </div>
    </div>
  );
}

export function MarkGlyph({ mark }: { mark: string }) {
  const common = { width: 14, height: 14, viewBox: "0 0 16 16", "aria-hidden": true as const };
  if (mark === "star" || mark === "spark") {
    return (
      <svg {...common}>
        <path d="M8 1.4l1.6 4.2 4.4.3-3.4 2.8 1.1 4.3L8 10.6 4.3 13l1.1-4.3L2 5.9l4.4-.3z" fill="#fff" />
      </svg>
    );
  }
  if (mark === "moon") {
    return (
      <svg {...common}>
        <path d="M9 1.5a6 6 0 1 0 5.2 9A5 5 0 0 1 9 1.5z" fill="#fff" />
      </svg>
    );
  }
  if (mark === "leaf") {
    return (
      <svg {...common}>
        <path d="M13 2C6 3 2 8 2 13c5 0 10-3 11-11z" fill="#fff" />
      </svg>
    );
  }
  if (mark === "sun") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="3" fill="#fff" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M13 3l-1.4 1.4M4.4 11.6 3 13" stroke="#fff" strokeWidth="1.4" />
      </svg>
    );
  }
  if (mark === "fox") {
    return (
      <svg {...common}>
        <path d="M2 3l3 4-2 6h4l1-3 1 3h4l-2-6 3-4-4 2L8 2 6 5z" fill="#fff" />
      </svg>
    );
  }
  if (mark === "flower") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="2" fill="#fff" />
        <circle cx="8" cy="3.2" r="2" fill="#fff" />
        <circle cx="8" cy="12.8" r="2" fill="#fff" />
        <circle cx="3.2" cy="8" r="2" fill="#fff" />
        <circle cx="12.8" cy="8" r="2" fill="#fff" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M8 13s-5-3.1-5-6.2A2.8 2.8 0 0 1 8 5a2.8 2.8 0 0 1 5 1.8C13 9.9 8 13 8 13z" fill="#fff" />
    </svg>
  );
}
