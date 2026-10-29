// The places the app knows, from the data files (slice 5's 5c and 5d; the bundle holds a copy of app/data's lists, which
// the build's config checked first: GNOWORLD_DATA names another directory, vite.config.ts). A page is found by its
// request's path, exactly as written: the path's case is part of the address (F376), a trailing slash is not.
import { placeAt, type Place, type PlaceKind } from "@gnoworld/core";
import { data } from "react-router";
import ecosystems from "../data/ecosystems.json" with { type: "json" };
import genres from "../data/genres.json" with { type: "json" };
import hubs from "../data/hubs.json" with { type: "json" };
import stations from "../data/stations.json" with { type: "json" };
import universes from "../data/universes.json" with { type: "json" };
import { placesFrom } from "./dataPlaces.ts";

/** A world or an ecosystem: what the site shows of it, with its one address. */
export interface Listed {
  slug: string;
  name: string;
  description: string;
  universe: string;
  /** Where its page lives, and where its links point. */
  path: string;
  /** Its one address on the site, always under /net/<universe>. */
  canonical: string;
}
export type World = Listed;
export type Ecosystem = Listed;

/** A universe's own pages: its cosmos and its Earth, and what it holds. */
export interface UniverseView {
  id: string;
  name: string;
  isDefault: boolean;
  home: { path: string; canonical: string };
  earth: { path: string; canonical: string };
  worlds: Listed[];
  ecosystems: Listed[];
}

interface Row {
  slug: string;
  name: string;
  description: string;
  universe: string;
}
interface Source {
  universes: { id: string; name: string; default?: boolean | undefined }[];
  hubs: Row[];
  ecosystems: Row[];
  stations: Row[];
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
  };
}

function build(source: Source) {
  const places = placesFrom(source);
  const listed = (kind: PlaceKind, from: Row[]): Listed[] => {
    const rows = new Map(from.map((row) => [`${row.universe}/${row.slug}`, row]));
    return places.flatMap(({ kind: is, universe, slug, path, canonical }) => {
      const row = is === kind && slug !== undefined ? rows.get(`${universe}/${slug}`) : undefined;
      return row === undefined
        ? []
        : [{ slug: row.slug, name: row.name, description: row.description, universe, path, canonical }];
    });
  };
  const worlds = listed("world", [...source.hubs, ...source.stations]);
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
      home: { path: at("cosmos").path, canonical: at("cosmos").canonical },
      earth: { path: at("earth").path, canonical: at("earth").canonical },
      worlds: worlds.filter((world) => world.universe === universe.id),
      ecosystems: ecosystemList.filter((each) => each.universe === universe.id),
    };
  });

  /** The place a path names, exactly as written but for a trailing slash, when it is of the kind the route serves. */
  function placeOf(pathname: string, kind: PlaceKind): Place | undefined {
    const trimmed = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
    for (const path of [pathname, trimmed, `${pathname}/`]) {
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
  const universeOf = (id: string): UniverseView => {
    const view = views.find((each) => each.id === id);
    if (view === undefined) throw data(null, { status: 404 });
    return view;
  };
  const row = (place: Place, from: Listed[]): Listed => {
    const found = from.find((each) => each.path === place.path);
    if (found === undefined) throw data(null, { status: 404 });
    return found;
  };

  return {
    places,
    views,
    worlds,
    ecosystems: ecosystemList,
    genres: source.genres,
    /** The world a request names. */
    world: (request: Request): World => row(find(request, "world"), worlds),
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
  };
}

export const site = siteOf({ universes, hubs, ecosystems, stations, genres });
