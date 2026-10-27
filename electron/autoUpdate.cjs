/**
 * Checks GitHub Releases when a packaged build opens, and about once an hour.
 * A newer release is only announced. download() and install() run after the
 * person confirms, so nothing is fetched or applied on its own.
 * The electron-updater instance is passed in so tests do not load Electron.
 * That updater still reads latest-mac.yml on macOS and latest.yml on Windows.
 */
const HOUR_MS = 60 * 60 * 1000;
const PHASES = ['available', 'downloading', 'downloaded', 'failed'];

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

function progressPercent(progress) {
  const value = Number(progress && progress.percent);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Notice sent to the window. Drops query strings, URLs, and unknown phases. */
function readUpdateState(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const version = releasedVersion(payload);
  const rawPhase = payload.phase;
  if (rawPhase == null) return { phase: 'available', version, percent: 0 };
  if (!PHASES.includes(rawPhase)) return null;
  return {
    phase: rawPhase,
    version,
    percent: rawPhase === 'downloading' ? progressPercent(payload) : 0,
  };
}

function watchForUpdates(autoUpdater, log = () => {}, timers = {}, notify = () => {}) {
  const schedule = timers.schedule || setInterval;
  const delay = timers.delay || setTimeout;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  let version = '';
  let phase = 'idle';
  let downloading = false;
  let downloaded = false;
  let installing = false;
  let lastNotice = '';
  let swallowDuplicate = false;

  const emit = (nextPhase, percent = 0) => {
    phase = nextPhase;
    const notice = readUpdateState({
      phase: nextPhase,
      version,
      percent: nextPhase === 'downloading' ? percent : 0,
    });
    if (!notice) return;
    const key = `${notice.phase}|${notice.version}|${notice.percent}`;
    if (key === lastNotice) return;
    lastNotice = key;
    notify(notice);
  };

  const reportCheckFailure = (error) => {
    log(`Update check failed: ${safeUpdateError(error)}`);
  };

  const failDownload = (error) => {
    if (!downloading) return false;
    downloading = false;
    log(`Update download failed: ${safeUpdateError(error)}`);
    emit('failed');
    return true;
  };

  const reportError = (error) => {
    if (failDownload(error)) {
      swallowDuplicate = true;
      queueMicrotask(() => {
        swallowDuplicate = false;
      });
      return;
    }
    if (swallowDuplicate) {
      swallowDuplicate = false;
      return;
    }
    reportCheckFailure(error);
  };

  autoUpdater.logger = {
    info() {},
    warn() {},
    debug() {},
    error(message) {
      reportError({ message: String(message ?? '') });
    },
  };
  autoUpdater.on('error', reportError);
  autoUpdater.on('update-available', (info) => {
    if (phase === 'downloading' || phase === 'downloaded') return;
    const reported = releasedVersion(info);
    if (reported) version = reported;
    log(`Update available${reported ? `: ${reported}` : ''}.`);
    emit('available');
  });
  autoUpdater.on('download-progress', (progress) => {
    if (!downloading && phase !== 'downloading') return;
    emit('downloading', progressPercent(progress));
  });
  autoUpdater.on('update-downloaded', (info) => {
    if (downloaded) return;
    const reported = releasedVersion(info);
    if (reported) version = reported;
    downloading = false;
    downloaded = true;
    log(`Update downloaded${version ? `: ${version}` : ''}. Waiting for restart.`);
    emit('downloaded');
  });

  const check = () => {
    try {
      const pending = autoUpdater.checkForUpdates();
      if (pending && typeof pending.then === 'function') {
        pending.catch((error) => {
          reportCheckFailure(error);
        });
      }
    } catch (error) {
      reportCheckFailure(error);
    }
  };

  const download = () => {
    if (downloaded || downloading || installing) return;
    if (phase !== 'available' && phase !== 'failed') return;
    downloading = true;
    log(`Downloading update${version ? `: ${version}` : ''}.`);
    emit('downloading', 0);
    if (typeof autoUpdater.downloadUpdate !== 'function') {
      failDownload(new Error('download unavailable'));
      return;
    }
    try {
      const pending = autoUpdater.downloadUpdate();
      if (pending && typeof pending.catch === 'function') pending.catch((error) => failDownload(error));
    } catch (error) {
      failDownload(error);
    }
  };

  const install = () => {
    if (!downloaded || installing) return;
    installing = true;
    log(`Restarting to apply update${version ? `: ${version}` : ''}.`);
    const timer = delay(() => {
      try {
        autoUpdater.quitAndInstall(false, true);
      } catch (error) {
        installing = false;
        log(`Update restart failed: ${safeUpdateError(error)}`);
      }
    }, 1000);
    if (timer && typeof timer.unref === 'function') timer.unref();
  };

  check();
  const timer = schedule(check, HOUR_MS);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return { check, download, install };
}

module.exports = {
  HOUR_MS,
  progressPercent,
  readUpdateState,
  releasedVersion,
  safeUpdateError,
  shouldCheckForUpdates,
  watchForUpdates,
};
