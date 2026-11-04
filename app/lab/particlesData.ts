// The study's matter (particles.ts): the recorded worlds with their realms, and the packages read on Onyx (packages.json, gnomcp, through
// Zod), gathered by namespace; and a world added to a namespace, for the picture of the mass making room for it.
import { ImportPath, type Worlds } from "@gnoworld/schemas/indexer";
import { usageOf } from "../src/scene/cosmos/cosmosWorld.ts";
import { z } from "../src/lib/jitless.ts";
import type { Namespace } from "./particlesLayout.ts";

const Packages = z.strictObject({
  chain: z.string(),
  read: z.string(),
  how: z.string(),
  packages: z.record(z.string().check(z.regex(/^[a-z0-9][a-z0-9_-]*$/)), z.array(z.string().check(z.maxLength(200)))),
});

interface Held {
  worlds: { id: string; realms: string[]; use: number }[];
  packages: string[];
}

/** Every namespace of the file and of the packages read, each with its worlds, their realms and use, and its packages' paths. */
export function namespacesOf(file: Worlds, read: unknown): Namespace[] {
  const { packages } = Packages.parse(read);
  const held = new Map<string, Held>();
  const of = (id: string) => {
    const one = held.get(id) ?? { worlds: [], packages: [] };
    held.set(id, one);
    return one;
  };
  for (const world of file.worlds)
    of(world.namespace).worlds.push({
      id: world.id,
      realms: world.realms.map(({ path }) => path),
      use: usageOf(world),
    });
  for (const [id, paths] of Object.entries(packages))
    of(id).packages.push(...paths.map((path) => ImportPath.parse(`gno.land/p/${id}/${path}`)));
  return [...held].map(([id, one]) => ({ id, ...one }));
}

/** The same namespaces with one world more in `namespace`, a new namespace if none holds that name: `index` names it. */
export function withWorld(namespaces: readonly Namespace[], namespace: string, index: number): Namespace[] {
  const world = {
    id: `${namespace}/added${String(index)}`,
    realms: [`gno.land/r/${namespace}/added${String(index)}`],
    use: 2,
  };
  const found = namespaces.some(({ id }) => id === namespace);
  const grown = namespaces.map((one) => (one.id === namespace ? { ...one, worlds: [...one.worlds, world] } : one));
  return found ? grown : [...grown, { id: namespace, worlds: [world], packages: [] }];
}
