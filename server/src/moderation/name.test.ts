import { describe, expect, it, vi } from "vitest";
import type { Rules } from "../roles/roles.ts";
import { answer } from "../testing/answers.ts";
import type { Answer } from "./provider.ts";
import { withBreaker } from "./check.ts";
import { makeNameChecker } from "./name.ts";

// A room's name goes through what a message of its world goes through (D394): the world's rules, then the provider.
const RULES: Rules = { bannedWords: ["spam"], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };

const setup = (provider: ((text: string) => Promise<Answer | "unchecked">) | undefined, clock = { now: 0 }) => {
  const asked: string[] = [];
  const check = makeNameChecker({
    rulesOf: (world) => (world === "earth" ? RULES : undefined),
    // The breaker is the server's one, made around the provider before the name check sees it (checker.ts's providerOf).
    provider:
      provider === undefined
        ? undefined
        : withBreaker(
            (text) => {
              asked.push(text);
              return provider(text);
            },
            { now: () => clock.now, log: () => undefined },
          ),
    thresholds: {},
  });
  return { check, asked };
};

describe("a room's name checked", () => {
  it("passes a clean name the provider clears, reading it as words (hyphens as spaces)", async () => {
    const { check, asked } = setup(() => Promise.resolve(answer()));
    expect(await check("earth", "coffee-lovers")).toBe("pass");
    expect(asked).toEqual(["coffee lovers"]);
  });

  it("hides a name with a banned word of its world, whole across hyphens, and never asks the provider", async () => {
    const { check, asked } = setup(() => Promise.resolve(answer()));
    expect(await check("earth", "buy-spam-now")).toBe("hide");
    expect(await check("earth", "spam")).toBe("hide");
    expect(asked).toEqual([]);
  });

  it("hides a name the provider flags", async () => {
    const { check } = setup(() => Promise.resolve(answer({ hate: true }, { hate: 0.9 })));
    expect(await check("earth", "bad-name")).toBe("hide");
  });

  it("leaves a name unchecked when the provider fails, answers unchecked or is not set", async () => {
    expect(await setup(() => Promise.resolve("unchecked")).check("earth", "fine")).toBe("unchecked");
    expect(await setup(() => Promise.reject(new Error("down"))).check("earth", "fine")).toBe("unchecked");
    expect(await setup(undefined).check("earth", "fine")).toBe("unchecked");
  });

  it("hides a name of a world the file does not name, with no provider call", async () => {
    const provider = vi.fn(() => Promise.resolve(answer()));
    const { check } = setup(provider);
    expect(await check("nowhere", "fine")).toBe("hide");
    expect(provider).not.toHaveBeenCalled();
  });

  it("stops asking the provider for 30 seconds after five failures running, as a message's check does", async () => {
    const provider = vi.fn(() => Promise.resolve<Answer | "unchecked">("unchecked"));
    const { check } = setup(provider);
    for (let n = 0; n < 7; n += 1) await check("earth", "fine");
    expect(provider).toHaveBeenCalledTimes(5);
  });

  it("asks the provider again 30 seconds after the pause", async () => {
    const provider = vi.fn(() => Promise.resolve<Answer | "unchecked">("unchecked"));
    const clock = { now: 0 };
    const { check } = setup(provider, clock);
    for (let n = 0; n < 6; n += 1) await check("earth", "fine");
    clock.now = 30_001;
    await check("earth", "fine");
    expect(provider).toHaveBeenCalledTimes(6);
  });

  it("reads a banned word as a message's check does: full-width, accented or with a zero-width character", async () => {
    const { check, asked } = setup(() => Promise.resolve(answer()));
    for (const name of ["ｓｐａｍ", "spám", "sp\u200bam"]) expect(await check("earth", name)).toBe("hide");
    expect(asked).toEqual([]);
  });

  it("passes a name whose score stays under the world's threshold though the provider flagged nothing", async () => {
    const { check } = setup(() => Promise.resolve(answer({}, { hate: 0.2 })));
    expect(await check("earth", "fine")).toBe("pass");
  });
});
