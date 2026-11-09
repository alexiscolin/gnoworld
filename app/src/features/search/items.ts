// The items the palette searches: the places of the site, then the systems and realms the worlds' file adds.
import type { siteOf } from "../../places.ts";
import { realmPage } from "../../lib/realmPage.ts";
import type { SearchItem } from "./types.ts";

// A world's kind as its tag says it; a hub is the plain kind and says none, a station has its own group.
const TAGS: Readonly<Record<string, string>> = { dao: "DAO", dapp: "dApp" };

type Site = ReturnType<typeof siteOf>;
type Place = Site["places"][number];
type Listed = Site["worlds"][number];
type WorldOf = (listed: { slug: string; realms?: readonly string[] | undefined }) => string;

const tagOf = (row: Listed | undefined) => TAGS[row?.kind ?? ""];
const kindOf = (row: Listed | undefined) => (row?.kind === "station" ? "station" : "world");

// A world's item: a station in its own kind, a DAO or a dApp with its tag, its main room `#slug`.
function worldItem(place: Place, row: Listed | undefined, worldOf: WorldOf): SearchItem {
  const slug = place.path.split("/").at(-1) ?? place.path;
  const tag = tagOf(row);
  const item: SearchItem = {
    name: row?.name ?? place.path,
    kind: kindOf(row),
    universe: place.universe,
    path: place.path,
    description: row?.description ?? "",
    slug,
    world: row === undefined ? slug : worldOf(row),
    rooms: [`#${slug}`],
  };
  return tag === undefined ? item : { ...item, tag };
}

/** One item for each place of the site: a world or an ecosystem by its name, a universe's cosmos by the universe's name and its Earth by
 * that name too, so none is mistaken for another universe's. */
export function searchItemsOf(site: Site, worldOf: WorldOf): SearchItem[] {
  const names = new Map(site.universes.map((universe) => [universe.id, universe.name]));
  const listed = new Map([...site.worlds, ...site.ecosystems].map((each) => [each.path, each]));
  const items = site.places
    .filter(({ kind, path }) => kind !== "world" || listed.has(path))
    .map((place): SearchItem => {
      const { kind, universe, path } = place;
      const home = names.get(universe) ?? universe;
      const row = listed.get(path);
      if (kind === "cosmos")
        return { name: home, kind, universe, path, description: "The universe's worlds, each a point in space." };
      if (kind === "earth") {
        const earth = {
          name: `Earth of ${home}`,
          kind,
          universe,
          path,
          slug: "earth",
          world: "earth",
          rooms: ["#earth"],
        };
        return { ...earth, description: "Where people speak from." };
      }
      if (kind === "world") return worldItem(place, row, worldOf);
      const world = row === undefined ? {} : { world: worldOf(row) };
      return { name: row?.name ?? path, kind, universe, path, description: row?.description ?? "", ...world };
    });
  // The schema lets two universes hold the same name: the option then says which universe it leads to.
  const seen = new Map<string, number>();
  for (const { name, kind } of items) seen.set(`${kind}/${name}`, (seen.get(`${kind}/${name}`) ?? 0) + 1);
  return items.map((item) =>
    (seen.get(`${item.kind}/${item.name}`) ?? 0) > 1
      ? { ...item, name: `${item.name} (${names.get(item.universe) ?? item.universe})` }
      : item,
  );
}

const DAY = 86_400_000;

interface FileWorld {
  namespace: string;
  seen?: string | null | undefined;
  realms: readonly { path?: string | null; calls?: number | null }[];
}

// When a world was last seen, in ms, or none; and whether that was in the last day.
const seenAt = (world: { seen?: string | null | undefined }): number | undefined => {
  const at = world.seen === undefined || world.seen === null ? Number.NaN : Date.parse(world.seen);
  return Number.isFinite(at) ? at : undefined;
};
const inDay = (at: number | undefined, now: number) => at !== undefined && at <= now && now - at < DAY;

/** What the worlds' file says of one hub's world: the calls of its realms, when it was last seen, whether that was lately. */
export function activityOf(world: FileWorld | undefined, now: number): Pick<SearchItem, "calls" | "seen" | "active"> {
  if (world === undefined) return {};
  const seen = seenAt(world);
  return {
    calls: world.realms.reduce((sum, realm) => sum + (realm.calls ?? 0), 0),
    ...(seen === undefined ? {} : { seen }),
    active: inDay(seen, now),
  };
}

interface Ground {
  universe: string;
  systemPath: (namespace: string) => string;
  now: number;
}

// A namespace's system, with the calls and the last sight of its worlds so far, and this one's.
function systemOf(before: SearchItem | undefined, world: FileWorld, ground: Ground): SearchItem {
  const own = activityOf(world, ground.now);
  const seen = Math.max(before?.seen ?? 0, own.seen ?? 0);
  return {
    name: world.namespace,
    kind: "system",
    universe: ground.universe,
    path: ground.systemPath(world.namespace),
    namespace: world.namespace,
    description: `The realms of @${world.namespace}, round their sun.`,
    calls: (before?.calls ?? 0) + (own.calls ?? 0),
    ...(seen === 0 ? {} : { seen }),
    active: before?.active === true || own.active === true,
  };
}

// A world's realms with a page, each with its calls and its world's last sight.
function realmsOf(world: FileWorld, ground: Ground): [string, SearchItem][] {
  const own = activityOf(world, ground.now);
  return world.realms.flatMap(({ path, calls }) => {
    const page = realmPage(path ?? undefined);
    if (page === undefined || path === undefined || path === null) return [];
    const item: SearchItem = {
      name: path.replace(/^gno\.land\/r\//, ""),
      kind: "realm",
      universe: ground.universe,
      path: page,
      namespace: world.namespace,
      description: "A realm, by its path",
      calls: calls ?? 0,
      active: own.active === true,
      ...(own.seen === undefined ? {} : { seen: own.seen }),
    };
    return [[page, item]];
  });
}

/** The systems and realms the worlds' file adds: a namespace's system at /s/<namespace>, each realm with a page at its own; each with the
 * calls and the last sight its world has. */
export function worldsItemsOf(worlds: readonly FileWorld[], ground: Ground): SearchItem[] {
  const spaces = new Map<string, SearchItem>();
  const realms = new Map<string, SearchItem>();
  for (const world of worlds) {
    spaces.set(world.namespace, systemOf(spaces.get(world.namespace), world, ground));
    for (const [page, item] of realmsOf(world, ground)) realms.set(page, item);
  }
  return [...spaces.values(), ...realms.values()];
}
