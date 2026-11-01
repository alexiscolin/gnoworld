import { describe, expect, it } from "vitest";
import { centreOf, COUNTRIES, countryName } from "./countries.ts";

// Slice 6's 6b: the table of countries a bubble can come from (docs/plans/slice-6.md §7): the ISO 3166-1 code, a name and
// a centre in degrees, from a public-domain source named in the file's header (dataFiles.test.ts reads the header).
// A centre differs from one source to another, so a spot check is a wide box, never a number.
describe("COUNTRIES", () => {
  it("holds about 250 countries and territories, as ISO 3166-1 lists them", () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(240);
    expect(COUNTRIES.length).toBeLessThanOrEqual(260);
  });

  // F3370: a lost or an added row changes this list in a diff, which the range above would not notice. Bonaire, Sint
  // Eustatius and Saba (BQ) are in the map units file of the release the header names, so a message from there counts.
  it("holds exactly these 250 codes, Natural Earth 5.1.2's 249 and BQ from its map units", () => {
    const pinned =
      "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT " +
      "BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH " +
      "ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT " +
      "HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS " +
      "LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI " +
      "NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG " +
      "SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
      "UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW ";
    expect(COUNTRIES.map((c) => c.code)).toEqual(pinned.trim().split(" "));
    expect(COUNTRIES).toHaveLength(250);
  });

  it("holds Bonaire, Sint Eustatius and Saba under BQ, among the leeward islands", () => {
    expect(COUNTRIES.find((c) => c.code === "BQ")?.name).toBe("Caribbean Netherlands");
    const c = centreOf("BQ");
    expect(c?.lat).toBeGreaterThanOrEqual(12);
    expect(c?.lat).toBeLessThanOrEqual(18);
    expect(c?.lon).toBeGreaterThanOrEqual(-69);
    expect(c?.lon).toBeLessThanOrEqual(-62);
  });

  it("gives each a two-capital code, once, and a name", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(codes.every((c) => /^[A-Z]{2}$/.test(c))).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
    expect(COUNTRIES.every((c) => c.name.trim().length > 0 && c.name.length <= 80)).toBe(true);
  });

  it("keeps the table in code order, so a diff of it reads", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(codes).toEqual([...codes].sort());
  });

  it("puts every centre on Earth: a latitude of -90 to 90 and a longitude of -180 to 180", () => {
    for (const c of COUNTRIES) {
      expect(Number.isFinite(c.lat) && Math.abs(c.lat) <= 90, `${c.code} lat`).toBe(true);
      expect(Number.isFinite(c.lon) && Math.abs(c.lon) <= 180, `${c.code} lon`).toBe(true);
    }
  });

  it.each([
    ["JP", [30, 46, 128, 146]],
    ["DE", [47, 55, 5, 15]],
    ["BR", [-35, 5, -75, -35]],
    ["AU", [-45, -10, 110, 155]],
    ["IN", [8, 35, 68, 97]],
    ["ZA", [-35, -22, 16, 33]],
    ["EG", [22, 32, 24, 37]],
    ["AR", [-55, -22, -73, -53]],
    ["CA", [42, 75, -141, -52]],
  ] as const)("puts %s in its own part of the world", (code, [south, north, west, east]) => {
    const c = centreOf(code);
    expect(c?.lat).toBeGreaterThanOrEqual(south);
    expect(c?.lat).toBeLessThanOrEqual(north);
    expect(c?.lon).toBeGreaterThanOrEqual(west);
    expect(c?.lon).toBeLessThanOrEqual(east);
  });

  // Finding 9: a sign flipped on any row puts a country on the other side of the globe, so every continent and each
  // quadrant of (lat, lon) is checked, by a box wide enough for any source's centre.
  it.each([
    ["US", [25, 50, -125, -67]],
    ["MX", [14, 32, -118, -86]],
    ["CU", [19, 24, -85, -74]],
    ["GL", [60, 84, -60, -18]],
    ["CO", [-4, 13, -79, -66]],
    ["VE", [0, 12, -73, -60]],
    ["PE", [-18, 0, -81, -68]],
    ["BO", [-23, -9, -69, -57]],
    ["CL", [-56, -17, -76, -66]],
    ["GB", [49, 61, -8, 2]],
    ["FR", [41, 51, -5, 10]],
    ["ES", [36, 44, -10, 4]],
    ["IT", [36, 47, 6, 19]],
    ["NL", [50, 54, 3, 8]],
    ["CH", [45, 48, 5, 11]],
    ["PL", [49, 55, 14, 24]],
    ["SE", [55, 69, 11, 24]],
    ["NO", [57, 71, 4, 31]],
    ["FI", [59, 70, 20, 32]],
    ["IS", [63, 67, -25, -13]],
    ["UA", [44, 53, 22, 40]],
    ["RU", [50, 70, 30, 150]],
    ["TR", [36, 42, 26, 45]],
    ["SA", [16, 32, 35, 56]],
    ["IR", [25, 40, 44, 63]],
    ["PK", [23, 37, 60, 77]],
    ["CN", [20, 45, 75, 125]],
    ["KR", [33, 39, 125, 130]],
    ["VN", [8, 24, 102, 110]],
    ["TH", [5, 21, 97, 106]],
    ["PH", [5, 19, 117, 127]],
    ["MY", [0, 7, 99, 119]],
    ["ID", [-11, 6, 95, 141]],
    ["NZ", [-48, -34, 166, 179]],
    ["MA", [27, 36, -13, -1]],
    ["DZ", [19, 37, -9, 12]],
    ["NG", [4, 14, 2, 15]],
    ["ET", [3, 15, 33, 48]],
    ["KE", [-5, 5, 34, 42]],
    ["TZ", [-12, -1, 29, 40]],
    ["CD", [-14, 5, 12, 31]],
    ["AO", [-18, -4, 12, 24]],
    ["MG", [-26, -12, 43, 51]],
  ] as const)(
    "puts %s in its own part of the world too (a spot check of the signs)",
    (code, [south, north, west, east]) => {
      const c = centreOf(code);
      expect(c?.lat, `${code} lat`).toBeGreaterThanOrEqual(south);
      expect(c?.lat, `${code} lat`).toBeLessThanOrEqual(north);
      expect(c?.lon, `${code} lon`).toBeGreaterThanOrEqual(west);
      expect(c?.lon, `${code} lon`).toBeLessThanOrEqual(east);
    },
  );

  it("has the checked countries in all four quadrants of the signs", () => {
    const signs = new Set(
      ["US", "CL", "ID", "RU", "NZ", "GB", "NG", "CO", "KE"].map(
        (c) => `${String(Math.sign(centreOf(c)?.lat ?? 0))}${String(Math.sign(centreOf(c)?.lon ?? 0))}`,
      ),
    );
    expect([...signs].sort()).toEqual(["-1-1", "-11", "1-1", "11"]);
  });

  it("lists the countries the tests use and the ones a gno.land community comes from", () => {
    for (const code of ["JP", "FR", "DE", "US", "BR", "IN", "CA", "AU", "KR", "NL", "CH", "GB", "ES", "IT", "NG", "ZA"])
      expect(COUNTRIES.map((c) => c.code)).toContain(code);
  });
});

describe("centreOf", () => {
  it("gives the centre of a code, as the table holds it", () => {
    const jp = COUNTRIES.find((c) => c.code === "JP");
    expect(centreOf("JP")).toEqual({ lat: jp?.lat, lon: jp?.lon });
  });

  it("never guesses: a lower-case code, a long one, an unknown one and nothing give nothing", () => {
    for (const code of ["jp", "Jp", "JPN", "", "XX", "ZZ", " JP", "__proto__", "constructor"])
      expect(centreOf(code), JSON.stringify(code)).toBeUndefined();
    expect(centreOf(undefined)).toBeUndefined();
  });

  it("gives a copy: changing it leaves the table as it was", () => {
    const one = centreOf("JP");
    if (one === undefined) throw new Error("JP is in the table");
    const before = { ...one };
    (one as { lat: number }).lat = 0;
    expect(centreOf("JP")).toEqual(before);
  });
});

describe("countryName", () => {
  it("names a code the table holds", () => {
    expect(countryName("FR")).toBe("France");
    expect(countryName("JP")).toBe("Japan");
  });

  it.each(["jp", "ZZ", "", "__proto__", "constructor"])("names nothing for %j: a code is never guessed", (code) => {
    expect(countryName(code)).toBeUndefined();
  });
});
