import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChainFetch, ChainRead, Failure, ReadOptions } from "@gnoworld/chain/read";
import { REALM_FACTS_CAPS, RealmDeployAnswer } from "@gnoworld/schemas/indexer";
import recorded from "../../../tests/chain/onyxRealmDeploy.json" with { type: "json" };
import { readRealmFacts } from "./indexer.ts";

// 5k, the indexer reader: onyx-1's recorded answers (8g, F4875: `realmFacts` was never defined there) and the faults on a fake fetch, as
// rpc.test.ts does. The body a fault test builds is the recorded shape: a deploy's transaction, its MsgAddPackage.
const INDEXER = "https://indexer.onyx.testnets.gno.land/graphql/query";
const REALM = "gno.land/r/gnoland/wugnot";
const NOW = new Date("2026-10-31T06:00:00.000Z");
const HOSTILE = "<script>alert('HOSTILE')</script>\u0000\u202e HOSTILE";
const FACTS = {
  path: REALM,
  deployer: "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5",
  firstBlock: 786661,
};

const answering = (body: unknown, init?: ResponseInit) =>
  vi.fn<ChainFetch>(() => Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), init)));
const options = (fetcher: ChainFetch, extra: ReadOptions = {}): ReadOptions => ({
  fetch: fetcher,
  now: () => NOW,
  ...extra,
});
// The recorded answer's shape around `facts`: null for no transaction; a fact left out is a field left out of the message.
const withFacts = (
  facts: null | { path?: unknown; deployer?: unknown; firstBlock?: unknown; extra?: unknown } | string,
) => ({
  data: {
    getTransactions:
      facts === null
        ? null
        : typeof facts === "string"
          ? facts
          : [
              {
                block_height: facts.firstBlock ?? 1,
                messages: [
                  {
                    value: {
                      __typename: "MsgAddPackage",
                      ...(facts.deployer === undefined ? {} : { creator: facts.deployer }),
                      package: { path: facts.path ?? REALM },
                      ...(facts.extra === undefined ? {} : { extra: facts.extra }),
                    },
                  },
                ],
              },
            ],
  },
});
const answerOf = (index: number) => {
  const answer = recorded.answers[index];
  if (answer === undefined) throw new Error("no such recording");
  return answer;
};

