import type { Meta, StoryObj } from "@storybook/react-vite";
import { TokensPage } from "./TokensPage.tsx";

const meta = { title: "Tokens", component: TokensPage } satisfies Meta<typeof TokensPage>;
export default meta;

export const All: StoryObj<typeof meta> = {};
