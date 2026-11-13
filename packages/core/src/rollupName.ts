// A realm's rollup file (slice 13a) by its path's hash: the server writes it under this name and a browser asks it, so no path text reaches a
// file name. Synchronous and pure, as a planet's seed is (planet/sha256.ts).
import { sha256 } from "./planet/sha256.ts";
import { asciiBytes, hexOf } from "./text/bytes.ts";

/** The first 32 hex characters of the SHA-256 of `path`, an ASCII text as every realm path is; a text beyond ASCII is refused. */
export function rollupName(path: string): string {
  return hexOf(sha256(asciiBytes(path)).subarray(0, 16));
}
