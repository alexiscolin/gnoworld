// The call a card shows as a command to run by hand (D13880), on a computer only, folded while Adena is in the page: the page never runs
// it and never watches for it. None for an argument a shell could read otherwise: the fold says which, where the command would be.
import { callFields } from "@gnoworld/core";
import type { Address } from "@gnoworld/schemas";
import { Disclosure } from "@gnoworld/ui";
import { CodeBlock } from "../../CodeBlock.tsx";
import { GAS_FEE } from "../../lib/adena/gas.ts";
import { gnokeyCall } from "../../lib/adena/gnokey.ts";
import type { CallCard } from "../../lib/calls.ts";

// What running it costs, and that the card will not know (PR #41's UX review): a second signature in Adena would send it twice.
const PAYS = `It sends the call and pays ${String(GAS_FEE / 1_000_000)} GNOT; gnoworld will not see it, so do not also sign in Adena.`;

// The command, or the words of why there is none.
function command(card: CallCard, network: { chainId: string; rpc: string }, as: Address | undefined) {
  const made = gnokeyCall({ realm: card.realm, func: card.func, args: card.texts }, { ...network, key: as });
  if (made.ok) {
    const where =
      as === undefined ? "Run it in bash or zsh, KEY replaced by your key's name." : "Run it in bash or zsh.";
    return <CodeBlock text={made.command} help={`${where} ${PAYS}`} />;
  }
  const fields = callFields(card.params);
  const name = (fields.ok ? fields.fields[made.argument]?.name : undefined) ?? "";
  const why = card.texts[made.argument]?.includes("\\")
    ? "a backslash, which some shells read as an escape"
    : "a line break or a control character";
  return (
    <p className="meta">
      No command for this call: {name === "" ? `argument ${String(made.argument + 1)}` : name} holds {why}. Remove it to
      get a command.
    </p>
  );
}

/** The card's command, signed by `as` when an account is logged in; open from the start when `open` (no Adena in the page). */
export function CommandLine({
  card,
  network,
  as,
  open,
}: {
  card: CallCard;
  network: { chainId: string; rpc: string };
  as: Address | undefined;
  open: boolean;
}) {
  return (
    <div className="fine-only">
      <Disclosure title="Or run it with gnokey" size="s" open={open}>
        {command(card, network, as)}
      </Disclosure>
    </div>
  );
}
