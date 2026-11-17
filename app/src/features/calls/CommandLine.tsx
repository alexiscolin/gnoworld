// The call a card shows as a command to run by hand (D13880), on a computer only: the page never runs it and never watches for it. None
// for an argument a terminal would run as a new line or draw unlike its bytes, and the card says which.
import { callFields } from "@gnoworld/core";
import { Disclosure } from "@gnoworld/ui";
import { gnokeyCall } from "../../lib/adena/gnokey.ts";
import type { CallCard } from "../../lib/calls.ts";

export function CommandLine({ card, network }: { card: CallCard; network: { chainId: string; rpc: string } }) {
  const made = gnokeyCall({ realm: card.realm, func: card.func, args: card.texts }, network);
  if (!made.ok) {
    const fields = callFields(card.params);
    const name = (fields.ok ? fields.fields[made.argument]?.name : undefined) ?? "";
    return (
      <p className="meta fine-only">
        No command for this call: {name === "" ? `argument ${String(made.argument + 1)}` : name} holds a line break or a
        control character.
      </p>
    );
  }
  return (
    <div className="fine-only">
      <Disclosure title="Or run it with gnokey" size="s">
        <p className="fill-box data-text">{made.command}</p>
      </Disclosure>
    </div>
  );
}
