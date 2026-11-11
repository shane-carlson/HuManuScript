import type { CSSProperties, ReactNode } from 'react';
import type { BadgeId } from '../core/writingHabit.ts';

const ink = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export interface ShieldTone {
  rim: string;
  a: string;
  b: string;
  ink: string;
}

const TONES: Record<BadgeId, ShieldTone> = {
  'first-words': { rim: '#8a4b12', a: '#ffe0a3', b: '#e07a1f', ink: '#4a2408' },
  'first-sitting': { rim: '#8c3d2f', a: '#ffc7b0', b: '#e25b3a', ink: '#4a160e' },
  'back-again': { rim: '#9d174d', a: '#fecdd3', b: '#e11d48', ink: '#4c0519' },
  'page-day': { rim: '#a16207', a: '#fef3c7', b: '#f59e0b', ink: '#451a03' },
  'steady-five-hundred': { rim: '#c2410c', a: '#ffedd5', b: '#f97316', ink: '#7c2d12' },
  'deep-hour': { rim: '#9a3412', a: '#fdba74', b: '#c2410c', ink: '#431407' },
  'thousand-day': { rim: '#9f1239', a: '#fda4af', b: '#e11d48', ink: '#4c0519' },
  'came-back': { rim: '#0f766e', a: '#99f6e4', b: '#0d9488', ink: '#042f2e' },
  'chain-kept': { rim: '#854d0e', a: '#fde68a', b: '#ca8a04', ink: '#422006' },
  'streak-3': { rim: '#166534', a: '#bbf7d0', b: '#22c55e', ink: '#052e16' },
  'streak-7': { rim: '#047857', a: '#a7f3d0', b: '#10b981', ink: '#022c22' },
  'week-filled': { rim: '#3f6212', a: '#ecfccb', b: '#84cc16', ink: '#1a2e05' },
  'streak-14': { rim: '#0f766e', a: '#5eead4', b: '#14b8a6', ink: '#042f2e' },
  'streak-28': { rim: '#155e75', a: '#a5f3fc', b: '#06b6d4', ink: '#083344' },
  'streak-30': { rim: '#1d4ed8', a: '#bfdbfe', b: '#3b82f6', ink: '#172554' },
  'writing-days-30': { rim: '#1e40af', a: '#dbeafe', b: '#2563eb', ink: '#172554' },
  'streak-60': { rim: '#4338ca', a: '#e0e7ff', b: '#6366f1', ink: '#1e1b4b' },
  season: { rim: '#6d28d9', a: '#ede9fe', b: '#8b5cf6', ink: '#2e1065' },
  'words-10k': { rim: '#0369a1', a: '#e0f2fe', b: '#0284c7', ink: '#082f49' },
  'streak-100': { rim: '#1e3a8a', a: '#bfdbfe', b: '#1d4ed8', ink: '#172554' },
  'writing-days-100': { rim: '#7e22ce', a: '#f5d0fe', b: '#c026d3', ink: '#3b0764' },
  'words-50k': { rim: '#a21caf', a: '#fae8ff', b: '#d946ef', ink: '#4a044e' },
  'words-100k': { rim: '#be185d', a: '#fbcfe8', b: '#db2777', ink: '#500724' },
  'year-round': { rim: '#b45309', a: '#fef3c7', b: '#f59e0b', ink: '#451a03' },
  'streak-365': { rim: '#9f1239', a: '#ffe4e6', b: '#be123c', ink: '#4c0519' },
  'writing-days-365': { rim: '#881337', a: '#fecdd3', b: '#9f1239', ink: '#4c0519' },
  'five-years': { rim: '#fbbf24', a: '#312e81', b: '#1e1b4b', ink: '#fde68a' },
};

export function badgeTone(id: BadgeId): ShieldTone {
  return TONES[id];
}

function Quill() {
  return (
    <g>
      <path fill="currentColor" d="M9.2-11.4c-4.6 1.2-8.4 5.4-11.2 9.6l-2.2 5.2 5.2-2.1c4.2-3.2 8.2-7.4 9.4-11.4l-1.2-1.3z" />
      <path className="badge-medal__cut" d="M6.2-6.2c-2.4 2.2-4.6 4.8-6.2 8" />
      <path {...ink} d="M-4.2 3.4-8.6 8.4" />
      <path {...ink} d="M-8.6 8.4-6.2 7.6" />
    </g>
  );
}

function Hourglass() {
  return (
    <g>
      <path {...ink} d="M-8.2-11h16.4L.6-.2 8.2 11H-8.2L-.6-.2Z" />
      <path fill="currentColor" d="M-2.4-8h4.8L0-3.8Z" />
      <path fill="currentColor" d="M-3.6 7.8h7.2L0 3.2Z" />
      <circle cx="0" cy="1.1" r="1.05" fill="currentColor" />
    </g>
  );
}

