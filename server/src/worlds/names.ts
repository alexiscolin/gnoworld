// The names registered for deployers' addresses (slice 7, 7c), one `vm/qeval` each through core's builder, the only place the
// expression is composed. The answer is typed text, `("name" string)`; anything else (no name registered, a panic, a longer or
// odd text) is no name. A network fault ends the pass, a refusal by the chain only leaves that address without one.
import { evalNameOf } from "@gnoworld/core";
import { DeployerName } from "@gnoworld/schemas/indexer";
import { abciQuery, isDown, kindOf, type Send } from "./remote.ts";

const NAME_MAX_BYTES = 4096;
const NAME_MS = 15_000;

/** The registered name of each address asked, or null; an address left unasked after a network fault is null too. */
export async function readNames(
  reader: { send: Send; rpc: string; pace?: () => Promise<void> },
  addresses: readonly string[],
): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>();
  let down = false;
  for (const address of new Set(addresses)) {
    names.set(address, null);
    const expression = evalNameOf(address);
    if (down || expression === null) continue;
    try {
      await reader.pace?.();
      const text = await abciQuery(
        reader,
        { path: "vm/qeval", data: expression },
        { ms: NAME_MS, maxBytes: NAME_MAX_BYTES },
      );
      const name = /^\("([^"]*)" string\)$/.exec(text)?.[1];
      const checked = DeployerName.safeParse(name);
      if (checked.success) names.set(address, checked.data);
    } catch (error) {
      down = isDown(kindOf(error));
    }
  }
  return names;
}
