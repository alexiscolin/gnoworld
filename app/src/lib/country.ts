// The country an account's lines show (ADR-0001 §7, D395): its time zone's by default, the one it chooses instead, or none once it hides
// it; on the device, never finer than a country. What the device gives back is written into a line of the chat, so it is outside data.
import { isCountryCode } from "@gnoworld/core";
import type { Address } from "@gnoworld/schemas";
import { readKept, writeKept } from "./dms/prefs.ts";
import type { DraftStorage } from "./drafts/drafts.ts";

const pageStorage = () => localStorage;
const keyOf = (account: Address) => `gnoworld:country:${account}`;

// What the device keeps for an account that hides its country: no country code is it. NONE is no choice kept yet.
const HIDDEN = "hidden";
const NONE = "none";

// What the device keeps for `account`: a country, the mark that it hides one, or NONE, anything else forgotten; nothing when the device
// cannot be read, which may hold a hidden choice.
const keptChoice = (account: Address, storage: () => DraftStorage): string | undefined =>
  readKept<string>(storage, keyOf(account), {
    empty: NONE,
    check: (raw) => (typeof raw === "string" && (raw === HIDDEN || isCountryCode(raw)) ? raw : undefined),
  });

/** The country `account` chose on this device; none until it chooses, once it hid it, or when the device cannot be read. */
export function keptCountry(account: Address, storage: () => DraftStorage = pageStorage): string | undefined {
  const kept = keptChoice(account, storage);
  return kept === HIDDEN || kept === NONE ? undefined : kept;
}

/** Keeps `code` as what `account` shows, or that it shows none; whether the device did. */
export function keepCountry(
  account: Address,
  code: string | undefined,
  storage: () => DraftStorage = pageStorage,
): boolean {
  if (code !== undefined && !isCountryCode(code)) return false;
  return writeKept(storage, keyOf(account), JSON.stringify(code ?? HIDDEN));
}

// `getTimeZones` is Baseline 2026 and outside the es2024 types: an older browser has none, and so no suggestion, which nothing needs.
const zonesOf = (code: string): readonly string[] =>
  (new Intl.Locale(`und-${code}`) as { getTimeZones?: () => string[] | undefined }).getTimeZones?.() ?? [];

/** The country of `countries` whose region holds `zone`, the browser's by default; none when none does or the browser cannot say. */
export function zoneCountry<T extends { code: string }>(
  countries: readonly T[],
  zone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): T | undefined {
  // ponytail: a locale a country, 250 at most, about 40 ms, once as the list opens with nothing chosen.
  return countries.find(({ code }) => zonesOf(code).includes(zone));
}

/** What `account`'s lines show: its choice, none once hidden or when the device cannot be read, else its time zone's country, as
 * `zoneCountry` finds it in `countries`. */
export function shownCountry(
  account: Address,
  countries: readonly { code: string }[],
  storage: () => DraftStorage = pageStorage,
): string | undefined {
  const kept = keptChoice(account, storage);
  if (kept === undefined || kept === HIDDEN) return undefined;
  return kept === NONE ? zoned(countries) : kept;
}

// The time zone's country, found once for the page: each line asks it as it speaks, and the zone does not move under a page.
const found = new WeakMap<readonly { code: string }[], string | null>();
function zoned(countries: readonly { code: string }[]): string | undefined {
  if (!found.has(countries)) found.set(countries, zoneCountry(countries)?.code ?? null);
  return found.get(countries) ?? undefined;
}
