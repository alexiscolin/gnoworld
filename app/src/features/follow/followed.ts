// The worlds a reader follows, as the rail reads them (slice 8), apart from the button: the rail's chunk holds this alone.
import { shortAddress } from "@gnoworld/schemas";
import type { DeviceFields } from "../../lib/keep/fields.ts";

/** The worlds of `universe` followed, by their ids, the last followed first. */
export function worldsFollowedIn(follows: DeviceFields["follows"], universe: string): string[] {
  const prefix = `${universe}:`;
  return follows.worlds.filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
}

/** The first person followed among `members`, by the order followed, the last followed first: matched on the account, which Ergo makes the
 * nick (force-nick-equals-account); none for none. */
export const friendAmong = (people: readonly string[], members: readonly string[]): string | undefined =>
  people.find((person) => members.includes(person));

/** A followed person's chip, on a room's moon or a world's label (Alexis's "noor is here"). */
export const isHere = (address: string): string => `${shortAddress(address)} is here`;