function ReturnArrow() {
  return (
    <g>
      <path {...ink} d="M6-7A8 8 0 1 0 6 7" />
      <path fill="currentColor" d="M3.2 3.2 8.6 7.2 2.8 9.4Z" />
    </g>
  );
}

function PageMark() {
  return (
    <g>
      <path fill="currentColor" d="M-8-11h10l6 6v16H-8Z" />
      <path className="badge-medal__cut" d="M2-11v6h6" />
      <path className="badge-medal__cut" d="M-5-2h8M-5 2h8M-5 6h5" />
    </g>
  );
}

function Climb() {
  return (
    <g fill="currentColor">
      <rect x="-12.4" y="3.4" width="3.7" height="7.4" rx="0.9" />
      <rect x="-6.9" y="-0.2" width="3.7" height="11" rx="0.9" />
      <rect x="-1.4" y="-4.2" width="3.7" height="15" rx="0.9" />
      <rect x="4.1" y="-8" width="3.7" height="18.8" rx="0.9" />
      <rect x="9.6" y="-11.6" width="3.7" height="22.4" rx="0.9" />
    </g>
  );
}

function Clock() {
  return (
    <g>
      <circle cx="0" cy="0" r="11.2" {...ink} />
      <path fill="currentColor" opacity="0.28" d="M0-8.6A8.6 8.6 0 1 1-2.2-8.3L0 0Z" />
      <path {...ink} d="M0 0V-6.6" />
      <path {...ink} d="M0 0 4.8 2.6" />
      <circle cx="0" cy="0" r="1.35" fill="currentColor" />
    </g>
  );
}

function LongDay() {
  return (
    <g>
      <path fill="currentColor" d="M0-13.6 1.2-10.1 4.9-9.9 2-7.6 2.8-4 0-5.8-2.8-4-2-7.6-4.9-9.9-1.2-10.1Z" />
      <path fill="currentColor" d="M-.5-1.6C-6-3.6-12-2.2-12 2.2V11c3.4-2.6 8-2.6 11.5.2V2.2C-.5.2-.5-.4-.5-1.6Z" />
      <path fill="currentColor" d="M.5-1.6C6-3.6 12-2.2 12 2.2V11c-3.4-2.6-8-2.6-11.5.2V2.2C.5.2.5-.4.5-1.6Z" />
      <path className="badge-medal__cut" d="M0-1.2v10.4" />
    </g>
  );
}

function Lantern() {
  return (
    <g>
      <path {...ink} d="M-3.2-12h6.4M0-12v2.2" />
      <rect x="-7.2" y="-9.2" width="14.4" height="16.4" rx="3.2" {...ink} />
      <path fill="currentColor" d="M0-5.2c2.2 2.4 2.6 4.2 0 6.8-2.6-2.6-2.2-4.4 0-6.8Z" />
      <path {...ink} d="M-4.2 7.2h8.4v2.4h-8.4z" />
    </g>
  );
}

function flamePath(scale: number, x: number, y: number) {
  return (
    <path
      fill="currentColor"
      transform={`translate(${x} ${y}) scale(${scale})`}
      d="M0-11C2.4-7.2 5.4-6.2 4.3-2.4 6.4-.6 5.5 4.2 2.2 6.4 1.1 7.2.4 7.4 0 7.4c-.4 0-1.1-.2-2.2-1C-5.5 4.2-6.4-.6-4.3-2.4-5.4-6.2-2.4-7.2 0-11Z"
    />
  );
}

function Flames() {
  return (
    <g>
      {flamePath(0.78, -8.2, 2.4)}
      {flamePath(1, 0, 0.2)}
      {flamePath(0.78, 8.2, 2.4)}
    </g>
  );
}

function Crown() {
  return (
    <g fill="currentColor">
      <path d="M-12.4 5.2V-.8L-7.2-10.6-2.2.2 0-12.4 2.2.2 7.2-10.6 12.4-.8V5.2Z" />
      <path d="M-12.4 6.2h24.8v3.2h-24.8z" />
      <circle cx="-7.2" cy="-8.6" r="1.35" />
      <circle cx="0" cy="-10.6" r="1.45" />
      <circle cx="7.2" cy="-8.6" r="1.35" />
    </g>
  );
}

function WeekGrid() {
  return (
    <g>
      <rect x="-11" y="-9" width="22" height="18" rx="2.4" {...ink} />
      <path {...ink} d="M-11-4.2h22" />
      {[0, 1, 2, 3, 4].map((index) => (
        <rect key={index} x={-8.2 + index * 3.6} y="-1.2" width="2.5" height="2.5" rx="0.4" fill="currentColor" />
      ))}
    </g>
  );
}

