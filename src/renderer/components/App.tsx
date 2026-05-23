import "./css/App.css";
import "./css/ModernTheme.css";

import { Clippy } from "./Clippy";
import { ChatPopup } from "./ChatPopup";
import { ChatProvider } from "../contexts/ChatContext";
import { SharedStateProvider } from "../contexts/SharedStateContext";
import { BubbleViewProvider } from "../contexts/BubbleViewContext";
import { DebugProvider } from "../contexts/DebugContext";

export function App() {
  return (
    <DebugProvider>
      <SharedStateProvider>
        <ChatProvider>
          <BubbleViewProvider>
            <div
              className="clippy"
              style={{
                position: "fixed",
                bottom: 0,
                right: 0,
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                justifyContent: "flex-end",
              }}
            >
              {/* Inline chat popup – no separate OS window */}
              <ChatPopup />
              {/* The Clippy character */}
              <Clippy />
            </div>
          </BubbleViewProvider>
        </ChatProvider>
      </SharedStateProvider>
    </DebugProvider>
  );
}
