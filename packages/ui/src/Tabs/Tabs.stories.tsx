import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Tabs, type TabsProps } from "./Tabs.tsx";

// Tabs as a page holds them: the selected one is its state, so the arrows select as they move.
function Held({ selected, ...rest }: TabsProps) {
  const [now, setNow] = useState(selected);
  return <Tabs {...rest} selected={now} onSelect={setNow} />;
}

const meta = {
  component: Tabs,
  render: (args) => <Held {...args} />,
  args: {
    label: "Views",
    tabs: [
      { id: "earth", label: "Earth" },
      { id: "cosmos", label: "Cosmos" },
      { id: "list", label: "List" },
    ],
    selected: "cosmos",
    onSelect: () => undefined,
  },
} satisfies Meta<typeof Tabs>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Segmented: Story = {};
export const WithCounts: Story = {
  args: {
    label: "Notifications",
    tabs: [
      { id: "all", label: "All", count: 8 },
      { id: "mentions", label: "Mentions", count: 2 },
      { id: "calls", label: "Calls", count: 0 },
    ],
    selected: "all",
  },
};
export const IconsOnly: Story = {
  args: {
    label: "Library",
    iconOnly: true,
    tabs: [
      { id: "worlds", label: "Worlds", icon: "planet" },
      { id: "people", label: "People", icon: "people" },
      { id: "saved", label: "Saved", icon: "bookmark" },
    ],
    selected: "worlds",
  },
};
export const NoneSelected: Story = { args: { selected: null } };
