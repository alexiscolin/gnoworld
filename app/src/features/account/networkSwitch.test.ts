import { describe, expect, it, vi } from "vitest";
import { siteOf } from "../../places.ts";
import { switchTo } from "./networkSwitch.ts";

// Choosing another network (D13501): the same place when that network holds it, else its home and a line saying so. Paths are the app's own
// (places.ts); a realm is on the other network only if that network's chain says so, read, never guessed from the path.
const row = (slug: string, universe: string) => ({
  slug,
  name: slug.toUpperCase(),
  description: `${slug} of ${universe}, described at more than fifty characters, as the schema asks of it.`,
  universe,
});
const site = siteOf({
  universes: [
    { id: "onyx", name: "Onyx", default: true, testnet: true },
    { id: "gnoland", name: "gno.land" },
  ],
  // bubble is on both, only-onyx on Onyx alone.
  hubs: [row("bubble", "onyx"), row("bubble", "gnoland"), row("only-onyx", "onyx")],
  ecosystems: [],
  genres: [],
});
const REALM = "gno.land/r/gov/dao";
const go = (pathname: string, to: string, holds = vi.fn(() => Promise.resolve(true))) =>
  switchTo({ site, pathname, to, holds });

describe("switchTo", () => {
  it("keeps a world where the other network lists it, both ways", async () => {
    expect(await go("/w/bubble", "gnoland")).toEqual({ path: "/net/gnoland/w/bubble" });
    expect(await go("/net/gnoland/w/bubble", "onyx")).toEqual({ path: "/w/bubble" });
  });

  it("keeps the Earth, and the galaxy, which every network has", async () => {
    expect(await go("/earth", "gnoland")).toEqual({ path: "/net/gnoland/earth" });
    expect(await go("/net/gnoland/earth", "onyx")).toEqual({ path: "/earth" });
  });

  it("goes to the other network's home, with a line, for a world it does not list", async () => {
    const found = await go("/w/only-onyx", "gnoland");
    expect(found.path).toBe("/net/gnoland");
    expect(found.line).toMatch(/not on gno\.land/i);
  });

  it("goes to the default network's home as `/`, not `/net/onyx`", async () => {
    expect((await go("/net/gnoland/w/nope", "onyx")).path).toBe("/");
  });

  it("keeps a realm's page when the other network's chain holds the realm, asked of that network and no other", async () => {
    const holds = vi.fn(() => Promise.resolve(true));
    expect(await go(`/r/gov/dao`, "gnoland", holds)).toEqual({ path: "/net/gnoland/r/gov/dao" });
    expect(holds).toHaveBeenCalledExactlyOnceWith("gnoland", REALM);
    expect(await go(`/net/gnoland/r/gov/dao`, "onyx", holds)).toEqual({ path: "/r/gov/dao" });
    expect(holds).toHaveBeenLastCalledWith("onyx", REALM);
  });

  it("goes home with a line when the chain says the realm is not there, or the read fails", async () => {
    for (const holds of [() => Promise.resolve(false), () => Promise.reject(new Error("down"))]) {
      const found = await go("/r/gov/dao", "gnoland", vi.fn(holds));
      expect(found.path).toBe("/net/gnoland");
      expect(found.line).toMatch(/not on gno\.land/i);
    }
  });

  it("asks no chain for a place that is no realm's", async () => {
    const holds = vi.fn(() => Promise.resolve(true));
    await go("/w/bubble", "gnoland", holds);
    await go("/earth", "gnoland", holds);
    expect(holds).not.toHaveBeenCalled();
  });

  it("stays put for the network one is on", async () => {
    expect(await go("/w/bubble", "onyx")).toEqual({ path: "/w/bubble" });
  });
});
