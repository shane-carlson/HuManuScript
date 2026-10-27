/** Help menu entry. The click runs the same GitHub Release check as launch. */

const CHECK_FOR_UPDATES_LABEL = 'Check for updates';

function applicationMenuTemplate({ onCheckForUpdates, platform = process.platform } = {}) {
  const check = typeof onCheckForUpdates === 'function' ? onCheckForUpdates : () => {};
  const template = [
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      label: 'Help',
      role: 'help',
      submenu: [
        {
          label: CHECK_FOR_UPDATES_LABEL,
          click: () => check(),
        },
      ],
    },
  ];
  if (platform === 'darwin') template.unshift({ role: 'appMenu' });
  return template;
}

module.exports = {
  CHECK_FOR_UPDATES_LABEL,
  applicationMenuTemplate,
};
