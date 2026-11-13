// Direct messages on a world's page (slice 4's 4e): the conversation the address names (?dm=<address>), an
// account's with another account, and the list the rooms' navigation shows.
import type { Line, Reaction } from "@gnoworld/core";
import type { AppState } from "../../store/index.ts";
import { useApp } from "../../storeContext.tsx";
import { LOG_IN_TO_READ_DMS } from "./loginWords.ts";
import { isAccount } from "./names.ts";
import type { DmsProps } from "./RoomsView.tsx";

/** What every direct message says of itself (ADR-0002, Chat). */
export const NOT_ENCRYPTED = "Not encrypted: the server can read these.";
/** And that it lives in the page alone: Ergo keeps no direct message (decision 154; decision C). */
export const PAGE_ONLY = "Kept only while this page is open.";

export interface Dms {
  /** The account the conversation in view is with; none for a guest or an address that is none. */
  partner: string | undefined;
  /** The navigation's list; none for a guest. */
  nav: DmsProps | undefined;
  /** The lines of the conversation in view. */
  lines: readonly Line[];
  /** What the conversation in view says while it holds no line. */
  empty: string;
  /** The lines to it Ergo refused this session: how many, the last one's draft, and whether its partner was offline. */
  refused: AppState["dmRefused"][string] | undefined;
  /** Why the ?dm= asked shows no conversation, said in its place (U9). */
  problem: string | undefined;
  /** The reactions to the conversation's lines (4d's DM bar). */
  reactions?: readonly Reaction[] | undefined;
  /** What Ergo refused of the page's delete or reaction in it: the line whose delete, and a reaction. */
  acts?: AppState["dmActRefused"][string] | undefined;
}

/** The account the address's ?dm= names: another account's, never the reader's own nor an address that is none. */
export function partnerOf(account: string | undefined, asked: string | null): string | undefined {
  if (account === undefined || asked === null || asked === account) return undefined;
  return isAccount(asked) ? asked : undefined;
}

/** The navigation's list: every conversation heard, `heard` oldest first, listed heard last first; and the one in view
 * first though none was yet. */
export const listOf = (heard: readonly string[], partner: string | undefined): string[] =>
  partner === undefined || heard.includes(partner) ? heard.toReversed() : [partner, ...heard.toReversed()];

/** Why the address's ?dm= shows no conversation: a guest's, one's own address, an address that is none (U9); nothing
 * while the session is unknown. */
export function problemOf(session: AppState["login"]["session"], asked: string | null): string | undefined {
  if (asked === null || session.kind === "unknown") return undefined;
  if (session.kind === "out") return LOG_IN_TO_READ_DMS;
  if (asked === session.address) return "That is your own address.";
  return isAccount(asked) ? undefined : "That is not an account's address.";
}

/** The conversation with `partner`: its lines, and what it says with none. */
export function conversationOf(all: AppState["dms"], partner: string | undefined): Pick<Dms, "lines" | "empty"> {
  return { lines: partner === undefined ? [] : (all[partner] ?? []), empty: "No messages since this page opened." };
}

// Everyone in a room this page follows, as one string the store's selector compares by value: a partner among them is online.
// ponytail: every member of every room followed, a world's few rooms of a few hundred people each.
const presentIn = (rooms: AppState["chat"]["rooms"]): string =>
  [...new Set(Object.values(rooms).flatMap((room) => room.members))].sort().join(" ");

/** An account's direct messages on a world's page, `asked` the address's ?dm=. */
export function useDms(world: string, session: AppState["login"]["session"], asked: string | null): Dms {
  const all = useApp((app) => app.dms);
  const refusals = useApp((app) => app.dmRefused);
  const reactions = useApp((app) => app.dmReactions);
  const acts = useApp((app) => app.dmActRefused);
  const present = useApp((app) => presentIn(app.chat.rooms));
  const account = session.kind === "in" ? session.address : undefined;
  const partner = partnerOf(account, asked);
  return {
    partner,
    nav:
      account === undefined
        ? undefined
        : {
            world,
            partners: listOf(Object.keys(all), partner),
            current: partner,
            present,
          },
    ...conversationOf(all, partner),
    refused: partner === undefined ? undefined : refusals[partner],
    reactions: partner === undefined ? undefined : reactions[partner],
    acts: partner === undefined ? undefined : acts[partner],
    problem: problemOf(session, asked),
  };
}
