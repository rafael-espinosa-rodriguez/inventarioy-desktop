// Proceso principal de Electron (InventarioY Desktop)
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { initDatabase, getDataDir } from './db';
import { createServer } from './server';

const DEFAULT_PORT = 4173;
let mainWindow: BrowserWindow | null = null;
let server: any = null;

const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  app.quit();
}

function getPort(): number {
  const envPort = Number(process.env.INVENTARIOY_PORT);
  if (!Number.isNaN(envPort) && envPort > 0 && envPort < 65536) return envPort;
  return DEFAULT_PORT;
}

function createWindow(url: string): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    title: 'InventarioY',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: !!process.env.INVENTARIOY_DEV,
    },
  });

  mainWindow.loadURL(url);

  mainWindow.maximize();

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

async function start(): Promise<void> {
  await app.whenReady();

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  const port = getPort();

  // IPC: impresión (usado por TicketView vía preload)
  ipcMain.handle('print', async (_event, options) => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    if (!win) return { ok: false, error: 'Sin ventana' };
    try {
      await win.webContents.print({ silent: true, printBackground: true, ...options });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message };
    }
  });

  try {
    initDatabase(app.getPath('userData'));
    console.log(`[desktop] Base de datos en: ${getDataDir()}`);
  } catch (e: any) {
    console.error('[desktop] Error inicializando BD:', e?.message);
    app.quit();
    return;
  }

  const isDev = !!process.env.INVENTARIOY_DEV;
  const devUrl = process.env.INVENTARIOY_DEV_URL || 'http://127.0.0.1:3000';
  const staticDir = isDev ? '' : path.join(app.getAppPath(), 'dist');

  try {
    server = await createServer({
      port,
      host: '0.0.0.0',
      staticDir,
      appPath: app.getAppPath(),
    });
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`[desktop] Servidor local en http://0.0.0.0:${port}`);
  } catch (e: any) {
    console.error('[desktop] Error iniciando servidor:', e?.message);
    app.quit();
    return;
  }

  if (isDev) {
    createWindow(devUrl);
  } else {
    createWindow(`http://127.0.0.1:${port}`);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (isDev) createWindow(devUrl);
      else createWindow(`http://127.0.0.1:${port}`);
    }
  });
}

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  try { server?.close(); } catch { /* ignore */ }
});

start().catch((err) => {
  console.error('[desktop] Fatal:', err);
  app.quit();
});
