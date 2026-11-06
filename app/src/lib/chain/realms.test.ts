import { WORLDS_MAX_BYTES } from "@gnoworld/schemas/indexer";
import { describe, expect, it, vi } from "vitest";
import { readWorlds, WORLDS_URL } from "./realms.ts";

// The worlds' file, this site's own (slice-7 §3): it came from a chain, so it passes a size cap and a schema, and a read that fails leaves
// the cosmos with its fixed places. Never a throw, for the scene has nothing to do with one.
const WORLD = {
  id: "gnoswap/pool",
  namespace: "gnoswap",
  realms: [
    {
      path: "gno.land/r/gnoswap/pool",
      deployer: null,
      deployerName: null,
      functions: ["Swap"],
      imports: [],
      calls: 12,
      callers: 3,
      lastHeight: 810_000,
    },
  ],
};
const FILE = { version: 1, universe: "onyx", updated: "2026-11-01T00:11:00Z", worlds: [WORLD] };
const answer = (body: BodyInit | null, init?: ResponseInit) => vi.fn(() => Promise.resolve(new Response(body, init)));

describe("readWorlds", () => {
  it("reads the file at the site's own address, with the site's credentials and the file's own cache", async () => {
    const fetch = answer(JSON.stringify(FILE));
    const read = await readWorlds("/app/", { fetch });
    expect(read?.worlds).toEqual([WORLD]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/app/${WORLDS_URL}`);
    expect(init.credentials).toBe("same-origin");
    expect(init.cache).toBeUndefined();
  });

  it("gives nothing when the file is not there", async () => {
    expect(await readWorlds("/", { fetch: answer("nope", { status: 404 }) })).toBeUndefined();
  });

  it("gives nothing when the network fails", async () => {
    expect(await readWorlds("/", { fetch: vi.fn(() => Promise.reject(new TypeError("down"))) })).toBeUndefined();
  });

  it("refuses an answer past the file's cap, by its header and by its bytes", async () => {
    const declared = answer("{}", { headers: { "content-length": String(WORLDS_MAX_BYTES + 1) } });
    expect(await readWorlds("/", { fetch: declared })).toBeUndefined();
    const huge = new Uint8Array(WORLDS_MAX_BYTES + 1).fill(32);
    expect(await readWorlds("/", { fetch: answer(huge) })).toBeUndefined();
  });

  it("takes a file of exactly the cap, the most the job writes", async () => {
    const body = JSON.stringify(FILE);
    const exact = `${body}${" ".repeat(WORLDS_MAX_BYTES - body.length)}`;
    expect((await readWorlds("/", { fetch: answer(exact) }))?.worlds).toHaveLength(1);
  });

  it("stops reading an endless answer at the cap, and cancels it", async () => {
    const chunk = new Uint8Array(1024 * 1024).fill(32);
    let pulled = 0;
    const cancel = vi.fn();
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
      },
      cancel,
    });
    expect(await readWorlds("/", { fetch: answer(endless) })).toBeUndefined();
    expect(cancel).toHaveBeenCalledOnce();
    expect(pulled).toBeLessThan(10);
  });

  it("takes a file of a size the job may write, a good deal over a chain answer's megabyte", async () => {
    const padded = `${JSON.stringify(FILE)}${" ".repeat(2 * 1024 * 1024)}`;
    expect((await readWorlds("/", { fetch: answer(padded) }))?.worlds).toHaveLength(1);
  });

  it("refuses what is not JSON, or not in its bytes UTF-8", async () => {
    expect(await readWorlds("/", { fetch: answer("<html>") })).toBeUndefined();
    expect(await readWorlds("/", { fetch: answer(new Uint8Array([0x7b, 0xff, 0x7d])) })).toBeUndefined();
  });

  it.each([
    ["a script for an id", { ...FILE, worlds: [{ ...WORLD, id: "<script>alert(1)</script>" }] }],
    [
      "a path out of its grammar",
      { ...FILE, worlds: [{ ...WORLD, realms: [{ ...WORLD.realms[0], path: "gno.land/r/A/../b" }] }] },
    ],
    ["a namespace with a slash", { ...FILE, worlds: [{ ...WORLD, namespace: "a/b" }] }],
    [
      "a count that is no whole number",
      { ...FILE, worlds: [{ ...WORLD, realms: [{ ...WORLD.realms[0], calls: 1.5 }] }] },
    ],
    ["another version", { ...FILE, version: 2 }],
    ["a field the schema does not know", { ...FILE, extra: 1 }],
    ["no list", { version: 1, universe: "onyx", updated: "2026-11-01T00:11:00Z" }],
  ])("refuses a hostile file whole: %s", async (_, file) => {
    expect(await readWorlds("/", { fetch: answer(JSON.stringify(file)) })).toBeUndefined();
  });

  it("stops with the page that left", async () => {
    const left = new AbortController();
    left.abort();
    const fetch = vi.fn((_: string, init?: RequestInit) =>
      init?.signal?.aborted === true
        ? Promise.reject(new DOMException("gone", "AbortError"))
        : Promise.resolve(new Response("{}")),
    );
    expect(await readWorlds("/", { fetch, signal: left.signal })).toBeUndefined();
  });
});
