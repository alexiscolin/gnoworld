// The browser's client of a realm's or a world's explanation (server/src/explain/routes.ts, mounted at /api/explanations), through lib/api/http.ts:
// the answer is read through its schema, or why not. The realm travels URL-encoded as the path it is.
import { Explanation, type ExplainKind } from "@gnoworld/schemas";
import { pageFetch } from "../query/policy.ts";
import { jsonCall, TIMEOUT_MS, type Fetcher, type Result } from "./http.ts";

function explanationsApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  const call = jsonCall(fetcher, timeoutMs);
  return {
    read: (
      { kind, chain, subject }: { kind: ExplainKind; chain: string; subject: string },
      signal?: AbortSignal,
    ): Promise<Result<Explanation>> =>
      call({
        path: `/api/explanations/${kind}/${encodeURIComponent(chain)}/${encodeURIComponent(subject)}`,
        schema: Explanation,
        signal,
      }),
  };
}

/** The explanations' client of this page, on its own fetch. */
export const pageExplanationsApi = () => explanationsApi(pageFetch);
