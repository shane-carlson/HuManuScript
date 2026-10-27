const assert = require('node:assert/strict');
const test = require('node:test');
const { CHECK_FOR_UPDATES_LABEL, applicationMenuTemplate } = require('./appMenu.cjs');

function helpItem(platform) {
  const clicks = { n: 0 };
  const template = applicationMenuTemplate({
    platform,
    onCheckForUpdates: () => {
      clicks.n += 1;
    },
  });
  const help = template.find((item) => item.role === 'help');
  const item = help && help.submenu.find((entry) => entry.label === CHECK_FOR_UPDATES_LABEL);
  return { template, help, item, clicks };
}

test('Check for updates is on the Help menu', () => {
  assert.equal(CHECK_FOR_UPDATES_LABEL, 'Check for updates');
  for (const platform of ['darwin', 'win32', 'linux']) {
    const { template, help, item, clicks } = helpItem(platform);
    assert.equal(help.label, 'Help');
    assert.equal(item.label, 'Check for updates');
    item.click();
    assert.equal(clicks.n, 1);
    assert.equal(template[0].role, platform === 'darwin' ? 'appMenu' : 'fileMenu');
  }
});
