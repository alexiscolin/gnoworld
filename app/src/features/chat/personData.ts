// What a person's card draws of the server's answer, as plain values.
import { ADDRESS_BODY } from "@gnoworld/core";
import { PERSON_CAPS, type PersonCardData } from "@gnoworld/schemas/indexer";
import { shortAddress } from "@gnoworld/schemas";
import { amountText } from "../../lib/chainText.ts";
import { dayKey } from "../../lib/days.ts";

const DAY_MS = 86_400_000;
const UGNOT = 1_000_000n;

/** The whole GNOT of an amount of ugnot, exact: the figure a balance is drawn as. */
export const wholeGnot = (ugnot: string): number => Number(BigInt(ugnot) / UGNOT);

/** A realm's path as the person's card draws it: under their own namespace the part after it, else the path without its host, an address
 * in it by its two ends. */
export function realmIn(realm: string, address: string): string {
  const own = `gno.land/r/${address}/`;
  const path = realm.startsWith(own) ? realm.slice(own.length) : realm.replace(/^gno\.land\//, "");
  return path.replace(new RegExp(ADDRESS_BODY, "g"), (found) => shortAddress(found));
}

/** A text of at most `max` characters, cut in its middle with an ellipsis: both ends of a path stay. */
export function middle(text: string, max: number): string {
  if (text.length <= max) return text;
  const tail = Math.floor((max - 1) / 2);
  return `${text.slice(0, max - 1 - tail)}\u2026${text.slice(text.length - tail)}`;
}

/** An amount in the token's unit as one short figure: grouped while it is short, else compact ("1.23M"), three significant digits. */
export function figureOf(amount: string, decimals: number): string {
  const text = amountText(amount, decimals);
  if (text.length <= 10) return text;
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: 3 }).format(
    Number(amount) / 10 ** decimals,
  );
}

/** The calls of the last 30 UTC days ending on `now`'s, oldest first, a day with none counting 0. */
export function dailyCalls(days: NonNullable<PersonCardData["calls"]>["days"], now: number): number[] {
  const by = new Map(days.map(({ day, calls }) => [day, calls]));
  return Array.from(
    { length: PERSON_CAPS.days },
    (_, back) => by.get(dayKey(new Date(now - (PERSON_CAPS.days - 1 - back) * DAY_MS), "UTC")) ?? 0,
  );
}
