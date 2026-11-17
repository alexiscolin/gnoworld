// The call a card shows as a command to run by hand (D13880), on a computer only, folded: the page never runs it and never watches for
// it. None for an argument a terminal would run as a new line or draw unlike its bytes: the fold says which, where the command would be.
import { callFields } from "@gnoworld/core";
import { Disclosure } from "@gnoworld/ui";
import { CodeBlock } from "../../CodeBlock.tsx";
import { gnokeyCall } from "../../lib/adena/gnokey.ts";
import type { CallCard } from "../../lib/calls.ts";

// The command, or the words of why there is none.
function command(card: CallCard, network: { chainId: string; rpc: string }) {
  const made = gnokeyCall({ realm: card.realm, func: card.func, args: card.texts }, network);
  if (made.ok)
    return (
      <CodeBlock
        text={made.command}
        help="Replace KEY with your key's name. It sends the call and pays its fee, as signing in Adena does."
      />
    );
  const fields = callFields(card.params);
  const name = (fields.ok ? fields.fields[made.argument]?.name : undefined) ?? "";
  return (
    <p className="meta">
      No command for this call: {name === "" ? `argument ${String(made.argument + 1)}` : name} holds a line break or a
      control character.
    </p>
  );
}

export function CommandLine({ card, network }: { card: CallCard; network: { chainId: string; rpc: string } }) {
  return (
    <div className="fine-only">
      <Disclosure title="Or run it with gnokey" size="s">
        {command(card, network)}
      </Disclosure>
    </div>
  );
}
