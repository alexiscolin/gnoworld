// The worlds' file, read once a view that needs every world opens (the passport's constellations, the search drawer's signals left to find,
// 8i): only the cosmos's file lists them all. A read that fails gives an empty list, so a view falls back to what the device holds.
import type { Worlds } from "@gnoworld/schemas/indexer";
import { useEffect, useState } from "react";
import { readWorlds } from "./lib/chain/realms.ts";

/** The file's worlds once `open`, undefined while they come. */
export function useWorldsFile(open: boolean): Worlds["worlds"] | undefined {
  const [worlds, setWorlds] = useState<Worlds["worlds"]>();
  useEffect(() => {
    if (!open || worlds !== undefined) return;
    const leaving = new AbortController();
    readWorlds(import.meta.env.BASE_URL, { signal: leaving.signal })
      .then((file) => {
        setWorlds(file?.worlds ?? []);
      })
      .catch((error: unknown) => {
        if (!leaving.signal.aborted) setWorlds([]);
        reportError(error);
      });
    return () => {
      leaving.abort();
    };
  }, [open, worlds]);
  return worlds;
}
