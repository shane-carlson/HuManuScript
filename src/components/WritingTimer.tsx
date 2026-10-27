import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSessionCapture } from './SessionCapture.tsx';
import { certificationSummary, type ManuscriptDocument } from '../core/document.ts';
import { manuscriptStats } from '../core/manuscript.ts';
import {
  countdownDurationMs,
  countdownResult,
  elapsedNow,
  endTimer,
  formatClock,
  idleWritingTimer,
  pauseTimer,
  remainingMs,
  sessionGoalResult,
  sessionSummary,
  startTimer,
  tickTimer,
  type SessionSummary,
  type TimerMode,
  type WritingTimer,
} from '../core/writingTimer.ts';
import { sessionWordsWritten, type SessionGoal } from '../core/wordGoal.ts';

export function WritingTimer({
  bookId,
  doc,
  sessionGoal,
  noteRoot,
}: {
  bookId: string;
  doc: ManuscriptDocument;
  sessionGoal: SessionGoal | null;
  /** Errors and the session summary render here so the control row stays one line. */
  noteRoot: HTMLElement | null;
}) {
  const capture = useSessionCapture();
  const [mode, setMode] = useState<TimerMode>('up');
  const [minutes, setMinutes] = useState('25');
  const [timer, setTimer] = useState<WritingTimer>(() => idleWritingTimer('up'));
  const [now, setNow] = useState(() => Date.now());
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [error, setError] = useState('');
  const timerRef = useRef(timer);
  timerRef.current = timer;
  const docRef = useRef(doc);
  const goalRef = useRef(sessionGoal);
  docRef.current = doc;
  goalRef.current = sessionGoal;

  useEffect(() => {
    const idle = idleWritingTimer('up');
    timerRef.current = idle;
    setMode('up');
    setTimer(idle);
    setSummary(null);
    setError('');
  }, [bookId]);

  useEffect(() => {
    if (timer.phase !== 'running') return;
    const id = window.setInterval(() => {
      const tick = Date.now();
      const current = timerRef.current;
      const next = tickTimer(current, tick);
      if (next !== current) {
        timerRef.current = next;
        setTimer(next);
        if (next.phase === 'ended') setSummary(summarize(next, docRef.current, goalRef.current, bookId));
      }
      setNow(tick);
    }, 200);
    return () => window.clearInterval(id);
  }, [bookId, timer.phase]);

  const locked = timer.phase === 'running' || timer.phase === 'paused';
  const clockMs = timer.phase === 'running'
    ? (timer.mode === 'down' ? remainingMs(timer, now) : elapsedNow(timer, now))
    : timer.phase === 'idle' && timer.mode === 'down'
      ? timer.durationMs
      : timer.elapsedMs;

  const chooseMode = (next: TimerMode) => {
    if (locked) return;
    setMode(next);
    setError('');
    setTimer((current) => ({ ...idleWritingTimer(next, current.durationMs), durationMs: current.durationMs }));
  };

  const onStart = () => {
    const tick = Date.now();
    let base = timerRef.current;
    if (base.phase === 'idle' || base.phase === 'ended') {
      if (mode === 'down') {
        const durationMs = countdownDurationMs(minutes);
        if (durationMs == null) {
          setError('Enter 1 to 180 minutes.');
          return;
        }
        base = { ...idleWritingTimer('down', durationMs), durationMs };
      } else {
        base = idleWritingTimer('up', base.durationMs);
      }
      setSummary(null);
    }
    setError('');
    const next = startTimer({ ...base, mode }, tick);
    timerRef.current = next;
    setTimer(next);
    setNow(tick);
    capture.startSession();
  };

  const onPause = () => {
    const tick = Date.now();
    const next = pauseTimer(timerRef.current, tick);
    timerRef.current = next;
    setTimer(next);
    setNow(tick);
  };

  const onEnd = () => {
    if (capture.ownsSession) capture.endSession();
    if (!locked) return;
    const tick = Date.now();
    const next = endTimer(timerRef.current, tick);
    timerRef.current = next;
    setTimer(next);
    setNow(tick);
    if (next.phase === 'ended') setSummary(summarize(next, doc, sessionGoal, bookId));
  };

  return (
    <div className="writing-timer" data-timer-phase={timer.phase} data-timer-mode={timer.mode}>
      <div className="writing-timer__mode" role="group" aria-label="Writing timer">
        <button type="button" aria-pressed={mode === 'up'} aria-label="Count up" disabled={locked} title="Count up" onClick={() => chooseMode('up')}>
          Up
        </button>
        <button type="button" aria-pressed={mode === 'down'} aria-label="Countdown" disabled={locked} title="Countdown" onClick={() => chooseMode('down')}>
          Down
        </button>
      </div>
      {mode === 'down' && (
        <label className="writing-timer__minutes">
          <span className="sr-only">Countdown minutes</span>
          <input
            inputMode="numeric"
            value={minutes}
            disabled={locked}
            aria-label="Countdown minutes"
            onChange={(event) => {
              const value = event.target.value;
              setMinutes(value);
              const durationMs = countdownDurationMs(value);
              if (durationMs != null && !locked) {
                setTimer((current) => ({ ...current, durationMs }));
              }
              if (error) setError('');
            }}
          />
        </label>
      )}
      <p className="writing-timer__clock" role="timer" aria-label={timer.mode === 'down' ? 'Countdown' : 'Count up'}>
        {formatClock(clockMs)}
      </p>
      <div className="writing-timer__controls">
        <button type="button" onClick={onStart} disabled={timer.phase === 'running' || capture.busy} aria-label="Start session" title="Start the timer and the picture session">Start</button>
        <button type="button" onClick={onPause} disabled={timer.phase !== 'running'}>Pause</button>
        <button type="button" onClick={onEnd} disabled={capture.busy || (!locked && !capture.ownsSession)} aria-label="End session" title="End the timer and the picture session">End</button>
      </div>
      {noteRoot ? createPortal(timerNotes(error, summary), noteRoot) : null}
    </div>
  );
}

