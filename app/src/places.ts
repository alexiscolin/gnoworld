// The places the app knows, from the data files (slice 5's 5c and 5d; the bundle holds a copy of app/data's lists, which
// the build's config checked first: GNOWORLD_DATA names another directory, vite.config.ts). A page is found by its
// request's path, exactly as written: the path's case is part of the address (F376), a trailing slash is not.
import { placeAt, realmRoute, STATIONS_SHOWN, type Place, type PlaceKind } from "@gnoworld/core";
import { data } from "react-router";
import ecosystems from "../data/ecosystems.json" with { type: "json" };
import genres from "../data/genres.json" with { type: "json" };
import hubs from "../data/hubs.json" with { type: "json" };
import universes from "../data/universes.json" with { type: "json" };
import { cosmosAt, trimmed } from "./cosmosAt.ts";
import { holdsChat } from "./fullChat.ts";
import { placesFrom } from "./dataPlaces.ts";
import type { PinnedRow } from "./pinned.ts";

/** A world or an ecosystem: what the site shows of it, with its one address. */
export interface Listed {
  slug: string;
  name: string;
  description: string;
  universe: string;
  /** Whether its universe is a testnet: its page is not indexed. */
  testnet: boolean;
  /** Where its page lives, and where its links point. */
  path: string;
  /** Its one address on the site, always under /net/<universe>. */
  canonical: string;
  /** The realms a world is about, on its universe's chain: the first is the one its page reads proposals from. */
  realms?: readonly string[];
  /** What a world is and its genre's name, as its plate's crumb says them (8g): "dao", "Games". */
  kind?: string;
  genre?: string;
  /** The calls its team pins (D271), as the data file holds them. */
  actions?: readonly PinnedRow[];
}
export type World = Listed;
export type Ecosystem = Listed;

/** A universe's own pages: its cosmos and its Earth, and what it holds. */
export interface UniverseView {
  id: string;
  name: string;
  isDefault: boolean;
  /** A testnet's pages are not indexed (ADR-0002 §2). */
  testnet: boolean;
  /** Its chain's gnoweb, the chat's link out (8d); none in data that names none. */
  gnoweb?: string | undefined;
  home: { path: string; canonical: string };
  earth: { path: string; canonical: string };
  worlds: Listed[];
  ecosystems: Listed[];
}

/** A world as the data file holds it: its optional fields may be said absent. */
type Row = Pick<Listed, "slug" | "name" | "description" | "universe"> & {
  [K in "realms" | "kind" | "genre" | "actions"]?: Listed[K] | undefined;
};
interface Source {
  universes: {
    id: string;
    name: string;
    gnoweb?: string | undefined;
    default?: boolean | undefined;
    testnet?: boolean | undefined;
  }[];
  hubs: Row[];
  ecosystems: Row[];
  genres: { slug: string; name: string }[];
}

/** The page a build's data request belongs to: React Router's single fetch asks `/path.data` (`/dir/_.data` for a path that ends in a slash). The
 * browser's own request is never read so, and keeps its path as typed. */
export function pageOf(request: Request): Request {
  const url = new URL(request.url);
  if (!url.pathname.endsWith(".data")) return request;
  url.pathname = url.pathname.endsWith("/_.data")
    ? url.pathname.slice(0, -"_.data".length)
    : url.pathname.slice(0, -".data".length);
  return new Request(url);
}

/** The site's places as the data files hold them. Built when first asked, never at a module's load (F2206: a build at
 * load is a static mutant, which StrykerJS leaves unjudged). */
