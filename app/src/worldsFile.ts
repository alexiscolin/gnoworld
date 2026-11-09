// The worlds' file, read once a view that needs every world opens (the passport's constellations, the search palette's systems and realms,
// 8i; a plate's connected worlds and realm card, 8g): only the cosmos's file lists them all. A read that fails gives an empty list, so a
// view falls back to what the device holds. The reader and its schema come in a chunk of their own: a plate's first screen holds neither.
import type { Worlds } from "@gnoworld/schemas/indexer";
import { useEffect, useState } from "react";

// Asked at the effect: a dynamic import inside a component fails the React Compiler's build.
const read = (signal: AbortSignal) =>
  import("./lib/chain/realms.ts").then(({ readWorlds }) => readWorlds(import.meta.env.BASE_URL, { signal }));

/** The file's worlds once `open`, undefined while they come. */
export function useWorldsFile(open: boolean): Worlds["worlds"] | undefined {
  const [worlds, setWorlds] = useState<Worlds["worlds"]>();
  useEffect(() => {
    if (!open || worlds !== undefined) return;
    const leaving = new AbortController();
    read(leaving.signal)
      .then((file) => {
        // A read cut short (a strict-mode effect run, a closed view) says nothing: the next run reads again.
        if (!leaving.signal.aborted) setWorlds(file?.worlds ?? []);
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
