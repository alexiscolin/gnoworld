import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState } from "./EmptyState.tsx";

const meta = {
  component: EmptyState,
  args: { title: "No rooms yet", line: "A world opens its rooms once it has members." },
} satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const WithAction: Story = {
  args: {
    title: "No messages yet",
    line: "Say hello: the room keeps what you write.",
    action: { label: "Open the chat", href: "#chat" },
  },
};
export const Page: Story = {
  args: {
    level: 1,
    title: "No page here",
    line: "Nothing on gno.world goes by this address.",
    action: { label: "Back to the universe", href: "/" },
  },
};
