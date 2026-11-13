import type { Meta, StoryObj } from "@storybook/react-vite";
import { Cluster, Stack } from "../compositions/index.ts";
import { Panel } from "../Panel/Panel.tsx";
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
export const AsLink: Story = { args: { href: "#rooms", emphasis: "solid", children: "Open the rooms" } };
export const LongLabel: Story = { args: { children: "Vote yes on proposal 15 · signs in Adena, the fee is yours" } };
// The composer's Ask Jarvis: Jarvis's violet on a quiet button, its spark close to the control before it.
export const Signal: Story = {
  args: { emphasis: "quiet", tone: "signal", size: "s", icon: "spark", lead: "close", children: "Jarvis" },
};

// The plate's buttons with words, 20 px in.
export const WidePad: Story = { args: { href: "#chat", pad: "wide", icon: "chat", children: "Say hi in the chat" } };

// A bar's tool (`tool`) is pictured as the bar draws it, by its icons: IconButton's Tools and Popover's ToolTrigger. Words at
// that ink read under AA's 4.5:1, so no story shows them.

// A bar whose one link is the whole bar: the link's press covers the panel, whose hover lights the button.
export const Stretched: Story = {
  render: () => (
    <Panel label="Ask about Bubble">
      <p>Nobody has spoken in #general yet. Your question can be the first.</p>
      <Button href="#chat" icon="chat" stretch>
        Open chat
      </Button>
    </Panel>
  ),
};

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
      {(["neutral", "danger", "signal"] as const).map((tone) => (
        <Cluster key={tone}>
          {(["solid", "outline", "quiet"] as const).map((emphasis) => (
            <Button key={emphasis} emphasis={emphasis} tone={tone}>
              {{ neutral: "Join the chat", danger: "Leave the room", signal: "Ask Jarvis" }[tone]}
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
