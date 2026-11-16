// The login's one call the first screen never makes, "Log out my other sessions" (D13601), apart from lib/api/login.ts:
// only the settings import it, so it rides in their chunk, not the shell's (the world pages' first-screen budget,
// app/tests/e2e/budgets.spec.ts).
import { z } from "../jitless.ts";
import { jsonCall, TIMEOUT_MS, type Fetcher } from "./http.ts";

export function sessionsApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  const call = jsonCall(fetcher, timeoutMs);
  return {
    /** The account's other sessions ended, this one kept. */
    logoutOthers: () => call({ path: "/api/login/logout-others", body: {}, schema: z.undefined() }),
  };
}

/** The sessions' client of this page, on its own fetch. */
export const pageSessionsApi = () => sessionsApi((url, init) => fetch(url, init));
