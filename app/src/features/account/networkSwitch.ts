// Choosing another network (D13501): the same place when that network holds it, else its home and a line saying so. The paths are
// places.ts's own; a realm is on the other network only if that network's chain says so, read, never guessed from the path.
import { realmAt } from "../../realmAt.ts";
import { realmView, universePath, universePrefix, type site as Site, type UniverseView } from "../../places.ts";
import { trimmed } from "../../cosmosAt.ts";

export interface Switch {
  path: string;
  /** Why the place was not kept. */
  line?: string;
}

type Universe = UniverseView;

// The place a path keeps on `target` without asking a chain: its home, the galaxy, the Earth, a world it lists; `null` for a world it does
// not, none for a path that may be a realm's.
function keptOn(from: Universe, target: Universe, pathname: string): string | null | undefined {
  const here = trimmed(pathname);
  const is = (at: { path: string; canonical: string }) =>
    [at.path, at.canonical].some((each) => trimmed(each) === here);
  if (is(from.home)) return universePrefix(target) || "/";
  if (here === universePath(from)) return universePath(target);
  if (is(from.earth)) return target.earth.path;
  const world = from.worlds.find(is);
  return world === undefined ? undefined : (target.worlds.find((each) => each.slug === world.slug)?.path ?? null);
}

export async function switchTo({
  site,
  pathname,
  to,
  holds,
}: {
  site: typeof Site;
  pathname: string;
  to: string;
  holds: (universe: string, realm: string) => Promise<boolean>;
}): Promise<Switch> {
  const from = site.universeAt(pathname);
  const target = site.universes.find((each) => each.id === to);
  if (target === undefined || target.id === from.id) return { path: pathname };
  const lost = { path: universePrefix(target) || "/", line: `That place is not on ${target.name}.` };
  const kept = keptOn(from, target, pathname);
  if (kept !== undefined) return kept === null ? lost : { path: kept };
  const realm = realmAt(pathname)?.realm;
  if (realm === undefined) return lost;
  return (await holds(target.id, realm).catch(() => false)) ? { path: realmView(realm, target) } : lost;
}
