import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "../icons/Icon.tsx";
import { Stack } from "../compositions/index.ts";
import { disc } from "../Overview/samples.ts";
import { PlanetThumb } from "../PlanetThumb/PlanetThumb.tsx";
import { Row } from "./Row.tsx";

const meta = {
  component: Row,
  args: { title: "Bubble", subtitle: "The BUBBLE token and its governance" },
} satisfies Meta<typeof Row>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const Divided: Story = {
  render: () => (
    <Stack as="ul" space="3xs">
      <li>
        <Row look="divided" title="General" activity="12 here now" lead={<Icon name="chat" />} />
      </li>
      <li>
        <Row look="divided" title="Dev help" activity="3 here now" lead={<Icon name="code" />} current />
      </li>
    </Stack>
  ),
};
export const Boxed: Story = {
  args: {
    look: "boxed",
    lead: <PlanetThumb src={disc("5cf2c8")} name="Bubble" decorative />,
    activity: "214 here now",
    href: "#bubble",
  },
};
export const CurrentLink: Story = {
  args: { look: "divided", href: "#bubble", current: true, activity: "214 here now" },
};
export const LongText: Story = {
  args: {
    title: "The GovDAO world, where proposals are read, argued over and voted on",
    subtitle: "gno.land/r/gov/dao · the third proposal of the season, on sessions",
    activity: "96 calls a day",
  },
};
