import type { Meta, StoryObj } from "@storybook/react-vite";
import { Kicker } from "./Kicker.tsx";

const meta = { component: Kicker, args: { children: "On chain · 96 calls a day" } } satisfies Meta<typeof Kicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const Live: Story = { args: { dot: "warm", children: "Live · the AMA on sessions" } };
export const Mine: Story = { args: { dot: "mine", children: "Your vote" } };
export const Signal: Story = { args: { dot: "signal", children: "An uncharted signal" } };
export const Vertical: Story = { args: { vertical: true, children: "Hub atlas" } };
export const LongText: Story = {
  args: { children: "Expedition · stop 2 of 3 · GovDAO, then Earth, then an uncharted signal" },
};
