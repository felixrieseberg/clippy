import { clipboard, Data, ipcMain } from "electron";
import {
  toggleChatWindow,
  maximizeChatWindow,
  minimizeChatWindow,
} from "./windows";
import { IpcMessages } from "../ipc-messages";
import { roastNow } from "./roaster";
import { ensureScreenRecordingPermission } from "./permissions";
import { getModelManager } from "./models";
import { getStateManager } from "./state";
import { getChatManager } from "./chats";
import { ChatWithMessages } from "../types/interfaces";
import { getMainAppMenu } from "./menu";
import { checkForUpdates } from "./update";
import { getVersions } from "./helpers/getVersions";
import { getClippyDebugInfo } from "./debug-clippy";
import { getDebugManager } from "./debug";

export function setupIpcListeners() {
  // Window
  ipcMain.handle(IpcMessages.TOGGLE_CHAT_WINDOW, () => toggleChatWindow());
  ipcMain.handle(IpcMessages.MINIMIZE_CHAT_WINDOW, () => minimizeChatWindow());
  ipcMain.handle(IpcMessages.MAXIMIZE_CHAT_WINDOW, () => maximizeChatWindow());
  ipcMain.handle(IpcMessages.POPUP_APP_MENU, () => getMainAppMenu().popup());

  // Roaster
  ipcMain.handle(IpcMessages.ROAST_NOW, () => roastNow());

  // Permissions
  ipcMain.handle(IpcMessages.ENSURE_SCREEN_PERMISSION, () =>
    ensureScreenRecordingPermission(),
  );

  // App
  ipcMain.handle(IpcMessages.APP_CHECK_FOR_UPDATES, () => checkForUpdates());
  ipcMain.handle(IpcMessages.APP_GET_VERSIONS, () => getVersions());

  // Model
  ipcMain.handle(IpcMessages.DOWNLOAD_MODEL_BY_NAME, (_, name: string) =>
    getModelManager().downloadModelByName(name),
  );
  ipcMain.handle(IpcMessages.REMOVE_MODEL_BY_NAME, (_, name: string) =>
    getModelManager().removeModelByName(name),
  );
  ipcMain.handle(IpcMessages.DELETE_MODEL_BY_NAME, (_, name: string) =>
    getModelManager().deleteModelByName(name),
  );
  ipcMain.handle(IpcMessages.DELETE_ALL_MODELS, () =>
    getModelManager().deleteAllModels(),
  );
  ipcMain.handle(IpcMessages.ADD_MODEL_FROM_FILE, () =>
    getModelManager().addModelFromFile(),
  );

  // State
  ipcMain.handle(IpcMessages.STATE_UPDATE_MODEL_STATE, () =>
    getStateManager().updateModelState(),
  );
  ipcMain.handle(
    IpcMessages.STATE_GET_FULL,
    () => getStateManager().store.store,
  );
  ipcMain.handle(IpcMessages.STATE_SET, (_, key: string, value: any) =>
    getStateManager().store.set(key, value),
  );
  ipcMain.handle(IpcMessages.STATE_GET, (_, key: string) =>
    getStateManager().store.get(key),
  );
  ipcMain.handle(IpcMessages.STATE_OPEN_IN_EDITOR, () =>
    getStateManager().store.openInEditor(),
  );

  // Debug
  ipcMain.handle(
    IpcMessages.DEBUG_STATE_GET_FULL,
    () => getDebugManager().store.store,
  );
  ipcMain.handle(IpcMessages.DEBUG_STATE_SET, (_, key: string, value: any) =>
    getDebugManager().store.set(key, value),
  );
  ipcMain.handle(IpcMessages.DEBUG_STATE_GET, (_, key: string) =>
    getDebugManager().store.get(key),
  );
  ipcMain.handle(IpcMessages.DEBUG_STATE_OPEN_IN_EDITOR, () =>
    getDebugManager().store.openInEditor(),
  );
  ipcMain.handle(IpcMessages.DEBUG_GET_DEBUG_INFO, () => getClippyDebugInfo());

  // Chat
  ipcMain.handle(IpcMessages.CHAT_GET_CHAT_RECORDS, () =>
    getChatManager().getChats(),
  );
  ipcMain.handle(IpcMessages.CHAT_GET_CHAT_WITH_MESSAGES, (_, chatId: string) =>
    getChatManager().getChatWithMessages(chatId),
  );
  ipcMain.handle(
    IpcMessages.CHAT_WRITE_CHAT_WITH_MESSAGES,
    (_, chatWithMessages: ChatWithMessages) =>
      getChatManager().writeChatWithMessages(chatWithMessages),
  );
  ipcMain.handle(IpcMessages.CHAT_DELETE_CHAT, (_, chatId: string) =>
    getChatManager().deleteChat(chatId),
  );
  ipcMain.handle(IpcMessages.CHAT_DELETE_ALL_CHATS, () =>
    getChatManager().deleteAllChats(),
  );

  // Clipboard
  ipcMain.handle(IpcMessages.CLIPBOARD_WRITE, (_, data: Data) =>
    clipboard.write(data, "clipboard"),
  );
}
