import { shouldQuit } from "./squirrel-startup";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (shouldQuit) {
  app.quit();
}

import { app, BrowserWindow } from "electron";
// Let Clippy's pop sound play on a timer without a preceding user gesture.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
import { loadElectronLlm } from "@electron/llm";
import { setupIpcListeners } from "./ipc";
import { createMainWindow, setupWindowListener } from "./windows";
import { getModelManager } from "./models";
import { setupAutoUpdater } from "./update";
import { setupAppMenu } from "./menu";
import { startRoaster } from "./roaster";

async function onReady() {
  console.info(`Welcome to Clippy v${app.getVersion()}`);

  await setupAutoUpdater();
  await loadLlm();
  setupAppMenu();
  setupIpcListeners();
  setupWindowListener();
  await createMainWindow();
  startRoaster();
}

async function loadLlm() {
  await loadElectronLlm({
    getModelPath: (modelAlias: string) => {
      console.info(
        `Loading model ${modelAlias} from ${getModelManager().getModelByName(modelAlias)?.path}`,
      );
      return getModelManager().getModelByName(modelAlias)?.path;
    },
  });
}

app.on("ready", onReady);

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
    createMainWindow();
  }
});
