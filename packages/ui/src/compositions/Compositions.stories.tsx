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
      <p>A dialog holds its text at 490 px, and the measure at 65 characters.</p>
    </layout.Center>
  ),
};

const steps = ["3xs", "2xs", "xs", "s", "m", "l", "xl", "2xl"] as const;

// Every space step, each a Cluster spaced by it.
export const Steps: Story = {
  render: () => (
    <layout.Stack space="m">
      {steps.map((step) => (
        <layout.Cluster key={step} space={step}>
          <Kicker>{step}</Kicker>
          <Kicker dot="mine">GovDAO</Kicker>
          <Kicker dot="warm">Earth</Kicker>
        </layout.Cluster>
      ))}
    </layout.Stack>
  ),
};

// Each way a Cluster lines up its children.
export const Justify: Story = {
  render: () => (
    <layout.Stack space="m">
      {(["start", "center", "between", "end"] as const).map((justify) => (
        <layout.Cluster key={justify} justify={justify}>
          <Kicker>{justify}</Kicker>
          <Kicker dot="signal">An uncharted signal</Kicker>
        </layout.Cluster>
      ))}
    </layout.Stack>
  ),
};

// Each column minimum, with six worlds to place.
export const Columns: Story = {
  render: () => (
    <layout.Stack space="l">
      {(["s", "m", "l"] as const).map((min) => (
        <layout.Grid key={min} as="ul" min={min}>
          {[...worlds, "Arcade"].map((world) => (
            <li key={world}>{world}</li>
          ))}
        </layout.Grid>
      ))}
    </layout.Stack>
  ),
};

// A side wider than half the box: the main part takes a row of its own rather than shrink.
export const WideSide: Story = {
  render: () => (
    <layout.Sidebar side="end" space="m">
      <Button emphasis="solid">Join the chat</Button>
      <Kicker dot="warm">
        Where people speak from: countries are opt-in, and a city never shows, so this runs long
      </Kicker>
    </layout.Sidebar>
  ),
};
