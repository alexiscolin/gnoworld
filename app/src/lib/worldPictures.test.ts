import { existsSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inputsOf, PICTURES, RERUN, staleWorlds, worldIds } from "../../tests/tools/pictureInputs.ts";
import { pictureOf } from "./worldPictures.ts";

// The chat's planets are pictures of the real ones, taken once; a picture older than what its look is made from fails.
describe("worldPictures", () => {
  it("gives a world's picture as a path of the site, and none for a world nobody took", () => {
    expect(pictureOf("earth")).toMatch(/^\/world-pictures\/earth\.[0-9a-f]{8}\.webp$/);
    expect(pictureOf("no/such")).toBeUndefined();
  });

  it("has a small picture on disk for each world, the Earth first, and none left over", () => {
    const ids = worldIds();
    expect(ids[0]).toBe("earth");
    const files = ids.map((id) => (pictureOf(id) ?? "").replace("/world-pictures/", ""));
    for (const file of files) {
      expect(existsSync(`${PICTURES}${file}`), file).toBe(true);
      expect(statSync(`${PICTURES}${file}`).size, file).toBeLessThan(12_000);
    }
    expect(readdirSync(PICTURES, { recursive: true }).sort()).toEqual([...files].sort());
  });

  it("finds no world's picture older than its look", () => {
    expect(staleWorlds().map(({ id, why }) => `${id}: ${why}; run ${RERUN}`)).toEqual([]);
  });

  it("names the world whose seed changed, and the one with no picture, and the script to rerun", () => {
    const taken = "old-seed";
    const changed = staleWorlds(
      ["earth", "gov/dao", "unpictured/world"],
      (id) => (id === "gov/dao" ? "new-seed" : "old-seed"),
      { earth: taken, "gov/dao": taken },
    );
    expect(changed.map(({ id, why }) => [id, why])).toEqual([
      ["gov/dao", "its look changed"],
      ["unpictured/world", "no picture"],
    ]);
    expect(RERUN).toContain("planetPictures");
  });

  // gnosh's colony is drawn by its own code, not a seeded planet's maps: its picture is retaken when that code changes (D13740).
  it("makes the colony's picture from the colony's code and the portraits', and from no planet's map", () => {
    const files = inputsOf("gnosh-ai");
    for (const name of ["crown.ts", "hull.ts", "colony.ts", "materials.ts", "shapes.ts"])
      expect(files.some((file) => file.endsWith(`/space/colony/${name}`)), name).toBe(true);
    expect(files.some((file) => file.endsWith("/space/portraits.ts"))).toBe(true);
    expect(files.some((file) => file.includes("/public/"))).toBe(false);
  });
});
