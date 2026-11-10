// What a place is connected to (D566, "around it"): a realm's imports and what imports it, from the worlds' file and the rollup; a hub's
// neighbouring hub worlds and its own live realms. A hub is named and linked as its page; any other world by its id's last segment and its
// first realm's view. The nodes are the network's dots and its rows; their path is where one leads. Worked out once for a file and a place.
import { hubWorldOf, labelName, neighboursOf, realmName, REALM_PREFIX, type Neighbour } from "@gnoworld/core";
import type { RealmRollup, Worlds } from "@gnoworld/schemas/indexer";
import type { NetworkNode } from "@gnoworld/ui";
import type { Listed } from "../../places.ts";
import { shortPath } from "../../features/realms/shortPath.ts";

type Files = Worlds["worlds"];

/** A dot, where it leads (none for a package with no page) and what its row says it is. */
export interface AroundNode extends NetworkNode {
  path?: string;
  note: string;
}

/** One side of the graph: its word in the legend, its card's label, its dots and how many there are in all. */
interface Side {
  word: string;
  label: string;
  nodes: readonly AroundNode[];
  total: number;
}

export interface Around {
  title: string;
  /** What the card's header says it shows. */
  hint: string;
  centre: NetworkNode;
  left: Side;
  right: Side;
}

const near = new WeakMap<Files, Map<string, Neighbour[]>>();

function nearOf(worlds: Files, id: string): Neighbour[] {
  const held = near.get(worlds) ?? new Map<string, Neighbour[]>();
  near.set(worlds, held);
  const known = held.get(id) ?? neighboursOf(worlds, id);
  held.set(id, known);
  return known;
}

interface Where {
  /** The place's world, as the file holds it, and the word in the middle. */
  id: string;
  centre: string;
  hubs: readonly Listed[];
  /** The universe's own prefix, "" for the default one. */
  prefix: string;
  /** For a realm's plate: its path, whose imports and importers are the two sides. */
  realm?: string;
  /** The rollup's importers: the first hundred, and the total. */
  importers?: RealmRollup["importers"] | undefined;
}

const viewOf = (prefix: string, path: string) => `${prefix}/r/${path.slice(REALM_PREFIX.length)}`;

const MOST = 100;

// A path as a word in a dot: its last folder, with its version (v2) kept.
function wordOf(path: string): string {
  const parts = path.replace(/^gno\.land\/[pr]\//, "").split("/");
  const last = parts.at(-1) ?? path;
  return /^v\d+$/.test(last) && parts.length > 1 ? parts.slice(-2).join("/") : last;
}

/** A path as a row says it: gno.land dropped, a long one cut in its middle. */
export const rowPath = (path: string): string => shortPath(path.replace(/^gno\.land\//, ""));

const uniqueNodes = (nodes: readonly AroundNode[]): AroundNode[] =>
  nodes.filter((node, at, all) => all.findIndex((n) => n.id === node.id) === at).slice(0, MOST);

const packageNode = (prefix: string, path: string, calls?: number): AroundNode => {
  const pure = path.startsWith("gno.land/p/");
  const view = path.startsWith(REALM_PREFIX) ? viewOf(prefix, path) : undefined;
  return {
    id: path,
    label: wordOf(path),
    kind: pure ? "pure" : "realm",
    detail: path,
    note:
      calls === undefined ? (pure ? "pure package" : "realm") : `${String(calls)} ${calls === 1 ? "call" : "calls"}`,
    ...(view === undefined ? {} : { path: view }),
    ...(calls === undefined ? {} : { count: calls }),
  };
};

// A realm's own sides: what its code imports, and what imports it (the rollup's first hundred, else the worlds' file inverted).
function aroundRealm(known: Files, where: Where & { realm: string }): Around | undefined {
  const { realm, importers, centre, prefix } = where;
  const all = known.flatMap((world) => world.realms);
  const imports = (all.find((each) => each.path === realm)?.imports ?? []).map((path) => packageNode(prefix, path));
  const inverted = all.filter((each) => each.imports.includes(realm)).map((each) => packageNode(prefix, each.path));
  const importing =
    importers === undefined ? inverted : importers.top.map(({ path, calls }) => packageNode(prefix, path, calls));
  if (imports.length === 0 && importing.length === 0) return undefined;
  return {
    title: "Around it",
    hint: "imports and importers",
    centre: { id: "centre", label: centre, kind: "realm" },
    left: { word: "imports", label: "Imports", nodes: uniqueNodes(imports), total: imports.length },
    right: {
      word: "imported by",
      label: "Imported by",
      nodes: uniqueNodes(importing),
      total: importers?.total ?? inverted.length,
    },
  };
}

/** The dots round `id`, none when neither the worlds' file nor the rollup names any. A realm's sides are its imports and its importers; a
 * hub's, the hub worlds it neighbours and the live realms of its own world. */
export function aroundOf(worlds: Files | undefined, where: Where): Around | undefined {
  const { id, centre } = where;
  const known = worlds ?? [];
  if (where.realm !== undefined) return aroundRealm(known, { ...where, realm: where.realm });
  const byWorld = new Map(where.hubs.map((hub) => [hubWorldOf(hub), hub]));
  const firstRealm = new Map(known.map((world) => [world.id, world.realms[0]?.path]));
  const linked = (known.length === 0 ? [] : nearOf(known, id)).flatMap(({ id: other }): AroundNode[] => {
    const hub = byWorld.get(other);
    const realm = firstRealm.get(other);
    const path = hub?.path ?? (realm === undefined ? undefined : viewOf(where.prefix, realm));
    const name = hub?.name ?? labelName(other) ?? other;
    return path === undefined ? [] : [{ id: path, path, label: name, kind: "realm", detail: name, note: "hub world" }];
  });
  const live = (known.find((world) => world.id === id)?.realms ?? []).map(({ path }): AroundNode => {
    const view = viewOf(where.prefix, path);
    return { id: view, path: view, label: realmName(path).name, kind: "realm", detail: rowPath(path), note: "realm" };
  });
  if (linked.length === 0 && live.length === 0) return undefined;
  return {
    title: "Explore from here",
    hint: "hub worlds and live realms",
    centre: { id: "centre", label: centre, kind: "realm" },
    left: { word: "hub worlds", label: "Hub worlds", nodes: uniqueNodes(linked), total: linked.length },
    right: { word: "live realms", label: "Live realms", nodes: uniqueNodes(live), total: live.length },
  };
}
