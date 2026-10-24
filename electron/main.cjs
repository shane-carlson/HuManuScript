const { app, BrowserWindow, shell, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { shouldCheckForUpdates, watchForUpdates } = require('./autoUpdate.cjs');

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

function createWindow(baked) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: `HuManuScript ${baked.label}`,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
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
