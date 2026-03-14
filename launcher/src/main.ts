import { Client } from "discord-rpc-patch";
import {
  app,
  dialog,
  ipcMain,
  net,
  shell,
  BrowserWindow,
  Menu,
} from "electron";
import started from "electron-squirrel-startup";
import md5file from "md5-file";
import { mkdirp } from "mkdirp";
import { DownloaderHelper, DownloadEndedStats } from "node-downloader-helper";
import { setExternalVBSLocation } from "regedit";
import { getAppPath } from "steam-path";
import {
  makeUserNotifier,
  updateElectronApp,
  UpdateSourceType,
} from "update-electron-app";
import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import util from "node:util";

interface FileEntry {
  path: string;
  md5: string;
}

interface Config {
  mumbleUrl: string;
  files: FileEntry[];
}

const LINK_PLUGIN = path.join(
  process.env.APPDATA || path.join(os.homedir(), "AppData/Roaming"),
  "Mumble/Mumble/Plugins/link.dll"
);
const MUMBLE_LOCAL_APP_DATA = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData/Local"),
  "Mumble/Mumble"
);
const MUMBLE_CONFIG = path.join(MUMBLE_LOCAL_APP_DATA, "mumble_settings.json");
const LINK_PLUGIN_HASH = crypto
  .createHash("sha1")
  .update(LINK_PLUGIN.replace(/\\/g, "/"))
  .digest("hex");

const DIST_URL = "https://.../";
const APP_NAME = "Palworld";
const SERVER_NAME = "팰월드";
const STEAM_APP_ID = 1623730;
const DISCORD_CLIENT_ID = "";
const MUMBLE_SETTINGS = {
  audio: {
    audio_quality: 192000,
    echo_cancel_mode: "Disabled",
    mute_cue_popup_shown: true,
    play_mute_cue: false,
    vad_max: 0.3,
    vad_min: 0.2,
  },
  misc: {
    viewed_server_ping_consent_message: true,
  },
  mumble_has_quit_normally: true,
  network: {
    auto_connect_to_last_server: true,
  },
  plugins: {
    [LINK_PLUGIN_HASH]: {
      enabled: true,
      keyboard_monitoring_allowed: false,
      path: LINK_PLUGIN.replace(/\\/g, "/"),
      positional_data_enabled: true,
    },
  },
  positional_audio: {
    bloom: 0.75,
    enable_positional_audio: true,
    maximum_distance: 50.0,
    transmit_position: true,
  },
  settings_version: 1,
  ui: {
    disable_public_server_list: true,
    send_usage_statistics: false,
    show_developer_menu: true,
  },
};

let CONFIG: Config | null = null;

const execFile = util.promisify(childProcess.execFile);

const downloadFile = async (
  url: string,
  dest: string,
  fileName: string | undefined,
  updateProgress: (progress: number) => void
) => {
  updateProgress(0);
  await mkdirp(dest);
  const dl = new DownloaderHelper(url, dest, {
    timeout: 10000,
    fileName,
    retry: { maxRetries: 5, delay: 1000 },
    override: true,
  });
  return new Promise<DownloadEndedStats>((resolve, reject) => {
    dl.on("error", reject);
    dl.on("end", resolve);
    dl.on("progress", (e) => e.progress && updateProgress(e.progress));
    dl.start().catch(reject);
  });
};

const writeMumbleConfig = async (config?: typeof MUMBLE_SETTINGS) => {
  await mkdirp(MUMBLE_LOCAL_APP_DATA);
  await fsPromises.writeFile(
    MUMBLE_CONFIG,
    `${JSON.stringify(config || MUMBLE_SETTINGS, null, 4)}\n`
  );
};

const findInstallPath = async (window: BrowserWindow) => {
  try {
    return (await getAppPath(STEAM_APP_ID)).path;
  } catch {}
  const { filePaths } = await dialog.showOpenDialog(window, {
    title: `${APP_NAME} 설치 경로를 선택해주세요`,
    properties: ["openDirectory"],
  });
  if (!filePaths.length) {
    throw new Error("No selected directories");
  }
  const installPath = filePaths[0];
  if (!fs.existsSync(path.join(installPath, `${APP_NAME}.exe`))) {
    throw new Error("Invalid install path");
  }
  return installPath;
};

app.disableHardwareAcceleration();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

setExternalVBSLocation(
  MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? "node_modules/regedit/vbs"
    : path.join(process.resourcesPath, "vbs")
);

Menu.setApplicationMenu(null);

updateElectronApp({
  updateSource: {
    type: UpdateSourceType.StaticStorage,
    baseUrl: `https://.../${process.platform}/${process.arch}`,
  },
  onNotifyUser: makeUserNotifier({
    title: "런처 업데이트",
    detail:
      "새 버전이 다운로드되었습니다. 업데이트를 적용하려면 런처를 다시 시작하세요.",
    restartButtonText: "다시 시작",
    laterButtonText: "나중에",
  }),
});

