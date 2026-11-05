// The browser's client of the first signals (server/src/signals/routes.ts, mounted at /api/signals; slice 9h), through the
// one JSON call of lib/api/http.ts: POST to chart a world, GET for who is first there. Each answer must name the world asked.
import { ChartAnswer, ChartRequest, WorldFirsts } from "@gnoworld/schemas";
import { jsonCall, TIMEOUT_MS, type Fetcher, type Result } from "./http.ts";

export function signalsApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  const call = jsonCall(fetcher, timeoutMs);
  // A call for a world: its word checked before any is sent, its answer for that world alone.
  const ask = async <T extends { world: string }>(
    world: string,
    make: () => Promise<Result<T>>,
  ): Promise<Result<T>> => {
    if (!ChartRequest.safeParse({ world }).success) return { ok: false, reason: "refused" };
    const result = await make();
    return result.ok && result.value.world !== world ? { ok: false, reason: "malformed" } : result;
  };
  return {
    /** Opens the world as the logged-in account: whether this call was the first to chart it. */
    chart: (world: string) =>
      ask(world, () => call({ path: "/api/signals/chart", schema: ChartAnswer, body: { world } })),
    /** Who is first in the world, for anyone. */
    firsts: (world: string) =>
      ask(world, () => call({ path: `/api/signals?world=${encodeURIComponent(world)}`, schema: WorldFirsts })),
  };
}

/** The signals' client of this page, on its own fetch. */
export const pageSignalsApi = () => signalsApi((url, init) => fetch(url, init));