export function siteOf(source: Source) {
  let built: ReturnType<typeof build> | undefined;
  const get = () => (built ??= build(source));
  return {
    get places() {
      return get().places;
    },
    get worlds() {
      return get().worlds;
    },
    get ecosystems() {
      return get().ecosystems;
    },
    get genres() {
      return get().genres;
    },
    get universes() {
      return get().views;
    },
    /** The world a request names. */
    world: (request: Request): World => get().world(request),
    /** The ecosystem a request names. */
    ecosystem: (request: Request): Ecosystem => get().ecosystem(request),
    /** The ecosystem a path names, or none: for a route with no loader, which a build with no ecosystem cannot pre-render. */
    ecosystemAt: (pathname: string): Ecosystem | undefined => get().ecosystemAt(pathname),
    /** The universe whose cosmos or Earth a request names. */
    universe: (request: Request, kind: "cosmos" | "earth"): UniverseView => get().universe(request, kind),
    /** The universe a world or an ecosystem of the list belongs to. */
    home: (each: Listed): UniverseView => get().home(each),
    /** The universe a path belongs to: /net/<id> names it, any other path (a page not found, an error) is the default's. */
    universeAt: (pathname: string): UniverseView => get().universeAt(pathname),
    /** Which of the header's views a path is of a universe, at its path or at its canonical address, or none. */
    viewAt: (universe: UniverseView, pathname: string): View | undefined => viewAt(universe, pathname),
  };
}

/** The header's views: the whole cosmos far out (Galaxy), a system of it (System), a world, the Earth's or another's (World). */
export type View = "universe" | "system" | "world";

function universeAt(views: UniverseView[], pathname: string): UniverseView {
  const id = /^\/net\/([^/]+)/.exec(pathname)?.[1];
  const found = views.find((each) => each.id === id) ?? views.find((each) => each.isDefault);
  if (found === undefined) throw new RangeError("the data holds no default universe");
  return found;
}

function viewAt(universe: UniverseView, pathname: string): View | undefined {
  const here = trimmed(pathname);
  const is = (at: { path: string; canonical: string }) =>
    [at.path, at.canonical].some((each) => trimmed(each) === here);
  if (is(universe.earth) || holdsChat(here)) return "world";
  // The default universe's home is the Earth's first screen, no level of its own (D501); another universe's home is its system.
  if (is(universe.home)) return universe.isDefault ? undefined : "system";
  // The cosmos's own addresses are the default universe's alone: the scene shows its cosmos only.
  if (universe.isDefault && cosmosAt(here) !== undefined) return cosmosAt(here)?.view;
  return undefined;
}

// A row of the data as the site lists it; its genre by the name genres.json gives it.
function listedFrom(row: Row, testnet: boolean, at: { path: string; canonical: string }): Listed {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    universe: row.universe,
    testnet,
    ...at,
    ...(row.realms === undefined ? {} : { realms: row.realms }),
    ...(row.kind === undefined ? {} : { kind: row.kind }),
    ...(row.genre === undefined ? {} : { genre: row.genre }),
    ...(row.actions === undefined ? {} : { actions: row.actions }),
  };
}

