// The browser's client of the guest chat (server/src/guest/routes.ts, D430), through lib/api/http.ts's one JSON call: a name for the visit,
// which the server's HttpOnly cookie holds, then a line the server judges before the bot says it. A refusal comes back with its cause.
import { Guest, GuestRefusal, GuestSaid, type GuestCause, type GuestSayRequest } from "@gnoworld/schemas";
import { jsonCall, TIMEOUT_MS, type Fetcher, type Result } from "./http.ts";

/** A refusal: the call's reason and, where the server gave one, the rule or the state that held the line or the name. */
export interface Refused {
  ok: false;
  reason: Extract<Result<never>, { ok: false }>["reason"];
  cause?: GuestCause;
}
/** A line said, or why not. */
type Said = { ok: true } | Refused;
/** The visit's name, or why not (a muted visitor's cause among them). */
type Named = { ok: true; value: Guest } | Refused;

// A refusal read whole: its code, and its cause through the guest API's schema.
function refusedOf(result: Extract<Result<never>, { ok: false }>): Refused {
  const cause = GuestRefusal.safeParse(result.body).data?.cause;
  return cause === undefined ? { ok: false, reason: result.reason } : { ok: false, reason: result.reason, cause };
}

function guestApi(fetcher: Fetcher, timeoutMs = TIMEOUT_MS) {
  const call = jsonCall(fetcher, timeoutMs);
  return {
    /** The visit's name: the one its cookie holds, else a new one; never for an account logged in. */
    name: async (): Promise<Named> => {
      const result = await call({ path: "/api/guest", body: {}, schema: Guest });
      return result.ok ? result : refusedOf(result);
    },
    say: async (line: GuestSayRequest): Promise<Said> => {
      const result = await call({ path: "/api/guest/say", body: line, schema: GuestSaid });
      return result.ok ? { ok: true } : refusedOf(result);
    },
  };
}

/** The guest chat's client of this page, on its own fetch. */
export const pageGuestApi = () => guestApi((url, init) => fetch(url, init));
