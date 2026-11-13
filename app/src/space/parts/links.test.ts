import { describe, expect, it } from "vitest";
import type { Planet } from "../layout.ts";
import { litBy, type Link } from "./links.ts";

const planet = (id: string): Planet => ({ id }) as Planet;
const [a, b, c, d] = [planet("a"), planet("b"), planet("c"), planet("d")] as const;
const link = (from: Planet, to: Planet): Link => ({ from, to });

describe("litBy", () => {
  it("lights the hovered planet and the other end of each of its links, whichever way they point", () => {
    expect(litBy(a, [link(a, b), link(c, a)])).toEqual(new Set(["a", "b", "c"]));
  });

  it("lights a planet with no link alone, and never the worlds of links it has no part in", () => {
    expect(litBy(d, [])).toEqual(new Set(["d"]));
  });
});
