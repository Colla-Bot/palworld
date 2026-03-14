// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from "electron";
import { LauncherAPI } from "./renderer";

contextBridge.exposeInMainWorld("launcher", {
  start: () => ipcRenderer.send("start"),
  showMenu: () => ipcRenderer.send("show-menu"),
  onUpdateStatus: (callback: (status: string, progress: number) => void) =>
    ipcRenderer.on("update-status", (event, status, progress) =>
      callback(status, progress)
    ),
} as LauncherAPI);
