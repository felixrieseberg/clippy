import {
  BrowserWindow,
  dialog,
  Menu,
  MenuItem,
  MenuItemConstructorOptions,
  shell,
} from "electron";
import { getLogger } from "./logger";
import { FileTransport } from "electron-log";
import { getStateManager } from "./state";

import type { BubbleView } from "../renderer/contexts/BubbleViewContext";
import { getMainWindow } from "./windows";
import { IpcMessages } from "../ipc-messages";
import { roastNow } from "./roaster";
import {
  closeInspector,
  getIsInspectorEnabled,
  openInspector,
} from "./debugger";

/**
 * Setup the application menu
 */
export function setupAppMenu() {
  Menu.setApplicationMenu(getMainAppMenu());
}

/**
 * Popup the application menu
 *
 * @param options {Electron.PopupOptions} Options for the popup
 */
export function popupAppMenu(options: Electron.PopupOptions = {}) {
  getMainAppMenu().popup(options);
}

/**
 * Setup the application menu
 */
export function getMainAppMenu(): Menu {
  const isMac = process.platform === "darwin";

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([{ role: "appMenu", id: "appMenu" }] as MenuItemConstructorOptions[])
      : []),
    {
      label: "File",
      submenu: getFileMenu(),
    },
    { role: "editMenu" },
    { label: "View", submenu: getViewMenu() },
    {
      role: "windowMenu",
      id: "windowMenu",
    },
    { role: "help", submenu: getHelpMenu() },
  ];
  const menu = Menu.buildFromTemplate(template);

  // Insert app menu options
  if (isMac) {
    const appMenu = menu.getMenuItemById("appMenu");
    appMenu?.submenu?.insert(2, new MenuItem({ type: "separator" }));
    appMenu?.submenu?.insert(3, getSettingsMenuItem());
    appMenu?.submenu?.insert(4, new MenuItem({ type: "separator" }));
  }

  // Insert window options
  const windowMenu = menu.getMenuItemById("windowMenu");
  windowMenu?.submenu?.append(new MenuItem({ type: "separator" }));
  windowMenu?.submenu?.append(
    new MenuItem({
      label: "Always Show Clippy on Top",
      type: "checkbox",
      checked: getStateManager().store.get("settings").clippyAlwaysOnTop,
      click: (menuItem) => {
        getStateManager().store.set(
          "settings.clippyAlwaysOnTop",
          menuItem.checked,
        );
      },
    }),
  );
  windowMenu?.submenu?.append(
    new MenuItem({
      type: "separator",
    }),
  );
  windowMenu?.submenu?.append(
    new MenuItem({
      label: "Sober Mode (shut him up)",
      type: "checkbox",
      checked: getStateManager().store.get("settings").soberMode,
      click: (menuItem) => {
        getStateManager().store.set("settings.soberMode", menuItem.checked);
      },
    }),
  );
  windowMenu?.submenu?.append(
    new MenuItem({
      label: "Play Sound When Clippy Speaks",
      type: "checkbox",
      checked: getStateManager().store.get("settings").soundEnabled !== false,
      click: (menuItem) => {
        getStateManager().store.set("settings.soundEnabled", menuItem.checked);
      },
    }),
  );
  windowMenu?.submenu?.append(
    new MenuItem({
      label: "Say Something",
      click: () => roastNow(),
      accelerator: "Cmd+`",
    }),
  );

  return menu;
}

function getFileMenu(): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [{ role: "close" }];

  if (process.platform === "win32") {
    template.push(
      { type: "separator" },
      {
        label: "Settings",
        click: () => openView("settings-appearance"),
        accelerator: "CmdOrCtrl+,",
      },
    );
  }

  return template;
}

function getViewMenu(): MenuItemConstructorOptions[] {
  return [
    {
      label: "Settings",
      click: () => openView("settings-appearance"),
    },
    { type: "separator" },
    { role: "toggleDevTools" },
    { type: "separator" },
    { role: "resetZoom" },
    { role: "zoomIn" },
    { role: "zoomOut" },
  ];
}

function getSettingsMenuItem(): MenuItem {
  return new MenuItem({
    label: "Settings",
    submenu: Menu.buildFromTemplate([
      {
        label: "Options",
        click: () => openView("settings-appearance"),
        accelerator: "CmdOrCtrl+,",
      },
      {
        label: "About",
        click: () => openView("settings-about"),
      },
    ]),
  });
}

function getHelpMenu(): MenuItemConstructorOptions[] {
  return [
    {
      label: "Clippy's Revenge on GitHub",
      click: () => {
        shell.openExternal("https://github.com/lucaswhitman/clippys-revenge");
      },
    },
    {
      label: "Report an Issue",
      click: () => {
        shell.openExternal(
          "https://github.com/lucaswhitman/clippys-revenge/issues",
        );
      },
    },
    {
      label: "Based on Clippy by Felix Rieseberg",
      click: () => {
        shell.openExternal("https://github.com/felixrieseberg/clippy");
      },
    },
    {
      type: "separator",
    },
    {
      label: "Open All Developer Tools",
      click: () => {
        const windows = BrowserWindow.getAllWindows();
        for (const window of windows) {
          window.webContents.openDevTools({ mode: "detach" });
        }
      },
    },
    {
      label: "Enable Main Process Debugger",
      type: "checkbox",
      checked: getIsInspectorEnabled(),
      click: () => {
        getIsInspectorEnabled() ? closeInspector() : openInspector();
      },
    },
    {
      type: "separator",
    },
    {
      label: "Open Logs",
      click: () => {
        try {
          const fileTransport = getLogger().transports.file as FileTransport;
          const logPath = fileTransport.getFile();

          if (logPath?.path) {
            getLogger().info("Opening logs at", logPath.path);
            shell.showItemInFolder(logPath.path);
          }
        } catch (error) {
          getLogger().error("Failed to open logs", error);
          dialog.showMessageBox({
            type: "error",
            title: "Error",
            message: `Failed to open logs. The error was: ${error}. I'd normally tell you to check the logs for more details, but... well, you can't.`,
          });
        }
      },
    },
  ];
}

function openView(view: BubbleView) {
  getMainWindow()?.webContents.send(IpcMessages.SET_BUBBLE_VIEW, view);
}
