import { contextBridge, ipcRenderer } from "electron";
const bridge = {
  invoke(channel, ...args) {
    return ipcRenderer.invoke(channel, ...args);
  },
  on(channel, listener) {
    const wrapped = (_event, data) => listener(data);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.off(channel, wrapped);
    };
  },
  send(channel, ...args) {
    ipcRenderer.send(channel, ...args);
  }
};
contextBridge.exposeInMainWorld("praxis", bridge);
