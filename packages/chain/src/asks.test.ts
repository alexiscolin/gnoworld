import { describe, expect, it } from "vitest";
import { callsAbove, callsFirst, callsInBlock, docAsk, fileAsk, nameAsk, pathsAsk, renderAsk } from "./asks.ts";

const ADDRESS = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

describe("the abci asks", () => {
  it("name a route and its data: a page, the paths under a prefix, a package's doc and file", () => {
    expect(renderAsk("gno.land/r/demo/poll")).toEqual({ path: "vm/qrender", data: "gno.land/r/demo/poll:" });
    expect(pathsAsk("gno.land/r/", 100)).toEqual({ path: "vm/qpaths?limit=100", data: "gno.land/r/" });
    expect(docAsk("gno.land/p/demo/avl")).toEqual({ path: "vm/qdoc", data: "gno.land/p/demo/avl" });
    expect(fileAsk("gno.land/p/demo/avl/gnomod.toml")).toEqual({
      path: "vm/qfile",
      data: "gno.land/p/demo/avl/gnomod.toml",
    });
  });

  it("ask a name through core's builder for an address, and nothing for a text that is none", () => {
    expect(nameAsk(ADDRESS)).toMatchObject({ path: "vm/qeval" });
    expect(nameAsk(ADDRESS)?.data).toContain(ADDRESS);
    expect(nameAsk('g1x") + evil("')).toBeNull();
  });
});

describe("the indexer's asks", () => {
  it("choose transactions by a call's type, in height order, with their bound as a variable", () => {
    for (const ask of [callsFirst(5), callsAbove(7, 5), callsInBlock(9)]) {
      expect(ask.query).toContain('typeUrl: { eq: "exec" }');
      expect(ask.query).toContain("order: { heightAndIndex: ASC }");
    }
    expect(callsFirst(5).variables).toEqual({ limit: 5 });
    expect(callsAbove(7, 5).variables).toEqual({ above: 7, limit: 5 });
    expect(callsInBlock(9).variables).toEqual({ height: 9 });
  });

  it("bound a page above a height, and a block to its height", () => {
    expect(callsAbove(7, 5).query).toContain("block_height: { gt: $above }");
    expect(callsInBlock(9).query).toContain("block_height: { eq: $height }");
    expect(callsInBlock(9).query).not.toContain("limit");
  });
});
