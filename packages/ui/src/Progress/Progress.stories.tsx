import type { Meta, StoryObj } from "@storybook/react-vite";
import { Progress } from "./Progress.tsx";

const meta = {
  component: Progress,
  args: { label: "Passport, DeFi", value: 3, max: 5, shown: "3/5" },
} satisfies Meta<typeof Progress>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Bar: Story = {};
export const Steps: Story = { args: { kind: "steps", label: "Quest, first steps", value: 2, max: 4, shown: "2/4" } };
export const ManySteps: Story = { args: { kind: "steps", value: 9, max: 40, shown: "9/40" } };
