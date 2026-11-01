// The country an account declares (ADR-0001 §7): opt-in, on the device, never finer than a country; declared, never detected. A time zone
// only suggests one, for the person to confirm. What the device gives back is written into a line of the chat, so it is outside data.
import { isCountryCode } from "@gnoworld/core";
import type { Address } from "@gnoworld/schemas";
import { readKept, writeKept } from "./dms/prefs.ts";
import type { DraftStorage } from "./drafts/drafts.ts";

const pageStorage = () => localStorage;
const keyOf = (account: Address) => `gnoworld:country:${account}`;

/** What `account` declares on this device; none until it chooses, and none for what the device holds that is no country, then forgotten. */
export function keptCountry(account: Address, storage: () => DraftStorage = pageStorage): string | undefined {
  return readKept<string | undefined>(storage, keyOf(account), {
    empty: undefined,
    check: (raw) => (typeof raw === "string" && isCountryCode(raw) ? raw : undefined),
  });
}

/** Keeps `code` as what `account` declares, or forgets what it declared for none; whether the device did. */
export function keepCountry(
  account: Address,
  code: string | undefined,
  storage: () => DraftStorage = pageStorage,
): boolean {
  if (code !== undefined) return isCountryCode(code) && writeKept(storage, keyOf(account), JSON.stringify(code));
  try {
    storage().removeItem(keyOf(account));
    return true;
  } catch {
    return false;
  }
}

// `getTimeZones` is Baseline 2026 and outside the es2024 types: an older browser has none, and so no suggestion, which nothing needs.
const zonesOf = (code: string): readonly string[] =>
  (new Intl.Locale(`und-${code}`) as { getTimeZones?: () => string[] | undefined }).getTimeZones?.() ?? [];

/** The country of `countries` whose region holds `zone`, the browser's by default; none when none does or the browser cannot say. */
export function zoneCountry<T extends { code: string }>(
  countries: readonly T[],
  zone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): T | undefined {
  // ponytail: a locale a country, 250 at most, once each time a person asks for the list.
  return countries.find(({ code }) => zonesOf(code).includes(zone));
}
