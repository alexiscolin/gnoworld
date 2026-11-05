import { worldLook } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import { worldThumb } from "./worldThumb.ts";

const IDS = ["bubble", "govdao", "gnoswap", "kyoto-builders", "art-hall", "fresh-mint", "memba", "gnogolf"];

describe("worldThumb", () => {
  it("is an SVG data picture the PlanetThumb draws as its own", () => {
    expect(worldThumb("bubble")).toMatch(/^data:image\/svg\+xml,/);
  });

  it("gives one world the same picture every time", () => {
    expect(worldThumb("bubble")).toBe(worldThumb("bubble"));
  });

  it("gives worlds of different seeds different pictures", () => {
    expect(new Set(IDS.map(worldThumb)).size).toBe(IDS.length);
  });

  it("is drawn from the world's look: its ramp's colours, in bands for a giant and patches for the rest", () => {
    const drawn = (id: string) => decodeURIComponent(worldThumb(id).replace("data:image/svg+xml,", ""));
    for (const id of IDS) {
      const { anchor, ramp } = worldLook(id);
      const middle = ramp[1]
        .map((v) =>
          Math.round(255 * v)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("");
      const svg = drawn(id);
      expect(svg.includes(`#${middle}`)).toBe(true);
      expect(svg.includes("<ellipse")).toBe(!/giant|cloud deck|sub-Neptune/.test(anchor));
    }
  });
});
