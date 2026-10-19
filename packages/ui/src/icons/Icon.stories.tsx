import type { Meta, StoryObj } from "@storybook/react-vite";
import { Cluster } from "../compositions/index.ts";
import { Icon, ICON_NAMES } from "./Icon.tsx";

const meta = { component: Icon, args: { name: "search" } } satisfies Meta<typeof Icon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const One: Story = {};
export const Large: Story = { args: { size: "l" } };
export const All: Story = {
  render: () => (
    <Cluster>
      {ICON_NAMES.map((name) => (
        <Icon key={name} name={name} />
      ))}
    </Cluster>
  ),
};
