// Right after a Connect (a login under way, not a session found at the page's load), an account with no name on the page's chain is asked
// for one, once; "Later" closes it (D13953). The ask ends at the chain's first answer for that account, at a Connect that failed and at a
// new universe, so nothing it held opens the dialog later or for another account.
import { useState } from "react";

/** Whether the name dialog shows, and whether a name can be picked: the label's `pickable`, none until the page's chain answered. */
export function useNaming(connecting: boolean, address: string | undefined, universe: string) {
  const [naming, setNaming] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [pickable, setPickable] = useState<boolean | undefined>(undefined);
  const [seen, setSeen] = useState(universe);
  if (universe !== seen) {
    setSeen(universe);
    setFresh(false);
  }
  if (connecting && !fresh) {
    setFresh(true);
    setNaming(false);
    setPickable(undefined);
  }
  if (fresh && !connecting && (address === undefined || pickable !== undefined)) {
    setFresh(false);
    setNaming(address !== undefined && pickable === true);
  }
  return { naming, setNaming, pickable: pickable === true, setPickable };
}
