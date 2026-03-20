// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, Data, ipcRenderer } from "electron";
import { IpcMessages } from "../ipc-messages";
import type { SharedState } from "../sharedState";

import type { ClippyApi } from "./clippyApi";
import { ChatWithMessages } from "../types/interfaces";
import { DebugState } from "../debugState";
import { BubbleView } from "./contexts/BubbleViewContext";

const clippyApi: ClippyApi = {
  // Window
  toggleChatWindow: () => ipcRenderer.invoke(IpcMessages.TOGGLE_CHAT_WINDOW),
  minimizeChatWindow: () =>
    ipcRenderer.invoke(IpcMessages.MINIMIZE_CHAT_WINDOW),
  maximizeChatWindow: () =>
    ipcRenderer.invoke(IpcMessages.MAXIMIZE_CHAT_WINDOW),
  onSetBubbleView(callback: (bubbleView: BubbleView) => void) {
    ipcRenderer.on(IpcMessages.SET_BUBBLE_VIEW, (_event, bubbleView) =>
      callback(bubbleView),
    );
  },
  offSetBubbleView() {
    ipcRenderer.removeAllListeners(IpcMessages.SET_BUBBLE_VIEW);
  },
  popupAppMenu: () => ipcRenderer.invoke(IpcMessages.POPUP_APP_MENU),

  // Models
  updateModelState: () =>
    ipcRenderer.invoke(IpcMessages.STATE_UPDATE_MODEL_STATE),
  downloadModelByName: (name: string) =>
    ipcRenderer.invoke(IpcMessages.DOWNLOAD_MODEL_BY_NAME, name),
  deleteModelByName: (name: string) =>
    ipcRenderer.invoke(IpcMessages.DELETE_MODEL_BY_NAME, name),
  removeModelByName: (name: string) =>
    ipcRenderer.invoke(IpcMessages.REMOVE_MODEL_BY_NAME, name),
  deleteAllModels: () => ipcRenderer.invoke(IpcMessages.DELETE_ALL_MODELS),
  addModelFromFile: () => ipcRenderer.invoke(IpcMessages.ADD_MODEL_FROM_FILE),

  // State
  getFullState: () => ipcRenderer.invoke(IpcMessages.STATE_GET_FULL),
  getState: (key: string) => ipcRenderer.invoke(IpcMessages.STATE_GET, key),
  setState: (key: string, value: any) =>
    ipcRenderer.invoke(IpcMessages.STATE_SET, key, value),
  openStateInEditor: () => ipcRenderer.invoke(IpcMessages.STATE_OPEN_IN_EDITOR),
  onStateChanged: (callback: (state: SharedState) => void) => {
    ipcRenderer.on(IpcMessages.STATE_CHANGED, (_event, state: SharedState) =>
      callback(state),
    );
  },
  offStateChanged: () => {
    ipcRenderer.removeAllListeners(IpcMessages.STATE_CHANGED);
  },

  // Debug
  getFullDebugState: () => ipcRenderer.invoke(IpcMessages.DEBUG_STATE_GET_FULL),
  getDebugState: (key: string) =>
    ipcRenderer.invoke(IpcMessages.DEBUG_STATE_GET, key),
  setDebugState: (key: string, value: any) =>
    ipcRenderer.invoke(IpcMessages.DEBUG_STATE_SET, key, value),
  openDebugStateInEditor: () =>
    ipcRenderer.invoke(IpcMessages.DEBUG_STATE_OPEN_IN_EDITOR),
  onDebugStateChanged: (callback: (state: DebugState) => void) => {
    ipcRenderer.on(
      IpcMessages.DEBUG_STATE_CHANGED,
      (_event, state: DebugState) => callback(state),
    );
  },
  offDebugStateChanged: () => {
    ipcRenderer.removeAllListeners(IpcMessages.DEBUG_STATE_CHANGED);
  },
  getDebugInfo: () => ipcRenderer.invoke(IpcMessages.DEBUG_GET_DEBUG_INFO),

  // Chats
  getChatRecords: () => ipcRenderer.invoke(IpcMessages.CHAT_GET_CHAT_RECORDS),
  getChatWithMessages: (chatId: string) =>
    ipcRenderer.invoke(IpcMessages.CHAT_GET_CHAT_WITH_MESSAGES, chatId),
  writeChatWithMessages: (chatWithMessages: ChatWithMessages) =>
    ipcRenderer.invoke(
      IpcMessages.CHAT_WRITE_CHAT_WITH_MESSAGES,
      chatWithMessages,
    ),
  deleteChat: (chatId: string) =>
    ipcRenderer.invoke(IpcMessages.CHAT_DELETE_CHAT, chatId),
  deleteAllChats: () => ipcRenderer.invoke(IpcMessages.CHAT_DELETE_ALL_CHATS),
  onNewChat: (callback: () => void) => {
    ipcRenderer.on(IpcMessages.CHAT_NEW_CHAT, callback);
  },
  offNewChat: () => {
    ipcRenderer.removeAllListeners(IpcMessages.CHAT_NEW_CHAT);
  },
  exportChatForClaude: (chatWithMessages: ChatWithMessages) =>
    ipcRenderer.invoke(IpcMessages.CHAT_EXPORT_FOR_CLAUDE, chatWithMessages),

  // App
  getVersions: () => ipcRenderer.invoke(IpcMessages.APP_GET_VERSIONS),
  checkForUpdates: () => ipcRenderer.invoke(IpcMessages.APP_CHECK_FOR_UPDATES),

  // Clipboard
  clipboardWrite: (data: Data) =>
    ipcRenderer.invoke(IpcMessages.CLIPBOARD_WRITE, data),
};

contextBridge.exposeInMainWorld("clippy", clippyApi);
