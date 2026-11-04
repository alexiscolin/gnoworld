import { describe, expect, it } from "vitest";
import { z } from "zod";
import { host, parseSettings } from "./settings.ts";

// config.test.ts and jarvis/config.test.ts read these through their settings; this file holds what neither reaches.
describe("host", () => {
  it("reads a host of 1 to 253 characters, the loopback when none is set", () => {
    const Env = z.object({ HOST: host() });
    expect(parseSettings(Env, {})).toEqual({ HOST: "127.0.0.1" });
    expect(parseSettings(Env, { HOST: "h".repeat(253) })).toEqual({ HOST: "h".repeat(253) });
    expect(() => parseSettings(Env, { HOST: "h".repeat(254) })).toThrow(/^setting HOST: too_big$/);
    expect(() => parseSettings(Env, { HOST: "" })).toThrow(/^setting HOST: too_small$/);
  });
});

describe("parseSettings", () => {
  it("names an entry nested in lists by every step of its place, never its value", () => {
    const Grid = z.object({
      GRID: z
        .string()
        .transform((text) => text.split(";").map((row) => row.split(",")))
        .pipe(z.array(z.array(z.string().regex(/^[a-z]+$/)))),
    });
    expect(parseSettings(Grid, { GRID: "ab,cd;ef" })).toEqual({ GRID: [["ab", "cd"], ["ef"]] });
    expect(() => parseSettings(Grid, { GRID: "ab,cd;ef,planted-value" })).toThrow(
      /^setting GRID: invalid_format \(at 1\.1\)$/,
    );
  });
});
