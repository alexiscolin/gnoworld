import { existsSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PICTURES, RERUN, staleWorlds, worldIds } from "../../tests/tools/pictureInputs.ts";
import { pictureOf } from "./worldPictures.ts";

// Alexis 2026-11-06: the chat's planets are pictures of the real ones, taken once; a picture older than what its look is made from fails.
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
});
