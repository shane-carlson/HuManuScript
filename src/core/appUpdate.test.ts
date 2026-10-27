import assert from 'node:assert/strict';
import test from 'node:test';
import { updateAvailableMessage, updatePromptModel } from './appUpdate.ts';

test('the header names the release that is available', () => {
  assert.equal(updateAvailableMessage('0.1.32'), 'Update 0.1.32 is available.');
  assert.equal(updateAvailableMessage(' 0.1.32 '), 'Update 0.1.32 is available.');
  assert.equal(updateAvailableMessage(''), 'An update is available.');
  assert.equal(updateAvailableMessage('latest-mac.yml?token=1'), 'An update is available.');
});

test('the prompt asks, confirms the download, shows progress, then asks to restart', () => {
  const available = updatePromptModel({ phase: 'available', version: '0.1.36' });
  assert.equal(available?.phase, 'available');
  assert.equal(available?.message, 'Update 0.1.36 is available.');
  assert.equal(available?.primary, 'Update');
  assert.equal(available?.secondary, null);

  const confirm = updatePromptModel({ phase: 'available', version: '0.1.36', confirming: true });
  assert.equal(confirm?.phase, 'confirm');
  assert.equal(confirm?.message, 'Download update 0.1.36?');
  assert.equal(confirm?.primary, 'Download');
  assert.equal(confirm?.secondary, 'Not now');
  assert.match(confirm?.detail ?? '', /restarts only after you confirm/);

  const downloading = updatePromptModel({ phase: 'downloading', version: '0.1.36', percent: 42.4, confirming: true });
  assert.equal(downloading?.phase, 'downloading');
  assert.equal(downloading?.message, 'Downloading update 0.1.36… 42%');
  assert.equal(downloading?.percent, 42);
  assert.equal(downloading?.primary, null);
  assert.match(downloading?.detail ?? '', /keep writing/);

  const restart = updatePromptModel({ phase: 'downloaded', version: '0.1.36' });
  assert.equal(restart?.phase, 'downloaded');
  assert.equal(restart?.message, 'Restart to apply update 0.1.36.');
  assert.equal(restart?.primary, 'Restart');
  assert.match(restart?.detail ?? '', /will not restart until you confirm/);

  const failed = updatePromptModel({ phase: 'failed', version: '0.1.36' });
  assert.equal(failed?.message, 'The update could not be downloaded.');
  assert.equal(failed?.detail, 'You can keep writing and try again.');
  assert.equal(failed?.primary, 'Try again');

  const retry = updatePromptModel({ phase: 'failed', version: '0.1.36', confirming: true });
  assert.equal(retry?.phase, 'confirm');
  assert.equal(retry?.primary, 'Download');
});

test('a menu check says when the app is current and when the check fails', () => {
  const checking = updatePromptModel({ phase: 'checking', version: '' });
  assert.equal(checking?.message, 'Checking for updates…');
  assert.equal(checking?.primary, null);
  assert.match(checking?.detail ?? '', /keep writing/);

  const current = updatePromptModel({ phase: 'current', version: '0.1.36' });
  assert.equal(current?.message, 'HuManuScript is up to date.');
  assert.equal(current?.primary, null);
  assert.equal(current?.secondary, 'Dismiss');
  assert.match(current?.detail ?? '', /keep writing/);

  const failed = updatePromptModel({ phase: 'check-failed', version: 'latest.yml?token=1' });
  assert.equal(failed?.message, 'Could not check for updates.');
  assert.equal(failed?.primary, null);
  assert.match(failed?.detail ?? '', /keep writing/);
});

test('a feed string that is not a version never becomes the prompt', () => {
  const model = updatePromptModel({ phase: 'available', version: 'latest-mac.yml?token=1' });
  assert.equal(model?.message, 'An update is available.');
  assert.equal(updatePromptModel({ phase: 'nope', version: '0.1.36' }), null);
});
