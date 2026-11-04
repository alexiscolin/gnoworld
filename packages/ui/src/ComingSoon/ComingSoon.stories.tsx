import type { Meta, StoryObj } from "@storybook/react-vite";
import { ComingSoon } from "./ComingSoon.tsx";

const meta = { component: ComingSoon, args: { name: "Jarvis" } } satisfies Meta<typeof ComingSoon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Words: Story = { args: { icon: "spark", words: "Jarvis" } };
export const IconOnly: Story = { args: { name: "Notifications", icon: "bell" } };
export const Plain: Story = { args: { name: "Call the realm", children: "Needs a wallet, soon" } };
