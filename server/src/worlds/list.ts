// The chain's realm list (slice 7, 7c): `vm/qpaths` with the prefix `gno.land/r/` answers the paths joined by a newline, sorted, with
// no metadata (handler.go:233 at v1.5.0). Its limit is 1,000 by default and 10,000 at most, and a limit over the cap is lowered,
// not refused, so an answer of exactly the limit may be cut: the prefix is then split on the next character and each part asked
// on its own (F3517; the chain pages by prefix only, handler.go:196, pagination not implemented there). What comes back is data: capped,
// and each line kept only if it is a realm path. ponytail: at most LIST_MAX_QUERIES requests; then the list is returned, marked partial.
import { REALM_PREFIX } from "@gnoworld/core";
import { RealmPath } from "@gnoworld/schemas/indexer";
import { abciQuery, kindOf, type Kind, type Send } from "./remote.ts";

export const LIST_MAX_PATHS = 10_000;
/** A full page of the longest legal paths: gno caps a path at 256 bytes, and a newline follows each. */
export const LIST_MAX_BYTES = 257 * LIST_MAX_PATHS;
/** The most requests one list may take: 38 parts of the first split, and their splits after it, far past a chain of 10^5 realms. */
export const LIST_MAX_QUERIES = 2_000;
/** The most paths one list holds: about 30 MB of heap at 300 bytes a path, past what the file's 4 MiB can name. */
export const LIST_MAX_TOTAL = 100_000;
const LIST_MS = 30_000;
// What may follow a prefix in a realm path: a segment's letters and digits, `_` and `-` inside it, and `/` between two.
const NEXT = [
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "_",
  "-",
  "/",
];

export type PathsRead = { ok: true; paths: string[]; partial?: true } | { ok: false; kind: Kind };

// The realm paths of one answer: all of them, or when the chain cut it only the prefix's own path (the parts are asked apart).
function keptFrom(lines: readonly string[], prefix: string, cut: boolean): string[] {
  return lines.filter((line) => (!cut || line === prefix) && RealmPath.safeParse(line).success);
}

// Whether the walk stops with what it has: its requests or its total of paths are used up.
const spent = (asked: number, paths: number): boolean => asked >= LIST_MAX_QUERIES || paths >= LIST_MAX_TOTAL;

export async function readRealmPaths(reader: {
  send: Send;
  rpc: string;
  pace?: () => Promise<void>;
  /** The chain's limit per answer, 10,000 unless a test says less. */
  limit?: number;
}): Promise<PathsRead> {
  try {
    const limit = reader.limit ?? LIST_MAX_PATHS;
    const found = new Set<string>();
    const prefixes = [REALM_PREFIX];
    let partial = false;
    for (let asked = 0; prefixes.length > 0; asked += 1) {
      if (spent(asked, found.size)) {
        partial = true;
        break;
      }
      const prefix = prefixes.shift() ?? REALM_PREFIX;
      await reader.pace?.();
      const text = await abciQuery(
        reader,
        { path: `vm/qpaths?limit=${String(limit)}`, data: prefix },
        { ms: LIST_MS, maxBytes: LIST_MAX_BYTES },
      );
      const lines = text.split("\n").filter((line) => line !== "");
      const cut = lines.length >= limit;
      if (cut) prefixes.push(...NEXT.map((next) => `${prefix}${next}`));
      for (const path of keptFrom(lines, prefix, cut)) found.add(path);
    }
    return partial ? { ok: true, paths: [...found], partial } : { ok: true, paths: [...found] };
  } catch (error) {
    return { ok: false, kind: kindOf(error) };
  }
}
