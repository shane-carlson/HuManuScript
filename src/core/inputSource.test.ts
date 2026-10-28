import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  INPUT_SOURCE_UNKNOWN,
  TYPING_RATE_UNKNOWN,
  cleanInputDeviceName,
  inputSourceFor,
  inputSourceLine,
  noteKeyboardPace,
  typingRateLine,
} from './inputSource.ts';

test('device names are trimmed and blank names stay unknown', () => {
  assert.equal(cleanInputDeviceName('  Keychron K2  '), 'Keychron K2');
  assert.equal(cleanInputDeviceName('   '), null);
  assert.equal(cleanInputDeviceName(INPUT_SOURCE_UNKNOWN), null);
  assert.equal(inputSourceFor('keyboard', { keyboard: '  ', microphone: 'Blue Yeti' }).name, null);
  assert.deepEqual(inputSourceFor('dictation', { keyboard: 'Keychron K2', microphone: 'Blue Yeti' }), {
    kind: 'microphone',
    name: 'Blue Yeti',
  });
});

test('typing rate needs two timed keys and ignores a bulk insert', () => {
  const first = noteKeyboardPace(undefined, { at: '2026-10-28T15:00:00.000Z', inputType: 'insertText', data: 'A' });
  assert.equal(first?.keystrokes, 1);
  assert.equal(typingRateLine({ origin: 'keyboard', keyboardPace: first }), TYPING_RATE_UNKNOWN);
  const bulk = noteKeyboardPace(first, { at: '2026-10-28T15:00:01.000Z', inputType: 'insertText', data: 'Hello' });
  assert.equal(bulk, first);
  const second = noteKeyboardPace(first, { at: '2026-10-28T15:00:01.000Z', inputType: 'insertText', data: 'B' });
  assert.equal(typingRateLine({ origin: 'keyboard', keyboardPace: second }), 'Typing rate: 60 keys/min');
  assert.equal(typingRateLine({ origin: 'dictation', keyboardPace: second }), TYPING_RATE_UNKNOWN);
  assert.equal(inputSourceLine({ inputSource: { kind: 'keyboard', name: null } }), INPUT_SOURCE_UNKNOWN);
  assert.equal(inputSourceLine({}), INPUT_SOURCE_UNKNOWN);
  assert.equal(inputSourceLine({ inputSource: { kind: 'microphone', name: 'Blue Yeti' } }), 'Input: Blue Yeti');
});

test('a very slow pair of keys is still a rate', () => {
  const pace = noteKeyboardPace(
    { keystrokes: 1, firstAt: '2026-10-28T15:00:00.000Z', lastAt: '2026-10-28T15:00:00.000Z' },
    { at: '2026-10-28T15:10:00.000Z', inputType: 'insertCompositionText', data: 'é' },
  );
  assert.equal(typingRateLine({ origin: 'keyboard', keyboardPace: pace }), 'Typing rate: under 1 key/min');
});
