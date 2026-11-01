import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { abciRefused, fakeChain, RPC } from "../testing/fakeWorldsChain.ts";
import { LIST_MAX_BYTES, LIST_MAX_PATHS, readRealmPaths } from "./list.ts";

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

  it("refuses more paths than the cap, though under the byte cap", async () => {
    const paths = Array.from({ length: LIST_MAX_PATHS + 1 }, (_, i) => `gno.land/r/a/p${i.toString(36)}`);
    expect(await ask(() => paths.join("\n")).read()).toEqual({ ok: false, kind: "too_many" });
  });

  it("refuses a list of exactly the cap, which the chain may have cut, and takes one path fewer", async () => {
    const paths = (count: number) => Array.from({ length: count }, (_, i) => `gno.land/r/a/p${i.toString(36)}`);
    expect(await ask(() => paths(LIST_MAX_PATHS).join("\n")).read()).toEqual({ ok: false, kind: "too_many" });
    const result = await ask(() => paths(LIST_MAX_PATHS - 1).join("\n")).read();
    expect(result.ok && result.paths.length).toBe(LIST_MAX_PATHS - 1);
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
