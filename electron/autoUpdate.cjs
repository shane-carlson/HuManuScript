/**
 * Decides when a packaged build should install a newer signed GitHub Release.
 * The electron-updater instance is passed in so tests do not load Electron.
 */
const HOUR_MS = 60 * 60 * 1000;

function shouldCheckForUpdates({ isPackaged, build }) {
  return Boolean(isPackaged) && /^[0-9]+$/.test(String(build ?? '').trim());
}

function safeUpdateError(error) {
  const message = error && error.message ? String(error.message) : 'unknown error';
  return message.split('?')[0].slice(0, 300);
}

/** Release version from the feed. Anything else is dropped so the window never shows a URL. */
function releasedVersion(info) {
  const version = info && info.version ? String(info.version).trim() : '';
  return /^[0-9]+(?:\.[0-9A-Za-z]+){1,3}$/.test(version) ? version : '';
}

function watchForUpdates(autoUpdater, log = () => {}, timers = {}, notify = () => {}) {
  const schedule = timers.schedule || setInterval;
  const delay = timers.delay || setTimeout;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info() {},
    warn() {},
    debug() {},
    error(message) {
      log(`Update check failed: ${safeUpdateError({ message: String(message ?? '') })}`);
    },
  };
  let installing = false;
  const install = (version) => {
    if (installing) return;
    installing = true;
    log(`Update downloaded${version ? `: ${version}` : ''}. Installing.`);
    const timer = delay(() => {
      autoUpdater.quitAndInstall(false, true);
    }, 1000);
    if (timer && typeof timer.unref === 'function') timer.unref();
  };
  autoUpdater.on('error', (error) => {
    log(`Update check failed: ${safeUpdateError(error)}`);
  });
  autoUpdater.on('update-available', (info) => {
    const version = releasedVersion(info);
    log(`Update available${version ? `: ${version}` : ''}.`);
    notify({ version });
  });
  autoUpdater.on('update-downloaded', (info) => {
    install(releasedVersion(info));
  });
  const check = () => {
    try {
      const pending = autoUpdater.checkForUpdates();
      if (pending && typeof pending.then === 'function') {
        pending.catch((error) => {
          log(`Update check failed: ${safeUpdateError(error)}`);
        });
      }
    } catch (error) {
      log(`Update check failed: ${safeUpdateError(error)}`);
    }
  };
  check();
  const timer = schedule(check, HOUR_MS);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return { check };
}

module.exports = { HOUR_MS, releasedVersion, shouldCheckForUpdates, safeUpdateError, watchForUpdates };
