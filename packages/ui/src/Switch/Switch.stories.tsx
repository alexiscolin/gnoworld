import type { Meta, StoryObj } from "@storybook/react-vite";
import { Switch } from "./Switch.tsx";

const meta = {
  component: Switch,
  args: {
    label: "Reduce animations",
    description: "Nothing flies or flares; your system's setting counts too.",
    checked: false,
    onChange: () => undefined,
  },
} satisfies Meta<typeof Switch>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {};
export const On: Story = { args: { checked: true } };
export const NameAlone: Story = {
  render: ({ label, checked, onChange }) => <Switch label={label} checked={checked} onChange={onChange} />,
};
export const LongText: Story = {
  args: {
    label: "Space in 3D on a phone, even on a slow network and an old device",
    description:
      "On a phone, the worlds show as a list until you ask for space; this draws them in space from the first screen.",
  },
};
