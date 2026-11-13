// The app's one query client (slice 13, D13973): every read of the chain, the indexer and the site's files goes through it, so a place seen
// comes back at once and is read again quietly. Fresh for fifteen seconds (the public RPC is shared: a visit costs one read, never a flood); an
// answer nobody uses is let go after ten minutes, which bounds a tab's memory to the places it recently showed. The hooks pass this client to
// `useQuery` themselves, so no provider sits over the first screen.
import type { FailureKind } from "@gnoworld/chain/read";
import { CancelledError, environmentManager, QueryCache, QueryClient } from "@tanstack/react-query";

/** How long a fresh read is shared: a read younger than this is not asked again. */
export const FRESH_MS = 15_000;
/** How long an answer no view uses is kept. */
const KEPT_MS = 10 * 60_000;
const RETRIES = 2;

/** A read that did not come whole, thrown by a `queryFn` so the query keeps its last good data and keeps nothing of the failure; `read`
 * is what the caller shows of it (the failed `ChainRead`, or nothing). */
export class Unread<R = undefined> extends Error {
  readonly read: R;
  readonly failure: { kind: FailureKind; status?: number | undefined } | undefined;
  constructor(read: R, failure?: { kind: FailureKind; status?: number | undefined }) {
    super("read did not come whole");
    this.read = read;
    this.failure = failure;
  }
}

// Worth a second try: a service that did not answer in time, a network that dropped, a 5xx. Never a 4xx, a wrong shape, a refusal, a realm's
// panic or a missing realm: each answers the same again, and a retry only costs the shared RPC (TanStack's retries guide: a rule by error).
const retry = (count: number, error: Error): boolean => {
  if (count >= RETRIES) return false;
  if (!(error instanceof Unread)) return true;
  const { kind, status } = error.failure ?? {};
  return kind === "timeout" || (kind === "down" && (status === undefined || status >= 500));
};

/** Whether `error` is an `Unread` carrying a `read` of the type the caller's query throws. */
export const isUnread = <R>(error: unknown): error is Unread<R> => error instanceof Unread;

/** Whether `error` is the query's own end: cancelled because its last viewer left while it was being read. */
export const isCancelled = (error: unknown): error is CancelledError => error instanceof CancelledError;

/** For a read nobody waits on (asked ahead): a read that did not come whole, or that was cancelled, is expected and said by the view's
 * own ask; anything else is a bug and rises. */
export const quietUnread = (error: unknown): void => {
  if (!(error instanceof Unread) && !isCancelled(error)) throw error;
};

export const makeQueryClient = (): QueryClient =>
  new QueryClient({
    // A read that did not come whole is a state the views say; anything else thrown is a bug, and the browser reports it.
    queryCache: new QueryCache({
      onError: (error) => {
        if (!(error instanceof Unread)) reportError(error);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: FRESH_MS,
        // A server render has no tab to keep for and no timer to hold the process.
        gcTime: environmentManager.isServer() ? Infinity : KEPT_MS,
        refetchOnWindowFocus: true,
        retry,
        retryDelay: (count) => Math.min(1_000 * 2 ** count, 8_000),
        structuralSharing: true,
      },
    },
  });

export const queryClient = makeQueryClient();
