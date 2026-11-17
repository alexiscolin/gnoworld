import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { callOptions, TIMELESS_MS } from "./callQueries.ts";

const detail = (time: string | null) => ({ time });

// The query's own staleTime, asked of the state a read left.
function staleAfter(data: unknown): number {
  const client = new QueryClient();
  const options = callOptions("0x1", 0);
  client.setQueryData(options.queryKey, data as never);
  const query = client.getQueryCache().find({ queryKey: options.queryKey });
  const { staleTime } = options;
  if (typeof staleTime !== "function" || query === undefined) throw new Error("no staleTime to ask");
  const stale = staleTime(query as never);
  if (typeof stale !== "number") throw new Error("a staleTime that is no number");
  return stale;
}

describe("a call's detail query", () => {
  it("keeps a detail with its time for good", () => {
    expect(staleAfter(detail("2026-11-12T10:00:00Z"))).toBe(Number.POSITIVE_INFINITY);
  });

  it("keeps a detail with no time a few seconds, then asks again", () => {
    expect(staleAfter(detail(null))).toBe(TIMELESS_MS);
  });
});