function build(source: Source) {
  const places = placesFrom(source);
  const testnets = new Set(
    source.universes.filter((universe) => universe.testnet === true).map((universe) => universe.id),
  );
  const genres = new Map(source.genres.map(({ slug, name }) => [slug, name]));
  const listed = (kind: PlaceKind, from: Row[]): Listed[] => {
    const rows = new Map(from.map((row) => [`${row.universe}/${row.slug}`, row]));
    return places.flatMap(({ kind: is, universe, slug, path, canonical }) => {
      const row = is === kind && slug !== undefined ? rows.get(`${universe}/${slug}`) : undefined;
      return row === undefined
        ? []
        : [listedFrom({ ...row, genre: genres.get(row.genre ?? "") }, testnets.has(universe), { path, canonical })];
    });
  };
  const everyWorld = listed("world", source.hubs);
  // A station's page stays routable (everyWorld), but is offered as a place only while the switch is on.
  const worlds = STATIONS_SHOWN ? everyWorld : everyWorld.filter(({ kind }) => kind !== "station");
  const ecosystemList = listed("ecosystem", source.ecosystems);
  const views = source.universes.map((universe): UniverseView => {
    const at = (kind: PlaceKind): Place => {
      const found = places.find((place) => place.universe === universe.id && place.kind === kind);
      if (found === undefined) throw new RangeError(`places: no ${kind} in "${universe.id}"`);
      return found;
    };
    return {
      id: universe.id,
      name: universe.name,
      isDefault: universe.default === true,
      testnet: testnets.has(universe.id),
      gnoweb: universe.gnoweb,
      home: { path: at("cosmos").path, canonical: at("cosmos").canonical },
      earth: { path: at("earth").path, canonical: at("earth").canonical },
      worlds: worlds.filter((world) => world.universe === universe.id),
      ecosystems: ecosystemList.filter((each) => each.universe === universe.id),
    };
  });

  /** The place a path names, exactly as written but for a trailing slash, when it is of the kind the route serves. */
  function placeOf(pathname: string, kind: PlaceKind): Place | undefined {
    for (const path of [pathname, trimmed(pathname), `${pathname}/`]) {
      const place = placeAt(places, path);
      if (place?.kind === kind) return place;
    }
    return undefined;
  }
  /** The place of a request; throws React Router's 404 when none has that path. */
  function find(request: Request, kind: PlaceKind): Place {
    const place = placeOf(new URL(request.url).pathname, kind);
    if (place === undefined) throw data(null, { status: 404 });
    return place;
  }
  const found = <T>(one: T | undefined): T => {
    if (one === undefined) throw data(null, { status: 404 });
    return one;
  };
  const universeOf = (id: string): UniverseView => found(views.find((each) => each.id === id));
  const row = (place: Place, from: Listed[]): Listed => found(from.find((each) => each.path === place.path));

  return {
    places,
    views,
    worlds,
    ecosystems: ecosystemList,
    genres: source.genres,
    /** The world a request names. */
    world: (request: Request): World => row(find(request, "world"), everyWorld),
    /** The ecosystem a request names. */
    ecosystem: (request: Request): Ecosystem => row(find(request, "ecosystem"), ecosystemList),
    /** The ecosystem a path names, or none: for a route with no loader, which a build with no ecosystem cannot pre-render. */
    ecosystemAt(pathname: string): Ecosystem | undefined {
      const place = placeOf(pathname, "ecosystem");
      return place === undefined ? undefined : ecosystemList.find((each) => each.path === place.path);
    },
    /** The universe whose cosmos or Earth a request names. */
    universe: (request: Request, kind: "cosmos" | "earth"): UniverseView => universeOf(find(request, kind).universe),
    /** The universe a world or an ecosystem of the list belongs to. */
    home: (each: Listed): UniverseView => universeOf(each.universe),
    universeAt: (pathname: string): UniverseView => universeAt(views, pathname),
  };
}

export const site = siteOf({ universes, hubs, ecosystems, genres });

/** Where a universe's pages stand on the site: at its root for the default one, under /net/<id> for another. */
export const universePrefix = (universe: Pick<UniverseView, "id" | "isDefault">): string =>
  universe.isDefault ? "" : `/net/${universe.id}`;

/** A world's realm's view on the site: /r/<path> in the default universe, /net/<id>/r/<path> in another. */
export const realmView = (realm: string, universe: Pick<UniverseView, "id" | "isDefault">): string =>
  realmRoute(realm, universePrefix(universe));

/** The Universe view's page: /universe in the default universe; the scene shows its cosmos alone, so another's Universe is its home. */
export const universePath = (at: UniverseView): string => (at.isDefault ? "/universe" : at.home.path);

// A realm's path on a site or on gnoweb, `gno.land/r/gov/dao` -> `/r/gov/dao`: the data's realms, which dataFiles.ts checks.
export const realmPath = (realm: string): string => realmRoute(realm);

/** The world `slug` of universe `at` as a place: its name and page, the Earth's own; none for a slug the universe does not list. Where an
 * event happens (the calendar, the bell, the ticker). */
export function placeOf(at: UniverseView, slug: string): { name: string; href: string } | undefined {
  const world = slug === "earth" ? { name: "Earth", ...at.earth } : at.worlds.find((each) => each.slug === slug);
  return world === undefined ? undefined : { name: world.name, href: world.path };
}
