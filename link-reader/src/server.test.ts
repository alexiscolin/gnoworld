import type { AddressInfo } from "node:net";
import { ReaderCard } from "@gnoworld/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Refused } from "./fetch.ts";
import { readerServer } from "./server.ts";
import type { ServerDeps } from "./server.ts";

const CARD: ReaderCard = { title: "T", description: "D", site: "S", picture: null };
const closers: (() => void)[] = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function start(over: Partial<ServerDeps> = {}) {
  const log = vi.fn();
  const read = vi.fn<ServerDeps["read"]>(() => Promise.resolve(CARD));
  const server = readerServer({ read, max: 2, log, ...over });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closers.push(() => server.close());
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const ask = (path: string, init: RequestInit = {}) => fetch(base + path, init);
  const post = (
    body: string,
    path = "/card",
    headers: Record<string, string> = { "content-type": "application/json" },
  ) => ask(path, { method: "POST", headers, body });
  return { ask, post, read, log };
}

describe("POST /card", () => {
  it("answers the card the reader made, as JSON that the server's schema reads, and never cached", async () => {
    const { post, read } = await start();
    const response = await post(JSON.stringify({ url: "https://example.com/a" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(ReaderCard.parse(await response.json())).toEqual(CARD);
    expect(read).toHaveBeenCalledWith("https://example.com/a");
  });

  it.each([
    ["not JSON", "{"],
    ["a JSON array", "[]"],
    ["no url", "{}"],
    ["a url that is a number", '{"url":1}'],
    ["a url that is null", '{"url":null}'],
    ["another key beside the url", '{"url":"https://example.com/","cookie":"x"}'],
    ["nothing", ""],
  ])("answers 400 to %s, and reads nothing", async (_name, body) => {
    const { post, read, log } = await start();
    expect((await post(body)).status).toBe(400);
    expect(read).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith({ kind: "bad_request" });
  });

  it("answers 413 to a body past 4 KiB, without reading it all", async () => {
    const { post, read } = await start();
    expect((await post(JSON.stringify({ url: "https://example.com/" + "a".repeat(5000) }))).status).toBe(413);
    expect(read).not.toHaveBeenCalled();
  });

  it("answers 415 to a body that is not JSON by its type", async () => {
    const { post, read } = await start();
    expect((await post('{"url":"https://example.com/"}', "/card", { "content-type": "text/plain" })).status).toBe(415);
    expect(read).not.toHaveBeenCalled();
  });

  it("answers 422 with the kind of the failure alone, and logs the kind alone, never the URL", async () => {
    const url = "https://secret-host.example.com/private/path?token=abc";
    const { post, log } = await start({ read: () => Promise.reject(new Refused("private")) });
    const response = await post(JSON.stringify({ url }));
    expect(response.status).toBe(422);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: "private" });
    expect(text).not.toContain("secret-host");
    expect(log).toHaveBeenCalledWith({ kind: "private" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-host");
    expect(JSON.stringify(log.mock.calls)).not.toContain("token");
  });

  it("answers 500 with no words when the read crashes, and keeps serving", async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error("wasm trap at /app/secret/path")).mockResolvedValue(CARD);
    const { post, log } = await start({ read });
    const response = await post(JSON.stringify({ url: "https://example.com/" }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("wasm");
    expect(log).toHaveBeenCalledWith({ kind: "crash" });
    expect((await post(JSON.stringify({ url: "https://example.com/" }))).status).toBe(200);
  });

  it("answers 503 past `max` reads at once, reads nothing for the extra one, and serves again when one ends", async () => {
    const release: (() => void)[] = [];
    const read = vi.fn(
      () =>
        new Promise<ReaderCard>((resolve) => {
          release.push(() => {
            resolve(CARD);
          });
        }),
    );
    const { post, log } = await start({ read, max: 2 });
    const body = JSON.stringify({ url: "https://example.com/" });
    const first = post(body);
    const second = post(body);
    await vi.waitFor(() => {
      expect(read).toHaveBeenCalledTimes(2);
    });
    const third = await post(body);
    expect(third.status).toBe(503);
    expect(read).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith({ kind: "busy" });
    release.forEach((go) => {
      go();
    });
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    const again = post(body);
    await vi.waitFor(() => {
      expect(read).toHaveBeenCalledTimes(3);
    });
    release.forEach((go) => {
      go();
    });
    expect((await again).status).toBe(200);
  });

  it("frees its place when a read fails, so a run of failures never fills it", async () => {
    const { post } = await start({ read: () => Promise.reject(new Refused("status")), max: 1 });
    for (let each = 0; each < 3; each++)
      expect((await post(JSON.stringify({ url: "https://example.com/" }))).status).toBe(422);
  });
});

describe("a body that is too long or too slow", () => {
  it("answers 413 to a chunked body past 4 KiB, which names no length, and reads nothing", async () => {
    const { ask, read } = await start();
    const chunk = new TextEncoder().encode("a".repeat(1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, 2));
        sent += 1;
        if (sent > 8) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const status = await ask("/card", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit).then(
      (response) => response.status,
      () => 0,
    );
    expect([0, 413]).toContain(status);
    expect(read).not.toHaveBeenCalled();
  });

  it("answers 431 to headers past 8 KiB", async () => {
    const { ask, read } = await start();
    const status = await ask("/health", { headers: { "x-big": "a".repeat(9000) } }).then(
      (response) => response.status,
      () => 0,
    );
    expect([0, 431]).toContain(status);
    expect(read).not.toHaveBeenCalled();
  });

  it("holds the limits that free a slow client's place: headers in 5 s, a whole request in 10 s, headers of 8 KiB", () => {
    const server = readerServer({ read: () => Promise.resolve(CARD), max: 2, log: vi.fn() });
    expect(server.headersTimeout).toBeLessThanOrEqual(5000);
    expect(server.headersTimeout).toBeGreaterThan(0);
    expect(server.requestTimeout).toBeLessThanOrEqual(10_000);
    expect(server.requestTimeout).toBeGreaterThan(0);
    expect(server.requestTimeout).toBeGreaterThanOrEqual(server.headersTimeout);
    server.close();
  });
});

describe("nothing else", () => {
  it("answers 405 to another method on /card, 404 to another path", async () => {
    const { ask, read } = await start();
    expect((await ask("/card")).status).toBe(405);
    expect((await ask("/card", { method: "PUT", body: "{}" })).status).toBe(405);
    expect((await ask("/cards", { method: "POST", body: "{}" })).status).toBe(404);
    expect((await ask("/")).status).toBe(404);
    expect((await ask("/card/../health", { method: "POST", body: "{}" })).status).toBe(404);
    expect(read).not.toHaveBeenCalled();
  });

  it("answers GET /health 200 for the container's check, and reads nothing", async () => {
    const { ask, read } = await start();
    expect((await ask("/health")).status).toBe(200);
    expect(read).not.toHaveBeenCalled();
  });
});
