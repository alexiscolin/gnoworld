// The browser's client of the first signals (server/src/signals/routes.ts, mounted at /api/signals; slice 9h), through the
// one JSON call of lib/api/http.ts: POST to chart a world; who is first comes on the stream. The answer must name the world asked.
import { ChartAnswer, ChartRequest } from "@gnoworld/schemas";
import { jsonCall, TIMEOUT_MS, type Fetcher, type Result } from "./http.ts";

export function signalsApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  const call = jsonCall(fetcher, timeoutMs);
  return {
    /** Opens the world as the logged-in account: whether this call was the first to chart it. Its word is checked before any
     * is sent, its answer must be for that world alone. */
    chart: async (world: string): Promise<Result<ChartAnswer>> => {
      if (!ChartRequest.safeParse({ world }).success) return { ok: false, reason: "refused" };
      const result = await call({ path: "/api/signals/chart", schema: ChartAnswer, body: { world } });
      return result.ok && result.value.world !== world ? { ok: false, reason: "malformed" } : result;
    },
  };
}

/** The signals' client of this page, on its own fetch. */
export const pageSignalsApi = () => signalsApi((url, init) => fetch(url, init));
