/**
 * Last Electron window placement. Stored under userData so an update
 * does not put the window back to the default size.
 */

const path = require('node:path');

const FILE_NAME = 'window-bounds.json';

function windowStatePath(userData) {
  return path.join(userData, FILE_NAME);
}

function normalizeWindowState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const width = Number(raw.width);
  const height = Number(raw.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 200 || height < 200) return null;
  const x = Number(raw.x);
  const y = Number(raw.y);
  const maximized = raw.maximized === true;
  return {
    x: Number.isFinite(x) ? x : null,
    y: Number.isFinite(y) ? y : null,
    width,
    height,
    maximized,
    minimized: raw.minimized === true && !maximized,
  };
}

function readWindowState(fs, file) {
  try {
    return normalizeWindowState(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

function writeWindowState(fs, file, state) {
  const normalized = normalizeWindowState(state);
  if (!normalized) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(normalized));
}

/** Prefer the restored rectangle when the window is maximized or minimized. */
function stateFromWindow({ bounds, normalBounds, maximized, minimized }) {
  const source = (maximized || minimized) && normalBounds ? normalBounds : bounds;
  return normalizeWindowState({
    x: source.x,
    y: source.y,
    width: source.width,
    height: source.height,
    maximized: Boolean(maximized),
    minimized: Boolean(minimized) && !maximized,
  });
}

function titleBarVisible(bounds, area) {
  if (bounds.x == null || bounds.y == null) return false;
  const overlap = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
  return overlap >= 48 && bounds.y >= area.y - 8 && bounds.y <= area.y + area.height - 28;
}

/**
 * Keep the saved width and height. If the title bar is off every display,
 * move the window onto the first work area without changing its size.
 */
function keepSizeOnScreen(state, workAreas) {
  if (!state) return null;
  if (state.x == null || state.y == null || !Array.isArray(workAreas) || workAreas.length === 0) {
    return { ...state };
  }
  if (workAreas.some((area) => titleBarVisible(state, area))) return { ...state };
  const area = workAreas[0];
  return { ...state, x: area.x + 16, y: area.y + 16 };
}

function boundsForLaunch(saved, defaults, workAreas) {
  const state = keepSizeOnScreen(saved, workAreas);
  if (!state) {
    return { width: defaults.width, height: defaults.height, x: null, y: null, maximized: false, minimized: false };
  }
  return state;
}

module.exports = {
  windowStatePath,
  normalizeWindowState,
  readWindowState,
  writeWindowState,
  stateFromWindow,
  keepSizeOnScreen,
  boundsForLaunch,
};
