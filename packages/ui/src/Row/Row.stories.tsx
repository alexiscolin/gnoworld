import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "../icons/Icon.tsx";
import { Stack } from "../compositions/index.ts";
import { PlanetThumb } from "../PlanetThumb/PlanetThumb.tsx";
import { Row } from "./Row.tsx";

const planet =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='20' fill='%235cf2c8'/%3E%3C/svg%3E";

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
    lead: <PlanetThumb src={planet} name="Bubble" decorative />,
    activity: "214 here now",
    href: "#bubble",
  },
};
export const LongText: Story = {
  args: {
    title: "The GovDAO world, where proposals are read, argued over and voted on",
    subtitle: "gno.land/r/gov/dao · the third proposal of the season, on sessions",
    activity: "96 calls a day",
  },
};
