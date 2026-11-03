// The worlds' file, read for the home's big number and taken by the scene (7n). The hero counts the worlds the cosmos draws whether the scene
// runs or not (no WebGL, a refused GPU, a phone before View in space), and a scene that comes takes the page's read: one request and one parse
// for both. Apart from the count's module, which the first screen and the universe's chunk both import.
import { worldsDrawn as counted } from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { useEffect } from "react";
import { readWorlds } from "../../lib/chain/realms.ts";
import { useWorldsDrawn, worldsDrawn } from "./worldsCount.ts";

// The page's read, until a scene takes it.
let asked: Promise<Worlds | undefined> | undefined;

// Whichever read brings the file counts it; one that brings nothing is let go, for the next home to ask again.
const counting = (options: { signal?: AbortSignal } = {}) =>
  readWorlds(import.meta.env.BASE_URL, options).then((file) => {
    if (file === undefined) asked = undefined;
    else worldsDrawn(counted(file.worlds));
    return file;
  });

/** The scene's read of the file: the page's, if it asked one, and the scene's alone from then on; else a read of its own that `leaving`
 * ends. */
export function worldsFile(leaving: AbortSignal): Promise<Worlds | undefined> {
  const read = asked ?? counting({ signal: leaving });
  asked = undefined;
  return read;
}

// Out of the hook: the React Compiler refuses a hook that writes a module's variable, even from its effect.
function ask(): void {
  asked ??= counting();
}

/** How many worlds the cosmos draws, while `wanted`: the page reads the file for it once a visit, whether the scene runs or not. */
export function useWorldsCount(wanted: boolean): number | undefined {
  const count = useWorldsDrawn();
  useEffect(() => {
    if (wanted && count === undefined) ask();
  }, [wanted, count]);
  return wanted ? count : undefined;
}
