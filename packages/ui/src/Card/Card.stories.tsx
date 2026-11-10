import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../Button/Button.tsx";
import { Card } from "./Card.tsx";

const poll = (
  <>
    <Card.Header icon="chart" kicker="Poll" title="Which realm next?" state="Live" />
    <Card.Body>
      <p>Three answers, 41 votes so far.</p>
    </Card.Body>
    <Card.Actions>
      <Button emphasis="solid">Vote</Button>
      <Button emphasis="quiet">See the results</Button>
    </Card.Actions>
  </>
);

const meta = { component: Card, args: { children: poll } } satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};
export const Assistant: Story = {
  args: {
    tone: "signal",
    children: (
      <>
        <Card.Header icon="spark" kicker="Assistant" title="What this realm does" />
        <Card.Body>
          <p>It keeps a list of names and who owns each; anyone can register one for a fee.</p>
        </Card.Body>
      </>
    ),
  },
};
export const Dashed: Story = { args: { dashed: true } };
export const Compact: Story = { args: { compact: true } };
export const Hub: Story = { args: { look: "hub" } };
export const HubExpandable: Story = {
  args: {
    look: "hub",
    children: (
      <>
        <Card.Header title="Calls per day" expand={{ open: false, onToggle: () => undefined }} />
        <Card.Body>
          <p>Three answers, 41 votes so far.</p>
        </Card.Body>
      </>
    ),
  },
};
