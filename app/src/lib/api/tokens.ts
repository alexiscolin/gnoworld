// The browser's client of a realm's tokens (server/src/worlds/tokenRoutes.ts, mounted at /api/tokens), through lib/api/http.ts: the answer is
// read through its schema, or why not. The realm travels as the hash of its path, never as text.
import { rollupName } from "@gnoworld/core";
import { TokenAnswer } from "@gnoworld/schemas/indexer";
import { pageFetch } from "../query/policy.ts";
import { jsonCall, TIMEOUT_MS, type Fetcher, type Result } from "./http.ts";

function tokensApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  const call = jsonCall(fetcher, timeoutMs);
  return {
    /** The tokens of the realm at `realm`; a refusal `not_found` says it holds none the server knows. */
    read: (realm: string, signal?: AbortSignal): Promise<Result<TokenAnswer>> =>
      call({ path: `/api/tokens/${rollupName(realm)}`, schema: TokenAnswer, signal }),
  };
}

/** The tokens' client of this page, on its own fetch. */
export const pageTokensApi = () => tokensApi(pageFetch);
