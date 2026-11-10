import type { Meta, StoryObj } from "@storybook/react-vite";
import { FIGURES } from "../Overview/samples.ts";
import { Figures } from "./Figures.tsx";

const meta = {
  component: Figures,
  args: {
    label: "Figures",
    figures: FIGURES,
  },
} satisfies Meta<typeof Figures>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Four: Story = {};
