// The realms a worlds file lists, as a set that is built again only when the file is: the worlds file's reader gives the same object until the job writes a new one.
import type { Worlds } from "@gnoworld/schemas/indexer";

export function realmsListed(read: () => Worlds | undefined): () => ReadonlySet<string> {
  let kept: { from: Worlds; realms: Set<string> } | undefined;
  return () => {
    const file = read();
    if (file === undefined) return new Set();
    if (kept?.from !== file)
      kept = { from: file, realms: new Set(file.worlds.flatMap(({ realms }) => realms.map(({ path }) => path))) };
    return kept.realms;
  };
}
