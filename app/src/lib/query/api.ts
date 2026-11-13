// The server's own JSON reads (lib/api) as queries (slice 13): their `Result` is a value, so a failed one throws `Unread` for the query to keep its last
// good data and cache no failure; a network drop or a 5xx may be asked again (client.ts's rule), a refusal or a malformed answer never. Their
// calls hold a time limit and the schema already (lib/api/http.ts), so no second one is added here.
import { isCancelled, isUnread, Unread } from "./client.ts";
import type { Result } from "../api/http.ts";

type Refused = Extract<Result<never>, { ok: false }>;

// A drop is `down`, a server error is `down` with a 5xx status; anything else is the answer's, and is the same on a second ask.
const failureOf = ({ reason }: Refused) =>
  reason === "network"
    ? { kind: "down" as const }
    : reason === "unavailable"
      ? { kind: "down" as const, status: 503 }
      : undefined;

/** The value of a call, or an `Unread` carrying its refusal; the query's `signal` ends the call when the query is cancelled. */
export async function readApi<T>(call: (signal?: AbortSignal) => Promise<Result<T>>, signal?: AbortSignal): Promise<T> {
  const answer = await call(signal);
  if (!answer.ok) throw new Unread(answer, failureOf(answer));
  return answer.value;
}

/** What a query of `readApi` gave, as the `Result` the callers of the client read: a read cancelled before it answered is the
 * network's, a bug is not a result and rises. */
export async function resultOf<T>(read: Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await read };
  } catch (error) {
    if (isUnread<Refused>(error)) return error.read;
    if (isCancelled(error)) return { ok: false, reason: "network" };
    throw error;
  }
}
