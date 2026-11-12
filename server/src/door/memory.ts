// What the door remembers beside its quota (D13985), made once for the chat, which feeds it, and the ask route, which reads
// it: the accounts heard in the chat (100,000, the one heard longest ago forgotten first), the answers kept, the strikes
// and shares in the database, and the hosts a link may name: the server's own sites and gno.land, with their subdomains.
import type { DatabaseSync } from "node:sqlite";
import { chainsOf } from "./chain.ts";
import { makeDay } from "./day.ts";
import { makeHeard } from "./heard.ts";
import { makeKept } from "./kept.ts";
import { makeServed } from "./served.ts";

export function doorMemory(
  db: DatabaseSync,
  origins: readonly string[],
  { now, chainId }: { now: () => number; chainId?: () => string | undefined },
) {
  const chains = chainsOf(db, chainId ?? (() => undefined));
  const [heard, served, kept] = [makeHeard(100_000), makeServed({ now }), makeKept(db, { now })];
  return {
    // What the chat tells the door.
    chat: {
      heard,
      changed: (room: string) => {
        served.drop(room);
        kept.drop(room);
      },
    },
    // What the ask route is given.
    ask: {
      heard: heard.has,
      // An ask sent with the account's own line waits for it 3 s at most.
      heardSoon: (account: string) => heard.soon(account, 3000),
      served,
      kept,
      chainOf: chains.of,
      defaultChain: chains.fallback,
      day: makeDay(db, { now }),
      hosts: [...origins.flatMap((origin) => URL.parse(origin)?.hostname ?? []), "gno.land"],
    },
  };
}
