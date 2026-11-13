import type { Meta, StoryObj } from "@storybook/react-vite";
import { Network, type NetworkNode } from "./Network.tsx";

const node = (i: number): NetworkNode => ({
  id: `n${String(i)}`,
  label: `pkg${String(i)}`,
  kind: i % 4 === 0 ? "pure" : "realm",
});
const meta = {
  component: Network,
  args: {
    label: "Linked realms",
    centre: { id: "c", label: "this" },
    left: { word: "imports", nodes: Array.from({ length: 5 }, (_, i) => node(i)) },
    right: { word: "imported by", nodes: Array.from({ length: 3 }, (_, i) => node(i + 5)) },
  },
} satisfies Meta<typeof Network>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Few: Story = {};
export const Picked: Story = { args: { selected: "n2", onSelect: () => undefined } };
export const Crowded: Story = {
  args: { right: { word: "imported by", nodes: Array.from({ length: 75 }, (_, i) => node(i)), total: 75 } },
};
export const Alone: Story = { args: { left: { word: "imports", nodes: [] }, right: { word: "importers", nodes: [] } } };
