import { useCallback, useState } from "react";

import { clippyApi } from "../clippyApi";
import { Chat } from "./Chat";
import { Settings } from "./Settings";
import { useBubbleView } from "../contexts/BubbleViewContext";
import { Chats } from "./Chats";
import { useChat } from "../contexts/ChatContext";
import { MessageRecord } from "../../types/interfaces";

export function Bubble() {
  const { currentView, setCurrentView } = useBubbleView();
  const { messages, currentChatRecord } = useChat();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const containerStyle = {
    width: "calc(100% - 6px)",
    height: "calc(100% - 6px)",
    margin: 0,
    overflow: "hidden",
  };

  const chatStyle = {
    padding: "15px",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "flex-end",
    minHeight: "calc(100% - 35px)",
    overflowAnchor: "none" as const,
  };

  const scrollAnchoredAtBottomStyle = {
    display: "flex",
    flexDirection: "column-reverse" as const,
  };

  let content = null;

  if (currentView === "chat") {
    content = <Chat style={chatStyle} />;
  } else if (currentView.startsWith("settings")) {
    content = <Settings onClose={() => setCurrentView("chat")} />;
  } else if (currentView === "chats") {
    content = <Chats onClose={() => setCurrentView("chat")} />;
  }

  const handleSettingsClick = useCallback(() => {
    if (currentView.startsWith("settings")) {
      setCurrentView("chat");
    } else {
      setCurrentView("settings");
    }
  }, [setCurrentView, currentView]);

  const handleChatsClick = useCallback(() => {
    if (currentView === "chats") {
      setCurrentView("chat");
    } else {
      setCurrentView("chats");
    }
  }, [setCurrentView, currentView]);

  const handleExportForClaude = useCallback(async () => {
    if (messages.length === 0) {
      return;
    }

    setIsExporting(true);
    try {
      const messageRecords: MessageRecord[] = messages.map((m) => ({
        id: m.id,
        content: m.content,
        sender: m.sender,
        createdAt: m.createdAt,
      }));
      await clippyApi.exportChatForClaude({
        chat: currentChatRecord,
        messages: messageRecords,
      });
    } catch (error) {
      console.error("Failed to export chat:", error);
    } finally {
      setIsExporting(false);
    }
  }, [messages, currentChatRecord]);

  return (
    <div className="bubble-container window" style={containerStyle}>
      <div className="app-drag title-bar">
        <div className="title-bar-text">Chat with Clippy</div>
        <div className="title-bar-controls app-no-drag">
          <button
            style={{
              marginRight: "8px",
              paddingLeft: "8px",
              paddingRight: "8px",
            }}
            onClick={handleChatsClick}
          >
            Chats
          </button>
          <button
            style={{
              marginRight: "8px",
              paddingLeft: "8px",
              paddingRight: "8px",
            }}
            onClick={handleSettingsClick}
          >
            Settings
          </button>
          {currentView === "chat" && messages.length > 0 && (
            <button
              style={{
                marginRight: "8px",
                paddingLeft: "8px",
                paddingRight: "8px",
              }}
              onClick={handleExportForClaude}
              disabled={isExporting}
            >
              Export for Claude
            </button>
          )}
          <button
            aria-label="Minimize"
            onClick={() => clippyApi.minimizeChatWindow()}
          ></button>
          <button
            aria-label={isMaximized ? "Restore" : "Maximize"}
            onClick={() => {
              clippyApi.maximizeChatWindow();
              setIsMaximized(!isMaximized);
            }}
          ></button>
          <button
            aria-label="Close"
            onClick={() => clippyApi.toggleChatWindow()}
          ></button>
        </div>
      </div>
      <div
        className="window-content"
        style={currentView === "chat" ? scrollAnchoredAtBottomStyle : {}}
      >
        {content}
      </div>
    </div>
  );
}
