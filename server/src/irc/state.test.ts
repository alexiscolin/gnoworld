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
});
