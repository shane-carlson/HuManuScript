import type { ReactNode } from 'react';
import type { BadgeId } from '../core/writingHabit.ts';

const ink = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Quill() {
  return (
    <g>
      <path
        fill="currentColor"
        d="M9.2-11.4c-4.6 1.2-8.4 5.4-11.2 9.6l-2.2 5.2 5.2-2.1c4.2-3.2 8.2-7.4 9.4-11.4l-1.2-1.3z"
      />
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
      <path
        fill="currentColor"
        d="M0-13.6 1.2-10.1 4.9-9.9 2-7.6 2.8-4 0-5.8-2.8-4-2-7.6-4.9-9.9-1.2-10.1Z"
      />
      <path fill="currentColor" d="M-.5-1.6C-6-3.6-12-2.2-12 2.2V11c3.4-2.6 8-2.6 11.5.2V2.2C-.5.2-.5-.4-.5-1.6Z" />
      <path fill="currentColor" d="M.5-1.6C6-3.6 12-2.2 12 2.2V11c-3.4-2.6-8-2.6-11.5.2V2.2C.5.2.5-.4.5-1.6Z" />
      <path className="badge-medal__cut" d="M0-1.2v10.4" />
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
      <path
        fill="currentColor"
        d="M0-5.2 1.05-2.1 4.4-1.95 1.7.15 2.55 3.35 0 1.65-2.55 3.35-1.7.15-4.4-1.95-1.05-2.1Z"
      />
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
  'steady-five-hundred': Climb,
  'deep-hour': Clock,
  'thousand-day': LongDay,
  'streak-3': Flames,
  'streak-7': Crown,
  'streak-30': Laurel,
  'chain-kept': Chain,
};

export function BadgeMedal({ id, earned }: { id: BadgeId; earned: boolean }) {
  const Mark = MARKS[id];
  return (
    <span className={`badge-medal${earned ? ' is-earned' : ''}`} aria-hidden="true">
      <svg className="badge-medal__svg" viewBox="0 0 72 88">
        <path className="badge-medal__ribbon" d="M20 48 11 86 33 69Z" />
        <path className="badge-medal__ribbon" d="M52 48 61 86 39 69Z" />
        <circle className="badge-medal__disc" cx="36" cy="32" r="27" />
        <circle className="badge-medal__face" cx="36" cy="32" r="21.5" />
        <circle className="badge-medal__ring" cx="36" cy="32" r="24" />
        <path className="badge-medal__shine" d="M22 22a16 16 0 0 1 18-8" />
        <g transform="translate(36 32)">
          <Mark />
        </g>
      </svg>
    </span>
  );
}
