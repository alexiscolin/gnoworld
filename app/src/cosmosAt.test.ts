import { describe, expect, it } from "vitest";
import { systemOfPage } from "./cosmosAt.ts";

// The views' bar's System goes to the system round the place one is on (Alexis, 2026-11-07, D383): a realm's own namespace, a system's
// own, and the Earth's anywhere else.
describe("the system round a page", () => {
  it.each([
    ["/r/nym-sixseven067/markets", "nym-sixseven067"],
    ["/r/gnops/valopers", "gnops"],
    ["/r/samcrew/escrow_v4/", "samcrew"],
    ["/s/samcrew", "samcrew"],
    ["/s/g1abc%2Fodd", "g1abc/odd"],
  ])("is %s's own: %s", (path, system) => {
    expect(systemOfPage(path)).toBe(system);
  });

  it.each(["/", "/earth", "/w/govdao", "/universe", "/net/gnoland/r/gov/dao", "/r/", "/s/"])(
    "is the Earth's for %s",
    (path) => {
      expect(systemOfPage(path)).toBeUndefined();
    },
  );
});
