/** File menu entry. The click runs the same GitHub Release check as launch. */

const CHECK_FOR_UPDATES_LABEL = 'Check for updates';

/**
 * Electron's fileMenu role is Close on macOS and Quit elsewhere.
 * Check for updates sits on that same File menu, above the platform item.
 * It is not a Help item.
 */
function fileMenu(check, platform) {
  const updateItem = {
    label: CHECK_FOR_UPDATES_LABEL,
    click: () => check(),
  };
  const standard = platform === 'darwin' ? { role: 'close' } : { role: 'quit' };
  return {
    label: 'File',
    submenu: [updateItem, { type: 'separator' }, standard],
  };
}

function applicationMenuTemplate({ onCheckForUpdates, platform = process.platform } = {}) {
  const check = typeof onCheckForUpdates === 'function' ? onCheckForUpdates : () => {};
  const template = [
    fileMenu(check, platform),
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  if (platform === 'darwin') template.unshift({ role: 'appMenu' });
  return template;
}

module.exports = {
  CHECK_FOR_UPDATES_LABEL,
  applicationMenuTemplate,
};
