import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countdownDurationMs,
  countdownResult,
  elapsedNow,
  endTimer,
  formatClock,
  idleWritingTimer,
  pauseTimer,
  sessionGoalResult,
  sessionSummary,
  startTimer,
  tickTimer,
} from './writingTimer.ts';

test('count-up starts, pauses, and resumes without dropping time', () => {
  const started = startTimer(idleWritingTimer('up'), 1_000);
  assert.equal(elapsedNow(started, 4_200), 3_200);
  const paused = pauseTimer(started, 4_200);
  assert.equal(paused.phase, 'paused');
  assert.equal(elapsedNow(paused, 9_000), 3_200);
  const resumed = startTimer(paused, 9_000);
  assert.equal(elapsedNow(resumed, 10_500), 4_700);
});

test('end session freezes the time already spent', () => {
  const started = startTimer(idleWritingTimer('up'), 0);
  const paused = pauseTimer(started, 5_000);
  const ended = endTimer(paused, 20_000);
  assert.equal(ended.phase, 'ended');
  assert.equal(ended.elapsedMs, 5_000);
  assert.equal(endTimer(ended, 30_000), ended);
});

test('a countdown ends at its planned length and a short end keeps the time spent', () => {
  const timer = { ...idleWritingTimer('down', 60_000), phase: 'running' as const, runningSince: 0 };
  assert.equal(tickTimer(timer, 59_000), timer);
  const finished = tickTimer(timer, 60_500);
  assert.equal(finished.phase, 'ended');
  assert.equal(finished.elapsedMs, 60_000);
  const early = endTimer(timer, 12_000);
  assert.equal(early.elapsedMs, 12_000);
  assert.equal(countdownResult(60_000, 60_000), '1:00 countdown finished');
  assert.equal(countdownResult(12_000, 60_000), '0:12 of 1:00');
});

test('the session summary keeps the bar stats and the word goal', () => {
  const ended = endTimer(startTimer(idleWritingTimer('up'), 0), 90_000);
  const summary = sessionSummary({
    timer: ended,
    words: 1204,
    chapters: 3,
    certified: 800,
    uncertified: 404,
    sessionWritten: 320,
    sessionTarget: 500,
  });
  assert.equal(summary.words, 1204);
  assert.equal(summary.chapters, 3);
  assert.equal(summary.certified, 800);
  assert.equal(summary.uncertified, 404);
  assert.equal(summary.elapsedMs, 90_000);
  assert.equal(sessionGoalResult(320, 500), '320 of 500 words, 180 short');
  assert.equal(sessionGoalResult(500, 500), '500 of 500 words, goal met');
  assert.equal(sessionGoalResult(null, null), 'No session word goal');
  assert.equal(formatClock(90_000), '1:30');
  assert.equal(formatClock(3_665_000), '1:01:05');
});

test('countdown minutes are optional whole minutes from 1 to 180', () => {
  assert.equal(countdownDurationMs('25'), 25 * 60_000);
  assert.equal(countdownDurationMs('1'), 60_000);
  assert.equal(countdownDurationMs(''), null);
  assert.equal(countdownDurationMs('0'), null);
  assert.equal(countdownDurationMs('181'), null);
  assert.equal(countdownDurationMs('1.5'), null);
});
