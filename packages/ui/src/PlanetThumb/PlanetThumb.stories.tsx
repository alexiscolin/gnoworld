import type { Meta, StoryObj } from "@storybook/react-vite";
import { Cluster } from "../compositions/index.ts";
import { disc } from "../Overview/samples.ts";
import { PlanetThumb } from "./PlanetThumb.tsx";

const meta = { component: PlanetThumb, args: { src: disc("5cf2c8"), name: "Bubble" } } satisfies Meta<
  typeof PlanetThumb
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const World: Story = {};
const kinds = [
  ["5cf2c8", "Bubble", "world"],
  ["b79cff", "The gno ecosystem", "cluster"],
  ["ffc46b", "The sun", "star"],
  ["9da8bc", "Broadcast Moon", "station"],
  ["b79cff", "An uncharted signal", "signal"],
] as const;

export const Kinds: Story = {
  render: () => (
    <Cluster space="m">
      {kinds.map(([colour, name, kind]) => (
        <PlanetThumb key={kind} src={disc(colour)} name={name} kind={kind} />
      ))}
    </Cluster>
  ),
};
export const Sizes: Story = {
  render: () => (
    <Cluster space="m">
      {(["s", "m", "l"] as const).map((size) => (
        <PlanetThumb key={size} src={disc("5cf2c8")} name={`Bubble, size ${size}`} size={size} />
      ))}
    </Cluster>
  ),
};
export const Magnified: Story = { args: { magnify: true } };
