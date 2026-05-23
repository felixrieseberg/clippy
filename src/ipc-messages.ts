export const IpcMessages = {
  // Window messages
  TOGGLE_CHAT_WINDOW: "clippy_toggle_chat_window",
  MINIMIZE_CHAT_WINDOW: "clippy_minimize_chat_window",
  MAXIMIZE_CHAT_WINDOW: "clippy_maximize_chat_window",
  SET_BUBBLE_VIEW: "clippy_set_bubble_view",
  POPUP_APP_MENU: "clippy_popup_app_menu",
  POPUP_CHAT_OPEN: "clippy_popup_chat_open",
  POPUP_CHAT_CLOSE: "clippy_popup_chat_close",

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

  // Clipboard
  CLIPBOARD_WRITE: "clippy_clipboard_write",
};
