import type { Meta, StoryObj } from "@storybook/react-vite";
import { Cluster } from "../compositions/index.ts";
import { Chip } from "./Chip.tsx";

const meta = { component: Chip, args: { children: "Dev help", onClick: () => undefined } } satisfies Meta<typeof Chip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Control: Story = {};
export const Selected: Story = { args: { selected: true, children: "Games" } };
export const WithCount: Story = { args: { count: 12, children: "General" } };
export const Marks: Story = {
  render: () => (
    <Cluster space="2xs">
      <Chip>Testnet</Chip>
      <Chip tone="mine">Your vote</Chip>
      <Chip tone="warm">Live</Chip>
      <Chip tone="signal">Assistant</Chip>
      <Chip tone="danger">Refused</Chip>
    </Cluster>
  ),
};
export const LongText: Story = { args: { children: "Room games · the quiz on realms, every Friday evening" } };
