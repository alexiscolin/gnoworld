// The links the worlds' file holds between worlds (ADR-0002 §10): a realm of one importing a realm of another. The whole cosmos was to draw them as
// lines (7u2, put off), a plate lists a world's (8g); a link means an import the file holds and nothing else.

/** A world of the file, as its links read it: its realms' paths and what each imports. */
export interface LinkedWorld {
  readonly id: string;
  readonly realms: readonly { readonly path?: string; readonly imports?: readonly string[] }[];
}

const REALM = "gno.land/r/";

// Which world holds each realm the file names: of two that name one, the first by id, in any order.
function holders(worlds: readonly LinkedWorld[]): Map<string, number> {
  const held = new Map<string, number>();
  worlds.forEach(({ id, realms }, at) => {
    for (const { path } of realms) {
      const before = path === undefined ? undefined : held.get(path);
      if (path !== undefined && (before === undefined || id < (worlds[before]?.id ?? ""))) held.set(path, at);
    }
  });
  return held;
}

// The worlds a world's realms import, by index: realms only, each one the file holds.
const importsOf = (realms: LinkedWorld["realms"], held: ReadonlyMap<string, number>): number[] =>
  realms.flatMap(({ imports = [] }) =>
    imports.flatMap((path) => {
      const to = path.startsWith(REALM) ? held.get(path) : undefined;
      return to === undefined ? [] : [to];
    }),
  );

/** A world linked to another by the file: whether that world's realms import its realms (`calls`), and whether its own import theirs. */
export interface Neighbour {
  readonly id: string;
  readonly calls: boolean;
  readonly called: boolean;
}

/** The worlds the file links to world `id` (a plate's "Connected worlds", 8g): each once, the ones that call it first, then by id. */
export function neighboursOf(worlds: readonly LinkedWorld[], id: string): Neighbour[] {
  const held = holders(worlds);
  const at = worlds.findIndex((world) => world.id === id);
  const self = worlds[at];
  if (self === undefined) return [];
  const calls = new Set(importsOf(self.realms, held));
  const called = new Set<number>();
  // ponytail: one pass over every import the file names, as linksOf's.
  worlds.forEach(({ realms }, from) => {
    if (from !== at && importsOf(realms, held).includes(at)) called.add(from);
  });
  return [...new Set([...called, ...calls])]
    .filter((index) => index !== at)
    .flatMap((index) => {
      const other = worlds[index]?.id;
      return other === undefined ? [] : [{ id: other, calls: called.has(index), called: calls.has(index) }];
    })
    .sort((a, b) => Number(b.calls) - Number(a.calls) || (a.id < b.id ? -1 : 1));
}
