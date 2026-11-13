import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { focusManager, onlineManager, QueryObserver } from "@tanstack/react-query";
import { FRESH_MS, makeQueryClient, quietUnread, Unread } from "./client.ts";
import { keys, invalidateRealm } from "./keys.ts";

// The app's reads through one query client (slice 13, D13973): a held answer, one fresh read past fifteen seconds and none before, a failed read
// that keeps the last good data and is not kept itself, an abort that is kept for no one, the chain in every key, a signed call that invalidates.
const RPC = "https://rpc.example";
const REALM = "gno.land/r/a/b";
let n = 0;
const read = vi.fn(() => Promise.resolve(++n));
const options = (key: readonly unknown[]) => ({ queryKey: key, queryFn: read });

beforeEach(() => {
  vi.useFakeTimers();
  n = 0;
  read.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the client's defaults", () => {
  it("reads again past fifteen seconds and not before, and returns the held answer meanwhile", async () => {
    const client = makeQueryClient();
    const key = keys.page(RPC, REALM, undefined);
    expect(await client.query(options(key))).toBe(1);
    vi.advanceTimersByTime(FRESH_MS - 1);
    expect(await client.query(options(key))).toBe(1);
    expect(read).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2);
    expect(client.getQueryData(key)).toBe(1);
    expect(await client.query(options(key))).toBe(2);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("shares one request between two askers in flight", async () => {
    const client = makeQueryClient();
    const key = keys.facts("idx", REALM);
    await Promise.all([client.query(options(key)), client.query(options(key))]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("keeps the last good answer when a fresh read fails, and keeps nothing of a first read that fails", async () => {
    const client = makeQueryClient();
    const key = keys.rollup("/", REALM);
    await expect(
      client.query({ queryKey: key, queryFn: () => Promise.reject(new Unread(undefined)) }),
    ).rejects.toBeInstanceOf(Unread);
    expect(client.getQueryData(key)).toBeUndefined();
    await client.query(options(key));
    vi.advanceTimersByTime(FRESH_MS + 1);
    await expect(
      client.query({ queryKey: key, queryFn: () => Promise.reject(new Unread(undefined)) }),
    ).rejects.toBeInstanceOf(Unread);
    expect(client.getQueryData(key)).toBe(1);
  });

  it("keeps a read that was cut short for no one", async () => {
    const client = makeQueryClient();
    const key = keys.hours("earth");
    const gone = client.query({
      queryKey: key,
      queryFn: ({ signal }) =>
        new Promise<number>((_, reject) => {
          signal.addEventListener("abort", () => {
            reject(new Error("cut"));
          });
        }),
    });
    const cut = expect(gone).rejects.toThrow();
    await client.cancelQueries({ queryKey: key });
    await cut;
    expect(client.getQueryData(key)).toBeUndefined();
  });

  it("keeps quiet for a read asked ahead that was cancelled when its last viewer left, and lets a bug rise", async () => {
    const client = makeQueryClient();
    const key = keys.hours("moon");
    const ahead = client
      .query({
        queryKey: key,
        queryFn: ({ signal }) =>
          new Promise<number>((_, reject) => {
            signal.addEventListener("abort", () => {
              reject(new Error("cut"));
            });
          }),
      })
      .catch(quietUnread);
    await client.cancelQueries({ queryKey: key });
    await expect(ahead).resolves.toBeUndefined();
    expect(() => {
      quietUnread(new Error("bug"));
    }).toThrow("bug");
  });

  it("retries a read that did not answer, twice, and never one whose answer was the wrong shape", () => {
    const client = makeQueryClient();
    const retry = client.getDefaultOptions().queries?.retry;
    if (typeof retry !== "function") throw new Error("retry is a rule");
    expect([
      retry(0, new Unread(undefined, { kind: "down" })),
      retry(1, new Unread(undefined, { kind: "timeout" })),
      retry(2, new Unread(undefined, { kind: "down" })),
    ]).toEqual([true, true, false]);
    expect(retry(0, new Unread(undefined, { kind: "wrong-shape" }))).toBe(false);
    expect(retry(0, new Unread(undefined))).toBe(false);
    expect(retry(0, new Unread(undefined, { kind: "down", status: 404 }))).toBe(false);
    expect(retry(0, new Unread(undefined, { kind: "down", status: 503 }))).toBe(true);
    expect(retry(0, new Unread(undefined, { kind: "down" }))).toBe(true);
    expect(retry(0, new Error("a bug"))).toBe(true);
  });
});

describe("the keys", () => {
  it("name the chain, so a universe switch never shows another chain's answer", () => {
    expect(keys.page("https://a", REALM, undefined)).not.toEqual(keys.page("https://b", REALM, undefined));
    expect(keys.functions("https://a", REALM)).not.toEqual(keys.functions("https://b", REALM));
    expect(keys.facts("https://i1", REALM)).not.toEqual(keys.facts("https://i2", REALM));
    expect(keys.page(RPC, REALM, undefined)).toEqual(["realm", RPC, REALM, "page", ""]);
  });
});

describe("a signed call, accepted", () => {
  it("makes its realm's page and facts stale, and no other realm's, nor its functions", async () => {
    const client = makeQueryClient();
    const [page, facts, functions, other] = [
      keys.page(RPC, REALM, undefined),
      keys.facts("idx", REALM),
      keys.functions(RPC, REALM),
      keys.page(RPC, "gno.land/r/c/d", undefined),
    ];
    for (const key of [page, facts, functions, other]) await client.query(options(key));
    expect(read).toHaveBeenCalledTimes(4);
    await invalidateRealm(client, REALM);
    const stale = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated;
    expect([stale(page), stale(facts), stale(functions), stale(other)]).toEqual(
      [true, true, undefined, undefined].map(Boolean),
    );
  });
});

describe("the tab", () => {
  it("reads a stale view again when the tab is seen again, once the client is mounted (the shell mounts it)", async () => {
    const client = makeQueryClient();
    client.mount();
    const off = new QueryObserver(client, options(keys.hours("earth"))).subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(10);
    expect(read).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(FRESH_MS + 1);
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(read).toHaveBeenCalledTimes(2);
    off();
    client.unmount();
  });
});

describe("the network", () => {
  it("holds a read while the device is offline, keeps the last answer shown, and asks it once back online", async () => {
    const client = makeQueryClient();
    // A mounted client (the app's views mount it) is the one that resumes a paused read when the network is back.
    client.mount();
    const key = keys.worlds("/");
    await client.query(options(key));
    vi.advanceTimersByTime(FRESH_MS + 1);
    onlineManager.setOnline(false);
    try {
      const paused = client.query(options(key));
      await Promise.resolve();
      expect(read).toHaveBeenCalledTimes(1);
      expect(client.getQueryData(key)).toBe(1);
      onlineManager.setOnline(true);
      await vi.advanceTimersByTimeAsync(10);
      expect(await paused).toBe(2);
    } finally {
      onlineManager.setOnline(true);
      client.unmount();
    }
  });

  it("reports an error that is not a read's own, and keeps quiet for a read that did not come whole", async () => {
    const reported = vi.fn();
    vi.stubGlobal("reportError", reported);
    const client = makeQueryClient();
    await expect(
      client.query({ queryKey: ["a"], retry: false, queryFn: () => Promise.reject(new Unread(undefined)) }),
    ).rejects.toBeInstanceOf(Unread);
    expect(reported).not.toHaveBeenCalled();
    const bug = new Error("bug");
    await expect(client.query({ queryKey: ["b"], retry: false, queryFn: () => Promise.reject(bug) })).rejects.toBe(bug);
    expect(reported).toHaveBeenCalledExactlyOnceWith(bug);
    vi.unstubAllGlobals();
  });
});
