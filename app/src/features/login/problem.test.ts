import { describe, expect, it, vi } from "vitest";
import { sayProblem } from "./problem.ts";

describe("sayProblem", () => {
  // F674: the login says why an address is refused, each reason its own words.
  it.each([
    ["empty", /no address/],
    ["case", /lower case/],
    ["prefix", /starts with g1/],
    ["characters", /a character a gno address never holds/],
    ["length", /40 characters/],
    ["checksum", /checksum/],
  ] as const)("says what is wrong with Adena's address: %s", (problem, words) => {
    expect(sayProblem({ reason: "address", problem })).toMatch(words);
  });

  it.each([
    ["missing", /Install Adena/],
    ["outdated", /Update Adena/],
    ["declined", /declined/],
    ["refused", /did not accept/],
    ["locked", /Unlock Adena/],
    ["no-account", /no account/],
    ["mismatch", /another account or network/],
    ["too-long", /too long/],
    ["failed", /Adena could not answer/],
    ["too_many", /wait a minute/],
    ["network", /could not be reached/],
    ["unavailable", /not available right now/],
    ["internal", /not available right now/],
    ["not_ready", /not available right now/],
    ["unauthenticated", /log in again/],
    ["forbidden", /not allowed/],
  ] as const)("says what to do when the login stopped for %s", (reason, words) => {
    expect(sayProblem({ reason })).toMatch(words);
  });

  it.each(["malformed", "not_found", "too_large", "unsupported"] as const)(
    "says something unexpected came back for %s, and to try again",
    (reason) => {
      expect(sayProblem({ reason })).toMatch(/unexpected.*try again/i);
    },
  );

  it("never says a server's refusal is the person's doing, nor names its code", () => {
    expect(sayProblem({ reason: "refused" })).not.toMatch(/declined|refused|400/);
  });
});

describe("sayShort", () => {
  // Loaded afresh inside the test: the function is made as its module loads, which a planted change reaches only when it loads after.
  it("gives a stopped login's button its few words", async () => {
    vi.resetModules();
    const { sayShort } = await import("./problem.ts");
    expect(sayShort({ reason: "missing" })).toBe("Install Adena");
    expect(sayShort({ reason: "address", problem: "empty" })).toBe("Check Adena's address");
  });
});
