import { useEffect, useId, useState } from 'react';
import type { ManuscriptDocument } from '../core/document.ts';
import { SessionCaptureControls } from './SessionCapture.tsx';
import { WritingTimer } from './WritingTimer.tsx';
import { manuscriptStats } from '../core/manuscript.ts';
import {
  activeChapter,
  chapterGoalWords,
  parseGoalCount,
  sessionWordsWritten,
  setChapterWordGoal,
  wordGoalPhase,
  type GoalScope,
  type SessionGoal,
} from '../core/wordGoal.ts';

const SESSION_GOAL_KEY = 'humanuscript.sessionGoal.v1';

function loadSessionGoal(bookId: string): SessionGoal | null {
  try {
    const raw = sessionStorage.getItem(SESSION_GOAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionGoal>;
    if (parsed.bookId !== bookId) return null;
    if (typeof parsed.target !== 'number' || typeof parsed.baseline !== 'number') return null;
    if (!Number.isInteger(parsed.target) || parsed.target <= 0) return null;
    return { bookId, target: parsed.target, baseline: parsed.baseline };
  } catch {
    return null;
  }
}

function saveSessionGoal(goal: SessionGoal | null): string | null {
  try {
    if (!goal) sessionStorage.removeItem(SESSION_GOAL_KEY);
    else sessionStorage.setItem(SESSION_GOAL_KEY, JSON.stringify(goal));
    return null;
  } catch {
    return 'The session goal could not be saved in this browser.';
  }
}

export function WordGoal({
  bookId,
  doc,
  activeBlockId,
  saveError,
  onChange,
}: {
  bookId: string;
  doc: ManuscriptDocument;
  activeBlockId: string | null;
  saveError?: string | null;
  onChange: (doc: ManuscriptDocument) => void;
}) {
  const [scope, setScope] = useState<GoalScope>('session');
  const [draft, setDraft] = useState('');
  const [inputError, setInputError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [sessionGoal, setSessionGoal] = useState<SessionGoal | null>(() => loadSessionGoal(bookId));
  const [readyId, setReadyId] = useState<string | null>(null);
  const [noteRoot, setNoteRoot] = useState<HTMLDivElement | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsPanelId = useId();

  useEffect(() => {
    setSessionGoal(loadSessionGoal(bookId));
    setReadyId(null);
    const frame = requestAnimationFrame(() => setReadyId(bookId));
    return () => cancelAnimationFrame(frame);
  }, [bookId]);

  useEffect(() => {
    if (!optionsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOptionsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [optionsOpen]);

  const total = manuscriptStats(doc.blocks).words;
  const chapter = activeChapter(doc.blocks, activeBlockId);
  const chapterWords = chapterGoalWords(doc.blocks, chapter?.id ?? null);
  const sessionWritten = sessionWordsWritten(total, sessionGoal, bookId);
  const target = scope === 'session' ? (sessionGoal?.bookId === bookId ? sessionGoal.target : null) : (chapter?.wordGoal ?? null);
  const current = scope === 'session' ? sessionWritten : chapterWords;
  const error = inputError || storageError || (saveError ?? '');
  const phase = wordGoalPhase({ ready: readyId === bookId, error, target });

  const setGoal = () => {
    const count = parseGoalCount(draft);
    if (count == null) {
      setInputError('Enter a whole number of words.');
      return;
    }
    setInputError('');
    setStorageError('');
    if (scope === 'session') {
      const next = { bookId, target: count, baseline: total };
      const failed = saveSessionGoal(next);
      if (failed) {
        setStorageError(failed);
        return;
      }
      setSessionGoal(next);
      setDraft('');
      return;
    }
    if (!chapter) {
      setInputError('Start a chapter before setting a chapter goal.');
      return;
    }
    onChange(setChapterWordGoal(doc, chapter.id, count));
    setDraft('');
  };

  const clearGoal = () => {
    setInputError('');
    setStorageError('');
    if (scope === 'session') {
      const failed = saveSessionGoal(null);
      if (failed) {
        setStorageError(failed);
        return;
      }
      setSessionGoal(null);
      return;
    }
    if (!chapter) return;
    onChange(setChapterWordGoal(doc, chapter.id, null));
  };

  const ratio = target && current != null ? Math.min(100, Math.round((current / target) * 100)) : 0;

  return (
    <div className="word-goal" data-word-goal={phase} data-word-goal-scope={scope}>
      <div className="word-goal__line">
        <div className="word-goal__main">
        <div className="word-goal__scope">
          <span className="session-capture-controls__label">Goal</span>
          <div role="group" aria-label="Goal scope">
            <button
              type="button"
              aria-pressed={scope === 'session'}
              data-tooltip="Count new words from when you set the goal until you clear it."
              data-tooltip-wrap="true"
              onClick={() => { setScope('session'); setInputError(''); }}
            >
              Session
            </button>
            <button
              type="button"
              aria-pressed={scope === 'chapter'}
              data-tooltip="Count the words already in the chapter you are writing."
              data-tooltip-wrap="true"
              onClick={() => { setScope('chapter'); setInputError(''); }}
            >
              Chapter
            </button>
          </div>
        </div>
        {phase === 'ready' && target != null && current != null && (
          <div className="word-goal__progress">
            <p>
              <strong>{current.toLocaleString()}</strong>
              <span> of {target.toLocaleString()}</span>
            </p>
            <div
              className="word-goal__meter"
              role="meter"
              aria-label={scope === 'session' ? 'Session word goal' : 'Chapter word goal'}
              aria-valuemin={0}
              aria-valuemax={target}
              aria-valuenow={Math.min(current, target)}
            >
              <span style={{ width: `${ratio}%` }} />
            </div>
          </div>
        )}
        <form
          className="word-goal__form"
          onSubmit={(event) => {
            event.preventDefault();
            setGoal();
          }}
        >
          <label>
            <span className="sr-only">{scope === 'session' ? 'Session word goal' : 'Chapter word goal'}</span>
            <input
              inputMode="numeric"
              value={draft}
              placeholder="Word goal"
              aria-label={scope === 'session' ? 'Words this session' : 'Words in this chapter'}
              aria-invalid={phase === 'error' || undefined}
              data-tooltip="A whole number of words. Session counts new words. Chapter counts the chapter."
              data-tooltip-wrap="true"
              onChange={(event) => {
                setDraft(event.target.value);
                if (inputError) setInputError('');
              }}
            />
          </label>
          <button
            type="submit"
            className="primary"
            data-tooltip={scope === 'session' ? 'Save this number as the session word goal.' : 'Save this number as the chapter word goal.'}
            data-tooltip-wrap="true"
          >
            Set goal
          </button>
          {target != null && (
            <button
              type="button"
              className="ghost"
              onClick={clearGoal}
              data-tooltip="Remove the word goal. The clock and the picture session keep going."
              data-tooltip-wrap="true"
            >
              Clear
            </button>
          )}
        </form>
        <WritingTimer bookId={bookId} doc={doc} sessionGoal={sessionGoal} noteRoot={noteRoot} />
        </div>
        <button
          type="button"
          className="session-options__trigger"
          aria-expanded={optionsOpen}
          aria-controls={optionsPanelId}
          onClick={() => setOptionsOpen((open) => !open)}
        >
          Session options
        </button>
      </div>
      {optionsOpen && (
        <div className="session-options__panel" id={optionsPanelId} role="region" aria-label="Session options">
          <p className="session-options__explain">
            You can include screenshots and pictures from this computer&apos;s camera. They are added to the
            certification evidence as proof the text was written by a person. Camera and screen stay off until you
            turn them on. Start and End on this bar begin and finish the session. A picture is taken at the start,
            every five minutes, and when you press End.
          </p>
          <SessionCaptureControls />
        </div>
      )}
      <div className="word-goal__notes" ref={setNoteRoot}>
        {phase === 'error' && (
          <p className="word-goal__status word-goal__status--error" role="alert">{error}</p>
        )}
      </div>
    </div>
  );
}
