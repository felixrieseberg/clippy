export const IpcMessages = {
  // Window messages
  TOGGLE_CHAT_WINDOW: "clippy_toggle_chat_window",
  MINIMIZE_CHAT_WINDOW: "clippy_minimize_chat_window",
  MAXIMIZE_CHAT_WINDOW: "clippy_maximize_chat_window",
  SET_BUBBLE_VIEW: "clippy_set_bubble_view",
  POPUP_APP_MENU: "clippy_popup_app_menu",

  // Model messages
  DOWNLOAD_MODEL_BY_NAME: "clippy_download_model_by_name",
  REMOVE_MODEL_BY_NAME: "clippy_remove_model_by_name",
  DELETE_MODEL_BY_NAME: "clippy_delete_model_by_name",
  DELETE_ALL_MODELS: "clippy_delete_all_models",
  ADD_MODEL_FROM_FILE: "clippy_add_model_from_file",

  // State messages
  STATE_UPDATE_MODEL_STATE: "clippy_state_update_model_state",
  STATE_CHANGED: "clippy_state_changed",
  STATE_GET_FULL: "clippy_state_get_full",
  STATE_GET: "clippy_state_get",
  STATE_SET: "clippy_state_set",
  STATE_OPEN_IN_EDITOR: "clippy_state_open_in_editor",

  // Debug messages
  DEBUG_STATE_GET_FULL: "clippy_debug_state_get_full",
  DEBUG_STATE_GET: "clippy_debug_state_get",
  DEBUG_STATE_SET: "clippy_debug_state_set",
  DEBUG_STATE_CHANGED: "clippy_debug_state_changed",
  DEBUG_STATE_OPEN_IN_EDITOR: "clippy_debug_state_open_in_editor",
  DEBUG_GET_DEBUG_INFO: "clippy_debug_get_debug_info",

  // App messages
  APP_CHECK_FOR_UPDATES: "clippy_app_check_for_updates",
  APP_GET_VERSIONS: "clippy_app__get_versions",

  // Chat messages
  CHAT_GET_CHAT_RECORDS: "clippy_chat_get_chat_records",
  CHAT_GET_CHAT_WITH_MESSAGES: "clippy_chat_get_chat_with_messages",
  CHAT_WRITE_CHAT_WITH_MESSAGES: "clippy_chat_write_chat_with_messages",
  CHAT_DELETE_CHAT: "clippy_chat_delete_chat",
  CHAT_DELETE_ALL_CHATS: "clippy_chat_delete_all_chats",
  CHAT_NEW_CHAT: "clippy_chat_new_chat",

  // Roaster (main -> renderer: here's what the user is doing, go heckle them)
  ROAST_CONTEXT: "clippy_roast_context",
  // Roaster (renderer -> main: roast right now, e.g. user clicked Clippy)
  ROAST_NOW: "clippy_roast_now",
  // Roaster (renderer -> main: here's the line he just said, remember it)
  ROAST_SPOKEN: "clippy_roast_spoken",
  // Roaster (renderer -> main: give me the freshest context, right before I
  // generate — so the roast reflects what they're doing NOW, post model-load)
  GET_ROAST_CONTEXT: "clippy_get_roast_context",
  // Memory (renderer -> main: forget everything he's learned/said)
  CLEAR_MEMORY: "clippy_clear_memory",
  // Cloud brain (renderer -> main: generate a roast via the user's Claude key)
  GENERATE_CLOUD: "clippy_generate_cloud",
  // Permissions (renderer -> main: ask macOS for Screen Recording so Clippy
  // can read window titles)
  ENSURE_SCREEN_PERMISSION: "clippy_ensure_screen_permission",

  // Clipboard
  CLIPBOARD_WRITE: "clippy_clipboard_write",
};

export type PartOfDay =
  | "lateNight"
  | "earlyMorning"
  | "morning"
  | "afternoon"
  | "evening"
  | "night";

/**
 * What Clippy can observe about what the user is doing right now — derived from
 * behavior over time, not just a snapshot. All on-device. `title` is omitted
 * entirely for sensitive/incognito windows.
 */
export type BehavioralContext = {
  app?: string;
  title?: string;
  /** Minutes spent continuously on the current app. */
  minutesOnApp?: number;
  /** App switches in roughly the last 5 minutes. */
  recentSwitches?: number;
  /** Rapidly bouncing between apps, unable to settle. */
  thrashing?: boolean;
  /** Just came back to an app they'd wandered away from. */
  returnedToApp?: boolean;
  /** Just returned after being idle/away for a while. */
  idleReturn?: boolean;
  /** Minutes since this computing session started. */
  sessionMinutes?: number;
  partOfDay?: PartOfDay;
  /** Human-readable local time, e.g. "2:47am". */
  localTime?: string;
  /** Day name, e.g. "Tuesday". */
  dayOfWeek?: string;
  /** Saturday or Sunday. */
  isWeekend?: boolean;
  /** Roughly a weekday during 9–6 — so gaming/slacking reads as during work. */
  isWorkHours?: boolean;
  /**
   * Other apps the user has open right now (distinct names, not the active one,
   * never Clippy). A read on WHO they are — their toolbelt and distractions.
   * App names only, never titles (privacy).
   */
  otherApps?: string[];
};

/**
 * The full payload sent to the renderer when it's time to roast: what the user
 * is doing, plus the memory Clippy needs to stay fresh and land callbacks.
 */
export type RoastContext = {
  // Kept at the top level for backward-compatibility with the fallback lines.
  app?: string;
  title?: string;
  /** Rich behavioral signal for the prompt. */
  behavior?: BehavioralContext;
  /** Recent things he's said, so he never repeats himself. */
  recentLines?: string[];
  /** Durable, non-sensitive notes about the user, for callbacks. */
  observations?: string[];
};
