import { REALM_FACTS_CAPS } from "@gnoworld/schemas/indexer";
import { describe, expect, it } from "vitest";
import { readFacts } from "./indexer.ts";
import type { ChainFetch, ChainRead } from "./read.ts";

// The package's own read of the indexer (D112): what the app's readRealmFacts asks once its name passed evalCall's grammar.
// StrykerJS sees a package's code through its own tests alone, as its sandbox links the workspaces' packages to the tree.
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

describe("readFacts", () => {
  it("asks the indexer one GraphQL query for the realm and gives its facts with where they were read", async () => {
    const facts = { path: REALM, deployer: "g1deployer", firstBlock: 12 };
    const indexer = fakeIndexer({ data: { realmFacts: facts } });
    const read = await readFacts(INDEXER, REALM, { fetch: indexer.fetch });
    expect(read).toMatchObject({ ok: true, value: facts });
    const query = "query($path: String!) { realmFacts(path: $path) { path deployer firstBlock } }";
    const url = `${INDEXER}?query=${encodeURIComponent(query)}&variables=${encodeURIComponent(`{"path":"${REALM}"}`)}`;
    expect(indexer.asked).toEqual([url]);
    expect(read.source.url).toBe(url);
  });

  it("takes facts that name no path as this realm's", async () => {
    const indexer = fakeIndexer({ data: { realmFacts: { firstBlock: 3 } } });
    expect(await readFacts(INDEXER, REALM, { fetch: indexer.fetch })).toMatchObject({
      ok: true,
      value: { firstBlock: 3 },
    });
  });

  it.each([
    ["a realm it does not know", { data: { realmFacts: null } }, "no-realm"],
    ["another realm's facts", { data: { realmFacts: { path: "gno.land/r/demo/other" } } }, "wrong-shape"],
    ["an answer with errors", { data: { realmFacts: null }, errors: [{ message: "x" }] }, "wrong-shape"],
  ])("refuses %s", async (_case, body, kind) => {
    expect(kindOf(await readFacts(INDEXER, REALM, { fetch: fakeIndexer(body).fetch }))).toBe(kind);
  });

  it("gives the transport's failure as it is, its status kept", async () => {
    const read = await readFacts(INDEXER, REALM, { fetch: fakeIndexer({}, 503).fetch });
    expect(read).toMatchObject({ ok: false, failure: { kind: "down", status: 503 } });
  });

  it("refuses a name past the cap before anything is asked, and asks one at the cap", async () => {
    const long = fakeIndexer({ data: { realmFacts: null } });
    const past = await readFacts(INDEXER, "a".repeat(REALM_FACTS_CAPS.path + 1), { fetch: long.fetch });
    expect(past).toMatchObject({ ok: false, failure: { kind: "bad-name" }, source: { url: INDEXER } });
    expect(long.asked).toEqual([]);
    await readFacts(INDEXER, "a".repeat(REALM_FACTS_CAPS.path), { fetch: long.fetch });
    expect(long.asked).toHaveLength(1);
  });
});
