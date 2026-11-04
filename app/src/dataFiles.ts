// The data files, read and checked when the app builds (slice 5's 5c; docs/plans/slice-5.md §3, "Data files"): each is
// JSON in app/data, parsed by its Zod schema in packages/schemas, and a fault stops the build with one line a fault:
// `<file>: <row>.<field>: <what is wrong>`, e.g. `news.json: [1].id: duplicate id "n1"`.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
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
  Quests,
  Universes,
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
};

/** The most a data file may weigh: a file past it is refused before it is read (the plan's "a huge file"). */
export const MAX_FILE_BYTES = 1024 * 1024;

export type Data = { [K in keyof typeof SCHEMAS]: output<(typeof SCHEMAS)[K]> };

/** The eleven files of a directory, checked; throws every fault found in the first file that has one. */
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
  if (unknown.length > 0) throw new Error(unknown.join("\n"));
  return data;
}

function where(path: readonly PropertyKey[]): string {
  return path.length === 0
    ? "(file)"
    : path
        .map((key) => (typeof key === "number" ? `[${String(key)}]` : `.${String(key)}`))
        .join("")
        .replace(/^\./, "");
}
