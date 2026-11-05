// The plate's "First charted by @name" (frame 91): who charted the world, for every reader, from the signals' slice. Plain text
// of the short address until the names of slice 9f exist (D212); nothing until the server has said who.
import { shortAddress } from "../chat/index.ts";
import { own } from "../../store/record.ts";
import { useApp } from "../../storeContext.tsx";

export function FirstCharted({ world }: { world: string }) {
  const charted = useApp(({ signals }) => own(signals.firsts, world)?.charted);
  return charted === undefined || charted === null ? null : <p>First charted by @{shortAddress(charted.account)}</p>;
}
