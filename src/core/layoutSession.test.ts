import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_LAYOUT_SESSION,
  LAYOUT_PANE_LIMITS,
  clampPaneWidth,
  layoutSessionFromStored,
} from './layoutSession.ts';

test('a missing layout record uses expanded rails and the default grab positions', () => {
  assert.deepEqual(layoutSessionFromStored(null), DEFAULT_LAYOUT_SESSION);
  assert.deepEqual(layoutSessionFromStored(''), DEFAULT_LAYOUT_SESSION);
  assert.deepEqual(layoutSessionFromStored('{'), DEFAULT_LAYOUT_SESSION);
});

test('saved collapsed rails and grab positions are restored, not reset', () => {
  const saved = layoutSessionFromStored(JSON.stringify({
    sidebarCollapsed: true,
    notesCollapsed: true,
    certificationCollapsed: false,
    railCollapsed: true,
    sidebarWidth: 320,
    notesWidth: 410,
    certificationWidth: 300,
  }), {
    sidebarCollapsed: false,
    notesCollapsed: false,
    certificationCollapsed: true,
  });
  assert.equal(saved.sidebarCollapsed, true);
  assert.equal(saved.notesCollapsed, true);
  assert.equal(saved.certificationCollapsed, false);
  assert.equal(saved.railCollapsed, true);
  assert.equal(saved.sidebarWidth, 320);
  assert.equal(saved.notesWidth, 410);
  assert.equal(saved.certificationWidth, 300);
});

test('a width outside the pane limits is clamped and does not fall back to the default', () => {
  const saved = layoutSessionFromStored(JSON.stringify({
    sidebarWidth: 9000,
    notesWidth: 12,
    certificationWidth: 200.4,
  }));
  assert.equal(saved.sidebarWidth, LAYOUT_PANE_LIMITS.sidebarWidth.max);
  assert.notEqual(saved.sidebarWidth, DEFAULT_LAYOUT_SESSION.sidebarWidth);
  assert.equal(saved.notesWidth, LAYOUT_PANE_LIMITS.notesWidth.min);
  assert.notEqual(saved.notesWidth, DEFAULT_LAYOUT_SESSION.notesWidth);
  assert.equal(saved.certificationWidth, 200);
  assert.equal(clampPaneWidth(Number.NaN, 180, 480), 180);
});

test('session flags fill only fields the saved layout does not already have', () => {
  const saved = layoutSessionFromStored(JSON.stringify({ sidebarCollapsed: false }), {
    sidebarCollapsed: true,
    notesCollapsed: true,
    certificationCollapsed: true,
  });
  assert.equal(saved.sidebarCollapsed, false);
  assert.equal(saved.notesCollapsed, true);
  assert.equal(saved.certificationCollapsed, true);
  assert.equal(saved.railCollapsed, false);
  assert.equal(saved.notesWidth, DEFAULT_LAYOUT_SESSION.notesWidth);
});
