import { describe, expect, it } from "vitest";
import { indexerOf } from "./indexerOf.ts";

// 5k: where a chain's public indexer is, as gnoweb's host is (gnoweb.ts). The two addresses are ADR-0001's own, answering a live
// query of 2026-10-30 (docs/plans/slice-5-part-2.md, question 4); the wire itself is F2950's.
describe("indexerOf: where a chain's indexer is", () => {
  it("names the two GraphQL addresses by chain id", () => {
    expect(indexerOf("gnoland-1")).toBe("https://indexer.gno.land/graphql/query");
    expect(indexerOf("onyx-1")).toBe("https://indexer.onyx.testnets.gno.land/graphql/query");
  });

  it("names none for any other chain, an object's key included", () => {
    for (const id of ["", "gnoland-2", "ONYX-1", "constructor", "toString", "__proto__"]) {
      expect(indexerOf(id)).toBeUndefined();
    }
  });
});
