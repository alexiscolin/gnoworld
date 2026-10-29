import type { Meta, StoryObj } from "@storybook/react-vite";
import { Breadcrumb } from "./Breadcrumb.tsx";

const meta = {
  component: Breadcrumb,
  args: {
    label: "You are here",
    items: [{ label: "gno.world", href: "/" }, { label: "Earth", href: "/earth" }, { label: "Bubble" }],
  },
} satisfies Meta<typeof Breadcrumb>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Trail: Story = {};
export const OneStep: Story = { args: { items: [{ label: "gno.world" }] } };
export const LongLabel: Story = {
  args: {
    items: [
      { label: "gno.world", href: "/" },
      { label: "A world whose name runs on and on, past the width of a phone's screen" },
    ],
  },
};
