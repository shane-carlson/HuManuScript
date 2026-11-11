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
import { recordSitting, stashOpenSitting, takeOpenSitting, type OpenSitting } from '../core/writingHabitStore.ts';

function wordsThisSitting(doc: ManuscriptDocument, baseline: number | null, accumulated: number): number {
  if (baseline == null) return accumulated;
  return accumulated + Math.max(0, manuscriptStats(doc.blocks).words - baseline);
}

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
  const savedRef = useRef<OpenSitting | null | undefined>(undefined);
  if (savedRef.current === undefined) savedRef.current = takeOpenSitting();
  const restored = savedRef.current;
  const [mode, setMode] = useState<TimerMode>(() => restored?.timer.mode ?? 'up');
  const [minutes, setMinutes] = useState('25');
  const [timer, setTimer] = useState<WritingTimer>(() => restored?.timer ?? idleWritingTimer('up'));
  const [now, setNow] = useState(() => Date.now());
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [sittingWords, setSittingWords] = useState<number | null>(null);
  const [error, setError] = useState('');
  const timerRef = useRef(timer);
  timerRef.current = timer;
  const docRef = useRef(doc);
  const goalRef = useRef(sessionGoal);
  docRef.current = doc;
  goalRef.current = sessionGoal;
  const baselineRef = useRef<number | null>(restored ? manuscriptStats(doc.blocks).words : null);
  const accumulatedRef = useRef(restored?.words ?? 0);
  const recordedRef = useRef(false);
  const finishRef = useRef<(next: WritingTimer) => void>(() => {});
  finishRef.current = (next) => {
    if (next.phase !== 'ended' || recordedRef.current) return;
    recordedRef.current = true;
    const words = wordsThisSitting(docRef.current, baselineRef.current, accumulatedRef.current);
    baselineRef.current = null;
    recordSitting({ elapsedMs: next.elapsedMs, words });
    setSittingWords(words);
  };

  useEffect(() => {
    return () => {
      const current = timerRef.current;
      if (current.phase !== 'running' && current.phase !== 'paused') {
        stashOpenSitting(null);
        return;
      }
      stashOpenSitting({
        timer: current,
        words: wordsThisSitting(docRef.current, baselineRef.current, accumulatedRef.current),
      });
    };
  }, []);

  useEffect(() => {
    if (timer.phase !== 'running') return;
    const id = window.setInterval(() => {
      const tick = Date.now();
      const current = timerRef.current;
      const next = tickTimer(current, tick);
      if (next !== current) {
        timerRef.current = next;
        setTimer(next);
        if (next.phase === 'ended') {
          finishRef.current(next);
          setSummary(summarize(next, docRef.current, goalRef.current, bookId));
        }
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
      setSittingWords(null);
      recordedRef.current = false;
      baselineRef.current = manuscriptStats(docRef.current.blocks).words;
      accumulatedRef.current = 0;
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
    if (next.phase === 'ended') {
      finishRef.current(next);
      setSummary(summarize(next, doc, sessionGoal, bookId));
    }
  };

  return (
    <div className="writing-timer" data-timer-phase={timer.phase} data-timer-mode={timer.mode}>
      <div className="writing-timer__mode">
        <span className="session-capture-controls__label">Time</span>
        <div role="group" aria-label="Writing timer">
          <button
            type="button"
            aria-pressed={mode === 'up'}
            disabled={locked}
            data-tooltip="Count time upward from zero."
            onClick={() => chooseMode('up')}
          >
            Count up
          </button>
          <button
            type="button"
            aria-pressed={mode === 'down'}
            disabled={locked}
            data-tooltip="Count down from the minutes you enter, between 1 and 180."
            data-tooltip-wrap="true"
            onClick={() => chooseMode('down')}
          >
            Countdown
          </button>
        </div>
      </div>
      {mode === 'down' && (
        <label className="writing-timer__minutes">
          <span className="sr-only">Countdown minutes</span>
          <input
            inputMode="numeric"
            value={minutes}
            disabled={locked}
            aria-label="Countdown minutes"
            data-tooltip="Minutes for the countdown, from 1 to 180."
            data-tooltip-wrap="true"
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
      <p
        className="writing-timer__clock"
        role="timer"
        aria-label={timer.mode === 'down' ? 'Countdown' : 'Count up'}
        data-tooltip={timer.mode === 'down' ? 'Time left in the countdown.' : 'Time elapsed this sitting.'}
      >
        {formatClock(clockMs)}
      </p>
      <div className="writing-timer__controls">
        <button
          type="button"
          onClick={onStart}
          disabled={timer.phase === 'running' || capture.busy}
          aria-label="Start session"
          data-tooltip="Start the clock and the picture session. A picture is taken now, every five minutes, and when you press End, only if Camera or Screen is on."
          data-tooltip-wrap="true"
        >
          Start
        </button>
        <button
          type="button"
          onClick={onPause}
          disabled={timer.phase !== 'running'}
          data-tooltip="Pause the clock. Camera and screen pictures keep their five-minute schedule until you press End."
          data-tooltip-wrap="true"
        >
          Pause
        </button>
        <button
          type="button"
          onClick={onEnd}
          disabled={capture.busy || (!locked && !capture.ownsSession)}
          aria-label="End session"
          data-tooltip="End the clock and the picture session. If Camera or Screen is on, one last picture is taken."
          data-tooltip-wrap="true"
        >
          End
        </button>
      </div>
      {noteRoot ? createPortal(timerNotes(error, summary, sittingWords), noteRoot) : null}
    </div>
  );
}

function timerNotes(error: string, summary: SessionSummary | null, sittingWords: number | null): ReactNode {
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
              <dt>This sitting</dt>
              <dd data-stat="sitting-words">{sittingWords == null ? '—' : `${sittingWords.toLocaleString()} words`}</dd>
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
