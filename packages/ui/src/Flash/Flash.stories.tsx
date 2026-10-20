import type { Meta, StoryObj } from "@storybook/react-vite";
import { Flash } from "./Flash.tsx";

const meta = {
  component: Flash,
  args: { message: { title: "Saved to your rooms", line: "Bubble · the AMA on sessions" }, onClose: () => undefined },
} satisfies Meta<typeof Flash>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Timed: Story = {};
export const Empty: Story = { args: { message: null }, tags: ["empty"] };
export const WithAction: Story = {
  args: { message: { title: "Message deleted", action: { label: "Undo", onAction: () => undefined } } },
};
export const LongText: Story = {
  args: {
    message: {
      title: "Your proposal reached GovDAO, and its vote opens in the morning",
      line: "Bubble · the AMA on sessions · the third of the season, with the realm's authors",
      action: { label: "Read it", onAction: () => undefined },
    },
  },
};
