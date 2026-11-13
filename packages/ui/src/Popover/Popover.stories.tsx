import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../Button/Button.tsx";
import { Stack } from "../compositions/index.ts";
import { Menu, Popover } from "./Popover.tsx";

const meta = {
  component: Popover,
  args: {
    trigger: "Network",
    label: "Choose the network",
    children: (
      <Stack space="xs">
        <p>Onyx, the testnet, is where you can sign for free.</p>
        <Button>Switch to Onyx</Button>
      </Stack>
    ),
  },
} satisfies Meta<typeof Popover>;
export default meta;
type Story = StoryObj<typeof meta>;

const actions = [
  { label: "Copy", onSelect: () => undefined },
  { label: "Room link", onSelect: () => undefined },
  { label: "Save", onSelect: () => undefined },
  { label: "Report", onSelect: () => undefined },
];

// The open ones sit in the top layer, placed against the screen: their pictures are the screen's.
export const Anchored: Story = {};
export const AnchoredOpen: Story = {
  tags: ["viewport"],
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Network" }));
  },
};
export const MessageMenu: Story = {
  render: () => <Menu trigger="More" label="Message actions" items={actions} />,
};
export const MessageMenuOpen: Story = {
  ...MessageMenu,
  tags: ["viewport"],
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More" }));
  },
};
// 4c's message bar: the More menu's trigger, an icon, outline and plain, small as a toolbar's control; its own
// line's Delete apart, in danger's tone.
const own = [...actions, { label: "Delete", tone: "danger" as const, onSelect: () => undefined }];
export const MessageMenuIcon: Story = {
  render: () => <Menu trigger="More" icon="more" label="Message actions" items={actions} />,
};
export const MessageMenuIconPlainOpen: Story = {
  tags: ["viewport"],
  render: () => <Menu trigger="More" icon="more" emphasis="plain" size="s" label="Message actions" items={own} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More" }));
  },
};

// A bar's tool that opens a panel (the composer's link tool): an icon trigger with the bar's faint ink.
export const ToolTrigger: Story = {
  args: { trigger: null, label: "Link", icon: { name: "link", size: "xs", tool: true } },
};
