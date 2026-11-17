// A window that is a phone's or not, as useMedia reads it: matchMedia stubbed, PHONE_QUERY matching on a phone alone.
import { PHONE_QUERY } from "@gnoworld/core";
import { vi } from "vitest";

export function stubPhone(phone: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: phone && query === PHONE_QUERY,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}
