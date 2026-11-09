// @vitest-environment jsdom
import { Address } from "@gnoworld/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DraftStorage } from "./drafts/drafts.ts";
import { keepCountry, keptCountry, shownCountry, zoneCountry } from "./country.ts";

// 7j: the country an account declares (ADR-0001 §7): opt-in, on the device, a country or nothing. What the device gives back goes into a
// line of the chat, so it is checked as what it is: outside data.
const ME = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const OTHER = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const KEY = `gnoworld:country:${ME}`;

function device(held: Record<string, string> = {}) {
  const map = new Map(Object.entries(held));
  const storage: DraftStorage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
  return { map, reach: () => storage };
}

const blocked = (): DraftStorage => {
  throw new Error("storage is blocked");
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the country an account keeps on its device", () => {
  it("holds none until the account chooses one", () => {
    expect(keptCountry(ME, device().reach)).toBeUndefined();
  });

  it("keeps what the account chose", () => {
    const { reach } = device();
    expect(keepCountry(ME, "JP", reach)).toBe(true);
    expect(keptCountry(ME, reach)).toBe("JP");
  });

  it("keeps it for that account alone: another on this device declares nothing", () => {
    const { reach } = device();
    keepCountry(ME, "JP", reach);
    expect(keptCountry(OTHER, reach)).toBeUndefined();
  });

  it("hides it (D395): the device holds the mark that it hides one, and nothing of the country", () => {
    const { map, reach } = device();
    keepCountry(ME, "JP", reach);
    expect(keepCountry(ME, undefined, reach)).toBe(true);
    expect([...map.values()]).toEqual(['"hidden"']);
    expect(keptCountry(ME, reach)).toBeUndefined();
  });

  it.each(['"jp"', '"JPN"', '"JP;+x=1"', '"JP PRIVMSG"', "7", "null", "[]", '["JP"]', "{", ""])(
    "reads the device's %j as none, and forgets it: it would be written into a line",
    (held) => {
      const { map, reach } = device({ [KEY]: held });
      expect(keptCountry(ME, reach)).toBeUndefined();
      expect(map.has(KEY)).toBe(false);
    },
  );

  it.each(["jp", "JPN", "JP;+x=1", ""])("keeps nothing that is no country: %j", (code) => {
    const { map, reach } = device();
    expect(keepCountry(ME, code, reach)).toBe(false);
    expect(map.size).toBe(0);
  });

  it("holds none on a device it cannot reach", () => {
    expect(keptCountry(ME, blocked)).toBeUndefined();
  });

  it("shows no country on a device it cannot read: a hidden choice it cannot see is never undone by the time zone's", () => {
    const tokyo = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      ...new Intl.DateTimeFormat().resolvedOptions(),
      timeZone: "Asia/Tokyo",
    });
    const countries = [{ code: "JP" }, { code: "FR" }];
    expect(shownCountry(ME, countries, blocked)).toBeUndefined();
    expect(shownCountry(ME, countries, device().reach)).toBe("JP");
    expect(tokyo).toHaveBeenCalled();
  });

  it("holds none, what it holds being refused, on a device that will not forget it", () => {
    const { reach } = device({ [KEY]: '"JP;+x=1"' });
    const storage = reach();
    expect(
      keptCountry(ME, () => ({
        ...storage,
        removeItem: () => {
          throw new Error("storage is read-only");
        },
      })),
    ).toBeUndefined();
  });

  it("keeps two capitals it cannot name: the list offers countries alone, and a reader draws none", () => {
    const { reach } = device();
    expect(keepCountry(ME, "FU", reach)).toBe(true);
  });

  it("says so when the device refuses a choice, and refuses to forget one", () => {
    expect(keepCountry(ME, "JP", blocked)).toBe(false);
    expect(keepCountry(ME, undefined, blocked)).toBe(false);
  });

  it("reaches the page's own device by default", () => {
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => '"JP"');
    expect(keptCountry(ME)).toBe("JP");
    expect(read).toHaveBeenCalledWith(KEY);
  });
});

describe("the country a time zone suggests", () => {
  const among = (...codes: string[]) => codes.map((code) => ({ code }));

  it("names the country whose region holds the zone", () => {
    expect(zoneCountry(among("FR", "JP"), "Asia/Tokyo")?.code).toBe("JP");
    expect(zoneCountry(among("FR", "JP"), "Europe/Paris")?.code).toBe("FR");
  });

  it("finds a country among all of its zones, not its first alone", () => {
    expect(zoneCountry(among("FR", "US"), "America/Chicago")?.code).toBe("US");
    expect(zoneCountry(among("FR", "US"), "America/Los_Angeles")?.code).toBe("US");
    expect(zoneCountry(among("RU"), "Asia/Vladivostok")?.code).toBe("RU");
  });

  it("reads the browser's own zone by default", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      ...new Intl.DateTimeFormat().resolvedOptions(),
      timeZone: "Asia/Tokyo",
    });
    expect(zoneCountry(among("FR", "JP"))?.code).toBe("JP");
  });

  it.each(["UTC", "Etc/UTC", "Mars/Base", ""])("suggests nothing for %j: no country holds it", (zone) => {
    expect(zoneCountry(among("FR", "JP"), zone)).toBeUndefined();
  });

  it("suggests only among the countries it is given", () => {
    expect(zoneCountry(among("FR"), "Asia/Tokyo")).toBeUndefined();
  });

  it("suggests nothing for a country with no zone of its own (Bouvet Island)", () => {
    expect(zoneCountry(among("BV"), "Asia/Tokyo")).toBeUndefined();
  });

  it("suggests nothing on a browser that cannot say: older ones have no getTimeZones, and a suggestion is no need", () => {
    const locale = Object.getPrototypeOf(new Intl.Locale("en")) as object;
    const held = Object.getOwnPropertyDescriptor(locale, "getTimeZones");
    expect(held).toBeDefined();
    Reflect.deleteProperty(locale, "getTimeZones");
    try {
      expect(zoneCountry(among("JP"), "Asia/Tokyo")).toBeUndefined();
    } finally {
      if (held !== undefined) Object.defineProperty(locale, "getTimeZones", held);
    }
  });
});
