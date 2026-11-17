import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

// The late chunks' weights, read from the built files with no page: a page busy with the scene on
// a software GPU timed their journeys out at a load of 60. Node's gzip is the browser's: /list's first screen weighed 156,696 B both ways.

/** A text's hashed names of other files (`scene-B9x_Qa1z.js`): a chunk renamed moved another's weight 1 to 3 B. */
export const HASHED = /-[\w-]{8}\.(js|css|woff2)\b/;
const steady = (text: string) => text.replace(new RegExp(HASHED.source, "g"), "-xxxxxxxx.$1");
// A static import between two built files (`from"./x.js"`, `import"./x.js"`), never a dynamic `import("./x.js")`.
export const STATIC_IMPORT = /(?:\bfrom|\bimport)\s*"\.\/([\w.-]+\.js)"/;
// A dynamic import between two built files, as the build writes it: import(`./x.js`).
export const DYNAMIC_IMPORT = /\bimport\(`\.\/([\w.-]+\.js)`\)/;

/** Each late chunk by its name, the chunks a page holds before it (their closures are not its weight), and its cap in bytes. `after`
 * absent: the chunk alone. */
// Five chunks are capped: `scene` (three is in the `earth` chunk it imports), `Rail`, `thumbs`, `generated` and `gnoshColony`. The first
// four caps were their measured weight and 256 B; a new chunk's cap is round, about a tenth over its measure, rounded up to the hundred, and
// a cap moves only by the owner's recorded decision (D13750). The first screen of every page that shows space holds `root` and `universe`.
export const LATE: readonly { chunk: string; after?: readonly string[]; cap: number }[] = [
  // The scene, three's `earth`, the generated worlds' chunk and the shaders it imports: 194,353 B measured, 256 B ahead.
  { chunk: "scene", after: ["root", "universe"], cap: 194_609 },
  // On the home's first screen: 19,888 B measured beyond `root` and `universe` (its worlds, their thumbs, the home's views and the follow
  // chunks it imports; the phone's worlds row reads the rail, D13719), 256 B ahead.
  { chunk: "Rail", after: ["root", "universe"], cap: 20_144 },
  // A world's planet drawn as its thumb anywhere (Discover, search, the chat's worlds): 2,436 B alone, 256 B ahead.
  { chunk: "thumbs", cap: 2692 },
  // The temperate worlds' coasts, shapes and climates and the cream veins.
  { chunk: "generated", cap: 10_189 },
  // gnosh's colony, asked when the scene draws it near (D13746): 5,587 B measured alone; a new chunk's cap is round, about a tenth over
  // its measure, rounded up to the hundred (D13750): 6,200 B.
  { chunk: "gnoshColony", cap: 6200 },
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
