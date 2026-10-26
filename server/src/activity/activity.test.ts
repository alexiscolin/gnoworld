import { describe, expect, it } from "vitest";
import { makeActivity } from "./activity.ts";

const T0 = Date.parse("2026-10-22T12:00:00.000Z");
const MINUTE = 60_000;

describe("activity", () => {
  it("gives each room its messages a minute over the last five minutes", () => {
    const activity = makeActivity();
    for (const account of ["a", "b", "c"]) activity.count("#bubble", account, T0);
    activity.count("#earth", "a", T0 + 2 * MINUTE);
    expect(activity.rates(["#bubble", "#earth"], T0 + 2 * MINUTE)).toEqual(
      new Map([
        ["#bubble", 3 / 5],
        ["#earth", 1 / 5],
      ]),
    );
  });

  it("forgets a minute once it is five minutes old", () => {
    const activity = makeActivity();
    activity.count("#bubble", "a", T0);
    activity.count("#bubble", "b", T0 + MINUTE);
    expect(activity.rates(["#bubble"], T0 + 5 * MINUTE - 1)).toEqual(new Map([["#bubble", 2 / 5]]));
    expect(activity.rates(["#bubble"], T0 + 5 * MINUTE)).toEqual(new Map([["#bubble", 1 / 5]]));
    expect(activity.rates(["#bubble"], T0 + 6 * MINUTE)).toEqual(new Map([["#bubble", 0]]));
  });

  it("counts an account 10 times a minute at most, so one spammer cannot fake a storm", () => {
    const activity = makeActivity();
    for (let n = 0; n < 1000; n += 1) activity.count("#bubble", "spammer", T0 + n);
    activity.count("#bubble", "someone", T0 + 1000);
    expect(activity.rates(["#bubble"], T0 + 1000)).toEqual(new Map([["#bubble", 11 / 5]]));
    activity.count("#bubble", "spammer", T0 + MINUTE);
    expect(activity.rates(["#bubble"], T0 + MINUTE)).toEqual(new Map([["#bubble", 12 / 5]]));
  });

  it("caps an account across rooms, not in each: 10 a minute in all", () => {
    const activity = makeActivity();
    for (let n = 0; n < 10; n += 1) activity.count("#a", "spammer", T0 + n);
    for (let n = 0; n < 10; n += 1) activity.count("#b", "spammer", T0 + 10 + n);
    expect(activity.rates(["#a", "#b"], T0 + 20)).toEqual(
      new Map([
        ["#a", 10 / 5],
        ["#b", 0],
      ]),
    );
  });

  it("counts five whole minutes, the current one included: a message late in a minute goes with it", () => {
    const activity = makeActivity();
    activity.count("#bubble", "a", T0 + MINUTE - 1);
    expect(activity.rates(["#bubble"], T0 + 5 * MINUTE - 1)).toEqual(new Map([["#bubble", 1 / 5]]));
    expect(activity.rates(["#bubble"], T0 + 5 * MINUTE)).toEqual(new Map([["#bubble", 0]]));
  });

  it("counts no minute ahead of the clock, should the clock go back", () => {
    const activity = makeActivity();
    activity.count("#bubble", "a", T0 + 2 * MINUTE);
    expect(activity.rates(["#bubble"], T0)).toEqual(new Map([["#bubble", 0]]));
  });

  it("still counts its live rooms and new accounts once full", () => {
    const activity = makeActivity();
    activity.count("#live", "first", T0);
    for (let n = 0; n < 10_000; n += 1) activity.count(`#room-${String(n)}`, `r${String(n)}`, T0);
    for (let n = 0; n < 100_000; n += 1) activity.count("#live", `account-${String(n)}`, T0 + MINUTE);
    activity.count("#live", "a-newcomer", T0 + MINUTE);
    activity.count("#late", "someone", T0 + MINUTE);
    expect(activity.rates(["#live", "#late"], T0 + MINUTE)).toEqual(
      new Map([
        ["#live", (1 + 100_000 + 1) / 5],
        ["#late", 0],
      ]),
    );
  });

  it("answers for the rooms asked only, and a room it never counted as none", () => {
    const activity = makeActivity();
    activity.count("#bubble", "a", T0);
    expect(activity.rates(["#earth"], T0)).toEqual(new Map([["#earth", 0]]));
  });

  // Its bound is memory's, not time's: 170,000 counts get 30 s, which a machine busy with merge checks needs (F833).
  it("stays bounded: 100,000 accounts, then 20,000 rooms, hold at most their caps", { timeout: 30_000 }, () => {
    const activity = makeActivity();
    for (let n = 0; n < 150_000; n += 1) activity.count("#bubble", `account-${String(n)}`, T0);
    for (let n = 0; n < 20_000; n += 1) activity.count(`#room-${String(n)}`, `r${String(n)}`, T0 + MINUTE);
    expect(activity.size()).toEqual({ accounts: 100_000, rooms: 10_000, minutes: 10_000 });
  });

  it("keeps a room's last five minutes alone, however many minutes it has counted", () => {
    const activity = makeActivity();
    for (let n = 0; n < 1000; n += 1) activity.count("#bubble", `a${String(n)}`, T0 + n * MINUTE);
    expect(activity.size().minutes).toBeLessThanOrEqual(5);
  });
});
