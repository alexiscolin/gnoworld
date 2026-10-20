import type { Meta, StoryObj } from "@storybook/react-vite";
import { DAY } from "../Overview/samples.ts";
import { ActivityChart } from "./ActivityChart.tsx";

const meta = { component: ActivityChart, args: { label: "Calls per hour, today", values: DAY } } satisfies Meta<
  typeof ActivityChart
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Day: Story = {};
export const Sparkline: Story = {
  args: { label: "Calls this week", values: [310, 280, 402, 390, 455, 520, 498], sparkline: true, unit: "day" },
};
export const Quiet: Story = { args: { label: "Calls per hour, today", values: Array.from({ length: 24 }, () => 0) } };
