// The call a card shows as a command to run by hand (D13880), on a computer only, folded while Adena is in the page: the page never runs
// it and never watches for it. None for an argument a shell could read otherwise: the fold says which, where the command would be.
import { callFields } from "@gnoworld/core";
import type { Address } from "@gnoworld/schemas";
import { Disclosure } from "@gnoworld/ui";
import { CodeBlock } from "../../CodeBlock.tsx";
import { MAX_DEPOSIT } from "../../lib/adena/deposit.ts";
import { GAS_FEE } from "../../lib/adena/gas.ts";
import { gnokeyCall, QUOTE } from "../../lib/adena/gnokey.ts";
import type { CallCard } from "../../lib/calls.ts";

// What running it costs, and that the card will not know (PR #41's UX review): a second signature in Adena would send it twice.
const PAYS = `It sends the call and pays ${String(GAS_FEE / 1_000_000)} GNOT, and at most ${String(Number.parseInt(MAX_DEPOSIT, 10) / 1_000_000)} GNOT of storage deposit; gnoworld will not see it, so do not also sign in Adena.`;

// cmd has no single quotes, and PowerShell's differ (the split's security review): the words single-quoted are a POSIX shell's.
const SHELLS = "Run it in bash or zsh, not cmd or PowerShell.";

// Why an argument has no command (gnokey.ts's refusals).
const whyNone = (text: string): string =>
  text.includes("\\")
    ? "a backslash, which some shells read as an escape"
    : QUOTE.test(text)
      ? "a quote, which some shells read as the end of the text"
      : "a line break or a control character";

// The command, or the words of why there is none.
function command(card: CallCard, network: { chainId: string; rpc: string }, as: Address | undefined) {
  const made = gnokeyCall({ realm: card.realm, func: card.func, args: card.texts }, { ...network, key: as });
  if (made.ok) {
    const where =
      as === undefined
        ? `${SHELLS} Replace KEY with your key's name.`
        : `${SHELLS} It signs with this account's key, which the tool must hold.`;
    return <CodeBlock text={made.command} help={`${where} ${PAYS}`} />;
  }
  const fields = callFields(card.params);
  const name = (fields.ok ? fields.fields[made.argument]?.name : undefined) ?? "";
  const why = whyNone(card.texts[made.argument] ?? "");
  return (
    <p className="meta">
      No command for this call: {name === "" ? `argument ${String(made.argument + 1)}` : name} holds {why}. Remove it to
      get a command.
    </p>
  );
}

/** The card's command, signed by `as` when an account is logged in; open from the start with no Adena in the page, read without
 * touching its object (D254). */
export default function CommandLine({
  card,
  network,
  as,
}: {
  card: CallCard;
  network: { chainId: string; rpc: string };
  as: Address | undefined;
}) {
  return (
    <div className="fine-only">
      <Disclosure title="Or run it with gnokey" size="s" open={!("adena" in globalThis)}>
        {command(card, network, as)}
      </Disclosure>
    </div>
  );
}
