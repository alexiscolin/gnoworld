import type { Meta, StoryObj } from "@storybook/react-vite";
import { Field } from "./Field.tsx";

const meta = { component: Field, args: { label: "Room name", value: "", onChange: () => undefined } } satisfies Meta<
  typeof Field
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Text: Story = { args: { help: "Up to 32 letters" } };
export const Search: Story = { args: { kind: "search", label: "Search worlds" } };
export const DateAndTime: Story = { args: { kind: "date", label: "Starts", value: "2026-10-21T18:00" } };
export const WithPrefix: Story = { args: { label: "Name", prefix: "@", value: "alexis" } };
export const WithError: Story = {
  args: { label: "Name", prefix: "@", value: "ab", help: "Six letters at least", error: "Too short" },
};
export const Lines: Story = {
  args: { kind: "lines", label: "Message", help: "Shift+Enter adds a line", value: "- one\n- two\n- three" },
};
export const LinesWithError: Story = {
  args: { kind: "lines", label: "Message", value: "one\ntwo", error: "Line 2 is too long by 12 bytes." },
};
