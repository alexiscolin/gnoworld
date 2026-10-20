import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { eachStory } from "../testing.tsx";
import { ICON_NAMES } from "../icons/Icon.tsx";
import type * as ui from "../index.ts";
import { Overview } from "./Overview.tsx";
import * as stories from "./Overview.stories.tsx";

// docs/DESIGN-SYSTEM.md, "Storybook shows everything": one page shows every component at once.
// Each component the entry gives, by the region that shows it: tsc fails this object the day a
// component joins the entry with no region named here.
const REGION_OF: Record<keyof typeof ui, string> = {
  Button: "Buttons",
  IconButton: "Icon buttons",
  Kicker: "Kickers",
  Flash: "Flashes",
  EmptyState: "Empty states",
  Icon: "Icons",
  Stack: "Compositions",
  Cluster: "Compositions",
  Grid: "Compositions",
  Sidebar: "Compositions",
  Switcher: "Compositions",
  Center: "Compositions",
};

describe("Overview", () => {
  it("has a region for every component the entry gives", () => {
    render(<Overview />);
    for (const name of new Set(Object.values(REGION_OF))) expect(screen.getByRole("region", { name })).toBeTruthy();
  });

  it.each(["Buttons", "Icon buttons", "Kickers", "Flashes", "Empty states", "Icons", "Text", "Compositions"])(
    "has a region for %s",
    (name) => {
      render(<Overview />);
      expect(screen.getByRole("region", { name })).toBeTruthy();
    },
  );

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
    expect(icons.querySelectorAll("svg")).toHaveLength(ICON_NAMES.length);
    for (const name of ICON_NAMES) expect(within(icons).getByText(name, { exact: true })).toBeTruthy();
  });

  it("renders its story", () => {
    const found = eachStory(stories, () => screen.queryByRole("region", { name: "Buttons" }));
    expect(found.length).toBeGreaterThan(0);
    for (const region of found) expect(region).not.toBeNull();
  });
});
