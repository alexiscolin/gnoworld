// The browser's client of a call's detail (server/src/calls/routes.ts, mounted at /api/calls), through the one JSON call of lib/api/http.ts:
// the answer is read through its schema, or why not.
import { CallDetail } from "@gnoworld/schemas";
import { pageFetch } from "../query/policy.ts";
import { jsonCall, TIMEOUT_MS, type Fetcher, type Result } from "./http.ts";

function callsApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  const call = jsonCall(fetcher, timeoutMs);
  return {
    /** Message `index` of the transaction `hash` (a route's spelling of it, CallHash). */
    read: (hash: string, index: number): Promise<Result<CallDetail>> =>
      call({ path: `/api/calls/${hash}/${String(index)}`, schema: CallDetail }),
  };
}

/** The calls' client of this page, on its own fetch. */
export const pageCallsApi = () => callsApi(pageFetch);
