import { useCallback, useState } from "react";

import { clippyApi } from "../clippyApi";
import { Chat } from "./Chat";
import { Settings } from "./Settings";
import { useBubbleView } from "../contexts/BubbleViewContext";
import { Chats } from "./Chats";

import "./css/ModernTheme.css";

export function Bubble() {
  const { currentView, setCurrentView } = useBubbleView();
  const [isMaximized, setIsMaximized] = useState(false);

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

  return (
    <div className="modern-bubble" style={containerStyle}>
      <div className="modern-title-bar app-drag">
        <div className="modern-title-text">Chat with Clippy</div>
        <div className="modern-controls app-no-drag">
          <button onClick={handleChatsClick}>Chats</button>
          <button onClick={handleSettingsClick}>Settings</button>
          <button onClick={() => clippyApi.minimizeChatWindow()}>_</button>
          <button onClick={() => {
              clippyApi.maximizeChatWindow();
              setIsMaximized(!isMaximized);
            }}
          >{isMaximized ? "[]" : "[ ]"}</button>
          <button onClick={() => clippyApi.toggleChatWindow()}>X</button>
        </div>
      </div>
      <div
        className="modern-content"
        style={currentView === "chat" ? scrollAnchoredAtBottomStyle : {}}
      >
        {content}
      </div>
    </div>
  );
}
