export type TimerMode = 'up' | 'down';
export type TimerPhase = 'idle' | 'running' | 'paused' | 'ended';

export interface WritingTimer {
  mode: TimerMode;
  phase: TimerPhase;
  /** Countdown length. Count-up ignores it until the mode changes. */
  durationMs: number;
  /** Time already counted, not including the current run. */
  elapsedMs: number;
  /** Date.now() when the current run began. */
  runningSince: number | null;
}

export interface SessionSummary {
  elapsedMs: number;
  mode: TimerMode;
  durationMs: number;
  words: number;
  chapters: number;
  certified: number;
  uncertified: number;
  sessionWritten: number | null;
  sessionTarget: number | null;
}

const DEFAULT_COUNTDOWN_MS = 25 * 60_000;

export function idleWritingTimer(mode: TimerMode, durationMs = DEFAULT_COUNTDOWN_MS): WritingTimer {
  return { mode, phase: 'idle', durationMs, elapsedMs: 0, runningSince: null };
}

export function elapsedNow(timer: WritingTimer, now: number): number {
  const running = timer.phase === 'running' && timer.runningSince != null
    ? Math.max(0, now - timer.runningSince)
    : 0;
  return timer.elapsedMs + running;
}

export function remainingMs(timer: WritingTimer, now: number): number {
  return Math.max(0, timer.durationMs - elapsedNow(timer, now));
}

export function countdownDurationMs(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const minutes = Number(trimmed);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) return null;
  return minutes * 60_000;
}

export function startTimer(timer: WritingTimer, now: number): WritingTimer {
  if (timer.phase === 'running') return timer;
  if (timer.phase === 'paused') return { ...timer, phase: 'running', runningSince: now };
  return { ...timer, phase: 'running', elapsedMs: 0, runningSince: now };
}

export function pauseTimer(timer: WritingTimer, now: number): WritingTimer {
  if (timer.phase !== 'running') return timer;
  return { ...timer, phase: 'paused', elapsedMs: elapsedNow(timer, now), runningSince: null };
}

export function endTimer(timer: WritingTimer, now: number): WritingTimer {
  if (timer.phase !== 'running' && timer.phase !== 'paused') return timer;
  const spent = elapsedNow(timer, now);
  const elapsedMs = timer.mode === 'down' ? Math.min(timer.durationMs, spent) : spent;
  return { ...timer, phase: 'ended', elapsedMs, runningSince: null };
}

/** Finish a countdown once the planned time has been spent. */
export function tickTimer(timer: WritingTimer, now: number): WritingTimer {
  if (timer.phase !== 'running' || timer.mode !== 'down') return timer;
  if (elapsedNow(timer, now) < timer.durationMs) return timer;
  return endTimer(timer, now);
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
  return `${minutes}:${ss}`;
}

export function sessionGoalResult(written: number | null, target: number | null): string {
  if (written == null || target == null) return 'No session word goal';
  const words = `${written.toLocaleString()} of ${target.toLocaleString()} words`;
  if (written >= target) return `${words}, goal met`;
  return `${words}, ${target - written} short`;
}

export function countdownResult(elapsedMs: number, durationMs: number): string {
  if (elapsedMs >= durationMs) return `${formatClock(durationMs)} countdown finished`;
  return `${formatClock(elapsedMs)} of ${formatClock(durationMs)}`;
}

export function sessionSummary(args: {
  timer: WritingTimer;
  words: number;
  chapters: number;
  certified: number;
  uncertified: number;
  sessionWritten: number | null;
  sessionTarget: number | null;
}): SessionSummary {
  return {
    elapsedMs: args.timer.elapsedMs,
    mode: args.timer.mode,
    durationMs: args.timer.durationMs,
    words: args.words,
    chapters: args.chapters,
    certified: args.certified,
    uncertified: args.uncertified,
    sessionWritten: args.sessionWritten,
    sessionTarget: args.sessionTarget,
  };
}
