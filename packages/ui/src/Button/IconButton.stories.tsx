import type { Meta, StoryObj } from "@storybook/react-vite";
import { Cluster } from "../compositions/index.ts";
import { IconButton } from "./IconButton.tsx";

const meta = { component: IconButton, args: { icon: "bell", label: "Notifications" } } satisfies Meta<
  typeof IconButton
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Outline: Story = {};
export const Plain: Story = { args: { emphasis: "plain", icon: "bold", label: "Bold" } };
export const Pressed: Story = { args: { icon: "star", label: "Save the room", pressed: true } };
export const WithCount: Story = { args: { label: "Unread notifications", count: 8 } };
export const NewCount: Story = { args: { label: "Notifications", count: 6, countTone: "new" } };
export const CountPast99: Story = { args: { label: "Unread notifications", count: 120 } };

// Its tooltip, shown as the keyboard brings the focus: in the top layer, pictured as the screen.
export const WithTooltip: Story = {
  args: { icon: "search", label: "Search the universe" },
  tags: ["viewport"],
  play: ({ canvas }) => {
    canvas.getByRole("button").focus();
  },
};

// A bar's tools (the composer's format bar): the bar's faint ink; a narrow bar goes without the last two (their box under 18 rem).
export const Tools: Story = {
  render: () => (
    <Cluster space="3xs">
      <IconButton icon="bold" label="Bold" size="xs" emphasis="plain" tool />
      <IconButton icon="italic" label="Italic" size="xs" emphasis="plain" tool />
      <IconButton icon="list-bulleted" label="Bulleted list" size="xs" emphasis="plain" tool drops />
      <IconButton icon="list-numbered" label="Numbered list" size="xs" emphasis="plain" tool drops />
    </Cluster>
  ),
};

export const Sizes: Story = {
  render: () => (
    <Cluster>
      {(["s", "m", "l"] as const).map((size) => (
        <IconButton key={size} size={size} label={`Search, size ${size}`} icon="search" />
      ))}
    </Cluster>
  ),
};
