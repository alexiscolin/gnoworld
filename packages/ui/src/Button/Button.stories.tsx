import type { Meta, StoryObj } from "@storybook/react-vite";
import { Cluster, Stack } from "../compositions/index.ts";
import { Button } from "./Button.tsx";

const meta = { component: Button, args: { children: "Read the proposals" } } satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { emphasis: "solid" } };
export const Outline: Story = {};
export const Quiet: Story = { args: { emphasis: "quiet", children: "Read it · free" } };
export const Danger: Story = { args: { emphasis: "solid", tone: "danger", children: "Delete the room" } };
export const WithIcon: Story = { args: { icon: "planet", children: "Fly to Earth" } };
export const Disabled: Story = { args: { disabled: true, children: "Register" } };
export const Busy: Story = { args: { busy: true, children: "Waiting for Adena" } };
export const LongLabel: Story = { args: { children: "Vote yes on proposal 15 · signs in Adena, the fee is yours" } };

export const Sizes: Story = {
  render: (args) => (
    <Cluster>
      {(["s", "m", "l"] as const).map((size) => (
        <Button key={size} {...args} size={size}>
          Join the chat
        </Button>
      ))}
    </Cluster>
  ),
};

// The declared axes: emphasis × tone at the default size, then the two states.
export const Matrix: Story = {
  render: () => (
    <Stack>
      {(["neutral", "danger"] as const).map((tone) => (
        <Cluster key={tone}>
          {(["solid", "outline", "quiet"] as const).map((emphasis) => (
            <Button key={emphasis} emphasis={emphasis} tone={tone}>
              {tone === "danger" ? "Leave the room" : "Join the chat"}
            </Button>
          ))}
        </Cluster>
      ))}
      <Cluster>
        <Button disabled>Register</Button>
        <Button busy>Waiting for Adena</Button>
      </Cluster>
    </Stack>
  ),
};
