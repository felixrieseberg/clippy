import { useEffect, useState } from "react";
import "./css/App.css";
import "./css/ModernTheme.css";

import { Clippy } from "./Clippy";
import { ChatPopup } from "./ChatPopup";
import { ChatProvider, useChat } from "../contexts/ChatContext";
import { SharedStateProvider } from "../contexts/SharedStateContext";
import { BubbleViewProvider } from "../contexts/BubbleViewContext";
import { DebugProvider } from "../contexts/DebugContext";
import { clippyApi } from "../clippyApi";

const CLIPPY_W = 125;
const CLIPPY_H = 100;
const POPUP_W = 360;
const POPUP_H = 540;
const MARGIN = 12;

function AppInner() {
  const { isChatWindowOpen } = useChat();
  const [layout, setLayout] = useState<"right" | "left" | "top-right" | "top-left">("right");

  useEffect(() => {
    if (!isChatWindowOpen) {
      // When closing, shrink the window back down to Clippy's size.
      // We must calculate where Clippy was visually on the screen 
      // inside the large expanded window, so his absolute position doesn't jump.
      const winX = window.screenX;
      const winY = window.screenY;
      const winW = window.outerWidth;
      const winH = window.outerHeight;

      let newX = winX;
      let newY = winY;

      if (layout === "right") {
        newX = winX + winW - CLIPPY_W;
        newY = winY + winH - CLIPPY_H;
      } else if (layout === "left") {
        newX = winX;
        newY = winY + winH - CLIPPY_H;
      } else if (layout === "top-right") {
        newX = winX + winW - CLIPPY_W;
        newY = winY;
      } else if (layout === "top-left") {
        newX = winX;
        newY = winY;
      }

      clippyApi.setWindowBounds({ x: newX, y: newY, width: CLIPPY_W, height: CLIPPY_H });
      return;
    }

    // When opening, expand the window safely
    const winX = window.screenX;
    const winY = window.screenY;
    const screenW = window.screen.availWidth;
    const screenH = window.screen.availHeight;

    const totalW = POPUP_W;
    const totalH = POPUP_H + CLIPPY_H;

    // The anchor point is Clippy's current bottom-right corner
    const anchorX = winX + CLIPPY_W;
    const anchorY = winY + CLIPPY_H;

    let newLayout: typeof layout = "right";
    let newX = anchorX - totalW;
    if (newX < MARGIN) {
      newLayout = "left";
      newX = anchorX - CLIPPY_W;
      if (newX + totalW > screenW - MARGIN) {
        newX = screenW - MARGIN - totalW;
      }
    }

    let newY = anchorY - totalH;
    if (newY < MARGIN) {
      newLayout = newLayout === "left" ? "top-left" : "top-right";
      newY = anchorY - CLIPPY_H;
      if (newY + totalH > screenH - MARGIN) {
        newY = screenH - MARGIN - totalH;
      }
    }

    setLayout(newLayout);
    clippyApi.setWindowBounds({ x: newX, y: newY, width: totalW, height: totalH });
  }, [isChatWindowOpen]);

  // Dynamically configure flexbox so Clippy and the Popup stack perfectly
  let alignItems = "flex-end";
  let justifyContent = "flex-end";
  let flexDirection: any = "column";

  if (layout === "left") {
    alignItems = "flex-start";
    justifyContent = "flex-end";
  } else if (layout === "top-right") {
    alignItems = "flex-end";
    justifyContent = "flex-start";
    flexDirection = "column-reverse";
  } else if (layout === "top-left") {
    alignItems = "flex-start";
    justifyContent = "flex-start";
    flexDirection = "column-reverse";
  }

  return (
    <div
      className="clippy"
      style={{
        position: "fixed",
        bottom: 0,
        right: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection,
        alignItems,
        justifyContent,
      }}
    >
      <ChatPopup layout={layout} />
      <Clippy />
    </div>
  );
}

export function App() {
  return (
    <DebugProvider>
      <SharedStateProvider>
        <ChatProvider>
          <BubbleViewProvider>
            <AppInner />
          </BubbleViewProvider>
        </ChatProvider>
      </SharedStateProvider>
    </DebugProvider>
  );
}
