import { WORLDS_COUNT_MAX_BYTES } from "@gnoworld/schemas";
import { describe, expect, it, vi } from "vitest";
import { readWorldsCount, WORLDS_COUNT_URL } from "./worldsCount.ts";

// The worlds' count (7n2), this site's own file beside the worlds' file: the home's hero reads it for its number, a few bytes, so a phone asks
// nothing of the cosmos before View in space. The server's job wrote it from a chain, so it passes a size cap and a schema; a read that fails
// is no count, never a throw.
const COUNT = { version: 1, universe: "onyx", updated: "2026-11-01T00:11:00Z", count: 534 };
const answer = (body: BodyInit | null, init?: ResponseInit) => vi.fn(() => Promise.resolve(new Response(body, init)));

describe("readWorldsCount", () => {
  it("reads the count beside the worlds' file, at the site's own address, with the site's credentials and the file's own cache", async () => {
    const fetch = answer(JSON.stringify(COUNT));
    expect(await readWorldsCount("/app/", { fetch })).toEqual(COUNT);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/app/worlds-count.json");
    expect(WORLDS_COUNT_URL).toBe("worlds-count.json");
    expect(init.credentials).toBe("same-origin");
    expect(init.cache).toBeUndefined();
  });

  it("gives nothing when the file is not there, or the network fails", async () => {
    expect(await readWorldsCount("/", { fetch: answer("nope", { status: 404 }) })).toBeUndefined();
    expect(await readWorldsCount("/", { fetch: vi.fn(() => Promise.reject(new TypeError("down"))) })).toBeUndefined();
  });

  it("takes a count of exactly its cap, and refuses one byte over, by its header and by its bytes", async () => {
    const body = JSON.stringify(COUNT);
    const exact = `${body}${" ".repeat(WORLDS_COUNT_MAX_BYTES - body.length)}`;
    expect((await readWorldsCount("/", { fetch: answer(exact) }))?.count).toBe(534);
    const declared = answer(body, { headers: { "content-length": String(WORLDS_COUNT_MAX_BYTES + 1) } });
    expect(await readWorldsCount("/", { fetch: declared })).toBeUndefined();
    expect(await readWorldsCount("/", { fetch: answer(`${exact} `) })).toBeUndefined();
  });

  it("refuses a count of the wrong shape, what is not JSON, and the worlds' file itself", async () => {
    for (const body of [
      JSON.stringify({ ...COUNT, count: "534" }),
      JSON.stringify({ ...COUNT, count: 0 }),
      JSON.stringify({ ...COUNT, extra: 1 }),
      JSON.stringify({ version: 1, universe: "onyx", updated: COUNT.updated, worlds: [] }),
      "<html>",
    ])
      expect(await readWorldsCount("/", { fetch: answer(body) }), body).toBeUndefined();
  });

  it("ends with the caller's signal", async () => {
    const leaving = new AbortController();
    leaving.abort();
    const fetch = answer(JSON.stringify(COUNT));
    expect(await readWorldsCount("/", { fetch, signal: leaving.signal })).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
