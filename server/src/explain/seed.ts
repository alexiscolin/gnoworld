// A seed file read at the server's start: realms explained beforehand by other hands, in the shape of Jarvis's answer, so Jarvis only explains
// the realms deployed later. Each line passes the same check as Jarvis's own, and goes in as a row of the model `seed`: a line that is not sure or
// fails the check as a refused row, so nothing is asked for it again. Idempotent, and never over a ready row Jarvis made of this version. A file
// that does not parse stops the server rather than run with half a seed.
import { jsonOf } from "@gnoworld/core";
import { ExplainSeed, tagsOf } from "@gnoworld/schemas";
import type { Log } from "@gnoworld/service/log";
import { readFileSync, statSync } from "node:fs";
import { checkLine } from "./check.ts";
import type { Explanations } from "./store.ts";

// A seed of every realm of a chain is a few hundred kilobytes; this is far above and far below a file that would hold the process.
const MAX_BYTES = 8 * 1024 * 1024;

export interface SeedCounts {
  ready: number;
  refused: number;
  /** Rows left as they were: a ready row of Jarvis's. */
  kept: number;
}

export function loadSeed({
  file,
  store,
  now,
  log,
}: {
  file: string;
  store: Explanations;
  now: () => number;
  log: Log;
}): SeedCounts {
  if (statSync(file).size > MAX_BYTES) throw new Error("the explanations' seed file is too large");
  const seed = ExplainSeed.safeParse(jsonOf(readFileSync(file, "utf8")));
  if (!seed.success) throw new Error("the explanations' seed file is not a seed: version 1 and its rows' fields");
  const counts: SeedCounts = { ready: 0, refused: 0, kept: 0 };
  for (const { chain, realm, sure, text, tags } of seed.data.rows) {
    const checked = sure ? checkLine(text) : undefined;
    const line = checked?.ok === true ? { text: checked.text, tags: tagsOf(tags), now: now() } : undefined;
    const written = store.seed({ kind: "realm", chain, subject: realm }, line);
    counts[written ? (line === undefined ? "refused" : "ready") : "kept"] += 1;
  }
  log("explain_seeded", { setting: "ready", value: counts.ready });
  log("explain_seeded", { setting: "refused", value: counts.refused });
  log("explain_seeded", { setting: "kept", value: counts.kept });
  return counts;
}
