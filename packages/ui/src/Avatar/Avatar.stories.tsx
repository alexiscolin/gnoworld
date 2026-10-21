import type { Meta, StoryObj } from "@storybook/react-vite";
import { Cluster } from "../compositions/index.ts";
import { PEOPLE, short, SPREAD } from "../Overview/samples.ts";
import { Avatar, type AvatarProps } from "./Avatar.tsx";

const [first, second] = PEOPLE;

const meta = { component: Avatar, args: { address: first, name: short(first) } } satisfies Meta<typeof Avatar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Person: Story = {};
export const Sizes: Story = {
  render: () => (
    <Cluster space="m">
      {(["s", "m", "l"] as const).map((size) => (
        <Avatar key={size} address={first} name={`${short(first)}, size ${size}`} size={size} />
      ))}
    </Cluster>
  ),
};
export const Eight: Story = {
  render: () => (
    <Cluster space="2xs">
      {PEOPLE.map((address) => (
        <Avatar key={address} address={address} name={short(address)} />
      ))}
    </Cluster>
  ),
};
// Large faces side by side, to compare them.
function SideBySide({ faces }: { faces: AvatarProps[] }) {
  return (
    <Cluster space="m">
      {faces.map((face) => (
        <Avatar key={face.name} size="l" {...face} />
      ))}
    </Cluster>
  );
}
export const Kinds: Story = {
  render: () => (
    <SideBySide
      faces={[
        { address: first, name: short(first) },
        { address: first, name: "Jarvis", kind: "assistant" },
        { address: first, name: "The quiz bot", kind: "bot" },
      ]}
    />
  ),
};
export const HereAndSpeaking: Story = {
  render: () => (
    <SideBySide
      faces={[
        { address: first, name: short(first), here: true },
        { address: second, name: short(second), speaking: true },
      ]}
    />
  ),
};
export const NotAnAddress: Story = { args: { address: "not-an-address", name: "A name with no address", size: "l" } };
export const Spread: Story = {
  render: () => (
    <Cluster as="ul" space="3xs">
      {SPREAD.map((address) => (
        <li key={address}>
          <Avatar address={address} name={short(address)} size="s" />
        </li>
      ))}
    </Cluster>
  ),
};
