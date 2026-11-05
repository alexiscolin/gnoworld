// Which realms tie to which world, from the data's own hubs, and where a universe's subscription goes (slice 9g).
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

/** The indexer's address on wss, or none: a socket goes out over TLS to an address the data names, nothing else. */
export function socketUrl(address: string): string | undefined {
  const url = URL.canParse(address) ? new URL(address) : undefined;
  return url?.protocol === "https:" ? `wss:${address.slice("https:".length)}` : undefined;
}
