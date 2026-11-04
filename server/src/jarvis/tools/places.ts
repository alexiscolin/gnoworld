// The places of gnoworld's data (ADR-0002 §5, "the places and their URLs"; D101): universes, hubs, ecosystems and
// stations, read once at start from the folder JARVIS_DATA_DIR names, each through packages/schemas' own schema, as
// the site's build reads them, then core's placesOf. find_place answers a place's path and canonical address from
// them alone; a fault stops the start, naming its file and nothing it holds.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { placesOf, type Place } from "@gnoworld/core";
import { Ecosystems, Hubs, Stations, Universes } from "@gnoworld/schemas";
import { z } from "zod";
import type { Ran } from "../gnomcp.ts";

/** A universe's chain: its id, the chain's id, its node and its gnoweb's origin. */
export interface Universe {
  readonly id: string;
  readonly name: string;
  readonly chainId: string;
  readonly rpc: string;
  readonly gnoweb: string;
}

interface Shown {
  readonly kind: Place["kind"];
  readonly name?: string;
  readonly universe: string;
  readonly path: string;
  readonly canonical: string;
}

export interface Places {
  readonly places: readonly Place[];
  readonly universes: ReadonlyMap<string, Universe>;
  // Each place as find_place shows it, and the words a query looks for in it, in lower case.
  readonly found: readonly { readonly shown: Shown; readonly words: string }[];
}

// A data file through its schema: its fault named by its place and kind, never by what it holds (Zod and JSON.parse
// may quote it).
function fileOf<T>(folder: string, name: string, schema: z.core.$ZodType<T>): T {
  const file = `${name}.json`;
  const path = join(folder, file);
  let text: string;
  try {
    if (statSync(path).size > 1024 * 1024) throw new RangeError("past 1 MiB");
    text = readFileSync(path, "utf8");
  } catch (cause) {
    throw new Error(`places: ${file}: unreadable`, { cause });
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    // A parse error quotes the text, so no JSON reaches the schema as nothing, which it refuses by its place.
    if (!(error instanceof SyntaxError)) throw error;
    value = undefined;
  }
  const parsed = z.safeParse(schema, value);
  if (parsed.success) return parsed.data;
  throw faultOf(file, parsed.error.issues);
}

// A refused file's first fault, by its place in the file (`[0].slug`) and its kind.
function faultOf(file: string, [issue]: readonly z.core.$ZodIssue[]): Error {
  const place = (issue?.path ?? []).map((key) => (typeof key === "number" ? `[${String(key)}]` : `.${String(key)}`));
  const at = place.join("").replace(/^\./, "");
  return new Error(`places: ${file}: ${at === "" ? "(file)" : at}: ${issue?.code ?? "invalid"}`);
}

/** The places of a data folder and its universes by id; throws on a file missing, past 1 MiB, or refused. */
export function loadPlaces(folder: string): Places {
  const universes = fileOf(folder, "universes", Universes);
  const ids = new Set(universes.map(({ id }) => id));
  const rows = { hubs: fileOf(folder, "hubs", Hubs), ecosystems: fileOf(folder, "ecosystems", Ecosystems) };
  const all = { ...rows, stations: fileOf(folder, "stations", Stations) };
  for (const [name, list] of Object.entries(all)) {
    const at = list.findIndex((row) => !ids.has(row.universe));
    if (at !== -1) throw new Error(`places: ${name}.json: [${String(at)}].universe: not a universe of universes.json`);
  }
  const defaultUniverse = universes.find((row) => row.default === true)?.id ?? "";
  const places = placesOf({ defaultUniverse, universes, ...all });
  const byId = new Map(universes.map(({ id, name, chainId, rpc, gnoweb }) => [id, { id, name, chainId, rpc, gnoweb }]));
  const names = new Map<string, string>();
  for (const { slug, universe, name } of [...all.hubs, ...all.stations]) names.set(`${universe} world ${slug}`, name);
  for (const { slug, universe, name } of all.ecosystems) names.set(`${universe} ecosystem ${slug}`, name);
  const found = places.map(({ kind, universe, slug, path, canonical }) => {
    const name = slug === undefined ? undefined : names.get(`${universe} ${kind} ${slug}`);
    const shown = { kind, ...(name === undefined ? {} : { name }), universe, path, canonical };
    const words = [kind, slug, name, universe, byId.get(universe)?.name].join(" ").toLowerCase();
    return { shown, words };
  });
  return { places, universes: byId, found };
}

/** find_place: the places whose kind, slug, name or universe hold every word of a query, 20 at most. */
export function placesTool(data: Places) {
  const definition = {
    name: "find_place" as const,
    description:
      "gnoworld's places, from its data: each place's kind (cosmos, earth, world, ecosystem), name, universe, page path and canonical address, for a query whose every word is in its kind, slug, name or universe. A place the data lacks does not exist: say so, never guess a path.",
    args: z.strictObject({
      query: z
        .string()
        .min(1)
        .max(80)
        .describe("Words of a place's name, slug, kind or universe, such as `govdao` or `onyx earth`."),
    }),
  };
  return {
    definition,
    run(args: unknown): Promise<Ran> {
      const parsed = definition.args.safeParse(args);
      if (!parsed.success) return Promise.resolve({ ok: false, reason: "refused" });
      const words = parsed.data.query
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word !== "");
      // ponytail: a pass over every place, about 3,000 at most (three files of 1,000 rows, two places a universe).
      const matched =
        words.length === 0 ? [] : data.found.filter((place) => words.every((word) => place.words.includes(word)));
      if (matched.length === 0)
        return Promise.resolve({ ok: true, isError: false, text: "No place of gnoworld's data matches that query." });
      const places = matched.slice(0, 20).map(({ shown }) => shown);
      return Promise.resolve({
        ok: true,
        isError: false,
        text: JSON.stringify({ places, more: matched.length - places.length }),
      });
    },
  };
}
