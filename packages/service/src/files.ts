// A data file of the services (Jarvis's places, the server's universes): refused past 1 MiB before it is read, then its
// text. The app's build reads its own the same way (app/src/dataFiles.ts), as it depends on no package of the services.
import { readFileSync, statSync } from "node:fs";

/** A data file's text; throws past 1 MiB, naming nothing it holds, and the system's error for a file it cannot read. */
export function readDataFile(path: string): string {
  if (statSync(path).size > 1024 * 1024) throw new RangeError("past 1 MiB");
  return readFileSync(path, "utf8");
}
