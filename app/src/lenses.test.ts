// @vitest-environment jsdom
import { EARTH } from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { describe, expect, it, vi } from "vitest";
import { liveWorlds, roomWorlds, startLenses, withEarth } from "./lenses.ts";

// The lenses read the worlds' file once: a read that failed is read again at the next start, and who is here is heard once whatever happens.
const held = vi.hoisted(() => {
  const files: (Worlds | undefined)[] = [];
  return { files, heard: 0 };
});
vi.mock(import("./worldsFile.ts"), () => ({
  worldsFile: () => Promise.resolve(held.files.shift()),
  worldsOptions: () => {
    throw new Error("not asked here");
  },
}));
vi.mock(import("./railFeed.ts"), async (original) => ({
  ...(await original()),
  data: () => undefined,
  subscribe: () => {
    held.heard += 1;
    return () => undefined;
  },
}));
const FILE: Worlds = { version: 1, universe: "onyx", updated: "2026-11-13T00:00:00.000Z", worlds: [] };

describe("starting the lenses", () => {
  it("reads the file again after a read that failed, then lights, and hears who is here once", async () => {
    held.files.push(undefined, FILE);
    startLenses();
    await vi.waitFor(() => {
      expect(held.files).toHaveLength(1);
    });
    startLenses();
    await vi.waitFor(() => {
      expect(held.files).toHaveLength(0);
    });
    expect(held.heard).toBe(1);
  });
});

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
