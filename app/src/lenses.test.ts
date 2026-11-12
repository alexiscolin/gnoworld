import { EARTH } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import { liveWorlds, roomWorlds, withEarth } from "./lenses.ts";

// A lens lights its worlds and the Earth with them, always: the home never dims under a filter; the tag's count stays the lens's own.
describe("a lens's light", () => {
  it("keeps the Earth lit whatever the lens, and gives the same set for the same lens's worlds", () => {
    const games = new Set(["bubble", "gnogolf"]);
    const lit = withEarth(games);
    expect([...(lit ?? [])].sort()).toEqual([EARTH, "bubble", "gnogolf"].sort());
    expect(withEarth(games)).toBe(lit);
    expect(games.has(EARTH)).toBe(false);
    expect(withEarth(undefined)).toBeUndefined();
  });
});

// Who is here names a world by its room's world, a slug ("nym-alexiscolin000-gnogolf-<ten hex>"); the lenses by the worlds' file's id: a
// world of someone's namespace was never lit by Live, the two never met.
describe("Live's worlds", () => {
  it("light a namespace's world by its file's id, a hub's by its own, never the Earth", () => {
    const rooms = roomWorlds(["nym-alexiscolin000/gnogolf", "govdao"], [{ slug: "govdao" }]);
    const golf = [...rooms].find(([, id]) => id === "nym-alexiscolin000/gnogolf")?.[0] ?? "";
    expect(golf).toMatch(/^nym-alexiscolin000-gnogolf-[0-9a-f]{10}$/);
    const present = new Map([
      [golf, { here: 3 }],
      ["govdao", { here: 2 }],
      ["gnoswap", { here: 0 }],
      [EARTH, { here: 9 }],
    ]);
    expect([...liveWorlds(present, rooms)].sort()).toEqual(["govdao", "nym-alexiscolin000/gnogolf"]);
  });
});
