import { describe, expect, it } from "vitest";
import type { Result } from "../api/http.ts";
import { presenceApi } from "../api/presence.ts";
import { readApi, resultOf } from "./api.ts";
import { makeQueryClient, Unread } from "./client.ts";

// The server's reads as queries: a refusal is an `Unread` the query keeps nothing of, and its kind says whether a second ask is worth it.
const refused = (reason: "network" | "unavailable" | "too_many" | "malformed"): Result<number> => ({
  ok: false,
  reason,
});
const kindOf = async (reason: Parameters<typeof refused>[0]) =>
  readApi(() => Promise.resolve(refused(reason))).catch((error: unknown) =>
    error instanceof Unread ? error.failure : error,
  );

const hanging = (_url: string, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      reject(new Error("aborted"));
    });
  });

describe("a server read as a query", () => {
  it("gives the value of an answer", async () => {
    expect(await readApi(() => Promise.resolve<Result<number>>({ ok: true, value: 3 }))).toBe(3);
  });

  it("is asked again after a network drop and a server error, and never after a refusal or a malformed answer", async () => {
    const retry = makeQueryClient().getDefaultOptions().queries?.retry;
    if (typeof retry !== "function") throw new Error("retry is a rule");
    const again = async (reason: Parameters<typeof refused>[0]) => {
      const failure = await kindOf(reason);
      return retry(0, new Unread(undefined, failure as ConstructorParameters<typeof Unread>[1]));
    };
    expect([await again("network"), await again("unavailable")]).toEqual([true, true]);
    expect([await again("too_many"), await again("malformed")]).toEqual([false, false]);
  });

  it("gives back the refusal as the Result the client's callers read, and lets a bug rise", async () => {
    const read = readApi(() => Promise.resolve(refused("too_many")));
    expect(await resultOf(read)).toEqual(refused("too_many"));
    await expect(resultOf(Promise.reject(new Error("bug")))).rejects.toThrow("bug");
  });

  it("gives a read cancelled before it answered as a network failure, not a bug", async () => {
    const client = makeQueryClient();
    const read = resultOf(
      client.query({
        queryKey: ["cancelled"],
        queryFn: ({ signal }) => readApi((s) => presenceApi(hanging).read(s), signal),
      }),
    );
    await client.cancelQueries({ queryKey: ["cancelled"] });
    expect(await read).toEqual({ ok: false, reason: "network" });
  });

  it("keeps the last good answer when a fresh read is refused", async () => {
    const client = makeQueryClient();
    const key = ["presence"];
    await client.query({
      queryKey: key,
      queryFn: () => readApi(() => Promise.resolve<Result<number>>({ ok: true, value: 1 })),
    });
    await client.invalidateQueries({ queryKey: key });
    await expect(
      client.query({ queryKey: key, staleTime: 0, queryFn: () => readApi(() => Promise.resolve(refused("network"))) }),
    ).rejects.toBeInstanceOf(Unread);
    expect(client.getQueryData(key)).toBe(1);
  });

  it("ends the call when the query is cancelled: the fetch's signal is aborted and the call settles", async () => {
    let seen: AbortSignal | undefined;
    const fetcher = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        seen = init?.signal ?? undefined;
        seen?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    const query = new AbortController();
    const read = readApi((signal) => presenceApi(fetcher).read(signal), query.signal).catch((error: unknown) =>
      error instanceof Unread ? error.failure : error,
    );
    query.abort();
    expect(seen?.aborted).toBe(true);
    expect(await read).toEqual({ kind: "down" });
  });
});
