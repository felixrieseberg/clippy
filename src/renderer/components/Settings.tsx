import { useEffect, useState } from "react";

import { TabList } from "./TabList";
import { BubbleView, useBubbleView } from "../contexts/BubbleViewContext";
import { BubbleWindowBottomBar } from "./BubbleWindowBottomBar";
import { SettingsAppearance } from "./SettingsAppearance";
import { SettingsAbout } from "./SettingsAbout";

// Clippy's Revenge is a fixed-personality toy, not a tunable tool: the only
// settings we expose are the harmless "fun" toggles (Options) and the
// credits/legal page (About). The Model / Parameters / Advanced tabs — which
// let you swap the model, edit his system prompt, and tweak generation
// parameters — were removed on purpose so his personality can't be edited.
// (Their components still exist in the repo if ever needed.)
export type SettingsTab = "appearance" | "about";

export type SettingsProps = {
  onClose: () => void;
};

export const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const { currentView, setCurrentView } = useBubbleView();
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    bubbleViewToSettingsTab(currentView),
  );

  useEffect(() => {
    const newTab = bubbleViewToSettingsTab(currentView);

    if (newTab !== activeTab) {
      setActiveTab(newTab);
    }
  }, [currentView, activeTab]);

  const tabs = [
    { label: "Options", key: "appearance", content: <SettingsAppearance /> },
    { label: "About", key: "about", content: <SettingsAbout /> },
  ];

  return (
    <>
      <TabList
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(tab) => setCurrentView(`settings-${tab}` as BubbleView)}
      />
      <BubbleWindowBottomBar>
        <button onClick={onClose}>Close</button>
      </BubbleWindowBottomBar>
    </>
  );
};

/**
 * Converts a BubbleView to a SettingsTab.
 *
 * @param view - The BubbleView to convert.
 * @returns The SettingsTab.
 */
function bubbleViewToSettingsTab(view: BubbleView): SettingsTab {
  if (!view || !view.includes("settings")) {
    return "appearance";
  }

  const settingsTab = view.replace(/settings-?/, "");

  if (settingsTab === "about") {
    return "about";
  }

  return "appearance";
}
