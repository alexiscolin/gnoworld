import { describe, expect, it } from "vitest";
import { placesOf } from "@gnoworld/core";
import { prerenderPaths } from "./prerender.ts";

// Slice 5's 5d: every place has its page, at its path and at its canonical address, and the list has one.
describe("prerenderPaths", () => {
  const places = () =>
    placesOf({
      defaultUniverse: "onyx",
      universes: [{ id: "onyx" }, { id: "gnoland" }],
      hubs: [
        { slug: "bubble", universe: "onyx" },
        { slug: "other", universe: "gnoland" },
      ],
      ecosystems: [{ slug: "tokens", universe: "onyx" }],
    });

  it("is every place's path and canonical address, and the list, each once", () => {
    const paths = prerenderPaths(places());
    expect([...paths].sort()).toEqual(
      [
        "/",
        "/earth",
        "/w/bubble",
        "/e/tokens",
        "/list",
        "/net/onyx/",
        "/net/onyx/earth",
        "/net/onyx/w/bubble",
        "/net/onyx/e/tokens",
        "/net/gnoland/",
        "/net/gnoland/earth",
        "/net/gnoland/w/other",
      ].sort(),
    );
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("holds the Earth of every universe even when the data holds no world", () => {
    const paths = prerenderPaths(places().filter((p) => p.kind === "cosmos" || p.kind === "earth"));
    expect(paths).toEqual(expect.arrayContaining(["/", "/earth", "/list", "/net/onyx/earth", "/net/gnoland/earth"]));
  });

  it("is nothing when there is no home", () => {
    expect(prerenderPaths([])).toEqual([]);
  });
});
