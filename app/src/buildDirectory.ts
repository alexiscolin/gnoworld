// A build empties its folder before it writes, and React Router reads a relative folder from the app's own: set but empty, ".", or "src",
// the folder would be the app or a part of it, wiped. GNOWORLD_BUILD is an absolute folder that is not the app itself, or the build stops.
import { isAbsolute, resolve } from "node:path";

/** The folder a build writes into, `app` being the app's own folder: app/build, or GNOWORLD_BUILD's, which must be absolute and not `app`. */
export function buildDirectoryOf(asked: string | undefined, app: string): string {
  if (asked === undefined) return "build";
  if (!isAbsolute(asked)) throw new Error(`GNOWORLD_BUILD must be an absolute folder, not ${JSON.stringify(asked)}`);
  if (resolve(asked) === resolve(app))
    throw new Error("GNOWORLD_BUILD must not be the app's own folder, which a build empties");
  return asked;
}
