import type { Meta, StoryObj } from "@storybook/react-vite";
import { Overview } from "./Overview.tsx";

const meta = { title: "Overview", component: Overview } satisfies Meta<typeof Overview>;
export default meta;

export const All: StoryObj<typeof meta> = {};
