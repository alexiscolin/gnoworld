// The reasons a call to the server fails for whatever it asked: a server down or out of reach, which each feature says in its own words, and
// an answer the page could not use, which every feature says alike.
import type { Result } from "./http.ts";

type Why = Exclude<Result<never>, { ok: true }>["reason"];

/** What an answer the page could not use says, in every feature. */
export const UNEXPECTED = "Something unexpected came back. Please try again.";

/** The transport's reasons, each said: `unreached` for a server down or out of reach, `UNEXPECTED` for an answer the page could not take. */
export const transportWords = (unreached: string) =>
  ({
    not_ready: unreached,
    unavailable: unreached,
    internal: unreached,
    network: unreached,
    malformed: UNEXPECTED,
    unsupported: UNEXPECTED,
    too_large: UNEXPECTED,
  }) satisfies Partial<Record<Why, string>>;
