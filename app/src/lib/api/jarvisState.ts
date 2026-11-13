// Whether Jarvis is on, asked of the door (server/src/door/state.ts) with no schema but its own: a client of its own, so the chat, which
// asks it once a page, carries none of the question's and the answer's.
import { JarvisState } from "@gnoworld/schemas";
import { pageFetch } from "../query/policy.ts";
import { jsonCall, TIMEOUT_MS, type Fetcher, type Result } from "./http.ts";

export const jarvisState =
  (fetcher: Fetcher, timeoutMs = TIMEOUT_MS) =>
  (): Promise<Result<JarvisState>> =>
    jsonCall(fetcher, timeoutMs)({ path: "/api/jarvis/state", schema: JarvisState });

/** The page's one read of it. */
export const pageJarvisState = jarvisState(pageFetch);
