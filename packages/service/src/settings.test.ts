import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect } from "node:util";
import { host, keyFile, parseSettings } from "./settings.ts";

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

describe("keyFile", () => {
  const dir = mkdtempSync(join(tmpdir(), "gnoworld-keyfile-"));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const made = (name: string, text: string) => {
    const path = join(dir, name);
    writeFileSync(path, text);
    return path;
  };
  const KEY = `k${"0".repeat(31)}`;

  it("reads a key without its newline, into a value that never prints", () => {
    const key = keyFile("DOOR_KEY_FILE", made("ok", `${KEY}\n`), true);
    expect(key?.reveal()).toBe(KEY);
    expect(inspect(key) + JSON.stringify(key) + String(key)).not.toContain(KEY);
  });

  it("is none for no file when none is required, and an error naming the setting when one is", () => {
    expect(keyFile("DOOR_KEY_FILE", undefined, false)).toBeUndefined();
    expect(() => keyFile("DOOR_KEY_FILE", undefined, true)).toThrow(/^setting DOOR_KEY_FILE: required$/);
  });

  it.each([
    ["a file that is not there", join(dir, "none"), /^setting DOOR_KEY_FILE: unreadable$/],
    ["31 bytes", made("short", "k".repeat(31)), /^setting DOOR_KEY_FILE: too_short$/],
    ["a space inside", made("space", `${KEY} x`), /^setting DOOR_KEY_FILE: invalid_characters$/],
  ])("refuses %s, required or not, never printing the key", (_case, path, message) => {
    for (const required of [true, false]) expect(() => keyFile("DOOR_KEY_FILE", path, required)).toThrow(message);
  });

  it("takes 32 bytes, the shortest", () => {
    expect(keyFile("DOOR_KEY_FILE", made("min", "k".repeat(32)), true)?.reveal()).toBe("k".repeat(32));
  });
});
