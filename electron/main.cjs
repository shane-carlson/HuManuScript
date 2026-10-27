const { app, BrowserWindow, dialog, screen, shell, ipcMain, session, desktopCapturer } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { shouldCheckForUpdates, watchForUpdates } = require('./autoUpdate.cjs');
const {
  boundsForLaunch,
  stateFromWindow,
  windowStatePath,
  writeWindowState,
  readWindowState,
} = require('./windowBounds.cjs');
const {
  chooseCloudRoot,
  discoverCloudRoots,
  isCloudBackupFilename,
  isCloudProviderId,
  listBackupFiles,
  readBackupFile,
  writeBackupFile,
} = require('./cloudFolders.cjs');

const CLOUD_LABELS = {
  'google-drive': 'Google Drive',
  onedrive: 'OneDrive',
  box: 'Box',
  dropbox: 'Dropbox',
  icloud: 'iCloud Drive',
  mega: 'MEGA',
  pcloud: 'pCloud',
};

const isDev = process.env.ELECTRON === '1' || !app.isPackaged;

app.setName('HuManuScript');

function readBakedVersion() {
  try {
    const info = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'build', 'app-version.json'), 'utf8'));
    if (!info || typeof info.version !== 'string') throw new Error('missing version');
    const build = typeof info.build === 'string' ? info.build : 'dev';
    const label =
      typeof info.label === 'string' && info.label
        ? info.label
        : build === 'dev'
          ? `${info.version} (${build})`
          : info.version;
    return { version: info.version, build, label };
  } catch {
    return { version: '0.1.0', build: 'dev', label: '0.1.0 (dev)' };
  }
}

const DEFAULT_WINDOW = { width: 1280, height: 860 };

