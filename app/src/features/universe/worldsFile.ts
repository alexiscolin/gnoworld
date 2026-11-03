// The scene's read of the worlds' file (7n2): the cosmos asks it once it shows, and the home's hero never does, for it reads their count. What
// it brings is counted as the cosmos draws it, and that count stands over the one the home read: the hero says the number the cosmos draws.
import { worldsDrawn as counted } from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { readWorlds } from "../../lib/chain/realms.ts";
import { worldsDrawn } from "./worldsCount.ts";

/** The worlds' file, read for the scene until `leaving` ends it. */
export async function worldsFile(leaving: AbortSignal): Promise<Worlds | undefined> {
  const file = await readWorlds(import.meta.env.BASE_URL, { signal: leaving });
  if (file !== undefined) worldsDrawn(counted(file.worlds));
  return file;
}
