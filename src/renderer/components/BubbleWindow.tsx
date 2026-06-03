import { useContext, useEffect } from "react";

import { Settings } from "./Settings";
import { SpeechBubble } from "./SpeechBubble";
import { useBubbleView } from "../contexts/BubbleViewContext";
import { useChat } from "../contexts/ChatContext";
import { WindowContext } from "../contexts/WindowContext";

const BUBBLE_SIZE = { width: 340, height: 200 };
const SETTINGS_SIZE = { width: 450, height: 650 };

export function Bubble() {
  const { currentView, setCurrentView } = useBubbleView();
  const { spokenText, setIsBubbleOpen } = useChat();
  const { currentWindow } = useContext(WindowContext);

  const isSettings = currentView.startsWith("settings");

  // Grow the window for settings, shrink back down for the speech bubble.
  useEffect(() => {
    if (!currentWindow || currentWindow === window) {
      return;
    }

    const size = isSettings ? SETTINGS_SIZE : BUBBLE_SIZE;
    try {
      currentWindow.resizeTo(size.width, size.height);
    } catch {
      // Resizing a not-yet-ready popup can throw; harmless.
    }
  }, [isSettings, currentWindow]);

  const closeSettings = () => {
    setCurrentView("speech");
    setIsBubbleOpen(false);
  };

  if (isSettings) {
    return (
      <div
        className="window"
        style={{
          width: "100%",
          height: "100%",
          margin: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div className="app-drag title-bar">
          <div className="title-bar-text">Clippy Settings</div>
          <div className="title-bar-controls app-no-drag">
            <button aria-label="Close" onClick={closeSettings}></button>
          </div>
        </div>
        <div
          className="window-body"
          style={{ flex: 1, overflow: "auto", margin: 0 }}
        >
          <Settings onClose={closeSettings} />
        </div>
      </div>
    );
  }

  return <SpeechBubble text={spokenText} />;
}
