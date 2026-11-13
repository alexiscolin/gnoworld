// The places this reader opened last, newest first, which the search lists before the rest. The device keeps their paths one a line; a
// path no place of the site has is dropped by whoever reads them.
import { readFlag, writeFlag } from "./flags.ts";

const KEY = "gnoworld:recent-places";
const KEPT = 5;

/** The paths kept, newest first. */
export const recentPaths = (): string[] => (readFlag(KEY) ?? "").split("\n").filter((path) => path !== "");

/** Puts `path` first, once, keeping the last few. */
export function rememberPath(path: string): void {
  writeFlag(KEY, [path, ...recentPaths().filter((each) => each !== path)].slice(0, KEPT).join("\n"));
}

/** Takes `path` out of the places kept. */
export function forgetPath(path: string): void {
  writeFlag(
    KEY,
    recentPaths()
      .filter((each) => each !== path)
      .join("\n"),
  );
}
