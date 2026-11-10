import type { Meta, StoryObj } from "@storybook/react-vite";
import { Disclosure } from "./Disclosure.tsx";

const meta = {
  component: Disclosure,
  args: { title: "PlayRoundAt", children: <p>What it does, and the button that does it.</p> },
} satisfies Meta<typeof Disclosure>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};
export const Open: Story = { args: { open: true } };
export const Small: Story = { args: { size: "s", trail: <time>3 min ago</time> } };
