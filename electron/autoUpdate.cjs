/**
 * Checks GitHub Releases when a packaged build opens, about once an hour,
 * and when File → Check for updates is chosen. Same feed either way.
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

const QUIET_PHASES = ['checking', 'current', 'check-failed'];

/** Notice sent to the window. Drops query strings, URLs, and unknown phases. */
function readUpdateState(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const rawPhase = payload.phase;
  if (QUIET_PHASES.includes(rawPhase)) return { phase: rawPhase, version: '', percent: 0 };
  const version = releasedVersion(payload);
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
  let manualCheck = false;
  let lastNotice = '';
  let swallowDuplicate = false;

  const emit = (nextPhase, percent = 0, force = false) => {
    phase = nextPhase;
    const notice = readUpdateState({
      phase: nextPhase,
      version,
      percent: nextPhase === 'downloading' ? percent : 0,
    });
    if (!notice) return;
    const key = `${notice.phase}|${notice.version}|${notice.percent}`;
    if (!force && key === lastNotice) return;
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

  const reportManualFailure = (error) => {
    manualCheck = false;
    log(`Update check failed: ${safeUpdateError(error)}`);
    emit('check-failed', 0, true);
    swallowDuplicate = true;
    queueMicrotask(() => {
      swallowDuplicate = false;
    });
  };

  const reportError = (error) => {
    if (failDownload(error)) {
      manualCheck = false;
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
    if (manualCheck) {
      reportManualFailure(error);
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
    manualCheck = false;
    if (phase === 'downloading' || phase === 'downloaded') return;
    const reported = releasedVersion(info);
    if (reported) version = reported;
    log(`Update available${reported ? `: ${reported}` : ''}.`);
    emit('available');
  });
  autoUpdater.on('update-not-available', () => {
    if (!manualCheck) return;
    manualCheck = false;
    if (phase === 'downloading' || phase === 'downloaded') return;
    log('No update available.');
    emit('current', 0, true);
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
    const fromMenu = manualCheck;
    const onFailure = (error) => {
      if (fromMenu) reportError(error);
      else reportCheckFailure(error);
    };
    try {
      const pending = autoUpdater.checkForUpdates();
      if (pending && typeof pending.then === 'function') pending.catch(onFailure);
    } catch (error) {
      onFailure(error);
    }
  };

  const checkNow = () => {
    if (installing || downloaded || downloading) return;
    manualCheck = true;
    log('Checking for updates.');
    emit('checking', 0, true);
    check();
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
  return { check, checkNow, download, install };
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
