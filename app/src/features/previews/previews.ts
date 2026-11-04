// The previews' shared parts (8f): the captures' file, read once a page however many places ask, the universe whose pages it holds, and a
// path written as the video writes it.
import type { Previews } from "@gnoworld/schemas/indexer";
import { readPreviews } from "../../lib/chain/previews.ts";
import { site, type UniverseView } from "../../places.ts";

/** A realm's path as frames 26 and 104 write it: whole up to 20 characters, else its middle folders cut, its last kept. */
export function shortPath(path: string): string {
  const [, , ...folders] = path.split("/");
  const last = folders.at(-1);
  return path.length <= 20 || folders.length < 2 || last === undefined ? path : `gno.land/r/…/${last}`;
}

/** The default universe: its gnoweb is where a line's link must point, its id the one the file must be of. */
export const captured = (): UniverseView => site.universeAt("/");

let shared: Promise<Previews | undefined> | undefined;

/** The captures' file, read once a page, however many places ask; a read that failed is asked again by the next. */
export function sharedPreviews(): Promise<Previews | undefined> {
  shared ??= readPreviews(import.meta.env.BASE_URL).then((file) => {
    if (file === undefined) shared = undefined;
    return file;
  });
  return shared;
}