const createWindow = async () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#ffffff00",
      symbolColor: "#74b1be",
      height: 30,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  mainWindow.webContents.openDevTools();

  const updateStatus = (status: string, progress: number) => {
    mainWindow.webContents.send("update-status", status, progress);
  };

  ipcMain.on("start", async () => {
    if (!CONFIG) {
      return;
    }
    try {
      const mumbleInstallRequired = !fs.existsSync(MUMBLE_LOCAL_APP_DATA);
      if (mumbleInstallRequired) {
        const mumble = await downloadFile(
          "https://dl.mumble.info/latest/stable/client-windows-x64",
          path.join(app.getPath("userData"), "downloads"),
          "mumble.msi",
          (p) => updateStatus("Mumble 다운로드 중", p)
        );

        updateStatus("Mumble 설치 중", 0);
        await execFile("msiexec", ["/i", mumble.filePath, "/qr", "/norestart"]);

        updateStatus("Mumble 설치 중", 50);
        await writeMumbleConfig();
      }
      if (!fs.existsSync(LINK_PLUGIN)) {
        await mkdirp(path.dirname(LINK_PLUGIN));
        await fsPromises.copyFile(
          path.join(
            MAIN_WINDOW_VITE_DEV_SERVER_URL ? "." : process.resourcesPath,
            "resources/link.dll"
          ),
          LINK_PLUGIN
        );
      }

      if (!mumbleInstallRequired) {
        updateStatus("Mumble 설정 업데이트 중", 0);
        let config = JSON.parse(
          await fsPromises.readFile(MUMBLE_CONFIG, "utf-8")
        ) as typeof MUMBLE_SETTINGS;
        updateStatus("Mumble 설정 업데이트 중", 50);
        if (!config.plugins[LINK_PLUGIN_HASH]) {
          let { stdout } = await execFile("tasklist.exe", [
            "/fi",
            "Imagename eq mumble.exe",
          ]);
          while (stdout.includes("mumble.exe")) {
            await dialog.showMessageBox({
              type: "warning",
              message:
                "Mumble 설정 업데이트를 위해 Mumble을 종료한 후 확인 버튼을 눌러주세요.",
            });
            stdout = (
              await execFile("tasklist.exe", ["/fi", "Imagename eq mumble.exe"])
            ).stdout;
          }

          config = JSON.parse(
            await fsPromises.readFile(MUMBLE_CONFIG, "utf-8")
          );
          config.audio.audio_quality = MUMBLE_SETTINGS.audio.audio_quality;
          config.plugins["99aa2c48991115adde4912751b620178f63fc9ab"].enabled =
            false;
          config.plugins[LINK_PLUGIN_HASH] =
            MUMBLE_SETTINGS.plugins[LINK_PLUGIN_HASH];
          await writeMumbleConfig(config);
        }
      }

      updateStatus("Mumble 실행 중", 0);
      const url = new URL(CONFIG.mumbleUrl);
      if (url.protocol !== "mumble:") {
        throw new Error("Invalid URL");
      }
      await shell.openExternal(url.href);
      updateStatus("Mumble 실행 중", 100);

      if (mumbleInstallRequired) {
        await dialog.showMessageBox(mainWindow, {
          type: "info",
          message:
            "Mumble을 설정해 주세요. 설정이 끝나면 확인 버튼을 눌러주세요.",
        });
      }

      updateStatus("설치 경로 찾는 중", 0);
      const installPath = await findInstallPath(mainWindow);
      const totalFiles = CONFIG.files.length;
      for (let i = 0; i < totalFiles; i++) {
        const status = `파일 설치 중 (${i + 1}/${totalFiles})`;
        updateStatus(status, (i / totalFiles) * 100);
        const file = CONFIG.files[i];
        const filePath = path.join(installPath, file.path);
        if (
          !fs.existsSync(filePath) ||
          (await md5file(filePath)) !== file.md5
        ) {
          await downloadFile(
            `${DIST_URL}${file.path}`,
            path.dirname(filePath),
            path.basename(filePath),
            (p) => updateStatus(status, (i * 100 + p) / totalFiles)
          );
        }
      }

      try {
        const discordClient = new Client({ transport: "ipc" });
        discordClient.on("ready", () => {
          discordClient.setActivity({
            details: `${SERVER_NAME} 하는 중`,
            state: APP_NAME,
            largeImageKey: "large",
            largeImageText: SERVER_NAME,
            startTimestamp: new Date().getTime(),
            instance: false,
          });
        });
        await discordClient.login({ clientId: DISCORD_CLIENT_ID });
      } catch {}

      updateStatus(`${APP_NAME} 실행 중`, 0);
      await shell.openExternal(`steam://launch/${STEAM_APP_ID}`);
      updateStatus(`${APP_NAME} 실행 중`, 100);
    } catch (e) {
      updateStatus(e.name ? `${e.name}: ${e.message}` : `${e}`, -1);
    }
  });

  ipcMain.on("show-menu", (e) => {
    const window = BrowserWindow.fromWebContents(e.sender);
    const template = [
      {
        label: "Mumble 설정 초기화",
        click: async () => {
          await writeMumbleConfig();
          await dialog.showMessageBox(window, { message: "초기화되었습니다!" });
        },
      },
      {
        label: "패치 파일 삭제",
        click: async () => {
          const installPath = await findInstallPath(window);
          const totalFiles = CONFIG.files.length;
          for (let i = 0; i < totalFiles; i++) {
            updateStatus(
              `파일 삭제 중 (${i + 1}/${totalFiles})`,
              (i / totalFiles) * 100
            );
            const file = CONFIG.files[i];
            try {
              await fsPromises.rm(path.join(installPath, file.path), {
                force: true,
              });
            } catch {}
          }
          updateStatus("파일 삭제 완료", 100);
        },
      },
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window });
  });

  try {
    const res = await net.fetch(`${DIST_URL}config.json`);
    if (!res.ok) {
      throw new Error(`Failed to fetch config: ${res.status}`);
    }
    CONFIG = await res.json();
  } catch (e) {
    updateStatus(e.name ? `${e.name}: ${e.message}` : `${e}`, -1);
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("web-contents-created", (event, contents) => {
  contents.on("will-navigate", (e, navigationUrl) => {
    e.preventDefault();
  });
  contents.setWindowOpenHandler((details) => ({ action: "deny" }));
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
