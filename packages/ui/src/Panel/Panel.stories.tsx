import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../Button/Button.tsx";
import { Panel } from "./Panel.tsx";

const meta = { component: Panel, args: { label: "Notifications" } } satisfies Meta<typeof Panel>;
export default meta;
type Story = StoryObj<typeof meta>;

const parts = (
  <>
    <Panel.Header>
      <h2>Notifications</h2>
    </Panel.Header>
    <Panel.Body>
      <p>Nothing new</p>
    </Panel.Body>
    <Panel.Footer>
      <Button>Mark read</Button>
    </Panel.Footer>
  </>
);

export const Docked: Story = { args: { children: parts } };
export const Floating: Story = { args: { look: "floating", children: parts } };
export const Plate: Story = {
  args: {
    label: "Bubble",
    look: "plate",
    caption: "gnoworld · hub atlas",
    children: (
      <Panel.Body>
        <h1>Bubble</h1>
        <p>The BUBBLE token and its governance.</p>
      </Panel.Body>
    ),
  },
};