function failureOf(result: ChainRead<unknown>): Failure {
  if (result.ok) throw new Error("expected a failure");
  expect(result.failure.next).toMatch(/\S/);
  expect(result.source.at).toBe(NOW.toISOString());
  return result.failure;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("readRealmFacts", () => {
  it("reads onyx-1's recorded deploys: the creator and the block, and no-realm for a path none added", async () => {
    const read = async (index: number) => {
      const { variables, body, status } = answerOf(index);
      return readRealmFacts(recorded.indexer, variables.path, options(answering(body, { status })));
    };
    const genesis = await read(0);
    expect(genesis.ok && genesis.value).toEqual({
      path: "gno.land/r/gov/dao",
      deployer: "g1g73v2anukg4ej7axwqpthsatzrxjsh0wk797da",
      firstBlock: 0,
    });
    const later = await read(1);
    expect(later.ok && later.value).toMatchObject({ path: "gno.land/r/samcrew/connect4", firstBlock: 235627 });
    expect(failureOf(await read(2)).kind).toBe("no-realm");
  });

  it("asks the recorded query, the path in its variables", async () => {
    const fetcher = answering(withFacts(FACTS));
    await readRealmFacts(INDEXER, REALM, options(fetcher));
    const url = new URL(fetcher.mock.calls[0]?.[0] ?? "");
    expect(url.searchParams.get("query")).toBe(recorded.query);
    expect(JSON.parse(url.searchParams.get("variables") ?? "")).toEqual({ path: REALM });
  });

  it("says wrong-shape when the transaction adds another path or holds no deploy", async () => {
    const other = readRealmFacts(INDEXER, REALM, options(answering(withFacts({ path: "gno.land/r/other/realm" }))));
    expect(failureOf(await other).kind).toBe("wrong-shape");
    const call = { data: { getTransactions: [{ block_height: 3, messages: [{ value: { __typename: "MsgCall" } }] }] } };
    expect(failureOf(await readRealmFacts(INDEXER, REALM, options(answering(call)))).kind).toBe("wrong-shape");
  });

  it("gives the facts with the source and the time, and asks once, by GET, with nothing of the visitor's", async () => {
    const fetcher = answering(withFacts(FACTS));
    const result = await readRealmFacts(INDEXER, REALM, options(fetcher));
    expect(result.ok && result.value).toEqual(FACTS);
    expect(result.source.at).toBe(NOW.toISOString());
    expect(result.source.url.startsWith(INDEXER)).toBe(true);
    expect(decodeURIComponent(result.source.url)).toContain(REALM);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(result.source.url);
    expect(init).toMatchObject({ method: "GET", credentials: "omit" });
  });

  it("leaves a fact the indexer did not give out of the value, and drops a field it does not know", async () => {
    const result = await readRealmFacts(
      INDEXER,
      REALM,
      options(answering(withFacts({ path: REALM, firstBlock: 4, extra: "x" }))),
    );
    expect(result.ok && result.value).toEqual({ path: REALM, firstBlock: 4 });
  });

  it("gives a deployer of hostile text as the same text: reading never interprets it", async () => {
    const result = await readRealmFacts(
      INDEXER,
      REALM,
      options(answering(withFacts({ path: REALM, deployer: HOSTILE }))),
    );
    expect(result.ok && result.value).toEqual({ path: REALM, deployer: HOSTILE, firstBlock: 1 });
  });

  it("says no-realm for a realm the indexer does not know", async () => {
    const result = await readRealmFacts(INDEXER, REALM, options(answering(withFacts(null))));
    expect(failureOf(result).kind).toBe("no-realm");
  });

  it.each([
    ["a GraphQL errors body with no data", { errors: [{ message: "HOSTILE" }], data: null }],
    ["errors beside data", { errors: [{ message: "HOSTILE" }], ...withFacts(FACTS) }],
    ["data null", { data: null }],
    ["an empty object", {}],
    ["an array", []],
    ["a string", '"text"'],
    ["null", null],
    ["a path that is no text", withFacts({ path: 5 })],
    ["a deployer that is no text", withFacts({ deployer: { a: 1 } })],
    ["a first block as text", withFacts({ firstBlock: "7" })],
    ["a negative first block", withFacts({ firstBlock: -1 })],
    ["transactions that are no list", withFacts("x")],
    ["an overlong path", withFacts({ path: `gno.land/r/${"a".repeat(300)}` })],
    ["an overlong deployer", withFacts({ deployer: "g".repeat(200) })],
  ])("says wrong-shape for %s, and none of the answer's words reach the failure", async (_name, body) => {
    const result = await readRealmFacts(INDEXER, REALM, options(answering(body)));
    expect(failureOf(result).kind).toBe("wrong-shape");
    expect(JSON.stringify(result)).not.toContain("HOSTILE");
  });

  // Each cap at its bound: the last length is read, the next is refused (the answer's two texts, and the path asked).
  it("takes a path and a deployer of exactly their caps, and refuses one character more", async () => {
    const answer = (path: string, deployer: string) =>
      RealmDeployAnswer.safeParse(withFacts({ path, deployer })).success;
    expect(answer("p".repeat(REALM_FACTS_CAPS.path), "d")).toBe(true);
    expect(answer("p".repeat(REALM_FACTS_CAPS.path + 1), "d")).toBe(false);
    const read = (deployer: string) =>
      readRealmFacts(INDEXER, REALM, options(answering(withFacts({ path: REALM, deployer }))));
    expect((await read("d".repeat(REALM_FACTS_CAPS.deployer))).ok).toBe(true);
    expect((await read("d".repeat(REALM_FACTS_CAPS.deployer + 1))).ok).toBe(false);
  });

  it("asks a realm path of exactly the cap and refuses one character more as a bad name, asking nothing", async () => {
    const path = (length: number) => `gno.land/r/${"a".repeat(length - "gno.land/r/".length)}`;
    const fetcher = answering(withFacts(null));
    expect(failureOf(await readRealmFacts(INDEXER, path(REALM_FACTS_CAPS.path), options(fetcher))).kind).toBe(
      "no-realm",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(failureOf(await readRealmFacts(INDEXER, path(REALM_FACTS_CAPS.path + 1), options(fetcher))).kind).toBe(
      "bad-name",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("says down for a 500, with its status and none of its body", async () => {
    const fetcher = answering(HOSTILE, { status: 500 });
    const result = await readRealmFacts(INDEXER, REALM, options(fetcher));
    expect(failureOf(result)).toMatchObject({ kind: "down", status: 500 });
    expect(JSON.stringify(result)).not.toContain("HOSTILE");
  });

  it("says down when the request fails", async () => {
    const fetcher = vi.fn<ChainFetch>(() => Promise.reject(new TypeError("HOSTILE failed to fetch")));
    const result = await readRealmFacts(INDEXER, REALM, options(fetcher));
    expect(failureOf(result).kind).toBe("down");
    expect(JSON.stringify(result)).not.toContain("HOSTILE");
  });

  it("says not-json for a body that is no JSON", async () => {
    const result = await readRealmFacts(INDEXER, REALM, options(answering("<html>HOSTILE</html>")));
    expect(failureOf(result).kind).toBe("not-json");
  });

  it("says too-big for a body past the cap, declared or streamed", async () => {
    const big = JSON.stringify(withFacts({ path: `gno.land/r/${"a".repeat(200)}` }));
    const declared = answering(big, { headers: { "content-length": String(big.length) } });
    expect(failureOf(await readRealmFacts(INDEXER, REALM, options(declared, { maxBytes: 64 }))).kind).toBe("too-big");
    const streamed = answering(big);
    expect(failureOf(await readRealmFacts(INDEXER, REALM, options(streamed, { maxBytes: 64 }))).kind).toBe("too-big");
  });

  it("says too-big past the default cap, a megabyte, with no option given", async () => {
    const huge = JSON.stringify(withFacts({ path: "a".repeat(1024 * 1024) }));
    expect(failureOf(await readRealmFacts(INDEXER, REALM, options(answering(huge)))).kind).toBe("too-big");
  });

  it("says timeout when the indexer never answers, and leaves no timer behind", async () => {
    const fetcher = vi.fn<ChainFetch>(() => new Promise<Response>(() => undefined));
    const pending = readRealmFacts(INDEXER, REALM, options(fetcher));
    await vi.advanceTimersByTimeAsync(8_001);
    expect(failureOf(await pending).kind).toBe("timeout");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    "http://indexer.onyx.testnets.gno.land/graphql/query",
    "https://user:pass@indexer.onyx.testnets.gno.land/graphql/query",
    "//indexer.onyx.testnets.gno.land/graphql/query",
    "javascript:alert(1)",
    "",
  ])("refuses the indexer address %j without asking anything", async (indexer) => {
    const fetcher = answering(withFacts(FACTS));
    expect(failureOf(await readRealmFacts(indexer, REALM, options(fetcher))).kind).toBe("refused");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "javascript:alert(1)",
    "gno.land/p/demo/avl",
    "gno.land/r/demo/x?query=1",
    'gno.land/r/demo/x"} { evil',
    "gno.land/r/demo/x\n",
    `gno.land/r/${"a".repeat(400)}`,
    HOSTILE,
  ])("refuses the realm path %j as a bad name without asking anything", async (path) => {
    const fetcher = answering(withFacts(FACTS));
    expect(failureOf(await readRealmFacts(INDEXER, path, options(fetcher))).kind).toBe("bad-name");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("asks nothing again by itself: one call is one request, then no timer", async () => {
    const fetcher = answering(withFacts(FACTS));
    await readRealmFacts(INDEXER, REALM, options(fetcher));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
