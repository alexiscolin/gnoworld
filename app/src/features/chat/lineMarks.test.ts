import type { ShownLine } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import type { ChainHeard } from "../../store/chain.ts";
import { dayLabelsOf, groupedOf } from "./lineMarks.ts";

const at = (minutes: number, day = "2026-11-07") => `${day}T10:${String(minutes).padStart(2, "0")}:00.000Z`;
const line = (id: string, minutes: number, over: Partial<ShownLine> = {}) => ({
  line: { id, time: at(minutes), from: "ines", account: "g1ines", text: id, kind: "message" as const, ...over },
});
const guest = (id: string, minutes: number) => ({
  line: { id, time: at(minutes), from: "ines", text: id, kind: "message" as const },
});
const call = { call: { id: "c1" } as ChainHeard, key: "c1" };

describe("the lines that go on a group", () => {
  it("are the same author's, within five minutes of the line before", () => {
    expect([...groupedOf([line("a", 0), line("b", 4), line("c", 8), line("d", 20)])]).toEqual(["b", "c"]);
  });

  it("start again for another author, a guest of the same nick, a reply, a notice or a call of the chain", () => {
    expect([
      ...groupedOf([line("a", 0), line("b", 1, { account: "g1bob" }), line("c", 2, { account: "g1bob", from: "bob" })]),
    ]).toEqual(["c"]);
    expect([...groupedOf([line("a", 0), guest("b", 1)])]).toEqual([]);
    expect([...groupedOf([line("a", 0), line("b", 1, { reply: "a" }), line("c", 2)])]).toEqual(["c"]);
    expect([...groupedOf([line("a", 0), line("b", 1, { kind: "notice" }), line("c", 2)])]).toEqual([]);
    expect([...groupedOf([line("a", 0), call, line("b", 1)])]).toEqual([]);
  });

  it("start again on the next day, the reader's own", () => {
    const local = (day: number, minutes: number) =>
      new Date(2026, 10, day, minutes === 59 ? 23 : 0, minutes).toISOString();
    expect([...groupedOf([line("a", 0, { time: local(7, 59) }), line("b", 0, { time: local(8, 1) })])]).toEqual([]);
    expect([...groupedOf([line("a", 0, { time: local(8, 0) }), line("b", 0, { time: local(8, 1) })])]).toEqual(["b"]);
  });
});

describe("the day each line opens", () => {
  const now = new Date("2026-11-11T12:00:00.000Z");
  const lineAt = (id: string, time: string) => ({ line: { ...line(id, 0).line, time } });
  // A line of another, old day goes first: a list of one day alone says none.
  const labels = (times: string[], zone = "UTC", at = now) =>
    [
      ...dayLabelsOf(
        ["2020-01-01T10:00:00Z", ...times].map((time, i) => lineAt(`l${String(i)}`, time)),
        at,
        { timeZone: zone, locale: "en-GB" },
      ),
    ]
      .map(([, label]) => label)
      .slice(1);

  it("falls on the first line and on each line of another day than the one before", () => {
    const entries = ["2026-11-09T09:00:00Z", "2026-11-09T21:00:00Z", "2026-11-10T09:00:00Z"].map((t, i) =>
      lineAt(`l${String(i)}`, t),
    );
    expect([...dayLabelsOf(entries, now, { timeZone: "UTC", locale: "en-GB" }).keys()]).toEqual(["l0", "l2"]);
    expect(
      dayLabelsOf([lineAt("a", "2026-11-09T09:00:00Z"), lineAt("b", "2026-11-09T21:00:00Z")], now, { timeZone: "UTC" })
        .size,
    ).toBe(0);
    expect([...dayLabelsOf([], now, { timeZone: "UTC", locale: "en-GB" }).keys()]).toEqual([]);
  });

  it("says Today, Yesterday, then the weekday and date, the year only when it is not this year", () => {
    expect(labels(["2026-11-11T01:00:00Z", "2026-11-12T01:00:00Z"])).toEqual(["Today", "Thursday 12 November"]);
    expect(labels(["2026-11-10T23:59:00Z"])).toEqual(["Yesterday"]);
    expect(labels(["2026-11-09T10:00:00Z"])).toEqual(["Monday 9 November"]);
    expect(labels(["2025-12-31T10:00:00Z"])).toEqual(["Wednesday, 31 December 2025"]);
  });

  it("cuts at midnight in the reader's zone, not UTC", () => {
    // 23:30 UTC on the 10th is already the 11th in Paris (UTC+1).
    expect(labels(["2026-11-10T22:30:00Z"], "UTC")).toEqual(["Yesterday"]);
    expect(labels(["2026-11-10T23:30:00Z"], "Europe/Paris")).toEqual(["Today"]);
    expect([
      ...dayLabelsOf([lineAt("a", "2026-11-10T22:59:00Z"), lineAt("b", "2026-11-10T23:01:00Z")], now, {
        timeZone: "Europe/Paris",
        locale: "en-GB",
      }).keys(),
    ]).toEqual(["a", "b"]);
  });

  it("keeps a 25-hour day whole across the autumn clock change, and yesterday one day back", () => {
    // Paris went back on 2026-10-25: the 25th ran 22:00Z on the 24th to 23:00Z on the 25th.
    const keys = (times: string[]) => [
      ...dayLabelsOf(
        times.map((t, i) => lineAt(`l${String(i)}`, t)),
        new Date("2026-10-26T10:00:00Z"),
        { timeZone: "Europe/Paris", locale: "en-GB" },
      ).entries(),
    ];
    expect(
      keys(["2026-10-24T21:30:00Z", "2026-10-24T22:30:00Z", "2026-10-25T22:30:00Z", "2026-10-25T23:30:00Z"]),
    ).toEqual([
      ["l0", "Saturday 24 October"],
      ["l1", "Yesterday"],
      ["l3", "Today"],
    ]);
  });
});
