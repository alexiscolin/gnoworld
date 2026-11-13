import { describe, expect, it, vi } from "vitest";
import { gated, HOST_AT_ONCE } from "./policy.ts";

// The shared RPC is public: no page asks more than a few requests of one host at once (the plan's threat model), however many views ask.
describe("the per-host cap", () => {
  it("holds the requests past the cap until one ends, and never mixes two hosts", async () => {
    const ends: (() => void)[] = [];
    const base = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          ends.push(() => {
            resolve(new Response("{}"));
          });
        }),
    );
    const fetcher = gated(base);
    const asks = Array.from({ length: HOST_AT_ONCE + 2 }, () => fetcher("https://rpc.example/a"));
    const other = fetcher("https://other.example/b");
    await Promise.resolve();
    expect(base).toHaveBeenCalledTimes(HOST_AT_ONCE + 1);
    ends.shift()?.();
    await asks[0];
    await vi.waitFor(() => {
      expect(base).toHaveBeenCalledTimes(HOST_AT_ONCE + 2);
    });
    await vi.waitFor(() => {
      for (const end of ends.splice(0)) end();
      expect(base).toHaveBeenCalledTimes(HOST_AT_ONCE + 3);
    });
    await Promise.all([...asks.slice(1), other]);
  });

  it("lets a request that failed free its place", async () => {
    const base = vi.fn<typeof fetch>().mockRejectedValue(new Error("down"));
    const fetcher = gated(base);
    for (let i = 0; i < HOST_AT_ONCE * 2; i++) await expect(fetcher("https://rpc.example/a")).rejects.toThrow("down");
    expect(base).toHaveBeenCalledTimes(HOST_AT_ONCE * 2);
  });

  it("frees the place of a request cut short while it waited, and asks nothing for it", async () => {
    const ends: (() => void)[] = [];
    const base = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          ends.push(() => {
            resolve(new Response("{}"));
          });
        }),
    );
    const fetcher = gated(base);
    const running = Array.from({ length: HOST_AT_ONCE }, () => fetcher("https://rpc.example/a"));
    const leaving = new AbortController();
    const waiting = fetcher("https://rpc.example/a", { signal: leaving.signal });
    leaving.abort();
    await expect(waiting).rejects.toThrow();
    for (const end of ends.splice(0)) end();
    await Promise.all(running);
    expect(base).toHaveBeenCalledTimes(HOST_AT_ONCE);
  });
});