function Pennants() {
  return (
    <g fill="currentColor">
      <path d="M-10-12h5.2V5l-2.6-3.1L-10 5Z" />
      <path d="M1-12h5.2V5L3.6 1.9 1 5Z" />
    </g>
  );
}

function Crescent() {
  return <path fill="currentColor" fillRule="evenodd" d="M2-11a9 9 0 1 0 .2 18 6.4 6.4 0 1 1-.2-18Z" />;
}

function DayStack() {
  return (
    <g fill="currentColor">
      <rect x="-10" y="-10" width="20" height="5" rx="1.4" />
      <rect x="-10" y="-2.5" width="20" height="5" rx="1.4" />
      <rect x="-10" y="5" width="20" height="5" rx="1.4" />
    </g>
  );
}

function TwinMoons() {
  return (
    <g fill="currentColor" fillRule="evenodd">
      <path transform="translate(-6 0) scale(0.72)" d="M2-11a9 9 0 1 0 .2 18 6.4 6.4 0 1 1-.2-18Z" />
      <path transform="translate(7 0) scale(0.72)" d="M2-11a9 9 0 1 0 .2 18 6.4 6.4 0 1 1-.2-18Z" />
    </g>
  );
}

function SeasonLeaves() {
  return (
    <g>
      <path {...ink} d="M0 11V-4" />
      <ellipse cx="-6.2" cy="-2" rx="4.2" ry="2" transform="rotate(-40 -6.2 -2)" fill="currentColor" />
      <ellipse cx="6.2" cy="-2" rx="4.2" ry="2" transform="rotate(40 6.2 -2)" fill="currentColor" />
      <ellipse cx="0" cy="-8.4" rx="2" ry="4.4" fill="currentColor" />
    </g>
  );
}

function PageStack() {
  return (
    <g fill="currentColor">
      <rect x="-6" y="-11" width="16" height="12" rx="1.2" opacity="0.45" />
      <rect x="-9" y="-7" width="16" height="12" rx="1.2" opacity="0.7" />
      <rect x="-12" y="-3" width="16" height="12" rx="1.2" />
    </g>
  );
}

function Star() {
  return (
    <path
      fill="currentColor"
      d="M0-12 2.4-4.2 10.6-4.2 4 1.2 6.4 9 0 4.4-6.4 9-4 1.2-10.6-4.2-2.4-4.2Z"
    />
  );
}

function Columns() {
  return (
    <g fill="currentColor">
      <rect x="-12" y="-2" width="5" height="12" rx="1" />
      <rect x="-2.5" y="-8" width="5" height="18" rx="1" />
      <rect x="7" y="-12" width="5" height="22" rx="1" />
      <rect x="-13" y="10" width="26" height="2.2" rx="0.6" />
    </g>
  );
}

function Book() {
  return <path fill="currentColor" d="M-11-8C-5-4-5-4 0-8c5 4 5 4 11 0V8c-6-4-6-4-11 0-5-4-5-4-11 0V-8Z" />;
}

function LongBook() {
  return (
    <g fill="currentColor">
      <path d="M-11-7C-5-3.2-5-3.2 0-7c5 3.8 5 3.8 11 0V8c-6-3.6-6-3.6-11 0-5-3.6-5-3.6-11 0V-7Z" />
      <path d="M0-7v15" className="badge-medal__cut" />
      <rect x="-1.2" y="-10" width="2.4" height="8" />
    </g>
  );
}

function SunYear() {
  return (
    <g>
      <circle cx="0" cy="0" r="5.2" fill="currentColor" />
      <path {...ink} d="M0-12v3.2M0 8.8V12M-12 0h3.2M8.8 0H12M-8.5-8.5l2.2 2.2M6.3 6.3l2.2 2.2M-8.5 8.5l2.2-2.2M6.3-6.3l2.2-2.2" />
    </g>
  );
}

function ClosedRing() {
  return (
    <g>
      <circle cx="0" cy="0" r="9.2" {...ink} strokeWidth="2.8" />
      <path {...ink} strokeWidth="2.4" d="M-4.2.4-1.2 3.6 4.6-3.4" />
    </g>
  );
}

function Library() {
  return (
    <g fill="currentColor">
      <rect x="-12" y="-8" width="6.2" height="16" rx="1" />
      <rect x="-4.2" y="-11" width="6.2" height="19" rx="1" />
      <rect x="3.6" y="-6" width="6.2" height="14" rx="1" />
    </g>
  );
}

