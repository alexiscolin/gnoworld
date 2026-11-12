import { expect, it } from "vitest";
import { calmOf, countriesWidget } from "./figures.ts";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const line = (time: string, country?: string) => ({
  time,
  kind: "message",
  ...(country === undefined ? {} : { country }),
});

it("counts the countries heard in 24 h, the most heard first, all of them in more", () => {
  const [widget] = countriesWidget(
    [
      line("2026-11-12T11:00:00Z", "JP"),
      line("2026-11-12T10:00:00Z", "BR"),
      line("2026-11-12T09:00:00Z", "BR"),
      line("2026-11-12T08:00:00Z", "FR"),
    ],
    NOW,
  );
  expect(widget).toMatchObject({
    label: "Countries",
    value: "3",
    unit: "last 24 h",
    detail: "Brazil, Japan\u2026",
  });
  expect(widget?.more).toEqual(["Brazil \u00b7 2", "Japan \u00b7 1", "France \u00b7 1"]);
});

it("leaves out old lines and lines with no country, and shows nothing when none is left", () => {
  expect(countriesWidget([line("2026-11-11T11:00:00Z", "JP"), line("2026-11-12T11:00:00Z")], NOW)).toEqual([]);
});

it("shows nothing while the hours have not come", () => {
  expect(countriesWidget([line("2026-11-12T11:00:00Z", "JP")], undefined)).toEqual([]);
});

it("a realm nothing proved shows no status; read, it is on chain; listed, in use", () => {
  expect(calmOf(0, false, false)).toBeUndefined();
  expect(calmOf(0, false, true)?.label).toBe("On chain");
  expect(calmOf(0, true, false)?.label).toBe("In use");
});
