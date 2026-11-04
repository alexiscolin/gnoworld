// The data files, read and checked when the app builds (slice 5's 5c; docs/plans/slice-5.md §3, "Data files"): each is
// JSON in app/data, parsed by its Zod schema in packages/schemas, and a fault stops the build with one line a fault:
// `<file>: <row>.<field>: <what is wrong>`, e.g. `news.json: [1].id: duplicate id "n1"`.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { placeIn } from "@gnoworld/core";
import type { output } from "zod/mini";
import {
  BubbleRules,
  Ecosystems,
  Events,
  Expedition,
  Genres,
  Hubs,
  News,
  Quests,
  Stations,
  Universes,
} from "@gnoworld/schemas";

const SCHEMAS = {
  universes: Universes,
  hubs: Hubs,
  ecosystems: Ecosystems,
  stations: Stations,
  genres: Genres,
  events: Events,
  expedition: Expedition,
  quests: Quests,
  bubbles: BubbleRules,
  news: News,
};

/** The most a data file may weigh: a file past it is refused before it is read (the plan's "a huge file"). */
export const MAX_FILE_BYTES = 1024 * 1024;

export type Data = { [K in keyof typeof SCHEMAS]: output<(typeof SCHEMAS)[K]> };

/** The ten files of a directory, checked; throws every fault found in the first file that has one. */
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
      throw new Error(
        parsed.error.issues.map((issue) => `${file}: ${placeIn(issue.path)}: ${issue.message}`).join("\n"),
      );
    found[name] = parsed.data;
  }
  const data = found as Data;
  const universes = new Set(data.universes.map((universe) => universe.id));
  for (const name of ["hubs", "ecosystems", "stations"] as const) {
    const faults = data[name].flatMap((row, index) =>
      universes.has(row.universe)
        ? []
        : [`${name}.json: [${String(index)}].universe: no universe of universes.json is named "${row.universe}"`],
    );
    if (faults.length > 0) throw new Error(faults.join("\n"));
  }
  return data;
}
