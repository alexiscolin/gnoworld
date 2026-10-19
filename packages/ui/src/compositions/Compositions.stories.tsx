import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../Button/Button.tsx";
import { Kicker } from "../Kicker/Kicker.tsx";
import * as layout from "./index.ts";

// Each composition with the content it is made for; each story is named after it.
const meta = { title: "Compositions/Compositions" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const worlds = ["Earth", "GovDAO", "BUBBLE", "gnogolf", "Dev help"];

export const Stack: Story = {
  render: () => (
    <layout.Stack space="xs">
      <Kicker>Proposal 15</Kicker>
      <p>Session keys landed on testnet: one signature, then no popups.</p>
      <p>The AMA starts at 18:00 UTC.</p>
    </layout.Stack>
  ),
};

export const Cluster: Story = {
  render: () => (
    <layout.Cluster space="2xs" justify="between">
      {worlds.map((world) => (
        <Button key={world} size="s">
          {world}
        </Button>
      ))}
    </layout.Cluster>
  ),
};

export const Grid: Story = {
  render: () => (
    <layout.Grid as="ul" min="s">
      {worlds.map((world) => (
        <li key={world}>{world}</li>
      ))}
    </layout.Grid>
  ),
};

export const Sidebar: Story = {
  render: () => (
    <layout.Sidebar space="m">
      <Kicker vertical>Hub atlas</Kicker>
      <p>Where people speak from. Countries are opt-in.</p>
    </layout.Sidebar>
  ),
};

// Three facts side by side on a wide plate, one under the other on a narrow one.
export const Switcher: Story = {
  render: () => (
    <layout.Switcher space="m">
      {["214 here now", "31 countries", "96 calls a day"].map((fact) => (
        <Kicker key={fact}>{fact}</Kicker>
      ))}
    </layout.Switcher>
  ),
};

export const Center: Story = {
  render: () => (
    <layout.Center max="dialog" space="m">
      <p>A dialog holds its text at 460 px, and the measure at 65 characters.</p>
    </layout.Center>
  ),
};
