import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { storiesOf } from "../testing.tsx";
import { ICON_NAMES } from "../icons/Icon.tsx";
import { Overview } from "./Overview.tsx";
import * as stories from "./Overview.stories.tsx";

// docs/DESIGN-SYSTEM.md, "Storybook shows everything": one page shows every component at once.
describe("Overview", () => {
  it.each(["Buttons", "Icon buttons", "Kickers", "Icons", "Compositions"])("has a region for %s", (name) => {
    render(<Overview />);
    expect(screen.getByRole("region", { name })).toBeTruthy();
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
    expect(icons.querySelectorAll("svg")).toHaveLength(ICON_NAMES.length);
    for (const name of ICON_NAMES) expect(within(icons).getByText(name, { exact: true })).toBeTruthy();
  });

  it("renders its story", () => {
    for (const { element } of storiesOf(stories)) {
      const { unmount } = render(element);
      expect(screen.getByRole("region", { name: "Buttons" })).toBeTruthy();
      unmount();
    }
  });
});
