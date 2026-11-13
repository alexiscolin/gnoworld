import type { Meta, StoryObj } from "@storybook/react-vite";
import { PagedList, type PagedListProps } from "./PagedList.tsx";

// 130 realms' paths, so the page, the filter and the explorer all show.
const REALMS = Array.from({ length: 130 }, (_, i) => ({
  path: `gno.land/r/demo/realm${String(i + 1).padStart(3, "0")}`,
  calls: (i * 37) % 101,
}));
type Realm = (typeof REALMS)[number];

const args: PagedListProps<Realm> = {
  label: "realms",
  items: REALMS,
  keyOf: (r) => r.path,
  textOf: (r) => r.path,
  render: (r) => (
    <p>
      {r.path} · {r.calls} calls
    </p>
  ),
  sorts: [
    { id: "name", label: "Name", compare: (a, b) => a.path.localeCompare(b.path) },
    { id: "calls", label: "Calls", compare: (a, b) => b.calls - a.calls },
  ],
  explorer: { href: "/explorer", label: "See all 130 in the explorer" },
};
const meta = { component: PagedList<Realm>, args } satisfies Meta<typeof PagedList<Realm>>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Short: Story = { args: { items: REALMS.slice(0, 5), sorts: [] } };
