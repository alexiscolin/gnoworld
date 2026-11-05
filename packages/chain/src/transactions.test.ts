import { describe, expect, it } from "vitest";
import { blocksQuery, catchUpQuery, deploysQuery, subscriptionsOf } from "./transactions.ts";

// Slice 9g: the words of the indexer's GraphQL the server's reads send, from the live schema of the Onyx indexer (2026-11-06).
describe("the indexer's queries for the chain's rooms", () => {
  it("subscribes to the transactions of the realms and to the blocks, and a realm's path is a quoted string", () => {
    const [txs, blocks] = subscriptionsOf(["gno.land/r/a/b", 'x"y']);
    expect(txs?.id).toBe("tx");
    expect(txs?.query).toMatch(/^subscription \{ getTransactions\(where: \{ success: \{ eq: true \}, _or: \[/);
    expect(txs?.query).toContain('pkg_path: { eq: "gno.land/r/a/b" }');
    expect(txs?.query).toContain('eq: "x\\"y"');
    expect(txs?.query).toContain("add_package");
    expect(txs?.query).not.toMatch(/memo|args|events/);
    expect(blocks).toEqual({ id: "blocks", query: "subscription { getBlocks(where: {}) { height time } }" });
  });

  it("asks only the deploys when no realm is watched", () => {
    expect(subscriptionsOf([])[0]?.query).toContain('_or: [{ messages: { typeUrl: { eq: "add_package" } } }]');
  });

  it("asks the catch-up from a block on, oldest first, a page at a time", () => {
    const query = catchUpQuery(["gno.land/r/a"], 101, 500);
    expect(query).toContain("block_height: { gt: 100 }");
    expect(query).toContain("heightAndIndex: ASC");
    expect(query).toContain("limit: 500");
  });

  it("asks the deploys newest first, below a block when it is given one", () => {
    expect(deploysQuery(undefined, 100)).not.toContain("block_height: {");
    expect(deploysQuery(41, 100)).toContain("block_height: { lt: 41 }");
    expect(deploysQuery(41, 100)).toContain("heightAndIndex: DESC");
  });

  it("asks the time of each block named, no more rows than blocks", () => {
    const query = blocksQuery([5, 9]);
    expect(query).toContain("{ height: { eq: 5 } }, { height: { eq: 9 } }");
    expect(query).toContain("limit: 2");
  });
});
