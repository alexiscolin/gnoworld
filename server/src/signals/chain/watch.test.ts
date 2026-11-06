import { Hubs } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { jsonOf } from "@gnoworld/core";
import { secure, watchOf } from "./watch.ts";

// Slice 9g: which realms tie to which world, from the data's own hubs (app/data/hubs.json), and which indexer addresses are read.
const WORLD = (slug: string, universe: string, realms?: string[]) => ({
  slug,
  name: slug,
  description: `${slug}, a world of the test, with the fifty characters the data's schema asks of a description`,
  universe,
  ...(realms === undefined ? {} : { realms }),
});

describe("the realms a universe watches", () => {
  it("ties each realm of a world's data to that world, in its own universe only", () => {
    const list = Hubs.parse([
      WORLD("govdao", "onyx", ["gno.land/r/gov/dao", "gno.land/r/gov/dao/v3"]),
      WORLD("bubble", "onyx"),
      WORLD("other", "gnoland", ["gno.land/r/other/realm"]),
    ]);
    const watch = watchOf(list, "onyx");
    expect([...watch.entries()]).toEqual([
      ["gno.land/r/gov/dao", { world: "govdao" }],
      ["gno.land/r/gov/dao/v3", { world: "govdao" }],
    ]);
  });

  it("reads the shipped data: GovDAO's realm is the Onyx world's, and Bubble, with none, ties nothing", () => {
    const watch = watchOf(
      Hubs.parse(jsonOf(readFileSync(new URL("../../../../app/data/hubs.json", import.meta.url), "utf8"))),
      "onyx",
    );
    expect(watch.get("gno.land/r/gov/dao")).toEqual({ world: "govdao" });
    expect([...watch.values()].some(({ world }) => world === "bubble")).toBe(false);
  });
});

describe("the indexer's address", () => {
  it("is secure when it is https", () => {
    expect(secure("https://indexer.example.test/graphql/query")).toBe(true);
  });

  it.each(["http://indexer.example.test/graphql/query", "wss://x.test/q", "javascript:alert(1)", "not a url", ""])(
    "refuses %j: the server reads over TLS an address the data names, nothing else",
    (address) => {
      expect(secure(address)).toBe(false);
    },
  );
});
