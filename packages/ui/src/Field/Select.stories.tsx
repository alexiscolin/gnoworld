import type { Meta, StoryObj } from "@storybook/react-vite";
import { Select } from "./Select.tsx";

const meta = {
  component: Select,
  args: {
    label: "Your country",
    value: "JP",
    onChange: () => undefined,
    options: [
      { value: "", label: "No country" },
      { value: "FR", label: "France" },
      { value: "JP", label: "Japan" },
    ],
  },
} satisfies Meta<typeof Select>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Chosen: Story = {};
export const Nothing: Story = { args: { value: "" } };
