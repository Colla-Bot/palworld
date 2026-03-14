/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/application-architecture#main-and-renderer-processes
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.ts` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

export interface LauncherAPI {
  start(): void;
  showMenu(): void;
  onUpdateStatus(cb: (status: string, progress: number) => void): void;
}

declare global {
  interface Window {
    launcher: LauncherAPI;
  }
}

import "./index.css";

const error = document.getElementById("error");
const start = document.getElementById("start");
const progressBar = document.getElementById("progress-bar");
const label = document.getElementById("label");

window.launcher.onUpdateStatus((status: string, progress: number) => {
  start.classList.add("progress");
  if (progress < 0) {
    label.textContent = "오류가 발생했습니다!";
    error.textContent = status;
  } else {
    label.textContent = status;
    progressBar.style.strokeDashoffset = `${(1 - progress / 100) * 126}px`;
  }
});
start.addEventListener("click", () => {
  window.launcher.start();
});
start.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  window.launcher.showMenu();
});
