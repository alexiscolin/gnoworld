import { describe, expect, it, vi } from "vitest";
import { PREVIEWS_URL, readPreviews } from "./previews.ts";

// The captures' file (8f), this site's own: the server's job wrote it from a chain, so it passes a size cap and a schema, and a read
// that fails is no capture, never a throw: no capture, no preview.
const CAPTURE = { path: "gno.land/r/gov/dao", captured: "2026-11-05T10:00:00.000Z", text: "# GovDAO\n" };
const FILE = { version: 1, universe: "onyx", updated: "2026-11-05T10:00:01.000Z", previews: [CAPTURE] };
// The most bytes a client reads: 1 MiB, the largest file the job may write with every byte of every text escaped.
const CAP = 1_048_576;
const answer = (body: BodyInit | null, init?: ResponseInit) => vi.fn(() => Promise.resolve(new Response(body, init)));

describe("readPreviews", () => {
  it("reads the file at the site's own address, with the site's credentials and the file's own cache", async () => {
    const fetch = answer(JSON.stringify(FILE));
    expect((await readPreviews("/app/", { fetch }))?.previews).toEqual([CAPTURE]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/app/previews.json");
    expect(PREVIEWS_URL).toBe("previews.json");
    expect(init.credentials).toBe("same-origin");
    expect(init.cache).toBeUndefined();
  });

  it("gives nothing when the file is not there, the server fails, or the network does", async () => {
    expect(await readPreviews("/", { fetch: answer("nope", { status: 404 }) })).toBeUndefined();
    expect(await readPreviews("/", { fetch: answer("down", { status: 500 }) })).toBeUndefined();
    expect(await readPreviews("/", { fetch: vi.fn(() => Promise.reject(new TypeError("down"))) })).toBeUndefined();
  });

  it("takes a file of exactly its cap, and refuses one byte over, by its header and by its bytes", async () => {
    const body = JSON.stringify(FILE);
    const exact = `${body}${" ".repeat(CAP - body.length)}`;
    expect((await readPreviews("/", { fetch: answer(exact) }))?.previews).toHaveLength(1);
    const declared = answer(body, { headers: { "content-length": String(CAP + 1) } });
    expect(await readPreviews("/", { fetch: declared })).toBeUndefined();
    expect(await readPreviews("/", { fetch: answer(`${exact} `) })).toBeUndefined();
  });

  it("stops reading an endless answer at the cap, and cancels it", async () => {
    let cancelled = false;
    const chunk = new Uint8Array(64 * 1024).fill(32);
    const endless = new ReadableStream<Uint8Array>({
      pull: (controller) => {
        controller.enqueue(chunk);
      },
      cancel: () => {
        cancelled = true;
      },
    });
    expect(await readPreviews("/", { fetch: answer(endless) })).toBeUndefined();
    expect(cancelled).toBe(true);
  });

  it("refuses a file of another shape, and what is not JSON", async () => {
    for (const body of [
      JSON.stringify({ ...FILE, previews: [{ ...CAPTURE, path: "https://evil.example/" }] }),
      JSON.stringify({ ...FILE, previews: [{ ...CAPTURE, image: "https://tracker.example/p.png" }] }),
      JSON.stringify({ ...FILE, version: 2 }),
      "<html>",
    ])
      expect(await readPreviews("/", { fetch: answer(body) }), body).toBeUndefined();
  });

  it("ends with the caller's signal", async () => {
    const leaving = new AbortController();
    leaving.abort();
    const fetch = answer(JSON.stringify(FILE));
    expect(await readPreviews("/", { fetch, signal: leaving.signal })).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
