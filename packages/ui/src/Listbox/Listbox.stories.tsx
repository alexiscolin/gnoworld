import type { Meta, StoryObj } from "@storybook/react-vite";
import { Listbox } from "./Listbox.tsx";

const meta = {
  component: Listbox,
  args: {
    label: "Suggestions",
    id: "commands",
    active: 0,
    onPick: () => undefined,
    options: [
      { id: "commands-0", label: "/me", hint: "Send an action: /me waves" },
      { id: "commands-1", label: "/poll", hint: "Ask a poll: /poll Question? | answer | answer" },
    ],
  },
} satisfies Meta<typeof Listbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Commands: Story = {};

export const SecondPicked: Story = { args: { active: 1 } };
