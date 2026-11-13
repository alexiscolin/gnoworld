import type { Worlds } from "@gnoworld/schemas/indexer";
import { describe, expect, it, vi } from "vitest";
import { realmsListed } from "./listed.ts";

const file = (...paths: string[]) =>
  ({
    worlds: [{ id: "w", realms: paths.map((path) => ({ path })) }],
  }) as unknown as Worlds;

describe("the realms a worlds file lists", () => {
  it("lists every realm of every world, none without a file", () => {
    expect(realmsListed(() => undefined)().size).toBe(0);
    expect([...realmsListed(() => file("gno.land/r/a", "gno.land/r/b"))()]).toEqual(["gno.land/r/a", "gno.land/r/b"]);
  });

  it("builds the set once for one file and again for the next", () => {
    let current = file("gno.land/r/a");
    const read = vi.fn(() => current);
    const listed = realmsListed(read);
    expect(listed()).toBe(listed());
    current = file("gno.land/r/b");
    expect([...listed()]).toEqual(["gno.land/r/b"]);
  });
});
