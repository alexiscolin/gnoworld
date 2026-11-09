// The worlds' file as space and its rail read it (7n2): asked once a page shows space, and once for the page's life, both reading the
// same answer; the home's hero never asks it, for it reads their count. What it brings is counted as space draws it, and that count
// stands over the one the home read: the hero says the number space draws.
import { worldsDrawn as counted } from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { readWorlds } from "../../lib/chain/realms.ts";
import { worldsDrawn } from "./worldsCount.ts";

let reading: Promise<Worlds | undefined> | undefined;

/** The worlds' file, read once; a read that failed is asked again by the next reader. */
export function worldsFile(): Promise<Worlds | undefined> {
  reading ??= readWorlds(import.meta.env.BASE_URL).then(
    (file) => {
      if (file !== undefined) worldsDrawn(counted(file.worlds));
      return file;
    },
    (error: unknown) => {
      reading = undefined;
      throw error;
    },
  );
  return reading;
}
