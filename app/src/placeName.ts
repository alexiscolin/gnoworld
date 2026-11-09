// How the GUI names a namespace or a world (space's labels, the system's card, the header's levels): an address short, else the name
// the data gives, else its last part; the Earth by its name.
import { EARTH, isAddress, labelName } from "@gnoworld/core";
import { Address, shortAddress } from "@gnoworld/schemas";
import hubs from "../data/hubs.json" with { type: "json" };

// The hubs by the realm they stand on, as the cosmos names it (without "gno.land/r/"): the name and slug the rail and the plates use.
const BY_REALM = new Map(
  hubs.flatMap((hub) =>
    ("realms" in hub ? hub.realms : []).map((realm) => [realm.replace(/^gno\.land\/r\//, ""), hub] as const),
  ),
);

/** The hub a world id stands for (its display name, its slug), or none: the cosmos knows worlds by realm. */
export const hubOf = (id: string): { readonly name: string; readonly slug: string } | undefined => BY_REALM.get(id);

/** A namespace or a world as the GUI names them: an address short, else the name the data gives (core's labelName), else its last part. */
export const nameOf = (id: string): string => {
  if (id === EARTH) return "Earth";
  const hub = hubOf(id);
  if (hub !== undefined) return hub.name;
  if (Address.safeParse(id).success) return shortAddress(id);
  return labelName(id) ?? id.split("/").at(-1) ?? id;
};

/** A system's name: its namespace's; a namespace named by an address alone, by its busiest world and how many more it holds ("shoal +9", P1):
 * space's labels and its map say it alike. */
export function systemName(
  system: { readonly id: string; readonly planets: readonly { readonly id: string; readonly use: number }[] },
  name: (id: string) => string = nameOf,
): string {
  if (!isAddress(system.id)) return name(system.id);
  const [busiest] = [...system.planets].sort((a, b) => b.use - a.use);
  if (busiest === undefined) return name(system.id);
  const more = system.planets.length - 1;
  return more > 0 ? `${name(busiest.id)} +${String(more)}` : name(busiest.id);
}
