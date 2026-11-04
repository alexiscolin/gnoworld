// What a kept answer depends on beyond its case: every file jarvis runs (its code, its skills, the packages it imports,
// the places' data, gnomcp's settings) and the settings the run gives it, the models among them; jarvis runs gnomcp
// 0.11.0 alone. The SHA-256 of them all, each file by its path and its bytes: a change to any (a prompt, a skill, a
// tool, a model, ADR-0002 §5) makes every case run again.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FOLDERS = [
  "jarvis/src",
  "jarvis/skills",
  "packages/core/src",
  "packages/schemas/src",
  "packages/service/src",
  "packages/chain/src",
  "app/data",
];
// The evals' own files that read a case's answers or run it: a fix of one reads every kept answer again (V8).
const EVALS = ["provider.ts", "fakes.ts", "jarvis.ts", "spans.ts", "budget.ts", "cases.ts", "fingerprint.ts"];
const kept = (path: string) => !/\.(test|bench)\.ts$/.test(path);

export function fingerprint(root: string, settings: Readonly<Record<string, string>>): string {
  const hash = createHash("sha256");
  const files = FOLDERS.flatMap((folder) =>
    readdirSync(join(root, folder), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name).slice(root.length)),
  )
    .concat("deploy/jarvis/gnomcp.toml", ...EVALS.map((name) => `evals/${name}`))
    .filter(kept)
    .sort();
  for (const path of files)
    hash
      .update(`${path}\0`)
      .update(readFileSync(join(root, path)))
      .update("\0");
  const named = Object.keys(settings)
    .sort()
    .map((name) => `${name}=${settings[name] ?? ""}`);
  hash.update(named.join("\n"));
  return hash.digest("hex");
}
