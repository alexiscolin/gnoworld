import type { Meta, StoryObj } from "@storybook/react-vite";
import { Cluster } from "../compositions/index.ts";
import { Stamp } from "./Stamp.tsx";

const meta = {
  component: Stamp,
  args: { seed: "gov/dao", name: "dao", day: "11 Nov", system: "gov", icon: "people" },
} satisfies Meta<typeof Stamp>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Visit: Story = {};
export const Charted: Story = { args: { seed: "g1jz6j9/smoke", name: "smoke", icon: "planet", gold: true } };
export const Worlds: Story = {
  render: () => (
    <Cluster space="m">
      {["games/chess", "gnoland/wugnot", "nym-ana/hello", "g1abc/tally", "demo/defi", "gov/boards"].map((seed) => (
        <Stamp key={seed} seed={seed} name={seed.split("/")[1] ?? seed} day="8 Nov" system={seed.split("/")[0] ?? ""} />
      ))}
    </Cluster>
  ),
};
