// The realms the worlds job lists (D390, D413): the paths a realm room is made for, ahead or on a first open. One reader of the file for all
// of them, read again when the job has written it anew (its modification time changed), never on each ask; a file that is missing, broken
// or not the worlds' knows no realm. The paths come busiest world first, so a cap that falls short keeps the realms people call.
import { readFileSync, statSync } from "node:fs";
import { Worlds } from "@gnoworld/schemas/indexer";
import { callsOf } from "./shed.ts";

export interface Listing {
  /** Whether the file lists the path. */
  known: (path: string) => boolean;
  /** The listed paths, the world with the most calls first, the file's order among equals. */
  paths: () => readonly string[];
  /** The modification time of the file as last read, or none for a file that is not there. */
  stamp: () => number | undefined;
}

interface Read {
  at: number;
  paths: readonly string[];
  set: ReadonlySet<string>;
}

function load(at: number, text: () => string): Read {
  try {
    const { worlds } = Worlds.parse(JSON.parse(text()));
    const paths = worlds
      .toSorted((a, b) => callsOf(b) - callsOf(a))
      .flatMap((world) => world.realms.map((realm) => realm.path));
    return { at, paths, set: new Set(paths) };
  } catch {
    // Read once, not for each ask: the same broken file is not read again until it changes.
    return { at, paths: [], set: new Set() };
  }
}

export function worldsListing(
  file: string,
  read: (file: string) => string = (name) => readFileSync(name, "utf8"),
): Listing {
  let last: Read | undefined;
  const current = (): Read | undefined => {
    try {
      const { mtimeMs } = statSync(file);
      if (last?.at !== mtimeMs) last = load(mtimeMs, () => read(file));
    } catch {
      last = undefined;
    }
    return last;
  };
  return {
    known: (path) => current()?.set.has(path) === true,
    paths: () => current()?.paths ?? [],
    stamp: () => current()?.at,
  };
}

export const knownRealms = (file: string): ((path: string) => boolean) => worldsListing(file).known;
