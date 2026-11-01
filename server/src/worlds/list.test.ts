import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { abciRefused, fakeChain, RPC } from "../testing/fakeWorldsChain.ts";
import { LIST_MAX_BYTES, LIST_MAX_PATHS, LIST_MAX_QUERIES, readRealmPaths } from "./list.ts";

// vm/qpaths answers the paths joined by a newline, sorted, with no metadata (handler.go:233 at v1.5.0; 7c-notes.md). Its limit
// is 1,000 by default and 10,000 at most, and a limit over the cap is lowered, not refused.
const ONYX = readFileSync(new URL("./onyxPaths.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((line) => line !== "");
const ask = (given: Parameters<typeof fakeChain>[0]["paths"]) => {
  const chain = fakeChain({ paths: given });
  return { chain, read: () => readRealmPaths({ send: chain.send, rpc: RPC }) };
};

describe("readRealmPaths", () => {
  it("reads the recorded list in one request, asking vm/qpaths for gno.land/r/ with the cap as limit", async () => {
    const { chain, read } = ask(() => ONYX.join("\n"));
    expect(await read()).toEqual({ ok: true, paths: ONYX });
    expect(chain.asked).toHaveLength(1);
    expect(chain.asked[0]?.kind).toBe("vm/qpaths");
    expect(chain.asked[0]?.data).toBe("gno.land/r/");
    expect(decodeURIComponent(chain.asked[0]?.url ?? "")).toContain(`limit=${String(LIST_MAX_PATHS)}`);
  });

  it("asks through the one way out: a time limit on the call, and no cookie or credential", async () => {
    const { chain, read } = ask(() => "gno.land/r/a/b");
    await read();
    expect(chain.asked[0]?.ms).toBeGreaterThan(0);
    expect(chain.asked[0]?.ms).toBeLessThanOrEqual(30_000);
    expect(Number.isFinite(chain.asked[0]?.ms)).toBe(true);
    expect(JSON.stringify(chain.asked[0]?.init.headers ?? {}).toLowerCase()).not.toMatch(/cookie|authorization/);
  });

  it("gives an empty list as an empty list: a chain with no realm is no fault", async () => {
    expect(await ask(() => "").read()).toEqual({ ok: true, paths: [] });
  });

  it("drops a path that is no realm path and keeps the others, in the answer's order", async () => {
    const answer = ["gno.land/r/a/b", "<script>", "gno.land/p/x/y", "gno.land/r/c/d", ""].join("\n");
    expect(await ask(() => answer).read()).toEqual({ ok: true, paths: ["gno.land/r/a/b", "gno.land/r/c/d"] });
  });

  it("refuses an answer past the byte cap without keeping any of it", async () => {
    const huge = "gno.land/r/a/b\n".repeat(Math.ceil(LIST_MAX_BYTES / 15) + 1);
    expect(await ask(() => huge).read()).toEqual({ ok: false, kind: "too_large" });
  });

  // A chain as vm/qpaths answers: the paths that start with the prefix, sorted, at most `limit` of them.
  const chainOf = (all: string[], limit: number) => {
    const sorted = [...all].sort();
    return (prefix: string): string =>
      sorted
        .filter((path) => path.startsWith(prefix))
        .slice(0, limit)
        .join("\n");
  };
  const pagedRead = (all: string[], limit: number, answer = chainOf(all, limit)) => {
    const chain = fakeChain({ paths: answer });
    return { chain, read: () => readRealmPaths({ send: chain.send, rpc: RPC, limit }) };
  };
  const spread = Array.from(
    { length: 60 },
    (_, i) => `gno.land/r/${"abcdef"[i % 6] ?? "a"}${String(i % 7)}/app${String(i)}`,
  );

  describe("a list the chain cuts at its limit", () => {
    it("is read by prefix: the prefix splits on the next character, and every path comes back once", async () => {
      const { chain, read } = pagedRead(spread, 10);
      const result = await read();
      expect(result.ok && [...result.paths].sort()).toEqual([...spread].sort());
      expect(chain.asked.length).toBeGreaterThan(1);
      expect(chain.asked.every(({ data }) => data.startsWith("gno.land/r/"))).toBe(true);
      expect(chain.asked.every(({ url }) => decodeURIComponent(url).includes("limit=10"))).toBe(true);
    });

    it("reads a list of exactly the limit as a whole list, not as a refusal", async () => {
      const exact = spread.slice(0, 10);
      const result = await pagedRead(exact, 10).read();
      expect(result.ok && [...result.paths].sort()).toEqual([...exact].sort());
    });

    it("keeps a path that is itself the prefix it was split on", async () => {
      const all = ["gno.land/r/ab", ...Array.from({ length: 12 }, (_, i) => `gno.land/r/ab/x${i.toString(36)}`)];
      const result = await pagedRead(all, 5).read();
      expect(result.ok && [...result.paths].sort()).toEqual([...all].sort());
    });

    it("goes through the pace before each of its requests", async () => {
      let paced = 0;
      const chain = fakeChain({ paths: chainOf(spread, 10) });
      await readRealmPaths({ send: chain.send, rpc: RPC, limit: 10, pace: () => Promise.resolve(void (paced += 1)) });
      expect(paced).toBe(chain.asked.length);
    });

    it("gives up as too_many, after a bounded number of requests, on a chain that fills every prefix", async () => {
      const hostile = (prefix: string): string =>
        Array.from({ length: 10 }, (_, i) => `${prefix}${i.toString(36)}`).join("\n");
      const { chain, read } = pagedRead([], 10, hostile);
      expect(await read()).toEqual({ ok: false, kind: "too_many" });
      expect(chain.asked.length).toBeLessThanOrEqual(LIST_MAX_QUERIES);
    });
  });

  it("takes an answer of exactly the byte cap and refuses one byte over", async () => {
    const padded = (size: number) => `gno.land/r/a/b${"\n".repeat(size - "gno.land/r/a/b".length)}`;
    expect(await ask(() => padded(LIST_MAX_BYTES)).read()).toEqual({ ok: true, paths: ["gno.land/r/a/b"] });
    expect(await ask(() => padded(LIST_MAX_BYTES + 1)).read()).toEqual({ ok: false, kind: "too_large" });
  });

  it("cancels an answer that never ends, without reading it to its end", async () => {
    let pulled = 0;
    const endless = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            pulled += 1;
            controller.enqueue(new Uint8Array(64 * 1024));
          },
        }),
      );
    expect(await ask(endless).read()).toEqual({ ok: false, kind: "too_large" });
    expect(pulled).toBeLessThan(100);
  });

  it("asks before its call through the pace it is given, once", async () => {
    let paced = 0;
    const chain = fakeChain({ paths: () => "gno.land/r/a/b" });
    await readRealmPaths({ send: chain.send, rpc: RPC, pace: () => Promise.resolve(void (paced += 1)) });
    expect(paced).toBe(1);
  });

  it.each([
    ["not JSON", () => new Response("<html>bad gateway</html>")],
    ["a JSON array", () => Response.json([])],
    ["no result", () => Response.json({})],
    ["a Data that is no base64", () => Response.json({ result: { response: { ResponseBase: { Data: "%%%" } } } })],
    ["a Data that is no UTF-8", () => Response.json({ result: { response: { ResponseBase: { Data: "/w==" } } } })],
    ["a Data of the wrong type", () => Response.json({ result: { response: { ResponseBase: { Data: 12 } } } })],
  ])("gives a wrong shape for %s, and does not throw", async (_name, response) => {
    const result = await ask(response).read();
    expect(result).toEqual({ ok: false, kind: "shape" });
  });

  it("is a refusal of the chain when the query was refused", async () => {
    expect(await ask(() => abciRefused("/std.UnknownRequestError")).read()).toEqual({
      ok: false,
      kind: "chain_refused",
    });
  });

  it("is a status fault for a 502, and the list's reading goes on for the next pass", async () => {
    expect(await ask(() => new Response("down", { status: 502 })).read()).toEqual({ ok: false, kind: "status" });
  });

  it("is a request fault when the network is down, and a timeout when the call times out", async () => {
    expect(await ask(() => new TypeError("fetch failed")).read()).toEqual({ ok: false, kind: "request" });
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    expect(await ask(() => timeout).read()).toEqual({ ok: false, kind: "timeout" });
  });

  it("names its fault by a kind and never by what the answer or the error held", async () => {
    const result = await ask(() => new Error("secret-token-123 at https://evil.example")).read();
    expect(JSON.stringify(result)).not.toMatch(/secret|evil/);
  });
});
