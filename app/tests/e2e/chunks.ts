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
// A dynamic import between two built files, as the build writes it: import(`./x.js`).
export const DYNAMIC_IMPORT = /\bimport\(`\.\/([\w.-]+\.js)`\)/;

/** Each late chunk by its name, the chunks a page holds before it (their closures are not its weight), and its cap in bytes. `after`
 * absent: the chunk alone. Each cap's history is here or beside its chunk's pattern in budgets.spec.ts, before 7y's steady names. */
// D401's rebuild left four rows: `scene` (D13952; three is in the `earth` chunk it imports), `Rail`, `thumbs` and `generated`; the other
// 17 chunks (mountUniverse, cosmos, web, restSearch, flights, part...) are no file of the build. Raised on 2026-11-09 to the weights, 256 B ahead
// (D386, provisional); the first screen of every page that shows space holds `root` and `universe`.
export const LATE: readonly { chunk: string; after?: readonly string[]; cap: number }[] = [
  // The scene, three's `earth`, the generated worlds' chunk and the shaders it imports: 190,507 B measured on 2026-11-12, 256 B ahead
  // (D13948, provisional till the hardening; its history D386 and D13961).
  { chunk: "scene", after: ["root", "universe"], cap: 190_763 },
  // On the home's first screen now, not behind the cosmos (7i): 7,293 B on 2026-11-07 beyond the scene and the cosmos (D386); 16,007 B beyond
  // `root` and `universe` (its worlds, their thumbs, the home's views and the follow chunks it imports), 256 B ahead (+8,970 B).
  { chunk: "Rail", after: ["root", "universe"], cap: 18_752 },
  // A world's planet drawn as its thumb anywhere (Discover, search, the chat's worlds): 347 B alone (D386); 2,436 B alone on 2026-11-09,
  // 256 B ahead (+2,089 B over D386's 603 B).
  { chunk: "thumbs", cap: 2692 },
  // 10 KiB since 2026-11-03 (Alexis, docs/decisions.md, up to 10 KiB for 7b8): its temperate worlds' coasts, shapes and climates and the
  // cream veins took 9,325 B, 109 past 9 KiB; their size plus a tenth passes 10 KiB, the most he gave. 9,441 B on 2026-11-09: no raise.
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
