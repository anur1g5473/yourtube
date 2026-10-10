import React from "react";
import { Button } from "./ui/button";

type ChannelTab = "videos" | "about";
type ChannelTabsProps = {
  activeTab: ChannelTab;
  onTabChange: (tab: ChannelTab) => void;
};

const tabs: { id: ChannelTab; label: string }[] = [
  { id: "videos", label: "Videos" },
  { id: "about", label: "About" },
];

const Channeltabs = ({ activeTab, onTabChange }: ChannelTabsProps) => {
  return (
    <div className="border-b px-4">
      <div className="flex gap-8 overflow-x-auto">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant="ghost"
            className={`px-0 py-4 border-b-2 rounded-none ${
              activeTab === tab.id ? "border-black text-black" : "border-transparent text-gray-600 hover:text-black"
            }`}
            aria-pressed={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>
    </div>
  );
};

export default Channeltabs;
