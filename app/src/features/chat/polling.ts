// A draft that asks a poll (8d): `/poll A question? | an answer | another` sends the poll's text (core's poll.ts), any other draft
// what core's compose makes of it. Read here, in the composer's own chunk, so the first screen's compose stays as it was.
import { COMMANDS, compose, pollAsked, pollText, type Composed } from "@gnoworld/core";

const POLL = "/poll";

/** The commands the composer completes: core's, and the poll. */
export const DRAFT_COMMANDS: readonly string[] = [...COMMANDS, POLL];

/** The draft composed: a poll asked right as its text, one asked wrong as the unknown `/poll` (said.ts says how to ask one). */
export function composeDraft(room: string, draft: string, nick: string): Composed {
  const word = /^\s*(\S*)/u.exec(draft)?.[1]?.toLowerCase();
  if (word !== POLL) return compose(room, draft, nick);
  const poll = pollAsked(draft.trim().slice(POLL.length));
  return poll === undefined ? { kind: "unknown", command: POLL } : compose(room, pollText(poll), nick);
}
