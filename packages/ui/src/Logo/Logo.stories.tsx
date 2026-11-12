import type { Meta, StoryObj } from "@storybook/react-vite";
import { Logo } from "./Logo.tsx";

const meta = { component: Logo } satisfies Meta<typeof Logo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Mark: Story = {};
export const WithWordmark: Story = { args: { wordmark: true } };
