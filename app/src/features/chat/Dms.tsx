// Direct messages on a world's page (slice 4's 4e): the conversation the address names (?dm=<address>), an
// account's with another account; the list the rooms' navigation shows; and, when the account asks so, none from an
// account it never wrote to (ADR-0002's "only from people I have talked with"), as the store keeps the choice.
import type { Line } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import { heardFrom } from "../../store/dms.ts";
import type { AppState } from "../../store/index.ts";
import { useApp } from "../../storeContext.tsx";
import type { DmsProps } from "./RoomsView.tsx";

/** What every direct message says of itself (ADR-0002, Chat). */
export const NOT_ENCRYPTED = "Not encrypted: the server can read these.";

export interface Dms {
  /** The account the conversation in view is with; none for a guest or an address that is none. */
  partner: string | undefined;
  /** The navigation's list; none for a guest. */
  nav: DmsProps | undefined;
  /** The lines of the conversation in view; none from an account never written to, while the account asks so. */
  lines: readonly Line[];
  /** Notes an account written to. */
  know: (partner: string) => void;
}

// The account the address's ?dm= names: another account's, never the reader's own nor an address that is none.
function partnerOf(account: string | undefined, asked: string | null): string | undefined {
  if (account === undefined || asked === null || asked === account) return undefined;
  return Address.safeParse(asked).success ? asked : undefined;
}

// The navigation's list: every conversation heard, and the one in view though none was yet.
const listOf = (heard: readonly string[], partner: string | undefined): string[] =>
  partner === undefined || heard.includes(partner) ? [...heard] : [...heard, partner];

/** An account's direct messages on a world's page, `asked` the address's ?dm=. */
export function useDms(world: string, session: AppState["login"]["session"], asked: string | null): Dms {
  const all = useApp((app) => app.dms);
  const choices = useApp((app) => app.dmChoices);
  const { setOnlyKnown, know } = useApp((app) => app.dmActions);
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
    lines: partner !== undefined && heard(partner) ? (all[partner] ?? []) : [],
    know,
  };
}
