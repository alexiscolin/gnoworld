import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

// The late chunks' weights, read from the built files with no page (Alexis, 2026-11-04: "Oui, les deux"): a page busy with the scene on
// a software GPU timed their journeys out at a load of 60. Node's gzip is the browser's: /list's first screen weighed 156,696 B both ways.

/** A text's hashed names of other files (`scene-B9x_Qa1z.js`): a chunk renamed moved another's weight 1 to 3 B (7p2's review). */
export const HASHED = /-[\w-]{8}\.(js|css|woff2)\b/;
const steady = (text: string) => text.replace(new RegExp(HASHED.source, "g"), "-xxxxxxxx.$1");
// A static import between two built files (`from"./x.js"`, `import"./x.js"`), never a dynamic `import("./x.js")`.
export const STATIC_IMPORT = /(?:\bfrom|\bimport)\s*"\.\/([\w.-]+\.js)"/;

/** Each late chunk by its name, the chunks a page holds before it (their closures are not its weight), and its cap in bytes. `after`
 * absent: the chunk alone. Each cap's history is here or beside its chunk's pattern in budgets.spec.ts, before 7y's steady names. */
export const LATE: readonly { chunk: string; after?: readonly string[]; cap: number }[] = [
  // 156 KiB since 7e (Alexis, 2026-11-02): a second lazy part made rolldown split the scene's shared modules out of its chunk; 160,000 B for
  // the rail's planet portraits, drawn by the planets' own code through the scene's renderer (Alexis, 2026-11-03). Lowered to 158,208 B once
  // the shaders' spaces were stripped (Alexis, 2026-11-03, after 7v), keeping room for 7i's portraits and 7b8's warm air.
  { chunk: "scene", after: ["mountUniverse"], cap: 157_799 },
  // 16 KiB again since 7d6 gave the nebulae a chunk of their own (Alexis, 2026-11-02); 16,512 B once the rail's portraits shared the maps'
  // chunks with it, 16.5 KiB with 7v's views (Alexis, 2026-11-03); 17 KiB after 7v's merge with the night's parts (Alexis, 2026-11-04).
  { chunk: "cosmos", after: ["scene"], cap: 17_019 },
  { chunk: "web", after: ["scene", "cosmos"], cap: 5044 },
  { chunk: "restSearch", after: ["scene", "cosmos"], cap: 10_442 },
  { chunk: "nebulae", after: ["scene", "cosmos"], cap: 3790 },
  { chunk: "labelled", after: ["scene", "cosmos"], cap: 6502 },
  { chunk: "Rail", after: ["scene", "cosmos"], cap: 7026 },
  { chunk: "portraits", after: ["scene", "cosmos"], cap: 1797 },
  { chunk: "flights", after: ["scene"], cap: 18_391 },
  { chunk: "restArrival", after: ["scene", "cosmos", "restSearch"], cap: 2027 },
  { chunk: "restDeep", after: ["scene", "cosmos", "restSearch"], cap: 3573 },
  { chunk: "restPlan", after: ["scene", "cosmos", "restSearch", "labelled"], cap: 2419 },
  { chunk: "orbits", after: ["scene", "cosmos", "labelled"], cap: 2304 },
  { chunk: "rocks", after: ["scene", "cosmos", "labelled"], cap: 1318 },
  { chunk: "part", after: ["scene"], cap: 12_066 },
  // 10 KiB since 2026-11-03 (Alexis, docs/decisions.md, up to 10 KiB for 7b8): its temperate worlds' coasts, shapes and climates and the
  // cream veins took 9,325 B, 109 past 9 KiB; their size plus a tenth passes 10 KiB, the most he gave.
  { chunk: "generated", cap: 10_189 },
];

/** The one built file of a chunk's name (`scene` for `scene-B9x_Qa1z.js`, never `sceneView-…`); none, or two, throws. */
export function fileOf(assets: string, chunk: string): string {
  const found = readdirSync(assets).filter((name) => new RegExp(`^${chunk}-[\\w-]{8}\\.js$`).test(name));
  if (found.length !== 1)
    throw new Error(`${String(found.length)} built files of the chunk ${chunk} in ${assets}: ${found.join(", ")}`);
  return found[0] ?? "";
}

/** A built file and every built file it imports statically, at any depth. */
export function closureOf(assets: string, start: string): string[] {
  const seen = new Set<string>();
  const next = [start];
  for (let file = next.pop(); file !== undefined; file = next.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    for (const found of readFileSync(join(assets, file), "utf8").matchAll(new RegExp(STATIC_IMPORT.source, "g")))
      next.push(found[1] ?? "");
  }
  return [...seen];
}

/** What gzip sends of these built files, each a text whose hashed names weigh as one fixed string. */
export function weigh(assets: string, files: readonly string[]): number {
  return files.reduce(
    (total, file) =>
      total + gzipSync(new TextEncoder().encode(steady(readFileSync(join(assets, file), "utf8")))).length,
    0,
  );
}

/** Each late chunk's file, the files it brings that the chunks before it do not, their weight and its cap. */
export function lateWeights(assets: string) {
  return LATE.map(({ chunk, after, cap }) => {
    const file = fileOf(assets, chunk);
    const there = new Set((after ?? []).flatMap((before) => closureOf(assets, fileOf(assets, before))));
    const files = after === undefined ? [file] : closureOf(assets, file).filter((each) => !there.has(each));
    return { chunk, file, files, bytes: weigh(assets, files), cap };
  });
}