function createWindow(baked) {
  const saved = readWindowState(fs, windowStatePath(app.getPath('userData')));
  const launch = boundsForLaunch(
    saved,
    DEFAULT_WINDOW,
    screen.getAllDisplays().map((display) => display.workArea),
  );
  const win = new BrowserWindow({
    width: launch.width,
    height: launch.height,
    ...(launch.x == null || launch.y == null ? {} : { x: launch.x, y: launch.y }),
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: `HuManuScript ${baked.label}`,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  const restoreWindow = () => {
    if (launch.maximized) win.maximize();
    else if (launch.minimized) win.minimize();
    win.show();
  };
  win.once('ready-to-show', restoreWindow);
  win.on('close', () => {
    const normal = typeof win.getNormalBounds === 'function' ? win.getNormalBounds() : win.getBounds();
    const state = stateFromWindow({
      bounds: win.getBounds(),
      normalBounds: normal,
      maximized: win.isMaximized(),
      minimized: win.isMinimized(),
    });
    if (state) writeWindowState(fs, windowStatePath(app.getPath('userData')), state);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    void win.loadURL('http://127.0.0.1:47321');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

ipcMain.handle('humanuscript:device-name', () => {
  const name = os.hostname();
  return typeof name === 'string' ? name.trim() : '';
});

function askConsent(parent, message, detail) {
  const options = {
    type: 'question',
    buttons: ["Don't allow", 'Allow'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: 'HuManuScript',
    message,
    detail,
  };
  const pending = parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options);
  return pending.then(({ response }) => response === 1);
}

function cloudChoicesPath() {
  return path.join(app.getPath('userData'), 'cloud-folders.json');
}

function readCloudChoices() {
  try {
    const parsed = JSON.parse(fs.readFileSync(cloudChoicesPath(), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCloudChoice(provider, folder) {
  const choices = readCloudChoices();
  choices[provider] = folder;
  fs.mkdirSync(path.dirname(cloudChoicesPath()), { recursive: true });
  fs.writeFileSync(cloudChoicesPath(), JSON.stringify(choices));
}

async function cloudRootFor(provider) {
  if (!isCloudProviderId(provider)) throw new Error('Unknown cloud drive.');
  const label = CLOUD_LABELS[provider] || 'cloud drive';
  const saved = readCloudChoices()[provider];
  const discovered = discoverCloudRoots({
    home: app.getPath('home'),
    platform: process.platform,
    env: process.env,
    fs,
  });
  const chosen = chooseCloudRoot(discovered[provider], typeof saved === 'string' ? saved : '', saved && fs.existsSync(saved));
  if (chosen) return chosen;
  const parent = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(parent ?? undefined, {
    title: `Choose your ${label} folder`,
    message: `HuManuScript keeps backups in a HuManuScript folder inside ${label}.`,
    buttonLabel: 'Use this folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  const folder = result.filePaths[0];
  if (result.canceled || !folder) throw new Error(`${label} folder was not chosen.`);
  writeCloudChoice(provider, folder);
  return folder;
}

function cloudFilename(filename) {
  if (!isCloudBackupFilename(filename)) throw new Error('Unexpected backup name.');
  return filename;
}

ipcMain.handle('humanuscript:cloud-save', async (_event, provider, filename, contents) => {
  if (typeof contents !== 'string' || contents.length > 80_000_000) throw new Error('Backup could not be written.');
  const root = await cloudRootFor(provider);
  writeBackupFile({ fs, root, filename: cloudFilename(filename), contents });
  return CLOUD_LABELS[provider] || 'cloud drive';
});

ipcMain.handle('humanuscript:cloud-list', async (_event, provider) => {
  const root = await cloudRootFor(provider);
  return listBackupFiles({ fs, root });
});

ipcMain.handle('humanuscript:cloud-read', async (_event, provider, filename) => {
  const root = await cloudRootFor(provider);
  return readBackupFile({ fs, root, filename: cloudFilename(filename) });
});

function startAutoUpdate(baked) {
  if (!shouldCheckForUpdates({ isPackaged: app.isPackaged, build: baked.build })) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require('./autoUpdate.bundle.cjs'));
  } catch {
    console.error('Auto-update is unavailable.');
    return;
  }
  watchForUpdates(autoUpdater, (line) => {
    console.log(line);
  });
}

app.whenReady().then(() => {
  const ses = session.defaultSession;
  // Camera: the permission request is the consent dialog. Screen capture uses the
  // system picker when the OS has one, otherwise a chooser that never auto-selects.
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      const parent = BrowserWindow.fromWebContents(webContents) ?? undefined;
      void askConsent(
        parent,
        'Allow HuManuScript to take a picture with the camera?',
        'This prompt appears only while camera pictures are turned on. The picture is stored as a low-resolution thumbnail.',
      ).then(callback, () => callback(false));
      return;
    }
    if (permission === 'display-capture') {
      callback(true);
      return;
    }
    if (permission === 'clipboard-sanitized-write' || permission === 'fullscreen' || permission === 'pointerLock') {
      callback(true);
      return;
    }
    callback(false);
  });

  ses.setDisplayMediaRequestHandler((_request, callback) => {
    const parent = BrowserWindow.getFocusedWindow() ?? undefined;
    desktopCapturer
      .getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })
      .then(async (sources) => {
        if (!sources.length) {
          callback(null);
          return;
        }
        const shown = sources.slice(0, 6);
        const options = {
          type: 'question',
          buttons: ["Don't share", ...shown.map((source) => (source.name || 'Untitled').slice(0, 48))],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
          title: 'Screenshot',
          message: 'Share a screen or window for this session thumbnail?',
          detail: "HuManuScript only asks because screenshots are turned on. Don't share stores nothing.",
        };
        const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
        if (response <= 0 || !shown[response - 1]) {
          callback(null);
          return;
        }
        callback({ video: shown[response - 1] });
      })
      .catch(() => callback(null));
  }, { useSystemPicker: true });

  const baked = readBakedVersion();
  createWindow(baked);
  startAutoUpdate(baked);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(readBakedVersion());
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
