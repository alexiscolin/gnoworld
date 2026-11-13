// Right after a Connect (a login under way, not a session found at the page's load), an account with no name on the page's chain is asked
// for one, once; "Later" closes it (D13953). The ask ends at the chain's first answer for that account, at a Connect that failed and at a
// new universe, so nothing it held opens the dialog later or for another account.
import { useEffect, useState } from "react";
import { onAsked, tellNameless } from "../../pageAsks.ts";
import { useJustLoggedIn } from "./justLoggedIn.ts";

/** Whether the name dialog shows, and whether a name can be picked: the label's `pickable`, none until the page's chain answered; and
 * whether a login just ran its course. */
export function useNaming(connecting: boolean, address: string | undefined, universe: string) {
  const justIn = useJustLoggedIn(connecting, address);
  const [naming, setNaming] = useState(false);
  const [pending, setPending] = useState(false);
  const [pickable, setPickable] = useState<boolean | undefined>(undefined);
  const [seen, setSeen] = useState({ universe, address, justIn });
  if (universe !== seen.universe) setPending(false);
  if (address !== seen.address) {
    setNaming(false);
    setPickable(undefined);
    setPending(false);
  }
  if (justIn !== seen.justIn) setPending(justIn);
  if (universe !== seen.universe || address !== seen.address || justIn !== seen.justIn)
    setSeen({ universe, address, justIn });
  if (pending && pickable !== undefined) {
    setPending(false);
    setNaming(pickable);
  }
  return { naming, setNaming, pickable: pickable === true, setPickable, justIn };
}

/** While the account logged in has no name to be read by, the chat is told so, and its ask to pick one opens the dialog (D13982). */
export function useNamelessTold(nameless: boolean, open: (naming: boolean) => void): void {
  useEffect(() => {
    tellNameless(nameless);
    if (!nameless) return undefined;
    const stop = new AbortController();
    onAsked(
      "pick-name",
      () => {
        open(true);
      },
      stop.signal,
    );
    return () => {
      stop.abort();
      tellNameless(false);
    };
  }, [nameless, open]);
}
