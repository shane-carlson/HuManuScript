/**
 * Loaded only from a packaged app. scripts/bundle-updater.cjs inlines this
 * into electron/autoUpdate.bundle.cjs so the DMG does not ship node_modules.
 */
const { autoUpdater } = require('electron-updater');

module.exports = { autoUpdater };
