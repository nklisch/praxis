import type { PraxisIpcBridge } from "@praxis/client";
import { contextBridge, ipcRenderer } from "electron";

/**
 * Expose the typed Praxis IPC bridge to the renderer via contextBridge.
 * The renderer accesses this as `window.praxis`.
 *
 * Security: contextIsolation: true, sandbox: true.
 * Only specific channels are exposed — no raw ipcRenderer.
 */
const bridge: PraxisIpcBridge = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    return ipcRenderer.invoke(channel, ...args);
  },

  on(channel: string, listener: (data: unknown) => void): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, data: unknown) => listener(data);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.off(channel, wrapped);
    };
  },

  send(channel: string, ...args: unknown[]): void {
    ipcRenderer.send(channel, ...args);
  },
};

contextBridge.exposeInMainWorld("praxis", bridge);