function Constellation() {
  return (
    <g>
      <path {...ink} d="M0-2-8 6M0-2 8 6M0-2 0 9M0-2-7-7M0-2 8-6" />
      <circle cx="0" cy="-2" r="2.1" fill="currentColor" />
      <circle cx="-8" cy="6" r="1.5" fill="currentColor" />
      <circle cx="8" cy="6" r="1.5" fill="currentColor" />
      <circle cx="0" cy="9" r="1.5" fill="currentColor" />
      <circle cx="-7" cy="-7" r="1.45" fill="currentColor" />
      <circle cx="8" cy="-6" r="1.45" fill="currentColor" />
    </g>
  );
}

function leaf(x: number, y: number, turn: number, flip = false) {
  return (
    <ellipse
      cx="0"
      cy="0"
      rx="3.3"
      ry="1.45"
      fill="currentColor"
      transform={`translate(${x} ${y}) rotate(${turn}) scale(${flip ? -1 : 1} 1)`}
    />
  );
}

function Laurel() {
  return (
    <g>
      <path {...ink} d="M-1 12.4C-8.6 8-12.2 1.6-9.2-8.2" />
      <path {...ink} d="M1 12.4C8.6 8 12.2 1.6 9.2-8.2" />
      {leaf(-10.4, -5.2, -52)}
      {leaf(-11.6, 0.4, -16)}
      {leaf(-8.8, 5.8, 22)}
      {leaf(-4.2, 9.6, 52)}
      {leaf(10.4, -5.2, 52, true)}
      {leaf(11.6, 0.4, 16, true)}
      {leaf(8.8, 5.8, -22, true)}
      {leaf(4.2, 9.6, -52, true)}
      <path fill="currentColor" d="M0-5.2 1.05-2.1 4.4-1.95 1.7.15 2.55 3.35 0 1.65-2.55 3.35-1.7.15-4.4-1.95-1.05-2.1Z" />
    </g>
  );
}

function Chain() {
  return (
    <g>
      <path fill="currentColor" d="M3.4-10.6a3.8 3.8 0 1 0 .1 7.4 2.6 2.6 0 1 1-.1-7.4Z" />
      <rect x="-12.6" y="-1.4" width="9.2" height="6.2" rx="3.1" {...ink} />
      <rect x="3.4" y="-1.4" width="9.2" height="6.2" rx="3.1" {...ink} />
      <rect x="-4.6" y="-2.5" width="9.2" height="7.6" rx="3.8" {...ink} />
    </g>
  );
}

const MARKS: Record<BadgeId, () => ReactNode> = {
  'first-words': Quill,
  'first-sitting': Hourglass,
  'back-again': ReturnArrow,
  'page-day': PageMark,
  'steady-five-hundred': Climb,
  'deep-hour': Clock,
  'thousand-day': LongDay,
  'came-back': Lantern,
  'chain-kept': Chain,
  'streak-3': Flames,
  'streak-7': Crown,
  'week-filled': WeekGrid,
  'streak-14': Pennants,
  'streak-28': Crescent,
  'streak-30': Laurel,
  'writing-days-30': DayStack,
  'streak-60': TwinMoons,
  season: SeasonLeaves,
  'words-10k': PageStack,
  'streak-100': Star,
  'writing-days-100': Columns,
  'words-50k': Book,
  'words-100k': LongBook,
  'year-round': SunYear,
  'streak-365': ClosedRing,
  'writing-days-365': Library,
  'five-years': Constellation,
};

const SHIELD = 'M36 5 62 17v25C62 58 51 71 36 83 21 71 10 58 10 42V17Z';
const SHIELD_INSET = 'M36 13 54 22v20c0 12-8 22-18 31-10-9-18-19-18-31V22Z';

export function BadgeMedal({ id, earned }: { id: BadgeId; earned: boolean }) {
  const Mark = MARKS[id];
  const tone = TONES[id];
  const gradientId = `shield-enamel-${id}`;
  return (
    <span
      className={`badge-medal${earned ? ' is-earned' : ''}`}
      aria-hidden="true"
      style={{
        '--shield-rim': tone.rim,
        '--shield-a': tone.a,
        '--shield-b': tone.b,
        '--shield-ink': tone.ink,
      } as CSSProperties}
    >
      <svg className="badge-medal__svg" viewBox="0 0 72 88" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="36" y1="6" x2="36" y2="82" gradientUnits="userSpaceOnUse">
            <stop offset="0" className="badge-medal__enamel-a" />
            <stop offset="1" className="badge-medal__enamel-b" />
          </linearGradient>
        </defs>
        <path className="badge-medal__plate" d={SHIELD} fill={`url(#${gradientId})`} />
        <path className="badge-medal__edge" d={SHIELD} />
        <path className="badge-medal__inset" d={SHIELD_INSET} />
        <path className="badge-medal__shine" d="M22 26c4-10 12-14 20-12" />
        <g transform="translate(36 40)">
          <Mark />
        </g>
      </svg>
    </span>
  );
}
