// The worlds' file, read for the home's big number and taken by the scene (7n). The hero counts the worlds the cosmos draws whether the scene
// runs or not (no WebGL, a refused GPU, a phone before View in space), and a scene that comes takes the page's read: one request and one parse
// for both. Apart from the count's module, which the first screen and the universe's chunk both import.
import { worldsDrawn as counted } from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { useEffect, useState } from "react";
import { readWorlds } from "../../lib/chain/realms.ts";
import { useWorldsDrawn, worldsDrawn } from "./worldsCount.ts";

// As long as the host lets a browser keep the file (deploy/web/nginx.conf, max-age=60): a scene later than that reads it again.
const KEPT_MS = 60_000;

// The page's read, until a scene takes it or a minute after it came; and the read under way, whoever asked it.
let asked: Promise<Worlds | undefined> | undefined;
let running: Promise<Worlds | undefined> | undefined;

// Whichever read brings the file counts it.
function counting(options: { signal?: AbortSignal } = {}): Promise<Worlds | undefined> {
  const read = readWorlds(import.meta.env.BASE_URL, options).then((file) => {
    if (running === read) running = undefined;
    if (file !== undefined) worldsDrawn(counted(file.worlds));
    return file;
  });
  running = read;
  return read;
}

const letGo = (read: Promise<Worlds | undefined>) => {
  if (asked === read) asked = undefined;
};

/** The scene's read of the file: the page's, if it asked one, and the scene's alone from then on; else a read of its own that `leaving`
 * ends. */
export function worldsFile(leaving: AbortSignal): Promise<Worlds | undefined> {
  const read = asked ?? counting({ signal: leaving });
  asked = undefined;
  return read;
}

// The page shares a read under way; one that brought nothing is let go, for the next home to ask again. Out of the hook: the React
// Compiler refuses a hook that writes a module's variable, even from its effect.
function ask(): Promise<Worlds | undefined> {
  const kept: Promise<Worlds | undefined> = (running ?? counting()).then((file) => {
    if (file === undefined) letGo(kept);
    else setTimeout(letGo, KEPT_MS, kept);
    return file;
  });
  asked = kept;
  return kept;
}

/** How many worlds the cosmos draws, while `wanted`: the page reads the file for it once a visit, whether the scene runs or not. Nothing
 * while it comes; null once this page's read has brought none, until another read brings it. */
export function useWorldsCount(wanted: boolean): number | null | undefined {
  const count = useWorldsDrawn();
  const [none, setNone] = useState(false);
  useEffect(() => {
    if (wanted && count === undefined)
      ask().then(
        (file) => {
          if (file === undefined) setNone(true);
        },
        () => undefined,
      );
  }, [wanted, count]);
  if (!wanted) return undefined;
  return count ?? (none ? null : undefined);
}
