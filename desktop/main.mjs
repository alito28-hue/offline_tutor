// Amara desktop app. It shows a setup screen, gets the models if they are missing, then opens the tutor.
import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const NEEDED_FREE_BYTES = 4e9;
// A download with no progress for this long has lost the connection, even if nothing reported an error.
const STALL_MS = 60_000;
const EXTERNAL_LINKS = ['https://www.linkedin.com/in/alexinteractive', 'https://amaratutor.org', 'https://amaratutor.org/feedback', 'https://amaratutor.org/es/feedback', 'https://amaratutor.org/pt/feedback'];
let win = null;
let tutorStarted = false;
let models = [];
let tutorUrl = null;

// The full kit carries the models inside the app. The small installer keeps them where the SDK downloads them.
const bundled = path.join(process.resourcesPath, 'models');
const modelDir = fs.existsSync(bundled) ? bundled : path.join(os.homedir(), '.qvac/models');

function isPresent(model) {
  if (!fs.existsSync(modelDir)) return false;
  return fs.readdirSync(modelDir).some(f => f.endsWith(model.modelId) && fs.statSync(path.join(modelDir, f)).size === model.expectedSize);
}

const send = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };

const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

async function startTutor() {
  if (tutorStarted) return;
  tutorStarted = true;
  send('setup', { state: 'loading' });
  const port = await freePort();
  process.env.TUTOR_PORT = String(port);
  process.env.TUTOR_DESKTOP = '1';
  process.env.TUTOR_MODEL_DIR = modelDir;
  tutorUrl = `http://127.0.0.1:${port}`;
  // Importing the server loads the models; it answers on the port before that finishes.
  import('../tutor/server.mjs').catch(err => {
    console.error(err);
    tutorStarted = false;
    send('setup', { state: 'failed', detail: err.message, windows: process.platform === 'win32' });
  });
  const waitReady = async () => {
    for (;;) {
      if (!tutorStarted) return;
      try {
        const status = await (await fetch(`${tutorUrl}/api/status`)).json();
        if (status.ready) return win?.loadURL(tutorUrl).catch(err => console.error(err));
      } catch { /* not listening yet */ }
      await new Promise(r => setTimeout(r, 300));
    }
  };
  waitReady();
}

async function download() {
  const missing = models.filter(m => !isPresent(m));
  const total = missing.reduce((sum, m) => sum + m.expectedSize, 0);
  fs.mkdirSync(modelDir, { recursive: true });
  if (fs.statfsSync(modelDir).bavail * fs.statfsSync(modelDir).bsize < NEEDED_FREE_BYTES) {
    return send('setup', { state: 'no-space' });
  }
  const { downloadAsset } = await import('@qvac/sdk');
  let done = 0;
  try {
    for (const model of missing) {
      await new Promise((resolve, reject) => {
        let timer;
        const fail = () => reject(new Error('download stalled'));
        const watch = () => { clearTimeout(timer); timer = setTimeout(fail, STALL_MS); };
        watch();
        downloadAsset({
          assetSrc: model,
          onProgress: ({ percentage }) => {
            watch();
            send('setup', { state: 'downloading', percent: Math.min(99, Math.floor(((done + model.expectedSize * percentage / 100) / total) * 100)) });
          },
        }).then(resolve, reject).finally(() => clearTimeout(timer));
      });
      done += model.expectedSize;
    }
  } catch (err) {
    console.error(err);
    return send('setup', { state: 'download-failed' });
  }
  if (models.every(isPresent)) return startTutor();
  send('setup', { state: 'download-failed' });
}

async function begin() {
  const { EMBEDDINGGEMMA_300M_Q8_0, QWEN3_4B_INST_Q4_K_M } = await import('@qvac/sdk');
  models = [QWEN3_4B_INST_Q4_K_M, EMBEDDINGGEMMA_300M_Q8_0];
  if (models.every(isPresent)) return startTutor();
  send('setup', { state: 'needs-download', gigabytes: (models.filter(m => !isPresent(m)).reduce((s, m) => s + m.expectedSize, 0) / 1e9).toFixed(1) });
}

const MOVE_TEXT = {
  en: { message: 'Move Amara to Applications?', detail: 'It runs much faster from there, and you can eject the disk or pendrive afterwards.', yes: 'Move', no: 'Not now' },
  es: { message: '¿Mover Amara a Aplicaciones?', detail: 'Desde ahí funciona mucho más rápido, y después podés expulsar el disco o el pendrive.', yes: 'Mover', no: 'Ahora no' },
  pt: { message: 'Mover a Amara para Aplicativos?', detail: 'De lá ela funciona muito mais rápido, e depois você pode ejetar o disco ou o pendrive.', yes: 'Mover', no: 'Agora não' },
};

// Opened straight from the disk image, the models load very slowly. One click moves the app and reopens it.
function offerMove() {
  if (process.platform !== 'darwin' || !app.isPackaged || app.isInApplicationsFolder() || process.env.AMARA_NO_MOVE) return;
  const text = MOVE_TEXT[app.getLocale().slice(0, 2)] || MOVE_TEXT.en;
  const choice = dialog.showMessageBoxSync({ type: 'question', message: text.message, detail: text.detail, buttons: [text.yes, text.no], defaultId: 0, cancelId: 1 });
  if (choice !== 0) return;
  try { app.moveToApplicationsFolder(); } catch (err) { console.error(err); }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600, show: false, backgroundColor: '#F6F8F5', title: 'Amara',
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once('ready-to-show', () => win.show());
  // The window only ever shows the setup screen and the local tutor.
  win.webContents.on('will-navigate', (event, url) => { if (url !== `${tutorUrl}/`) event.preventDefault(); });
  // The credit's two links open in the computer's browser; nothing else leaves the window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL_LINKS.includes(url.replace(/\/$/, ''))) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadFile(path.join(here, 'setup.html'));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.commandLine.appendSwitch('disable-background-networking');
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    // The tutor's pages can't reach anything beyond this computer.
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const local = details.url.startsWith('file:') || details.url.startsWith('http://127.0.0.1:') || details.url.startsWith('devtools:');
      callback({ cancel: !local });
    });
    ipcMain.handle('setup:ready', () => begin());
    ipcMain.handle('setup:download', () => download());
    ipcMain.handle('setup:locale', () => app.getLocale());
    ipcMain.handle('setup:quit', () => app.quit());
    app.setAboutPanelOptions({
      applicationName: 'Amara',
      applicationVersion: app.getVersion(),
      credits: 'Created by Alex Smith, with QVAC.\nlinkedin.com/in/alexinteractive\namaratutor.org',
      copyright: '© 2026 Alex Smith',
    });
    offerMove();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
  // The tutor server unloads the models and exits on this signal.
  app.on('before-quit', () => { if (tutorStarted) process.emit('SIGTERM'); });
}
