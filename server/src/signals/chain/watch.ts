// Which realms tie to which world, from the data's own hubs, and which indexer addresses are read (slice 9g).
import type { Hubs } from "@gnoworld/schemas";
import type { Watched } from "./message.ts";

/** The realms of the hubs of a universe, each tied to its world. */
export function watchOf(hubs: ReturnType<typeof Hubs.parse>, universe: string): Map<string, Watched> {
  return new Map(
    hubs
      .filter((hub) => hub.universe === universe)
      .flatMap((hub) => (hub.realms ?? []).map((realm): [string, Watched] => [realm, { world: hub.slug }])),
  );
}

/** Whether the indexer's address is https: the server reads only over TLS an address the data names, nothing else. */
export function secure(address: string): boolean {
  return URL.canParse(address) && new URL(address).protocol === "https:";
}
