// What the door remembers beside its quota (D13985), made once for the chat, which feeds it, and the ask route, which reads
// it: the accounts heard in the chat (100,000, the one heard longest ago forgotten first), the answers kept, the strikes
// and shares in the database, and the hosts a link may name: the server's own sites and gno.land, with their subdomains.
import type { DatabaseSync } from "node:sqlite";
import { makeDay } from "./day.ts";
import { makeHeard } from "./heard.ts";
import { makeServed } from "./served.ts";

export function doorMemory(db: DatabaseSync, origins: readonly string[], now: () => number) {
  const [heard, served] = [makeHeard(100_000), makeServed({ now })];
  return {
    // What the chat tells the door.
    chat: { heard, changed: served.drop },
    // What the ask route is given.
    ask: {
      heard: heard.has,
      served,
      day: makeDay(db, { now }),
      hosts: [...origins.flatMap((origin) => URL.parse(origin)?.hostname ?? []), "gno.land"],
    },
  };
}
