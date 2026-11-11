import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WORKSPACE_TABS,
  reorderWorkspaceTabs,
  workspaceTabOrderFromStored,
} from './workspaceTabs.ts';

test('the default tab order puts Stats & Streaks under Manuscript', () => {
  assert.deepEqual(workspaceTabOrderFromStored(null), ['manuscript', 'streaks', 'export', 'history']);
  assert.deepEqual([...WORKSPACE_TABS], ['manuscript', 'streaks', 'export', 'history']);
});

test('a saved order is kept and a missing tab is appended', () => {
  assert.deepEqual(
    workspaceTabOrderFromStored(['history', 'manuscript', 'nope', 'history']),
    ['history', 'manuscript', 'streaks', 'export'],
  );
});

test('dragging a tab takes the slot of the tab it lands on', () => {
  const order = workspaceTabOrderFromStored(null);
  assert.deepEqual(reorderWorkspaceTabs(order, 'streaks', 'history'), [
    'manuscript',
    'export',
    'history',
    'streaks',
  ]);
  assert.deepEqual(reorderWorkspaceTabs(order, 'history', 'streaks'), [
    'manuscript',
    'history',
    'streaks',
    'export',
  ]);
  assert.deepEqual(reorderWorkspaceTabs(order, 'manuscript', 'manuscript'), [...order]);
});
