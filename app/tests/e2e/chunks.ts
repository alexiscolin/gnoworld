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
export const LATE: readonly { chunk: string; after?: readonly string[]; cap: number }[] = [
  // 159,847 B in this measure with the Earth's stations' three classes (Alexis, 2026-11-04, "Oui, 160 256"); 160,325 B once 7v2, 7b9,
  // 7f5 and slice-8 met, inside the night's +1 KiB (night-caps.md; where the last 467 B come from: hardening).
  { chunk: "scene", after: ["mountUniverse"], cap: 160_325 },
  // 16 KiB since 7d6 (Alexis, 2026-11-02); 16.5 KiB with 7v's views (Alexis, 2026-11-03); 17 KiB after 7v's merge (Alexis, 2026-11-04);
  // 7x2's loader and text box, 7v2's ratio, bands and a Plan half lit, 7b9's star's warmth (the night's +1 KiB, the chief), measured.
  { chunk: "cosmos", after: ["scene"], cap: 17_345 },
  // 6,834 B with the mass, the hero's box it shares (7u; Alexis, "Oui, 6 706") and its rims' touch; its pills a chunk apart; 6,837
  // on its merge into slice-7, inside the 256 B margin; 7,178 with 8m's mass thinned round the page's text (Alexis, 2026-11-05, "oui").
  { chunk: "web", after: ["scene", "cosmos"], cap: 7178 },
  { chunk: "webNames", after: ["scene", "cosmos", "web"], cap: 1219 },
  { chunk: "restSearch", after: ["scene", "cosmos"], cap: 10_442 },
  { chunk: "nebulae", after: ["scene", "cosmos"], cap: 3790 },
  { chunk: "labelled", after: ["scene", "cosmos"], cap: 6502 },
  { chunk: "Rail", after: ["scene", "cosmos"], cap: 7026 },
  { chunk: "portraits", after: ["scene", "cosmos"], cap: 1797 },
  { chunk: "flights", after: ["scene"], cap: 18_391 },
  // A system's arrival: 2,304 B, 2.25 KiB, for no column of worlds at rest (Alexis, 2026-11-04, "Oui aux deux", 7v's column patch).
  { chunk: "restArrival", after: ["scene", "cosmos", "restSearch"], cap: 2304 },
  // The rocks' laying, what is left of the depth (7p) once the Earth's view took the home's far worlds (7x2): 1,445 B, 1.5 KiB.
  { chunk: "restRocks", after: ["scene", "cosmos", "restSearch"], cap: 1536 },
  // The Earth's view (7x2): stations, scenery, belt, names, caption; 13,442 B with the fourteen stations Alexis approved (night-caps.md);
  // 7v2's route and bands, 7b9's chunks' names, 7f5's eye held; 13,815 B with 7u's hero box shared with web (night-caps.md); 14,065 B
  // with 8m's soft field round the text, shared with web (the chief, 2026-11-05, inside the 256 B margin).
  { chunk: "earthView", after: ["scene", "cosmos"], cap: 14_065 },
  { chunk: "restPlan", after: ["scene", "cosmos", "restSearch", "labelled"], cap: 2419 },
  // 2,417 B on 7u's merge: labels.module.css split with the pills' chunk (7u alone 2,408), inside the 256 B margin over 2,401.
  { chunk: "orbits", after: ["scene", "cosmos", "labelled"], cap: 2417 },
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
