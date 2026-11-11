// Tier 1 (docs/REVIEW.md). The one place that gives an owner's right: the staff right as the pins give it today, or the holder of the room's
// namespace being the account or one of its identity, read on the room's own chain. Nothing here feeds isTeam, spared, the console, the room
// lists or the reconciler. The namespace comes from the server's own tables (placeOf), never from a request.
import { Address } from "@gnoworld/schemas";

/** What gives a right: the roles file's (staff), an Earth room's maker (of that room alone), or the chain's holder of the room's namespace, `owner` being that address. */
export type Right = { as: "staff" } | { as: "maker" } | { as: "owner"; owner: Address };

/** What the log says of an act: what gave the right, and the owner's address for an owner's. */
export const asOf = (right: Right) => (right.as === "owner" ? { as: right.as, owner: right.owner } : { as: right.as });

interface Place {
  namespace: string;
  /** The reader of the room's own chain (makeOwners' `lookup`): the holder, null for nobody, undefined for a read that failed. */
  owner: (namespace: string, visitor: string) => Promise<Address | null | undefined>;
}

export interface MayModerateOptions {
  /** A moderator of the room's world or the team (the roles file). */
  staff: (room: string, who: string) => boolean;
  /** The maker of a public room of the Earth. */
  maker: (room: string, who: string) => boolean;
  /** The room's namespace and chain from the server's own tables: undefined for the Earth and a room it cannot place. */
  placeOf: (room: string) => Place | undefined;
  identityOf: (address: Address) => readonly Address[];
}

export function makeMayModerate({ staff, maker, placeOf, identityOf }: MayModerateOptions) {
  // The right, false for none, or "failed" when the owner read gave no answer: a caller that must not guess (a target) refuses on it.
  const judge = async (who: string, room: string, visitor: string): Promise<Right | false | "failed"> => {
    const account = Address.safeParse(who);
    if (!account.success) return false;
    if (maker(room, who)) return { as: "maker" };
    if (staff(room, who)) return { as: "staff" };
    const place = placeOf(room);
    if (place === undefined) return false;
    let holder: Address | null | undefined;
    try {
      // One key for the read's limits: the account and the visitor's /64 together (F13831).
      holder = await place.owner(place.namespace, `${who} ${visitor}`);
    } catch {
      return "failed";
    }
    if (holder === undefined) return "failed";
    return holder !== null && identityOf(account.data).includes(holder) ? { as: "owner", owner: holder } : false;
  };
  // A read that failed is no right, as a read that found nobody is none.
  const may = async (who: string, room: string, visitor: string): Promise<Right | false> => {
    const right = await judge(who, room, visitor);
    return right === "failed" ? false : right;
  };
  return Object.assign(may, { judge });
}
