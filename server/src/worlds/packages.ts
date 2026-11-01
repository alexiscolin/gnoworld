// What the worlds job reads of a package, once (slice 7, 7c): its imports and exported functions from `vm/qdoc`, one query
// (gnovm/pkg/doc/json_doc.go:18-28 at v1.5.0, read from the source: gnomcp has no route to it), and its deployer from the
// `[addpkg]` creator the chain stamps into gnomod.toml (keeper.go:637-639), read with `vm/qfile`. Code does not change, so a
// package already known is never asked again. Every answer is capped, parsed and filtered; a name that does not fit the
// file's schema is left out.
import { isAddress } from "@gnoworld/core";
import { ExportedName, ImportPath, WORLDS_CAPS } from "@gnoworld/schemas";
import { z } from "zod";
import { abciQuery, Absent, isDown, kindOf, type Send } from "./remote.ts";

export interface PackageFacts {
  readonly deployer: string | null;
  readonly functions: string[];
  readonly imports: string[];
}

const DOC_MAX_BYTES = 1024 * 1024;
const FILE_MAX_BYTES = 16 * 1024;
const CALL_MS = 15_000;

// gno leaves an empty `imports` out of the JSON (`omitempty`, json_doc.go:22 at v1.5.0); `package_path` and `funcs` have no omitempty
// (a nil slice is null), so they are always there, and an answer without them is no doc.
const Doc = z.object({
  package_path: z.string(),
  imports: z.optional(z.nullable(z.array(z.string()))),
  funcs: z.nullable(z.array(z.object({ type: z.optional(z.string()), name: z.string() }))),
});

// The first `creator = "..."` of the [addpkg] table, if it is an address.
function creatorOf(gnomod: string): string | null {
  const lines = gnomod.split("\n");
  const start = lines.findIndex((line) => line.trim() === "[addpkg]");
  if (start < 0) return null;
  for (const line of lines.slice(start + 1)) {
    if (line.trim().startsWith("[")) return null;
    const creator = /^\s*creator\s*=\s*"([^"]*)"\s*$/.exec(line)?.[1];
    if (creator !== undefined) return isAddress(creator) ? creator : null;
  }
  return null;
}

// Sorted, once each, at most `max`.
const listed = (names: Iterable<string>, max: number): string[] => [...new Set(names)].sort().slice(0, max);

// The facts of a doc's JSON, or null for an answer that is no doc of the package asked.
function factsOf(text: string, path: string): Omit<PackageFacts, "deployer"> | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const doc = Doc.safeParse(json);
  if (!doc.success || doc.data.package_path !== path) return null;
  return {
    functions: listed(
      (doc.data.funcs ?? []).flatMap(({ type, name }) =>
        (type ?? "") === "" && ExportedName.safeParse(name).success ? [name] : [],
      ),
      WORLDS_CAPS.functions,
    ),
    imports: listed(
      (doc.data.imports ?? []).filter((path) => ImportPath.safeParse(path).success),
      WORLDS_CAPS.imports,
    ),
  };
}

// One package's facts: its doc, then its file for the deployer. A doc that is refused or wrong gives null; a fault of the file
// other than the chain's "not there" is thrown, so the package is left out and asked again (readPackages ends the pass on a
// fault of the network).
async function readOne(
  reader: { send: Send; rpc: string; pace?: () => Promise<void> },
  path: string,
): Promise<PackageFacts | null> {
  await reader.pace?.();
  const text = await abciQuery(reader, { path: "vm/qdoc", data: path }, { ms: CALL_MS, maxBytes: DOC_MAX_BYTES });
  const doc = factsOf(text, path);
  if (doc === null) return null;
  let deployer: string | null = null;
  await reader.pace?.();
  try {
    const file = await abciQuery(
      reader,
      { path: "vm/qfile", data: `${path}/gnomod.toml` },
      { ms: CALL_MS, maxBytes: FILE_MAX_BYTES },
    );
    deployer = creatorOf(file);
  } catch (error) {
    // Only the chain's word that the file is not there is a fact; any other fault leaves the package out to be asked again.
    if (!(error instanceof Absent)) throw error;
  }
  return { deployer, ...doc };
}

/**
 * The facts of the packages not yet known, one call at a time. A package whose doc is refused or wrong is left out (the next pass
 * asks it again), and so is one whose file failed for any reason but absence. A network fault ends the pass with what was read. The known facts
 * of the paths asked are returned beside the new ones.
 */
export async function readPackages(
  reader: { send: Send; rpc: string; known: ReadonlyMap<string, PackageFacts>; pace?: () => Promise<void> },
  paths: readonly string[],
): Promise<Map<string, PackageFacts>> {
  const facts = new Map<string, PackageFacts>();
  for (const path of paths) {
    const earlier = reader.known.get(path);
    if (earlier !== undefined) facts.set(path, earlier);
  }
  for (const path of new Set(paths)) {
    if (facts.has(path)) continue;
    try {
      const read = await readOne(reader, path);
      if (read !== null) facts.set(path, read);
    } catch (error) {
      if (isDown(kindOf(error))) break;
    }
  }
  return facts;
}
