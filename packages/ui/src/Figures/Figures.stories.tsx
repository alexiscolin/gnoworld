import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stage } from "../Overview/Region.tsx";
import { FIGURES } from "../Overview/samples.ts";
import { Figures } from "./Figures.tsx";

const meta = {
  component: Figures,
  // A plate's block: drawn in the plate's container, as the world's page draws it.
  decorators: [
    (Story) => (
      <Stage>
        <Story />
      </Stage>
    ),
  ],
  args: {
    label: "Figures",
    figures: FIGURES,
  },
} satisfies Meta<typeof Figures>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Four: Story = {};
