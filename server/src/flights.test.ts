import { describe, expect, it } from "vitest";
import { keptFlights, singleFlight } from "./flights.ts";

const deferred = <T>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
};

describe("singleFlight", () => {
  it("gives two asks at once one start, and starts a settled key again", async () => {
    const flights = singleFlight<number>();
    const first = deferred<number>();
    let starts = 0;
    const start = () => {
      starts += 1;
      return first.promise;
    };
    const running = flights.start("k", start);
    expect(flights.get("k")).toBe(running);
    expect([flights.get("other"), flights.size()]).toEqual([undefined, 1]);
    first.resolve(7);
    expect(await running).toBe(7);
    expect([flights.get("k"), flights.size()]).toEqual([undefined, 0]);
    await flights.start("k", () => {
      starts += 1;
      return Promise.resolve(8);
    });
    expect(starts).toBe(2);
  });

  it("lets a key go once its flight rejects", async () => {
    const flights = singleFlight<number>();
    await expect(flights.start("k", () => Promise.reject(new Error("down")))).rejects.toThrow("down");
    expect(flights.get("k")).toBeUndefined();
  });
});

describe("keptFlights", () => {
  const setup = (perSecond = 10) => {
    const clock = { now: 0 };
    let starts = 0;
    const read = keptFlights<string>({
      now: () => clock.now,
      perSecond,
      most: 2,
      until: (value) => (value === "unsure" ? undefined : clock.now + 1000),
    });
    const ask = (key: string, value = key) =>
      read(key, () => {
        starts += 1;
        return Promise.resolve(value);
      });
    return { clock, ask, starts: () => starts };
  };

  it("keeps a read until its time, then reads again", async () => {
    const t = setup();
    expect(await t.ask("a")).toBe("a");
    expect(await t.ask("a")).toBe("a");
    expect(t.starts()).toBe(1);
    t.clock.now += 1000;
    await t.ask("a");
    expect(t.starts()).toBe(2);
  });

  it("keeps nothing its time says not to, and holds its cap of keys", async () => {
    const t = setup();
    await t.ask("u", "unsure");
    await t.ask("u", "unsure");
    expect(t.starts()).toBe(2);
    for (const key of ["a", "b", "c"]) await t.ask(key);
    await t.ask("a");
    expect(t.starts()).toBe(6);
  });

  it("joins a read under way, and answers limit past the bucket, spent by a start alone", async () => {
    const t = setup(1);
    const first = t.ask("a");
    expect(t.ask("a")).toBe(first);
    expect(t.ask("b")).toBe("limit");
    await first;
    expect(await t.ask("a")).toBe("a");
    expect(t.starts()).toBe(1);
  });
});
