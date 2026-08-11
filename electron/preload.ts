// Preload seguro para la ventana Electron (contextIsolation = true)
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  platform: process.platform,
  print: (options?: { silent?: boolean }) => ipcRenderer.invoke('print', options),
});
