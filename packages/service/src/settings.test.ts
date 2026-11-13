import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect } from "node:util";
import { absolute, host, isOrigin, keyFile, list, parseSettings, port, readWord, Secret, whole } from "./settings.ts";

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

describe("whole", () => {
  const env = () => z.object({ N: whole(100, 7) });
  it("reads a plain whole number from 1 to the maximum, the default when none is set", () => {
    expect(parseSettings(env(), {})).toEqual({ N: 7 });
    expect(parseSettings(env(), { N: "1" })).toEqual({ N: 1 });
    expect(parseSettings(env(), { N: "10" })).toEqual({ N: 10 });
    expect(parseSettings(env(), { N: "100" })).toEqual({ N: 100 });
    expect(parseSettings(env(), { N: "99" })).toEqual({ N: 99 });
    expect(() => parseSettings(env(), { N: "101" })).toThrow(/^setting N: too_big$/);
  });

  it.each(["0", "01", "-1", "+1", "1.5", "1a", "a1", "1 ", " 1", "1\n", "", "\n1", "x"])("refuses %j", (text) => {
    expect(() => parseSettings(env(), { N: text })).toThrow(/^setting N: invalid_format$/);
  });
});

describe("port", () => {
  const env = () => z.object({ PORT: port() });
  it.each([
    ["0", 0],
    ["1", 1],
    ["80", 80],
    ["65535", 65535],
    ["12345", 12345],
  ])("reads %s", (text, value) => {
    expect(parseSettings(env(), { PORT: text })).toEqual({ PORT: value });
  });

  it.each(["00", "01", "-1", "1.5", "1a", "a1", "1 ", " 1", "0 ", "0a", "a0", "123456", "x", "", "1\n", "\n0"])(
    "refuses %j",
    (text) => {
      expect(() => parseSettings(env(), { PORT: text })).toThrow(/^setting PORT: invalid_format$/);
    },
  );

  it("refuses a port above 65535", () => {
    expect(() => parseSettings(env(), { PORT: "65536" })).toThrow(/^setting PORT: too_big$/);
    expect(() => parseSettings(env(), { PORT: "99999" })).toThrow(/^setting PORT: too_big$/);
  });
});

describe("list", () => {
  const env = () => z.object({ L: list(z.string().regex(/^[a-z]+$/)) });
  it("is empty when empty or unset, else the entries parted by commas", () => {
    expect(parseSettings(env(), {})).toEqual({ L: [] });
    expect(parseSettings(env(), { L: "" })).toEqual({ L: [] });
    expect(parseSettings(env(), { L: "a" })).toEqual({ L: ["a"] });
    expect(parseSettings(env(), { L: "a,bc" })).toEqual({ L: ["a", "bc"] });
  });

  it("names the entry that is wrong by its place", () => {
    expect(() => parseSettings(env(), { L: "a,B" })).toThrow(/^setting L: invalid_format \(at 1\)$/);
  });
});

describe("isOrigin", () => {
  it.each(["http://example.com", "https://example.com", "https://example.com:8443", "http://127.0.0.1:3000"])(
    "takes %s",
    (text) => {
      expect(isOrigin(text)).toBe(true);
    },
  );

  it.each([
    ["not a URL", "example.com"],
    ["empty", ""],
    ["a scheme that is not http", "ftp://example.com"],
    ["a scheme with an origin of its own", "ws://example.com"],
    ["a trailing slash", "https://example.com/"],
    ["a path", "https://example.com/a"],
    ["a query", "https://example.com?a=1"],
    ["credentials", "https://user@example.com"],
    ["a capital in the host", "https://EXAMPLE.com"],
    ["a default port written out", "https://example.com:443"],
    ["a file URL", "file:///etc/passwd"],
    ["an opaque origin", "data:text/plain,a"],
  ])("refuses %s", (_case, text) => {
    expect(isOrigin(text)).toBe(false);
  });
});

describe("absolute", () => {
  it.each(["/a", "/a/b", "/var/lib/gnoworld", "/a.b/c..d"])("takes %s", (path) => {
    expect(absolute.safeParse(path).success).toBe(true);
  });

  it.each([
    "/",
    "",
    "a",
    "a/b",
    "//a",
    "/a//b",
    "/a/",
    "/.",
    "/..",
    "/a/.",
    "/a/..",
    "/a/./b",
    "/a/../b",
    "/../a",
    "./a",
  ])("refuses %j", (path) => {
    expect(absolute.safeParse(path).success).toBe(false);
  });
});

describe("Secret", () => {
  it("prints [redacted] in every way, and reveals its value only through reveal()", () => {
    const secret = new Secret("planted-secret-value");
    expect(secret.toJSON()).toBe("[redacted]");
    expect(secret.toString()).toBe("[redacted]");
    expect(String(secret)).toBe("[redacted]");
    expect(JSON.stringify({ secret })).toBe('{"secret":"[redacted]"}');
    expect(inspect(secret)).toBe("[redacted]");
    expect(secret.reveal()).toBe("planted-secret-value");
  });
});

describe("readWord", () => {
  const dir = mkdtempSync(join(tmpdir(), "gnoworld-readword-"));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const made = (name: string, text: string) => {
    const path = join(dir, name);
    writeFileSync(path, text);
    return path;
  };

  it("takes a word of 256 characters and no more", () => {
    expect(readWord("K", made("max", "k".repeat(256)))).toBe("k".repeat(256));
    expect(() => readWord("K", made("over", "k".repeat(257)))).toThrow(/^setting K: too_long$/);
  });
});
