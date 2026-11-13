import type { Meta, StoryObj } from "@storybook/react-vite";
import { Cluster } from "../compositions/index.ts";
import { Badge, type BadgeProps } from "./Badge.tsx";

const meta = {
  component: Badge,
  args: { name: "Named", icon: "at", tone: "mine", earned: true },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Earned: Story = {};
export const NotYet: Story = {
  args: { name: "Player one", icon: "play", tone: "signal", earned: false, count: "1/4" },
};
const tones: BadgeProps["tone"][] = ["primary", "mine", "warm", "signal", "danger"];
export const Tones: Story = {
  render: () => (
    <Cluster space="m">
      {tones.map((tone) => (
        <Badge key={tone} name={tone} icon="star" tone={tone} earned />
      ))}
    </Cluster>
  ),
};
