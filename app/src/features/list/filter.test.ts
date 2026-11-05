import { describe, expect, it } from "vitest";
import { filterByGenre, type ListedPlace } from "./filter.ts";

// The genre of a place is not in the data files yet (the hubs' schema has no such field): the list's
// view model carries it, and the question of where it comes from is put to Alexis (brief 5d).
const place = (slug: string, genres: string[]): ListedPlace => ({
  slug,
  name: slug,
  description: "",
  path: `/w/${slug}`,
  genres,
});
const all = [place("a", ["game"]), place("b", ["tool", "game"]), place("c", []), place("d", ["tool"])];

describe("filterByGenre", () => {
  it("keeps every place when no genre is chosen", () => {
    expect(filterByGenre(all, [])).toEqual(all);
  });

  it("keeps the places of the chosen genre", () => {
    expect(filterByGenre(all, ["tool"]).map((p) => p.slug)).toEqual(["b", "d"]);
  });

  it("keeps the places of any of several chosen genres, once each, in their order", () => {
    expect(filterByGenre(all, ["tool", "game"]).map((p) => p.slug)).toEqual(["a", "b", "d"]);
  });

  it("keeps none for a genre no place has, and drops a place with no genre", () => {
    expect(filterByGenre(all, ["nope"])).toEqual([]);
    expect(filterByGenre(all, ["game"]).map((p) => p.slug)).not.toContain("c");
  });

  it("does not change the list it is given", () => {
    const before = structuredClone(all);
    filterByGenre(all, ["game"]);
    expect(all).toEqual(before);
  });
});
