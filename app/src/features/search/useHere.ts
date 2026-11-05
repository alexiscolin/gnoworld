import { useEffect, useState } from "react";
import { pagePresenceApi } from "../../lib/api/presence.ts";

// Who is here in each of the default universe's worlds, by its roles file's slug, read as the drawer opens; nothing when the server says
// nothing.
export function useHere(open: boolean): ReadonlyMap<string, number> {
  const [here, setHere] = useState<ReadonlyMap<string, number>>(() => new Map());
  useEffect(() => {
    if (!open) return undefined;
    let shown = true;
    pagePresenceApi()
      .read()
      .then((read) => {
        if (shown && read.ok) setHere(new Map(read.value.worlds.map(({ world, here: people }) => [world, people])));
      })
      .catch(reportError);
    return () => {
      shown = false;
    };
  }, [open]);
  return here;
}
