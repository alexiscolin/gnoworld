// What a world's people and pace count (D353, D374, D430): the accounts the reconciler found and the streams open, the guests apart.
import { GUEST_PREFIX } from "@gnoworld/core";
import type { PresencePeople } from "@gnoworld/schemas/indexer";
import { NICK } from "../irc/lines.ts";

type Rates = (rooms: readonly string[], now: number) => ReadonlyMap<string, number>;

/** A world's messages an hour from its rooms' messages a minute now: the sum of the rooms' paces, times 60. */
export const hourOf = (rates: Rates, names: readonly string[], at: number): number =>
  [...rates(names, at).values()].reduce((sum, rate) => sum + rate, 0) * 60;

/** Not the bot, not a relayed guest (no connection can take a nick with the relay's separator), not a reading guest: Ergo names
 * a connection with no account Guest-<nick>, and it counts through its stream alone (D352, D374). `nick` is lower case. */
export const isPerson = (nick: string): boolean =>
  nick !== NICK && !nick.startsWith(GUEST_PREFIX) && !nick.startsWith("guest-");

// What the answer serves of a world (D374): its accounts once, the relay's and the streams', plus its guests.
export const shownOf = (
  nicks: ReadonlySet<string> | undefined,
  open: { guests: number; accounts: Iterable<string> } | undefined,
): number => new Set([...(nicks ?? []), ...(open?.accounts ?? [])]).size + (open?.guests ?? 0);

// The people among `nicks` (the relay's, with the accounts of the open streams, so one holding both counts once), each once, and the countries those of them who declare one name.
export function peopleOf(
  nicks: readonly string[],
  { guests, accounts }: { guests: number; accounts: Iterable<string> },
  countryOf: (nick: string) => string | undefined,
): PresencePeople {
  const people = new Set([...nicks, ...accounts]);
  const named = new Set([...people].flatMap((nick) => countryOf(nick) ?? []));
  return { online: people.size + guests, countries: named.size };
}
