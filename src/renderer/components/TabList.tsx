import React from "react";

export type TabListTab = {
  label: string;
  key: string;
  content: React.ReactNode;
};

export interface TabListProps {
  tabs: TabListTab[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function TabList({ tabs, activeTab, onTabChange }: TabListProps) {
  const [internalActiveTab, setInternalActiveTab] = React.useState(0);

  // Find the active tab index based on value
  const activeTabIndex = activeTab
    ? tabs.findIndex((tab) => tab.key === activeTab)
    : internalActiveTab;

  const handleTabClick = (index: number) => {
    if (onTabChange) {
      onTabChange(tabs[index].key);
    } else {
      setInternalActiveTab(index);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "12px" }}>
      <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
        {tabs.map((tab, index) => {
          const isActive = activeTabIndex === index;
          return (
            <button
              key={index}
              onClick={() => handleTabClick(index)}
              style={{
                background: isActive ? "rgba(99,102,241,0.2)" : "transparent",
                border: isActive ? "1px solid rgba(99,102,241,0.4)" : "1px solid transparent",
                color: isActive ? "#a78bfa" : "rgba(255,255,255,0.6)",
                padding: "4px 8px",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 600,
                whiteSpace: "nowrap",
                transition: "all 0.15s",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, overflowY: "auto", paddingRight: "4px" }}>
        {tabs[activeTabIndex]?.content}
      </div>
    </div>
  );
}
