const assert = require('node:assert/strict');
const test = require('node:test');
const { CHECK_FOR_UPDATES_LABEL, applicationMenuTemplate } = require('./appMenu.cjs');

function fileItem(platform, onCheckForUpdates) {
  const template = applicationMenuTemplate({ platform, onCheckForUpdates });
  const file = template.find((item) => item.label === 'File');
  const item = file && file.submenu.find((entry) => entry.label === CHECK_FOR_UPDATES_LABEL);
  return { template, file, item };
}

test('Check for updates is on the File menu', () => {
  assert.equal(CHECK_FOR_UPDATES_LABEL, 'Check for updates');
  for (const platform of ['darwin', 'win32', 'linux']) {
    const clicks = { n: 0 };
    const { template, file, item } = fileItem(platform, () => {
      clicks.n += 1;
    });
    assert.equal(file.label, 'File');
    assert.equal(item.label, 'Check for updates');
    item.click();
    assert.equal(clicks.n, 1);
    assert.deepEqual(
      file.submenu.map((entry) => entry.label || entry.type || entry.role),
      ['Check for updates', 'separator', platform === 'darwin' ? 'close' : 'quit'],
    );
    assert.equal(template[0].role, platform === 'darwin' ? 'appMenu' : undefined);
    if (platform !== 'darwin') assert.equal(template[0].label, 'File');
    assert.equal(template.filter((entry) => entry.label === 'File').length, 1);
  }
});

test('Check for updates is not on the Help menu', () => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    const { template } = fileItem(platform, () => {});
    assert.equal(
      template.some((entry) => entry.role === 'help' || entry.label === 'Help'),
      false,
    );
    const labels = template.flatMap((entry) => (entry.submenu || []).map((item) => item.label));
    assert.deepEqual(
      labels.filter((label) => label === CHECK_FOR_UPDATES_LABEL),
      [CHECK_FOR_UPDATES_LABEL],
    );
  }
});

test('a File menu check with no handler does not throw', () => {
  const { item } = fileItem('win32');
  assert.doesNotThrow(() => item.click());
});
