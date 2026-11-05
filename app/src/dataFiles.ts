// The data files, read and checked when the app builds (slice 5's 5c; docs/plans/slice-5.md §3, "Data files"): each is
// JSON in app/data, parsed by its Zod schema in packages/schemas, and a fault stops the build with one line a fault:
// `<file>: <row>.<field>: <what is wrong>`, e.g. `news.json: [1].id: duplicate id "n1"`.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { hubWorldOf, worldIdOf } from "@gnoworld/core";
import type { output } from "zod/mini";
import {
  BubbleRules,
  EarthOrbit,
  EarthRooms,
  Ecosystems,
  Events,
  Expedition,
  Genres,
  Hubs,
  News,
  OnAir,
  Quests,
  Universes,
  XPosts,
} from "@gnoworld/schemas";

const SCHEMAS = {
  universes: Universes,
  hubs: Hubs,
  ecosystems: Ecosystems,
  genres: Genres,
  events: Events,
  expedition: Expedition,
  quests: Quests,
  bubbles: BubbleRules,
  earthRooms: EarthRooms,
  earthOrbit: EarthOrbit,
  news: News,
  xPosts: XPosts,
  onAir: OnAir,
};

/** The most a data file may weigh: a file past it is refused before it is read (the plan's "a huge file"). */
export const MAX_FILE_BYTES = 1024 * 1024;

export type Data = { [K in keyof typeof SCHEMAS]: output<(typeof SCHEMAS)[K]> };

/** The thirteen files of a directory, checked; throws every fault found in the first file that has one. */
export function loadData(dir: string): Data {
  const found: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    const file = `${name}.json`;
    const path = join(dir, file);
    let text: string;
    try {
      if (statSync(path).size > MAX_FILE_BYTES) throw new RangeError(`larger than ${String(MAX_FILE_BYTES)} bytes`);
      text = readFileSync(path, "utf8");
    } catch (error) {
      throw new Error(`${file}: (file): cannot be read: ${error instanceof Error ? error.message : "unknown"}`, {
        cause: error,
      });
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new Error(`${file}: (file): is not JSON`, { cause: error });
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success)
      throw new Error(parsed.error.issues.map((issue) => `${file}: ${where(issue.path)}: ${issue.message}`).join("\n"));
    found[name] = parsed.data;
  }
  const data = found as Data;
  const universes = new Set(data.universes.map((universe) => universe.id));
  for (const name of ["hubs", "ecosystems"] as const) {
    const faults = data[name].flatMap((row, index) =>
      universes.has(row.universe)
        ? []
        : [`${name}.json: [${String(index)}].universe: no universe of universes.json is named "${row.universe}"`],
    );
    if (faults.length > 0) throw new Error(faults.join("\n"));
  }
  // A project round the Earth links to a hub's page by its slug: one no hub holds would link to no page.
  const hubs = new Set(data.hubs.map((hub) => hub.slug));
  const unknown = data.earthOrbit.flatMap(({ slug }, index) =>
    slug === undefined || hubs.has(slug)
      ? []
      : [`earthOrbit.json: [${String(index)}].slug: no hub of hubs.json is named "${slug}"`],
  );
  // A world's genre names one of genres.json, which its crumb says by name.
  const genres = new Set(data.genres.map(({ slug }) => slug));
  const noGenre = data.hubs.flatMap(({ genre }, index) =>
    genre === undefined || genres.has(genre)
      ? []
      : [`hubs.json: [${String(index)}].genre: no genre of genres.json is named "${genre}"`],
  );
  const faults = [...unknown, ...noGenre, ...discoveryFaults(data, universes), ...eventsNowhere(data.events, hubs)];
  if (faults.length > 0) throw new Error(faults.join("\n"));
  return data;
}

// The expedition's stops, the quests' steps and what is on air name worlds the site holds: a universe of universes.json, a hub of it by its slug;
// two stops of one world would make one visit reach both.
function discoveryFaults(data: Data, universes: ReadonlySet<string>): string[] {
  const worlds = new Map(data.hubs.map((world) => [`${world.universe}/${world.slug}`, world]));
  const faults: string[] = [];
  const check = (at: string, universe: string, hub: string | undefined) => {
    if (!universes.has(universe)) faults.push(`${at}.universe: no universe of universes.json is named "${universe}"`);
    else if (hub !== undefined && !worlds.has(`${universe}/${hub}`))
      faults.push(`${at}.hub: no hub of "${universe}" is named "${hub}"`);
  };
  const seen = new Set<string>();
  data.expedition.forEach((stop, index) => {
    const at = `expedition.json: [${String(index)}]`;
    check(at, stop.universe, stop.hub);
    const hub = worlds.get(`${stop.universe}/${stop.hub ?? ""}`);
    const id = stop.realm === undefined ? (hub === undefined ? undefined : hubWorldOf(hub)) : worldIdOf(stop.realm);
    if (id === undefined) return;
    if (seen.has(`${stop.universe}:${id}`)) faults.push(`${at}: a second stop of the world "${id}"`);
    seen.add(`${stop.universe}:${id}`);
  });
  data.onAir.forEach((row, index) => {
    check(`onAir.json: [${String(index)}]`, row.universe, row.hub);
  });
  data.quests.forEach((quest, index) => {
    check(`quests.json: [${String(index)}]`, quest.universe, undefined);
    quest.steps.forEach((step, n) => {
      check(`quests.json: [${String(index)}].steps[${String(n)}]`, quest.universe, step.hub);
    });
  });
  return faults;
}

// An event in a world links to that world's page: one no hub holds, and not the Earth, would link to no page.
function eventsNowhere(events: Data["events"], hubs: ReadonlySet<string>): string[] {
  return events.flatMap(({ world }, index) =>
    world === undefined || world === "earth" || hubs.has(world)
      ? []
      : [`events.json: [${String(index)}].world: no hub of hubs.json is named "${world}"`],
  );
}

function where(path: readonly PropertyKey[]): string {
  return path.length === 0
    ? "(file)"
    : path
        .map((key) => (typeof key === "number" ? `[${String(key)}]` : `.${String(key)}`))
        .join("")
        .replace(/^\./, "");
}
