import { describe, expect, it } from "vitest";
import { placesOf } from "@gnoworld/core";
import { prerenderPaths } from "./prerender.ts";

// Slice 5's 5c: pre-rendering reads the places from the data. Until 5d, the pages that exist are the home and the
// worlds' (the default universe's, unprefixed).
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
      stations: [],
    });

  it("is the home and each world of the default universe, from the data", () => {
    expect(prerenderPaths(places())).toEqual(["/", "/w/bubble"]);
  });

  it("is the home alone when the data holds no world", () => {
    expect(prerenderPaths(places().filter((p) => p.kind !== "world"))).toEqual(["/"]);
  });
});
