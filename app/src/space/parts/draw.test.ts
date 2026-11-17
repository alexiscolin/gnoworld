import { EARTH } from "@gnoworld/core";
import type { BufferGeometry } from "three";
import { describe, expect, it, vi } from "vitest";
import type { Planet } from "../layout.ts";
import type { Maps } from "./maps.ts";

vi.mock("../earth/earth.ts", () => ({ earthPlanet: (maps: object) => ({ maps }) }));
const { drawnOf } = await import("./draw.ts");

const HALF = { day: "day 2048", night: "night 2048", clouds: "clouds 2048", moon: "moon" };
const FULL = { day: "day 4096", night: "night 4096", clouds: "clouds 4096" };
const earthWith = (full: typeof FULL | undefined) =>
  // A fake with no fullEarth: making the Earth only reads the full maps, and asks none (a world's page made it ahead and fetched 2.5 MB).
  drawnOf({ id: EARTH } as Planet, { earth: () => HALF, fullCame: full } as unknown as Maps, {
    sphere: {} as BufferGeometry,
    page: true,
  });

describe("drawnOf, the Earth", () => {
  it("is made from its full maps once they came: no swap is left for its dive (Alexis saw it pop mid-dive)", () => {
    expect(earthWith(FULL)).toEqual({ maps: { ...HALF, ...FULL } });
  });

  it("is made from its half ones while the full ones are on their way", () => {
    expect(earthWith(undefined)).toEqual({ maps: HALF });
  });
});
