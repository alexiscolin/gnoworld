import type { Meta, StoryObj } from "@storybook/react-vite";
import { ActivityChart } from "./ActivityChart.tsx";

const day = [4, 3, 2, 2, 1, 1, 3, 8, 14, 22, 30, 34, 41, 38, 36, 40, 52, 70, 96, 88, 61, 40, 22, 12];

const meta = { component: ActivityChart, args: { label: "Calls per hour, today", values: day } } satisfies Meta<
  typeof ActivityChart
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Day: Story = {};
export const Sparkline: Story = {
  args: { label: "Calls this week", values: [310, 280, 402, 390, 455, 520, 498], sparkline: true, unit: "day" },
};
export const Quiet: Story = { args: { label: "Calls per hour, today", values: Array.from({ length: 24 }, () => 0) } };
