import { useEffect, useState } from "react";

import { TabList } from "./TabList";
import { BubbleView, useBubbleView } from "../contexts/BubbleViewContext";
import { SettingsModel } from "./SettingsModel";
import { BubbleWindowBottomBar } from "./BubbleWindowBottomBar";
import { SettingsAdvanced } from "./SettingsAdvanced";
import { SettingsAppearance } from "./SettingsAppearance";
import { SettingsAbout } from "./SettingsAbout";
import { SettingsParameters } from "./SettingsParameters";

export type SettingsTab = "appearance" | "model" | "advanced" | "about";

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
    { label: "Appearance", key: "appearance", content: <SettingsAppearance /> },
    { label: "Model", key: "model", content: <SettingsModel /> },
    { label: "Parameters", key: "parameters", content: <SettingsParameters /> },
    { label: "Advanced", key: "advanced", content: <SettingsAdvanced /> },
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
  const settingsTabs = [
    "appearance",
    "model",
    "parameters",
    "advanced",
    "about",
  ] as const;

  if (settingsTabs.includes(settingsTab as SettingsTab)) {
    return settingsTab as SettingsTab;
  }

  return "appearance";
}
