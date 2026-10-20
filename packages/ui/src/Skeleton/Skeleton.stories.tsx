import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton } from "./Skeleton.tsx";

const meta = { component: Skeleton } satisfies Meta<typeof Skeleton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Lines: Story = { args: { lines: 3 } };
export const CardShape: Story = { args: { shape: "card" } };
