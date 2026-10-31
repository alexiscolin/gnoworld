import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "../compositions/index.ts";
import { Icon } from "../icons/Icon.tsx";
import { NavItem } from "./NavItem.tsx";

const meta = { component: NavItem, args: { href: "/w/bubble?room=games", children: "#general" } } satisfies Meta<
  typeof NavItem
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const Current: Story = { args: { current: true, badge: { count: "96", said: "96 unread" } } };
export const Column: Story = {
  render: () => (
    <Stack space="3xs">
      <NavItem href="/a" current badge={{ count: "96", said: "96 unread" }}>
        #general
      </NavItem>
      <NavItem href="/b" badge={{ count: "31", said: "31 unread" }}>
        #help
      </NavItem>
      <NavItem href="/c" lead={<Icon name="people" />} badge={{ said: "2 unread" }}>
        noor
      </NavItem>
      <NavItem onClick={() => undefined} lead={<Icon name="bookmark" />}>
        Saved
      </NavItem>
    </Stack>
  ),
};
