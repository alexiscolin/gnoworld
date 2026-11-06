import { describe, expect, it } from "vitest";
import { blocksQuery, catchUpQuery, deploysQuery, placeQuery } from "./transactions.ts";

// Slice 9g: the words of the indexer's GraphQL the server's reads send, from the live schema of the Onyx indexer (2026-11-06).
describe("the indexer's queries for the chain's rooms", () => {
  it("asks the transactions of the realms, a realm's path a quoted string, and no args, memo or events", () => {
    const query = catchUpQuery(["gno.land/r/a/b", 'x"y'], { after: { height: 1 }, tip: 9 }, 5);
    expect(query).toMatch(
      /^\{ getTransactions\(where: \{ success: \{ eq: true \}, block_height: \{ lt: 10 \}, _and: \[\{ _or: \[/,
    );
    expect(query).toContain('pkg_path: { eq: "gno.land/r/a/b" }');
    expect(query).toContain('eq: "x\\"y"');
    expect(query).toContain("add_package");
    expect(query).not.toMatch(/memo|args|events/);
    expect(query).toContain("{ hash block_height index success messages");
  });

  it("separates the filters of the deploys and of each realm", () => {
    expect(catchUpQuery(["gno.land/r/a", "gno.land/r/b"], { after: { height: 1 }, tip: 5 }, 5)).toContain(
      '"add_package" } } }, { messages: { value: { MsgCall: { pkg_path: { eq: "gno.land/r/a" } } } } }, { messages: { value: { MsgCall: { pkg_path: { eq: "gno.land/r/b" }',
    );
  });

  it("asks only the deploys when no realm is watched", () => {
    expect(catchUpQuery([], { after: { height: 1 }, tip: 5 }, 5)).toContain(
      '_or: [{ messages: { typeUrl: { eq: "add_package" } } }]',
    );
  });

  it("asks the rows after a place, a block's own later rows included, oldest first, a page at a time (F5885)", () => {
    const query = catchUpQuery(["gno.land/r/a"], { after: { height: 101, index: 3 }, tip: 120 }, 500);
    expect(query).toContain(
      "{ _or: [{ block_height: { gt: 101 } }, { block_height: { eq: 101 }, index: { gt: 3 } }] }] }",
    );
    expect(query).toContain("heightAndIndex: ASC");
    expect(query).toContain("limit: 500");
  });

  it("asks the blocks after a block whose rows were all read when the place has no index", () => {
    const query = catchUpQuery(["gno.land/r/a"], { after: { height: 101 }, tip: 120 }, 500);
    expect(query).toContain("{ block_height: { gt: 101 } }] }");
    expect(query).not.toContain("index: {");
  });

  it("is bounded above by the tip, so a range is never open-ended (F5885)", () => {
    expect(catchUpQuery([], { after: { height: 1 }, tip: 7000 }, 5)).toContain("block_height: { lt: 7001 }");
  });

  it("asks only the place of the next row when the fields are the place's (a row too big to read)", () => {
    expect(placeQuery([], { after: { height: 1 }, tip: 5 })).toMatch(/limit: 1\) \{ block_height index \} \}$/);
  });

  it("asks the deploys newest first, below a block when it is given one", () => {
    expect(deploysQuery(undefined, 100)).not.toContain("block_height: {");
    expect(deploysQuery(undefined, 100)).toContain("where: { success: { eq: true }, _or: [{ messages: { typeUrl");
    expect(deploysQuery(41, 100)).toContain("block_height: { lt: 41 }");
    expect(deploysQuery(41, 100)).toContain("heightAndIndex: DESC");
  });

  it("asks the time of each block named, no more rows than blocks", () => {
    const query = blocksQuery([5, 9]);
    expect(query).toContain("{ height: { eq: 5 } }, { height: { eq: 9 } }");
    expect(query).toContain("limit: 2");
  });
});
