// The browser's client of the lines' verdicts (server/src/stream/verdicts.ts, mounted at /api/verdicts; slice 4's 4g),
// through the one JSON call of lib/api/http.ts: a line older than the stream's replay gets its verdict here. The
// answer must name the room asked and the lines asked alone.
import { LineVerdicts, VERDICTS_ASKED } from "@gnoworld/schemas";
import { jsonCall, TIMEOUT_MS, type Fetcher, type Result } from "./http.ts";

export function verdictsApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  const call = jsonCall(fetcher, timeoutMs);
  return {
    /** The verdicts the server holds of these lines of a room, VERDICTS_ASKED at most. */
    verdicts: async (room: string, ids: readonly string[]): Promise<Result<LineVerdicts>> => {
      if (ids.length === 0 || ids.length > VERDICTS_ASKED) return { ok: false, reason: "refused" };
      const query = new URLSearchParams({ room, ids: ids.join(",") });
      const result = await call({ path: `/api/verdicts?${query.toString()}`, schema: LineVerdicts });
      if (!result.ok) return result;
      const asked = new Set(ids);
      const own = result.value.room === room && result.value.verdicts.every(({ msgid }) => asked.has(msgid));
      return own ? result : { ok: false, reason: "malformed" };
    },
  };
}

/** The verdicts' client of this page, on its own fetch. */
export const pageVerdictsApi = () => verdictsApi((url, init) => fetch(url, init));
