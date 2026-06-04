import { ElectronLlmRenderer } from "@electron/llm";
import { SharedState } from "../sharedState";
import {
  ChatRecord,
  ChatWithMessages,
  ClippyDebugInfo,
  Versions,
} from "../types/interfaces";
import { DebugState } from "../debugState";

import type { BubbleView } from "./contexts/BubbleViewContext";
import type { RoastContext } from "../ipc-messages";
import { Data } from "electron";

export type ClippyApi = {
  // Window
  toggleChatWindow: () => Promise<void>;
  minimizeChatWindow: () => Promise<void>;
  maximizeChatWindow: () => Promise<void>;
  onSetBubbleView: (callback: (bubbleView: BubbleView) => void) => void;
  offSetBubbleView: () => void;
  popupAppMenu: () => void;
  // Models
  updateModelState: () => Promise<void>;
  downloadModelByName: (name: string) => Promise<void>;
  removeModelByName: (name: string) => Promise<void>;
  deleteModelByName: (name: string) => Promise<boolean>;
  deleteAllModels: () => Promise<boolean>;
  addModelFromFile: () => Promise<void>;
  // State
  offStateChanged: () => void;
  onStateChanged: (callback: (state: SharedState) => void) => void;
  getFullState: () => Promise<SharedState>;
  getState: (key: string) => Promise<any>;
  setState: (key: string, value: any) => Promise<void>;
  openStateInEditor: () => Promise<void>;
  // Debug
  offDebugStateChanged: () => void;
  onDebugStateChanged: (callback: (state: DebugState) => void) => void;
  getFullDebugState: () => Promise<DebugState>;
  getDebugState: (key: string) => Promise<any>;
  setDebugState: (key: string, value: any) => Promise<void>;
  openDebugStateInEditor: () => Promise<void>;
  getDebugInfo(): Promise<ClippyDebugInfo>;
  // App
  getVersions: () => Promise<Versions>;
  checkForUpdates: () => Promise<void>;
  // Chats
  getChatRecords: () => Promise<Record<string, ChatRecord>>;
  getChatWithMessages: (chatId: string) => Promise<ChatWithMessages | null>;
  writeChatWithMessages: (chatWithMessages: ChatWithMessages) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  deleteAllChats: () => Promise<void>;
  onNewChat: (callback: () => void) => void;
  offNewChat: () => void;
  // Roaster
  onRoastContext: (callback: (context: RoastContext) => void) => void;
  offRoastContext: () => void;
  roastNow: () => Promise<void>;
  roastSpoken: (line: string) => Promise<void>;
  getRoastContext: () => Promise<RoastContext>;
  clearMemory: () => Promise<void>;
  generateCloud: (systemPrompt: string, userPrompt: string) => Promise<string>;
  // Permissions
  ensureScreenPermission: () => Promise<void>;
  // Clipboard
  clipboardWrite: (data: Data) => Promise<void>;
};

declare global {
  interface Window {
    electronAi: ElectronLlmRenderer;
    clippy: ClippyApi;
  }
}

export const clippyApi = window["clippy"];
export const electronAi = window["electronAi"];
