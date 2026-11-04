// A realm's digest and proposal on its reads already made (10k, the digest's route): give_digest and propose_action,
// the cards' own definitions, for that realm and chain alone, each kept as the cards keep theirs, grounded on the
// chain's reads only, as no asker's words are among them (one digest serves every reader).
import type { Ran } from "../gnomcp.ts";
import { argsOf, keepDigest, keepProposal, no, refused, type cardTools, type RealmRead } from "./cards.ts";
import type { Asked } from "./kept.ts";

/** The two cards' tools for one realm's reads; a call for another realm or chain is refused, naming the one read. */
export function realmCards(definitions: ReturnType<typeof cardTools>["definitions"], realm: RealmRead) {
  const [digest, proposal] = definitions;
  const { at, read } = realm;
  const only = (profile: string, path: string): boolean => profile === at.profile && path === read.realm;
  const elsewhere = refused(`only ${read.realm} on ${at.profile} was read: give its digest.`);
  return {
    definitions: [digest, proposal] as const,
    /** A digest's or a proposal's call, its arguments parsed again by its own schema; refused for any other. */
    run(call: { readonly name: string; readonly args: unknown }, asked: Asked): Promise<Ran> {
      const [given, proposed] = [argsOf(digest, call), argsOf(proposal, call)];
      if (given !== undefined)
        return Promise.resolve(only(given.profile, given.realm) ? keepDigest(realm, given, asked) : elsewhere);
      if (proposed === undefined) return no();
      const { profile, action } = proposed;
      return Promise.resolve(only(profile, action.realm) ? keepProposal(realm, action, asked) : elsewhere);
    },
  };
}
