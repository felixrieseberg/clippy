import React, { createContext, useContext, useEffect, useState } from "react";
import { clippyApi } from "../clippyApi";
import { useChat } from "./ChatContext";

export type BubbleView =
  | "speech"
  | "settings"
  | "settings-general"
  | "settings-model"
  | "settings-parameters"
  | "settings-advanced"
  | "settings-about";

type BubbleViewContextType = {
  currentView: BubbleView;
  setCurrentView: (view: BubbleView) => void;
};

const BubbleViewContext = createContext<BubbleViewContextType | undefined>(
  undefined,
);

export const BubbleViewProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [currentView, setCurrentView] = useState<BubbleView>("speech");
  const { setIsBubbleOpen } = useChat();

  useEffect(() => {
    clippyApi.offSetBubbleView();
    clippyApi.onSetBubbleView((view: BubbleView) => {
      setCurrentView(view);
      // A view request from the menu (e.g. Settings) should pop the window open.
      setIsBubbleOpen(true);
    });

    return () => {
      clippyApi.offSetBubbleView();
    };
  }, [setIsBubbleOpen]);

  return (
    <BubbleViewContext.Provider value={{ currentView, setCurrentView }}>
      {children}
    </BubbleViewContext.Provider>
  );
};

export const useBubbleView = () => {
  const context = useContext(BubbleViewContext);
  if (context === undefined) {
    throw new Error("useBubbleView must be used within a BubbleViewProvider");
  }
  return context;
};
