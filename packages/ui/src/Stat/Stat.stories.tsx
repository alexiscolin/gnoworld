import type { Meta, StoryObj } from "@storybook/react-vite";
import { Cluster } from "../compositions/index.ts";
import { Stat } from "./Stat.tsx";

const meta = { component: Stat, args: { value: 214, caption: "Here now" } } satisfies Meta<typeof Stat>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const WithUnit: Story = { args: { value: 21480, unit: "calls", caption: "Today" } };
export const Small: Story = { args: { value: 1, unit: "/9", caption: "Challenge steps", size: "s" } };
export const Deltas: Story = {
  render: () => (
    <Cluster space="xl">
      <Stat value={214} caption="Here now" delta={18} hot />
      <Stat value={31} caption="Countries" delta={-2} />
      <Stat value={96} caption="Calls a day" delta={0} />
    </Cluster>
  ),
};
