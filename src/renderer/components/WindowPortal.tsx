import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";

import { clippyApi } from "../clippyApi";
import { WindowContext } from "../contexts/WindowContext";
import { useChat } from "../contexts/ChatContext";

interface WindowPortalProps {
  children: React.ReactNode;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
  title?: string;
}

// Singleton variables - moved outside component to persist across renders
let _externalWindow: Window | null = null;
let containerDiv: HTMLDivElement | null = null;
let isInitialized = false;

export function WindowPortal({
  children,
  width = 400,
  height = 700,
  title = "Clippy Chat",
}: WindowPortalProps) {
  const [externalWindow, setExternalWindow] = useState<Window | null>(null);
  const { isBubbleOpen, setIsBubbleOpen } = useChat();

  // Initialize the singleton container only once
  useEffect(() => {
    if (!isInitialized) {
      containerDiv = document.createElement("div");
      containerDiv.className = "clippy";
      isInitialized = true;
    }

    // Create function for window management
    const showWindow = async () => {
      if (!_externalWindow || _externalWindow.closed) {
        const windowFeatures = `width=${width},height=${height},positionNextToParent`;
        _externalWindow = window.open("", "", windowFeatures);

        if (!_externalWindow) {
          console.error("Failed to open window - popup may be blocked");
          return;
        }

        setExternalWindow(_externalWindow);

        // Setup window
        const externalDoc = _externalWindow.document;
        externalDoc.title = title;

        // Add styles
        const style = externalDoc.createElement("style");
        // Keep the popup itself see-through so only the speech balloon shows.
        style.textContent = `html, body { background: transparent !important; margin: 0; overflow: hidden; }`;

        // Copy styles from parent window
        const parentStyles = Array.from(document.styleSheets);
        for (const sheet of parentStyles) {
          try {
            if (sheet.href) {
              // For external stylesheets
              const linkElem = externalDoc.createElement("link");
              linkElem.rel = "stylesheet";
              linkElem.href = sheet.href;
              externalDoc.head.appendChild(linkElem);
            } else {
              // For internal stylesheets
              const rules = Array.from(sheet.cssRules || []);
              for (const rule of rules) {
                style.textContent += rule.cssText + "\n";
              }
            }
          } catch (e) {
            console.warn("Could not copy stylesheet", e);
          }
        }

        externalDoc.head.appendChild(style);

        // Setup close event
        _externalWindow.addEventListener("beforeunload", () => {
          console.log("Window closed by user");
          setIsBubbleOpen(false);
        });

        externalDoc.body.innerHTML = "";
        externalDoc.body.appendChild(containerDiv);
      } else {
        await clippyApi.toggleChatWindow();
      }
      // Intentionally not calling focus() — the bubble should appear without
      // stealing focus from the user's active app.
    };

    // Close window function
    const hideWindow = async () => {
      // Don't destroy the window, just hide it
      if (_externalWindow && !_externalWindow.closed) {
        await clippyApi.toggleChatWindow();
      }
    };

    // Show/hide based on prop
    if (isBubbleOpen) {
      showWindow();
    } else {
      hideWindow();
    }

    // Cleanup only on app unmount, not component unmount
    return () => {
      // We don't close the window here anymore to maintain singleton
      // The window will be closed when the app is closed
    };
  }, [isBubbleOpen, width, height, title]);

  // Always render to the portal if it exists, regardless of visibility
  if (!containerDiv) {
    return null;
  }

  // Wrap the children in the WindowContext provider
  // This provides the external window to all children components
  const wrappedChildren = (
    <WindowContext.Provider value={{ currentWindow: externalWindow || window }}>
      {children}
    </WindowContext.Provider>
  );

  return ReactDOM.createPortal(wrappedChildren, containerDiv);
}
