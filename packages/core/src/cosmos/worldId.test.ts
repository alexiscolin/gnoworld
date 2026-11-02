import { describe, expect, it } from "vitest";
import { worldIdOf } from "./worldId.ts";

// A world is a product (decision of 2026-11-01, 11): the server's job groups realms by this id, and a world's page draws the planet of the same
// id, so both read one rule.
describe("worldIdOf", () => {
  it.each([
    ["gno.land/r/gov/dao", "gov/dao"],
    ["gno.land/r/gnogolf/golf_v2/v3", "gnogolf/golf"],
    ["gno.land/r/memba/memba_feed_v1", "memba/memba"],
    ["gno.land/r/gnoland/blog", "gnoland/blog"],
    ["gno.land/r/leon", "leon"],
    ["gno.land/r/leon/v3", "leon"],
    ["gno.land/r/demo/x/daily/one/v2", "demo/x/daily/one"],
    ["gno.land/r/n/x/daily", "n/x/daily"],
    ["gno.land/r/n/demo/tools/v1", "n/demo/tools"],
  ])("names %s's world %s", (path, id) => {
    expect(worldIdOf(path)).toBe(id);
  });
});
