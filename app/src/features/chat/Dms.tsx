// Direct messages on a world's page (slice 4's 4e): the conversation the address names (?dm=<address>), an
// account's with another account; the list the rooms' navigation shows; and, when the account asks so, none from an
// account it never wrote to (ADR-0002's "only from people I have talked with"), as the store keeps the choice.
import type { Line } from "@gnoworld/core";
import { heardFrom } from "../../store/dms.ts";
import type { AppState } from "../../store/index.ts";
import { useApp } from "../../storeContext.tsx";
import { isAccount } from "./names.ts";
import type { DmsProps } from "./RoomsView.tsx";

/** What every direct message says of itself (ADR-0002, Chat). */
export const NOT_ENCRYPTED = "Not encrypted: the server can read these.";
/** And that it lives in the page alone: Ergo keeps no direct message (decision 154; decision C). */
export const PAGE_ONLY = "Kept only while this page is open.";
/** What a stranger's conversation says while the account hears those it wrote to alone (decision B). */
const NOT_KEPT = 'Not kept: messages from accounts you never wrote to, while "Only people I wrote to" is on.';

export interface Dms {
  /** The account the conversation in view is with; none for a guest or an address that is none. */
  partner: string | undefined;
  /** The navigation's list; none for a guest. */
  nav: DmsProps | undefined;
  /** The lines of the conversation in view; none from an account never written to, while the account asks so. */
  lines: readonly Line[];
  /** What the conversation in view says while it holds no line. */
  empty: string;
  /** The lines to it Ergo refused this session, its partner not connected: how many, and the last one's draft. */
  refused: { count: number; draft: string } | undefined;
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

/** The conversation with `partner`: its lines, none while the account does not hear from it, and what it says with
 * none. */
export function conversationOf(
  all: AppState["dms"],
  choices: AppState["dmChoices"],
  partner: string | undefined,
): Pick<Dms, "lines" | "empty"> {
  if (partner !== undefined && !heardFrom(choices, partner)) return { lines: [], empty: NOT_KEPT };
  return { lines: partner === undefined ? [] : (all[partner] ?? []), empty: "No messages since this page opened." };
}

/** An account's direct messages on a world's page, `asked` the address's ?dm=. */
export function useDms(world: string, session: AppState["login"]["session"], asked: string | null): Dms {
  const all = useApp((app) => app.dms);
  const choices = useApp((app) => app.dmChoices);
  const refusals = useApp((app) => app.dmRefused);
  const { setOnlyKnown } = useApp((app) => app.dmActions);
  const account = session.kind === "in" ? session.address : undefined;
  const partner = partnerOf(account, asked);
  const heard = (other: string) => heardFrom(choices, other);
  return {
    partner,
    nav:
      account === undefined
        ? undefined
        : {
            world,
            partners: listOf(Object.keys(all).filter(heard), partner),
            current: partner,
            onlyKnown: choices.onlyKnown,
            onOnlyKnown: setOnlyKnown,
          },
    ...conversationOf(all, choices, partner),
    refused: partner === undefined ? undefined : refusals[partner],
  };
}
