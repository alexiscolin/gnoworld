// A build empties its folder before it writes, and React Router reads a relative folder from the app's own: an empty value, ".", or "src"
// named the app or a part of it, wiped; a folder holding the app would take the build's client and server among the repository's own.
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const BUILD = /^build(?:-|$)/;

// The folder a path leads to through its links (/tmp is /private/tmp on a Mac): its nearest existing folder's real path, then the rest.
function real(path: string): string {
  const full = resolve(path);
  if (existsSync(full)) return realpathSync(full);
  const parent = dirname(full);
  return parent === full ? full : join(real(parent), basename(full));
}

/** The folder a build writes into, `app` being the app's own folder: app/build, or GNOWORLD_BUILD's, an absolute folder outside the app
 * and every folder holding it, or in the app under a first folder named build or build-*; any other stops the build. */
export function buildDirectoryOf(asked: string | undefined, app: string): string {
  if (asked === undefined) return "build";
  if (!isAbsolute(asked)) throw new Error(`GNOWORLD_BUILD must be an absolute folder, not ${JSON.stringify(asked)}`);
  const [folder, root] = [real(asked), real(app)];
  const up = relative(folder, root);
  if (!up.startsWith("..") && !isAbsolute(up))
    throw new Error(`GNOWORLD_BUILD must not be the app or a folder holding it, not ${JSON.stringify(asked)}`);
  const down = relative(root, folder);
  const inside = !down.startsWith("..") && !isAbsolute(down);
  if (inside && !BUILD.test(down.split(sep)[0] ?? ""))
    throw new Error(`GNOWORLD_BUILD in the app, only under build or build-*, not ${JSON.stringify(asked)}`);
  return asked;
}
