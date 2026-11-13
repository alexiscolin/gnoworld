// Tier 1 (docs/REVIEW.md). Who holds a namespace, read on the one chain the server is configured with, never on one a request names. An
// answer, yes or no, is kept 60 s from its own time; a failed read is refused and kept nowhere, so a failure never leaves a stale yes.
// Reads are bounded like an unlisted realm's (flights.ts): 4 in flight, 1,000 an hour (as `makeReads`: 120 let 24 visitors starve every
// owner for an hour, F13831), a few a visitor, one flight a namespace.
import { ownerAsk } from "@gnoworld/chain/asks";
import { ownerOfAnswer } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import type { Send } from "@gnoworld/service/net";
import { makeFlights } from "../flights.ts";
import { remember } from "../remember.ts";
import { abciQuery } from "../worlds/remote.ts";

export interface OwnersOptions {
  send: Send;
  /** The world's own chain's node: the default universe's. */
  rpc: string;
  now: () => number;
  perVisitor?: number;
  inFlight?: number;
  perHour?: number;
  /** The namespaces kept. */
  keys?: number;
}

const READ_MS = 5_000;
const READ_MAX_BYTES = 1_024;
const KEPT_MS = 60_000;

// A send that ends at `ms` whatever the transport does, so a read that never settles frees its slot.
function within(send: Send): Send {
  return (url, init, ms) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("timeout"));
      }, ms);
      send(url, init, ms)
        .then(resolve, reject)
        .finally(() => {
          clearTimeout(timer);
        });
    });
}

/** The one cache and chain of a universe's readers: the holder is kept 60 s from its own answer, whichever reader asked. */
export function makeOwnerReaders(options: OwnersOptions) {
  const { send, rpc, now, perVisitor = 5, inFlight = 4, perHour = 1_000, keys = 100_000 } = options;
  const kept = new Map<string, { at: number; holder: Address | null }>();
  const chain = { send: within(send), rpc };

  // The holder, null for nobody, undefined when the read failed: only the first two are kept. An address that fails its checksum
  // has no key that signs for it, so it is no answer.
  async function read(namespace: string, data: NonNullable<ReturnType<typeof ownerAsk>>) {
    try {
      const answer = ownerOfAnswer(await abciQuery(chain, data, { ms: READ_MS, maxBytes: READ_MAX_BYTES }));
      const holder = answer === null ? null : Address.safeParse(answer).data;
      if (holder !== undefined) remember(kept, [namespace, { at: now(), holder }], keys);
      return holder;
    } catch {
      return undefined;
    }
  }

  // A reader with limits of its own (a visitor's, in flight, an hour's): the lists a page shows and the acts a person makes each have one,
  // so a flood of lists never refuses an act. `lookup` tells nobody (null) from a read that failed or was limited (undefined).
  const reader = () => {
    const flights = makeFlights<Address | null | undefined>({ now, perVisitor, inFlight, perHour });
    const lookup = async (namespace: string, visitor: string): Promise<Address | null | undefined> => {
      // An address-shaped namespace with a bad checksum is read as a name and found to hold nothing.
      const self = Address.safeParse(namespace);
      if (self.success) return self.data;
      const data = ownerAsk(namespace);
      if (data === null) return null;
      const hit = kept.get(namespace);
      if (hit !== undefined) {
        // A clock that went back (age below 0) trusts nothing.
        const age = now() - hit.at;
        if (age >= 0 && age < KEPT_MS) return hit.holder;
      }
      const flight = flights(namespace, visitor, () => read(namespace, data));
      return flight === "limit" ? undefined : await flight;
    };
    return Object.assign(
      async (namespace: string, visitor: string): Promise<Address | undefined> =>
        (await lookup(namespace, visitor)) ?? undefined,
      { lookup },
    );
  };
  return { act: reader(), show: reader() };
}

/** The holder of a namespace, the action pool: an address namespace holds itself (no read), a name the registry's current address; undefined for nobody and for any read that failed. */
export const makeOwners = (options: OwnersOptions) => makeOwnerReaders(options).act;
