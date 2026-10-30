import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Combobox, type ComboboxGroup, type ComboboxProps } from "./Combobox.tsx";

const GROUPS: ComboboxGroup[] = [
  { id: "earth", label: "Earth", options: [{ id: "/earth", label: "Earth of Onyx" }] },
  {
    id: "world",
    label: "Worlds",
    options: [
      { id: "/w/bubble", label: "Bubble" },
      { id: "/w/orbit", label: "Orbit" },
    ],
  },
  { id: "ecosystem", label: "Ecosystems", options: [{ id: "/e/names", label: "Names" }] },
];

// The field holds what is typed, as a page's does.
function Held(args: ComboboxProps) {
  const [value, setValue] = useState(args.value);
  return <Combobox {...args} value={value} onValueChange={setValue} />;
}

const meta = {
  component: Combobox,
  render: (args) => <Held {...args} />,
  args: {
    label: "Search places",
    value: "",
    onValueChange: () => undefined,
    groups: GROUPS,
    onSelect: () => undefined,
  },
} satisfies Meta<typeof Combobox>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Places: Story = {};
export const Typed: Story = { args: { value: "b", groups: GROUPS.slice(1, 2) } };
export const NoPlace: Story = { args: { value: "zzz", groups: [] } };
