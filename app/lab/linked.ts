// The lab's worlds with the imports read on Onyx for a sample of their realms (app/lab/imports.json, 2026-11-02): the recorded file read no
// package, so these are its only lines. Both files go through Zod: a path or an import that is no gno.land path refuses the read whole.
import { ImportPath, RealmPath, Worlds } from "@gnoworld/schemas/indexer";
import { z } from "../src/lib/jitless.ts";

const Read = z.strictObject({
  chain: z.string(),
  read: z.string(),
  how: z.string(),
  realms: z.record(RealmPath, z.array(ImportPath)),
});

/** The recorded worlds, each realm the sample read holding its imports. */
export function linked(recorded: unknown, read: unknown): Worlds {
  const { realms } = Read.parse(read);
  const file = Worlds.parse(recorded);
  const imports = new Map(Object.entries(realms));
  return Worlds.parse({
    ...file,
    worlds: file.worlds.map((world) => ({
      ...world,
      realms: world.realms.map((realm) => ({ ...realm, imports: imports.get(realm.path) ?? realm.imports })),
    })),
  });
}
