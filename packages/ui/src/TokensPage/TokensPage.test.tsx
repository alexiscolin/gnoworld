import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { eachStory } from "../testing.tsx";
import { tokens } from "../tokens.ts";
import * as stories from "./TokensPage.stories.tsx";
import { TokensPage } from "./TokensPage.tsx";

// Where a token is drawn, and the private property its preview reads.
const preview = (name: string) => document.querySelector(`[data-preview="${name}"]`);

describe("TokensPage", () => {
  it("shows every token of the file, once, with its value", () => {
    render(<TokensPage />);
    for (const { name, value } of tokens()) {
      expect(screen.getAllByText(name, { exact: true })).toHaveLength(1);
      expect(preview(name)?.textContent).toContain(value);
    }
  });

  it("draws each colour as a swatch of that very token", () => {
    render(<TokensPage />);
    for (const { name } of tokens().filter((t) => /^--(p|color)-/.test(t.name))) {
      const swatch = preview(name)?.querySelector("[data-swatch]");
      expect(swatch instanceof HTMLElement && swatch.style.getPropertyValue("--_swatch")).toBe(`var(${name})`);
    }
  });

  it("draws space and sizes to scale, radii as corners, and type in its own font", () => {
    render(<TokensPage />);
    const drawn = {
      "--space-": "--_length",
      "--control-": "--_length",
      "--icon-": "--_length",
      "--radius-": "--_radius",
      "--font-": "--_font",
    };
    for (const [prefix, property] of Object.entries(drawn)) {
      const matching = tokens().filter((t) => t.name.startsWith(prefix));
      expect(matching.length, prefix).toBeGreaterThan(0);
      for (const { name } of matching) {
        const sample = preview(name)?.querySelector("[data-sample]");
        expect(sample instanceof HTMLElement && sample.style.getPropertyValue(property), name).toBe(`var(${name})`);
      }
    }
  });

  it("sets the primitives apart in their own region, since only the token file reads them", () => {
    render(<TokensPage />);
    const primitives = screen.getByRole("region", { name: "Primitives" });
    const names = tokens()
      .filter((t) => t.group === "Primitives")
      .map((t) => t.name);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(primitives.contains(preview(name))).toBe(true);
    expect(primitives.querySelectorAll("[data-preview]")).toHaveLength(names.length);
  });

  it("renders its story", () => {
    const found = eachStory(stories, () => screen.queryByRole("region", { name: "Primitives" }));
    expect(found.length).toBeGreaterThan(0);
    for (const region of found) expect(region).not.toBeNull();
  });
});
