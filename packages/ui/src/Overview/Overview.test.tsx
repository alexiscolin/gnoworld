import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { eachStory } from "../testing.tsx";
import { ICON_NAMES } from "../icons/Icon.tsx";
import type * as ui from "../index.ts";
import { Overview } from "./Overview.tsx";
import * as stories from "./Overview.stories.tsx";

// docs/DESIGN-SYSTEM.md, "Storybook shows everything": each component the entry gives, by the region that shows it and the mark it
// leaves there; tsc fails this object the day a component joins the entry with nothing named here. stillCopy, sightRef, Room, useAlone, holdsEscape, typedIn, composing and grouped are helpers
// with nothing to draw.
const SHOWN: Record<
  Exclude<
    keyof typeof ui,
    "stillCopy" | "sightRef" | "Room" | "useAlone" | "holdsEscape" | "typedIn" | "composing" | "grouped"
  >,
  readonly [region: string, mark: string]
> = {
  Breadcrumb: ["Links", "nav[aria-label] [aria-current='page']"],
  Button: ["Buttons", "button[data-emphasis]:not([aria-label])"],
  IconButton: ["Icon buttons", "button[data-emphasis][aria-label]"],
  Kicker: ["Kickers", "p.label"],
  Logo: ["Logos", "svg[aria-hidden='true']"],
  Panel: ["Panels", "section[data-look]"],
  Flash: ["Flashes", "[role='status'] p"],
  EmptyState: ["Empty states", "h3 + p"],
  Icon: ["Icons", "svg[data-icon]"],
  iconNode: ["Icons", "[data-icon-node] svg[data-icon]"],
  Stack: ["Buttons", "[data-space]"],
  Cluster: ["Kickers", "[data-justify]"],
  Grid: ["Compositions", "[data-min]"],
  Sidebar: ["Compositions", "[data-side]"],
  Switcher: ["Compositions", "[data-side] > [data-space] > [data-max]"],
  Center: ["Compositions", "[data-max]"],
  Cell: ["Hub cards", "[data-span]"],
  Tooltip: ["Icon buttons", "[aria-hidden='true'][data-shown]"],
  Chip: ["Chips", "[data-tone]"],
  Tabs: ["Tabs", "[role='tablist']"],
  Popover: ["Popovers", "[popover]"],
  Menu: ["Popovers", "[role='menu']"],
  Dialog: ["Dialogs", "dialog"],
  Skeleton: ["Skeletons", "[data-shape]"],
  Card: ["Cards", "article"],
  NavItem: ["Rows", "[data-nav-item]"],
  Row: ["Rows", "[data-look]"],
  Field: ["Fields", "input"],
  Combobox: ["Fields", "input[role='combobox']"],
  Switch: ["Fields", "input[role='switch']"],
  Select: ["Fields", "select"],
  FieldWords: ["Fields", "p[id$='-help']"],
  Listbox: ["Fields", "ul[role='listbox'] [role='option']"],
  Stat: ["Stats", "[data-value]"],
  Progress: ["Stats", "[role='progressbar']"],
  ComingSoon: ["Stats", "button[aria-disabled='true'][aria-label$='coming soon']"],
  ActivityChart: ["Activity", "svg [data-hour]"],
  DayChart: ["Day chart", "svg [data-hour]"],
  PagedList: ["Paged list", "ul > li"],
  ShowMore: ["Paged list", 'button[data-emphasis="outline"]'],
  Disclosure: ["Paged list", "button[aria-expanded][aria-controls]"],
  Network: ["Network", "svg[role='group'] circle"],
  // The band's cells (977255f1 rebuilt it: a figure is a cell of its grid, its value a span, no longer a Stat's `data-value`).
  Figures: ["Figures", "section[data-look='hub'] [data-span='3']"],
  Sparkline: ["Activity", "svg[data-tone]"],
  Planet: ["Planets", "span.disc[aria-hidden='true']"],
  PlanetThumb: ["Planets", "[data-kind]"],
  Avatar: ["Avatars", "[data-kind] svg"],
  Stamp: ["Stats", "svg[role='img'][color]"],
  Badge: ["Stats", "svg[role='img'][data-tone]"],
  LinkProvider: ["Links", "a[data-page-link]"],
  ChatLayout: ["Chat layout", "[data-chat-layout] [data-region='conversation']"],
};

describe("Overview", () => {
  it.each(Object.entries(SHOWN))("shows %s in its region", (_, [name, mark]) => {
    render(<Overview />);
    expect(screen.getByRole("region", { name }).querySelector(mark)).not.toBeNull();
  });

  it("names no two regions alike, as axe's landmark-unique asks", () => {
    render(<Overview />);
    const names = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  it("has a region for Text", () => {
    render(<Overview />);
    expect(screen.getByRole("region", { name: "Text" })).toBeTruthy();
  });

  it("shows each emphasis and tone of Button, and its disabled and busy states", () => {
    render(<Overview />);
    const buttons = within(screen.getByRole("region", { name: "Buttons" })).getAllByRole("button");
    const looks = new Set(buttons.map((b) => `${b.dataset["emphasis"] ?? ""} ${b.dataset["tone"] ?? ""}`));
    for (const look of ["solid neutral", "outline neutral", "quiet neutral", "solid danger", "outline danger"]) {
      expect(looks).toContain(look);
    }
    expect(buttons.some((b) => b.hasAttribute("disabled"))).toBe(true);
    expect(buttons.some((b) => b.getAttribute("aria-busy") === "true")).toBe(true);
  });

  it("shows every icon, each named beside it", () => {
    render(<Overview />);
    const icons = screen.getByRole("region", { name: "Icons" });
    // Every glyph once, and the one iconNode draws beside them.
    expect(icons.querySelectorAll("svg")).toHaveLength(ICON_NAMES.length + 1);
    for (const name of ICON_NAMES) expect(within(icons).getByText(name, { exact: true })).toBeTruthy();
  });

  it("renders its story", () => {
    const found = eachStory(stories, () => screen.queryByRole("region", { name: "Buttons" }));
    expect(found.length).toBeGreaterThan(0);
    for (const region of found) expect(region).not.toBeNull();
  });
});