function timerNotes(error: string, summary: SessionSummary | null): ReactNode {
  if (!error && !summary) return null;
  return (
    <>
      {error && <p className="writing-timer__error" role="alert">{error}</p>}
      {summary && (
        <div className="writing-timer__summary" data-session-summary="true" aria-label="Session summary">
          <p>Session ended</p>
          <dl>
            <div>
              <dt>Time</dt>
              <dd data-stat="time">{formatClock(summary.elapsedMs)}</dd>
            </div>
            <div>
              <dt>Words</dt>
              <dd data-stat="words">{summary.words.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Chapters</dt>
              <dd data-stat="chapters">{summary.chapters.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Certified</dt>
              <dd data-stat="certified">{summary.certified.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Uncertified</dt>
              <dd data-stat="uncertified">{summary.uncertified.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Session goal</dt>
              <dd data-stat="goal">{sessionGoalResult(summary.sessionWritten, summary.sessionTarget)}</dd>
            </div>
            {summary.mode === 'down' && (
              <div>
                <dt>Countdown</dt>
                <dd data-stat="countdown">{countdownResult(summary.elapsedMs, summary.durationMs)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </>
  );
}

function summarize(
  timer: WritingTimer,
  doc: ManuscriptDocument,
  sessionGoal: SessionGoal | null,
  bookId: string,
): SessionSummary {
  const stats = manuscriptStats(doc.blocks);
  const seals = certificationSummary(doc);
  const written = sessionWordsWritten(stats.words, sessionGoal, bookId);
  return sessionSummary({
    timer,
    words: stats.words,
    chapters: stats.chapters,
    certified: seals.certified,
    uncertified: seals.uncertified,
    sessionWritten: written,
    sessionTarget: sessionGoal && sessionGoal.bookId === bookId ? sessionGoal.target : null,
  });
}
