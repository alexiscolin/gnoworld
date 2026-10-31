import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatLayout } from "./ChatLayout.tsx";

const meta = {
  component: ChatLayout,
  parameters: { layout: "fullscreen" },
  args: {
    header: <p>Earth · General chat</p>,
    worlds: <p>Worlds</p>,
    rooms: <p>Rooms</p>,
    info: <p>Here now</p>,
    children: <p>Lines</p>,
  },
} satisfies Meta<typeof ChatLayout>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Full: Story = {};
export const WithoutInfo: Story = { args: { info: undefined } };
export const ThreadFirst: Story = { args: { infoFirst: true } };
