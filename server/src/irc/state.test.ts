import { parseLine } from "@gnoworld/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { roomStates, type States } from "./state.ts";

afterEach(() => {
  vi.useRealTimers();
});

// Ergo's answers, read as the link reads them.
const hear = (states: States, ...lines: string[]): void => {
  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed.ok) throw new Error(`not a line: ${line}`);
    states.read(parsed.message);
  }
};
const silent = (): void => undefined;

describe("a room's state as the link reads it", () => {
  it("reads an invite as an account only when Ergo writes it <account>!*@*, any other mask whole (F565)", async () => {
    vi.useFakeTimers();
    const states = roomStates(1000);
    const asked = states.ask(silent, "#bubble");
    const masks = ["g1a!*@*.evil", "x!g1a!*@*", "a!b@*", "g1b!*@*"];
    hear(
      states,
      ":e 324 gnoworld #bubble +Mi",
      ...masks.map((mask) => `:e 346 gnoworld #bubble ${mask} gnoworld 1`),
      ":e 366 gnoworld #bubble :End",
    );
    expect((await asked)?.invites).toEqual(["g1a!*@*.evil", "x!g1a!*@*", "a!b@*", "g1b"]);
  });

  it("answers every question in flight with no state once its connection closes, and asks anew after (F566)", async () => {
    vi.useFakeTimers();
    const states = roomStates(60_000);
    const written: string[] = [];
    const write = (command: string, params: readonly string[]): void => {
      written.push([command, ...params].join(" "));
    };
    const [a, b] = [states.ask(write, "#a"), states.ask(write, "#b")];
    states.drop();
    expect([await a, await b]).toEqual([undefined, undefined]);
    const later = states.ask(write, "#a");
    expect(written.filter((line) => line === "MODE #a")).toHaveLength(2);
    states.drop();
    expect(await later).toBeUndefined();
  });

  it("gives up on a question at its own time, never at an earlier answered one's (F567)", async () => {
    vi.useFakeTimers();
    const states = roomStates(1000);
    const first = states.ask(silent, "#a");
    hear(states, ":e 324 gnoworld #a +M", ":e 366 gnoworld #a :End");
    expect((await first)?.flags).toBe("M");
    vi.advanceTimersByTime(500);
    const second = states.ask(silent, "#a");
    // Past the first question's time, before the second's.
    vi.advanceTimersByTime(600);
    hear(states, ":e 324 gnoworld #a +Mi", ":e 366 gnoworld #a :End");
    expect((await second)?.flags).toBe("Mi");
  });

  it("asks a room once while a question about it is under way, and gives both askers its answer (F567)", async () => {
    vi.useFakeTimers();
    const states = roomStates(1000);
    const written: string[] = [];
    const write = (command: string, params: readonly string[]): void => {
      written.push([command, ...params].join(" "));
    };
    const [a, b] = [states.ask(write, "#a"), states.ask(write, "#a")];
    expect(written).toEqual(["MODE #a", "SAMODE #a I", "NAMES #a"]);
    hear(states, ":e 324 gnoworld #a +M", ":e 366 gnoworld #a :End");
    expect([await a, await b]).toEqual([
      { flags: "M", invites: [], present: [] },
      { flags: "M", invites: [], present: [] },
    ]);
  });
});
