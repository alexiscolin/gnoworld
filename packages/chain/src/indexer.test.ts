import { REALM_FACTS_CAPS } from "@gnoworld/schemas/indexer";
import { describe, expect, it } from "vitest";
import { readFacts } from "./indexer.ts";
import type { ChainFetch, ChainRead } from "./read.ts";

// The package's own read of the indexer (D112), seen through StrykerJS by its own tests. onyx-1 has no `realmFacts` (F4875):
// the facts are the realm's deploy, as the app's indexer.test.ts reads it from onyx-1's recorded answers.
const INDEXER = "https://indexer.onyx.example/graphql/query";
const REALM = "gno.land/r/demo/poll";

function fakeIndexer(body: unknown, status = 200) {
  const asked: string[] = [];
  const fetch: ChainFetch = (url) => {
    asked.push(url);
    return Promise.resolve(status === 200 ? Response.json(body) : new Response("", { status }));
  };
  return { asked, fetch };
}
const kindOf = (read: ChainRead<unknown>) => (read.ok ? "ok" : read.failure.kind);
// A deploy's transaction as the indexer answers it: the block, and the message that added `path`, by `creator` when it is given.
const deployed = (path: string, block: number, creator?: string) => ({
  data: {
    getTransactions: [
      {
        block_height: block,
        messages: [
          { value: { __typename: "MsgAddPackage", ...(creator === undefined ? {} : { creator }), package: { path } } },
        ],
      },
    ],
  },
});

describe("readFacts", () => {
  it("asks the indexer one GraphQL query for the realm's deploy and gives its facts with where they were read", async () => {
    const indexer = fakeIndexer(deployed(REALM, 12, "g1deployer"));
    const read = await readFacts(INDEXER, REALM, { fetch: indexer.fetch });
    expect(read).toMatchObject({ ok: true, value: { path: REALM, deployer: "g1deployer", firstBlock: 12 } });
    expect(indexer.asked).toHaveLength(1);
    const url = new URL(indexer.asked[0] ?? "");
    expect(url.searchParams.get("query")).toContain("getTransactions");
    expect(url.searchParams.get("query")).toContain("add_package");
    expect(JSON.parse(url.searchParams.get("variables") ?? "")).toEqual({ path: REALM });
    expect(read.source.url).toBe(indexer.asked[0]);
  });

  it("takes a deploy that names no creator, and leaves the deployer out", async () => {
    const read = await readFacts(INDEXER, REALM, { fetch: fakeIndexer(deployed(REALM, 3)).fetch });
    expect(read).toMatchObject({ ok: true, value: { path: REALM, firstBlock: 3 } });
    expect(read.ok && "deployer" in read.value).toBe(false);
  });

  it.each([
    ["a realm it does not know", { data: { getTransactions: null } }, "no-realm"],
    ["a deploy of another realm", deployed("gno.land/r/demo/other", 3), "wrong-shape"],
    ["an answer with errors", { data: { getTransactions: null }, errors: [{ message: "x" }] }, "wrong-shape"],
  ])("refuses %s", async (_case, body, kind) => {
    expect(kindOf(await readFacts(INDEXER, REALM, { fetch: fakeIndexer(body).fetch }))).toBe(kind);
  });

  it("gives the transport's failure as it is, its status kept", async () => {
    const read = await readFacts(INDEXER, REALM, { fetch: fakeIndexer({}, 503).fetch });
    expect(read).toMatchObject({ ok: false, failure: { kind: "down", status: 503 } });
  });

  it("refuses a name past the cap before anything is asked, and asks one at the cap", async () => {
    const long = fakeIndexer({ data: { getTransactions: null } });
    const past = await readFacts(INDEXER, "a".repeat(REALM_FACTS_CAPS.path + 1), { fetch: long.fetch });
    expect(past).toMatchObject({ ok: false, failure: { kind: "bad-name" }, source: { url: INDEXER } });
    expect(long.asked).toEqual([]);
    await readFacts(INDEXER, "a".repeat(REALM_FACTS_CAPS.path), { fetch: long.fetch });
    expect(long.asked).toHaveLength(1);
  });
});
