import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { toAddress } from "@gnoworld/schemas";
import { loadConfig } from "./config.ts";

const dir = mkdtempSync(join(tmpdir(), "gnoworld-config-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
const file = (name: string, content: string): string => {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
};
const PEPPER = "a-pepper-of-forty-characters-0123456789";
const ENV = { DATABASE: join(dir, "server.db"), LOG_PEPPER_FILE: file("pepper", `${PEPPER}\n`) };

// The whole error as a crash would print it: its message, its stack and its causes.
const failure = (env: Record<string, string | undefined>): string => {
  try {
    loadConfig(env);
  } catch (error) {
    return inspect(error, { depth: 5 });
  }
  throw new Error("loadConfig accepted the settings");
};

const MUTE = { strikes: 3, windowMinutes: 10, minutes: 5, max: 50 };

describe("loadConfig", () => {
  it("reads the settings, with the defaults, and the pepper from its file without its newline", () => {
    expect(loadConfig(ENV)).toEqual({
      host: "127.0.0.1",
      port: 8080,
      database: ENV.DATABASE,
      trustedProxy: undefined,
      pepper: PEPPER,
      roles: fileURLToPath(new URL("../roles.json", import.meta.url)),
      chains: ["onyx-1", "gnoland-1"],
      origins: [],
      newAccountsPerHour: 5,
      guests: { on: true, perVisitor: 10, perHour: 600, living: 5000 },
      moderation: { openaiKey: undefined, thresholds: {}, newAccountHours: 24, mute: MUTE },
    });
  });

  it("reads the login's lists, each item as it is sent", () => {
    expect(
      loadConfig({
        ...ENV,
        CHAINS: "test5",
        ORIGINS: "https://gnoworld.test,http://localhost:5173",
        NEW_ACCOUNTS_PER_HOUR: "1000",
      }),
    ).toMatchObject({
      chains: ["test5"],
      origins: ["https://gnoworld.test", "http://localhost:5173"],
      newAccountsPerHour: 1000,
    });
    expect(
      loadConfig({ ...ENV, CHAINS: "c".repeat(50), ORIGINS: "http://[::1]:5173", NEW_ACCOUNTS_PER_HOUR: "1" }),
    ).toMatchObject({
      chains: ["c".repeat(50)],
      origins: ["http://[::1]:5173"],
      newAccountsPerHour: 1,
    });
  });

  // D218: every world can be first charted (D210) unless the setting names the worlds that can; the journeys' server names
  // govdao alone, so the worlds the other journeys open are never charted.
  it("reads the worlds that can be first charted: every world when unset, else the slugs named, refusing any other word", () => {
    expect(loadConfig(ENV).firstToChart).toBeUndefined();
    expect(loadConfig({ ...ENV, FIRST_TO_CHART_WORLDS: "govdao" }).firstToChart).toEqual(new Set(["govdao"]));
    expect(loadConfig({ ...ENV, FIRST_TO_CHART_WORLDS: "govdao,fresh-mint" }).firstToChart).toEqual(
      new Set(["govdao", "fresh-mint"]),
    );
    for (const bad of ["", "GovDAO", "govdao,", "gov dao", "a".repeat(41)])
      expect(failure({ ...ENV, FIRST_TO_CHART_WORLDS: bad })).toMatch(/setting FIRST_TO_CHART_WORLDS: /);
  });

  it("reads the socket Ergo's auth script dials, an absolute path a socket can hold; none by default", () => {
    expect(loadConfig(ENV).authSocket).toBeUndefined();
    expect(loadConfig({ ...ENV, AUTH_SOCKET: "/run/gnoworld/auth.sock" }).authSocket).toBe("/run/gnoworld/auth.sock");
    expect(loadConfig({ ...ENV, AUTH_SOCKET: `/${"s".repeat(99)}` }).authSocket).toBe(`/${"s".repeat(99)}`);
    // A socket's path holds about 100 bytes, not characters: é takes two.
    for (const path of ["", "run/auth.sock", `/${"s".repeat(100)}`, `/${"é".repeat(50)}`]) {
      expect(failure({ ...ENV, AUTH_SOCKET: path })).toMatch(/setting AUTH_SOCKET: /);
    }
  });

  it("reads Ergo's data folder, read-only, and its cap in MB, 1024 by default; none by default (3n-b)", () => {
    const MB = 1024 * 1024;
    expect(loadConfig(ENV).ergoData).toBeUndefined();
    expect(loadConfig({ ...ENV, ERGO_DATA: "/ergo" }).ergoData).toEqual({ dir: "/ergo", maxBytes: 1024 * MB });
    expect(loadConfig({ ...ENV, ERGO_DATA: "/ergo", ERGO_DATA_MB: "1" }).ergoData).toEqual({
      dir: "/ergo",
      maxBytes: MB,
    });
    expect(loadConfig({ ...ENV, ERGO_DATA: "/var/lib/ergo.d" }).ergoData).toMatchObject({ dir: "/var/lib/ergo.d" });
    expect(loadConfig({ ...ENV, ERGO_DATA: "/e", ERGO_DATA_MB: "1048576" }).ergoData).toEqual({
      dir: "/e",
      maxBytes: 1024 * 1024 * MB,
    });
    for (const [key, value] of [
      ["ERGO_DATA", ""],
      ["ERGO_DATA", "ergo"],
      ["ERGO_DATA", "ergo/data"],
      // The whole disk, /proc included, walked at each tick (3NB-6).
      ["ERGO_DATA", "/"],
      ["ERGO_DATA", "/ergo/.."],
      ["ERGO_DATA", "/../"],
      // The root again, spelled otherwise: empty and "." segments (F636).
      ["ERGO_DATA", "//"],
      ["ERGO_DATA", "///"],
      ["ERGO_DATA", "/."],
      ["ERGO_DATA", "/./"],
      ["ERGO_DATA", "/ergo/"],
      ["ERGO_DATA", "/ergo/./data"],
      ["ERGO_DATA_MB", "0"],
      ["ERGO_DATA_MB", "1048577"],
      ["ERGO_DATA_MB", "1.5"],
      ["ERGO_DATA_MB", "1e3"],
      ["ERGO_DATA_MB", " 5"],
      ["ERGO_DATA_MB", "05"],
      ["ERGO_DATA_MB", ""],
    ] as const) {
      expect(failure({ ...ENV, ERGO_DATA: "/ergo", [key]: value })).toMatch(new RegExp(`setting ${key}: `));
    }
    // A cap with no folder is a measure meant that would not come: the server stops rather than run blind.
    expect(failure({ ...ENV, ERGO_DATA_MB: "100" })).toMatch(/setting ERGO_DATA: required/);
  });

  it("reads the file the prices timer writes: absolute, none by default, so no timer (5l)", () => {
    expect(loadConfig(ENV).markets).toBeUndefined();
    expect(loadConfig({ ...ENV, MARKETS_FILE: "/srv/markets/markets.json" }).markets).toBe("/srv/markets/markets.json");
    for (const value of [
      "",
      "markets.json",
      "./markets.json",
      "/",
      "/srv/../markets.json",
      "/srv//markets.json",
      "/srv/",
      "/.",
    ]) {
      expect(failure({ ...ENV, MARKETS_FILE: value })).toMatch(/setting MARKETS_FILE: /);
    }
  });

  it("reads the file the worlds job writes: absolute, none by default (7c)", () => {
    const universes = "/app/app/data/universes.json";
    expect(loadConfig(ENV).worlds).toBeUndefined();
    expect(loadConfig({ ...ENV, WORLDS_FILE: "/markets/worlds.json", UNIVERSES_FILE: universes }).worlds).toBe(
      "/markets/worlds.json",
    );
    for (const value of [
      "",
      "worlds.json",
      "./worlds.json",
      "/",
      "/srv/../worlds.json",
      "/srv//worlds.json",
      "/srv/",
    ]) {
      expect(failure({ ...ENV, UNIVERSES_FILE: universes, WORLDS_FILE: value })).toMatch(/setting WORLDS_FILE: /);
    }
  });

  it("reads the file the preview job writes: absolute, none by default (8f)", () => {
    const universes = "/app/app/data/universes.json";
    expect(loadConfig(ENV).previews).toBeUndefined();
    expect(loadConfig({ ...ENV, PREVIEWS_FILE: "/markets/previews.json", UNIVERSES_FILE: universes }).previews).toBe(
      "/markets/previews.json",
    );
    for (const value of [
      "",
      "previews.json",
      "./previews.json",
      "/",
      "/srv/../previews.json",
      "/srv//previews.json",
      "/srv/",
    ]) {
      expect(failure({ ...ENV, UNIVERSES_FILE: universes, PREVIEWS_FILE: value })).toMatch(/setting PREVIEWS_FILE: /);
    }
  });

  // The home's block height (2026-10-31): the universes' data names the RPC the prices timer reads it from.
  it("reads the universes' data file the height's RPC comes from: absolute, none by default", () => {
    expect(loadConfig(ENV).universes).toBeUndefined();
    expect(loadConfig({ ...ENV, UNIVERSES_FILE: "/app/app/data/universes.json" }).universes).toBe(
      "/app/app/data/universes.json",
    );
    for (const value of [
      "",
      "universes.json",
      "./universes.json",
      "/",
      "/srv/../universes.json",
      "/srv//u.json",
      "/srv/",
    ]) {
      expect(failure({ ...ENV, UNIVERSES_FILE: value })).toMatch(/setting UNIVERSES_FILE: /);
    }
  });

  it("reads the hubs' data file the chain's polls need: absolute, none by default, and never without the universes'", () => {
    const universes = { ...ENV, UNIVERSES_FILE: "/app/app/data/universes.json" };
    expect(loadConfig(universes).hubs).toBeUndefined();
    expect(loadConfig({ ...universes, HUBS_FILE: "/app/app/data/hubs.json" }).hubs).toBe("/app/app/data/hubs.json");
    for (const value of ["", "hubs.json", "/", "/srv/../hubs.json"])
      expect(failure({ ...universes, HUBS_FILE: value })).toMatch(/setting HUBS_FILE: /);
    expect(failure({ ...ENV, HUBS_FILE: "/app/app/data/hubs.json" })).toMatch(/setting UNIVERSES_FILE: required/);
  });

  it("names the entry of a list setting it refuses, never its value (F434)", () => {
    const error = failure({ ...ENV, ORIGINS: "https://gnoworld.test,https://bad.test/path" });
    expect(error).toMatch(/setting ORIGINS: \w+ \(at 1\)/);
    expect(error).not.toContain("bad.test");
  });

  it("reads Ergo's internal listener and its operator password from a file; no link without the file", () => {
    expect(loadConfig(ENV).ergo).toBeUndefined();
    const password = "an-operator-password-of-32-chars";
    const oper = file("oper", `${password}\n`);
    expect(loadConfig({ ...ENV, ERGO_OPER_PASSWORD_FILE: oper }).ergo).toEqual({
      host: "127.0.0.1",
      port: 6667,
      password,
    });
    expect(loadConfig({ ...ENV, ERGO_OPER_PASSWORD_FILE: oper, ERGO_HOST: "ergo", ERGO_PORT: "6668" }).ergo).toEqual({
      host: "ergo",
      port: 6668,
      password,
    });
  });

  it("takes an operator password of 256 characters, the longest", () => {
    const oper = file("oper-long", `${"p".repeat(256)}\n`);
    expect(loadConfig({ ...ENV, ERGO_OPER_PASSWORD_FILE: oper }).ergo?.password).toHaveLength(256);
  });

  it("takes Ergo's highest port and a host of 253 characters", () => {
    const oper = file("oper-edges", `${"p".repeat(32)}\n`);
    expect(
      loadConfig({ ...ENV, ERGO_OPER_PASSWORD_FILE: oper, ERGO_PORT: "65535", ERGO_HOST: "h".repeat(253) }).ergo,
    ).toEqual({ host: "h".repeat(253), port: 65_535, password: "p".repeat(32) });
  });

  it.each([
    ["ERGO_OPER_PASSWORD_FILE", { ERGO_OPER_PASSWORD_FILE: "/nonexistent/gnoworld-oper" }],
    ["ERGO_OPER_PASSWORD_FILE", { ERGO_OPER_PASSWORD_FILE: file("short-oper", "tiny-secret\n") }],
    [
      "ERGO_OPER_PASSWORD_FILE",
      { ERGO_OPER_PASSWORD_FILE: file("two-lines", `${"a".repeat(32)}\n${"b".repeat(32)}\n`) },
    ],
    ["ERGO_OPER_PASSWORD_FILE", { ERGO_OPER_PASSWORD_FILE: file("a-space", `${"a".repeat(16)} ${"b".repeat(16)}\n`) }],
    ["ERGO_OPER_PASSWORD_FILE", { ERGO_OPER_PASSWORD_FILE: file("long-oper", `${"p".repeat(257)}\n`) }],
    ["ERGO_OPER_PASSWORD_FILE", { ERGO_HOST: "ergo" }],
    ["ERGO_OPER_PASSWORD_FILE", { ERGO_PORT: "6668" }],
    ["ERGO_PORT", { ERGO_PORT: "65536" }],
    ["ERGO_PORT", { ERGO_PORT: "0" }],
    ["ERGO_PORT", { ERGO_PORT: "06667" }],
    ["ERGO_PORT", { ERGO_PORT: "6667x" }],
    ["ERGO_PORT", { ERGO_PORT: "6667 " }],
    ["ERGO_PORT", { ERGO_PORT: "-1" }],
    ["ERGO_HOST", { ERGO_HOST: "" }],
    ["ERGO_HOST", { ERGO_HOST: "h".repeat(254) }],
  ])("stops on a bad %s, naming it and never its value", (setting, env) => {
    const error = failure({ ...ENV, ...env });
    expect(error).toMatch(new RegExp(`setting ${setting}: `));
    expect(error).not.toContain("tiny-secret");
  });

  it("reads the moderation's settings: OpenAI's key from a file, thresholds by category, a new account's hours", () => {
    expect(loadConfig(ENV).moderation).toEqual({
      openaiKey: undefined,
      thresholds: {},
      newAccountHours: 24,
      mute: MUTE,
    });
    const key = `sk-${"k".repeat(40)}`;
    const env = {
      ...ENV,
      OPENAI_API_KEY_FILE: file("openai", `${key}\n`),
      MODERATION_THRESHOLDS: '{"harassment":0.9,"sexual/minors":0.01}',
      NEW_ACCOUNT_HOURS: "720",
    };
    const { openaiKey, ...rest } = loadConfig(env).moderation;
    expect([openaiKey?.reveal(), rest]).toEqual([
      key,
      { thresholds: { harassment: 0.9, "sexual/minors": 0.01 }, newAccountHours: 720, mute: MUTE },
    ]);
  });

  it.each([
    ["OPENAI_API_KEY_FILE", { OPENAI_API_KEY_FILE: "/nonexistent/gnoworld-openai" }],
    ["OPENAI_API_KEY_FILE", { OPENAI_API_KEY_FILE: file("openai-empty", "") }],
    ["OPENAI_API_KEY_FILE", { OPENAI_API_KEY_FILE: file("openai-short", "sk-tiny-secret\n") }],
    ["OPENAI_API_KEY_FILE", { OPENAI_API_KEY_FILE: file("openai-lines", `sk-${"a".repeat(40)}\r\nX-Evil: 1\n`) }],
    ["MODERATION_THRESHOLDS", { MODERATION_THRESHOLDS: "harassment=0.9" }],
    ["MODERATION_THRESHOLDS", { MODERATION_THRESHOLDS: '{"new/kind":0.5}' }],
    ["MODERATION_THRESHOLDS", { MODERATION_THRESHOLDS: '{"harassment":1.01}' }],
    ["MODERATION_THRESHOLDS", { MODERATION_THRESHOLDS: '{"harassment":-0.1}' }],
    // A threshold of 0 hides every line of its category: a typo would silence the chat (F525).
    ["MODERATION_THRESHOLDS", { MODERATION_THRESHOLDS: '{"harassment":0}' }],
    ["MODERATION_THRESHOLDS", { MODERATION_THRESHOLDS: '{"harassment":"0.9"}' }],
    ["NEW_ACCOUNT_HOURS", { NEW_ACCOUNT_HOURS: "0" }],
    ["NEW_ACCOUNT_HOURS", { NEW_ACCOUNT_HOURS: "721" }],
    ["NEW_ACCOUNT_HOURS", { NEW_ACCOUNT_HOURS: "1.5" }],
    ["MUTE_STRIKES", { MUTE_STRIKES: "0" }],
    ["MUTE_STRIKES", { MUTE_STRIKES: "100" }],
    ["MUTE_WINDOW_MINUTES", { MUTE_WINDOW_MINUTES: "0" }],
    ["MUTE_WINDOW_MINUTES", { MUTE_WINDOW_MINUTES: "1441" }],
    ["MUTE_MINUTES", { MUTE_MINUTES: "0" }],
    ["MUTE_MINUTES", { MUTE_MINUTES: "10081" }],
    ["MUTE_MINUTES", { MUTE_MINUTES: "5m" }],
    ["MUTE_MAX", { MUTE_MAX: "0" }],
    ["MUTE_MAX", { MUTE_MAX: "101" }],
    ["MUTE_STRIKES", { MUTE_STRIKES: "1.5" }],
    ["MUTE_STRIKES", { MUTE_STRIKES: "" }],
    ["MUTE_STRIKES", { MUTE_STRIKES: "03" }],
    ["MUTE_WINDOW_MINUTES", { MUTE_WINDOW_MINUTES: "1.5" }],
    ["MUTE_WINDOW_MINUTES", { MUTE_WINDOW_MINUTES: "" }],
    ["MUTE_WINDOW_MINUTES", { MUTE_WINDOW_MINUTES: "03" }],
    ["MUTE_MINUTES", { MUTE_MINUTES: "1.5" }],
    ["MUTE_MINUTES", { MUTE_MINUTES: "" }],
    ["MUTE_MINUTES", { MUTE_MINUTES: "03" }],
    ["MUTE_MAX", { MUTE_MAX: "1.5" }],
    ["MUTE_MAX", { MUTE_MAX: "" }],
    ["MUTE_MAX", { MUTE_MAX: "03" }],
  ])("stops on a bad %s, naming it and never its content", (setting, env) => {
    const error = failure({ ...ENV, ...env });
    expect(error).toMatch(new RegExp(`setting ${setting}: `));
    expect(error).not.toMatch(/sk-|tiny-secret|X-Evil|harassment=/);
  });

  it("reads the mute's settings: strikes, their window, the mute's minutes and the most at once (3k)", () => {
    const env = { ...ENV, MUTE_STRIKES: "99", MUTE_WINDOW_MINUTES: "1440", MUTE_MINUTES: "10080", MUTE_MAX: "100" };
    expect(loadConfig(env).moderation.mute).toEqual({ strikes: 99, windowMinutes: 1440, minutes: 10080, max: 100 });
    const low = { ...ENV, MUTE_STRIKES: "1", MUTE_WINDOW_MINUTES: "1", MUTE_MINUTES: "1", MUTE_MAX: "1" };
    expect(loadConfig(low).moderation.mute).toEqual({ strikes: 1, windowMinutes: 1, minutes: 1, max: 1 });
  });

  it("reads the guest chat's switch, on by default, and its limits (D430, plan 3.3)", () => {
    expect(loadConfig(ENV).guests).toEqual({ on: true, perVisitor: 10, perHour: 600, living: 5000 });
    expect(loadConfig({ ...ENV, GUEST_CHAT: "on" }).guests.on).toBe(true);
    expect(loadConfig({ ...ENV, GUEST_CHAT: "off" }).guests.on).toBe(false);
    const env = { ...ENV, GUEST_NAMES_PER_VISITOR_HOUR: "3", GUEST_NAMES_PER_HOUR: "50", GUEST_LIVING: "100" };
    expect(loadConfig(env).guests).toEqual({ on: true, perVisitor: 3, perHour: 50, living: 100 });
  });

  it("refuses a switch that is neither on nor off, naming the setting and never its value", () => {
    for (const value of ["", "OFF", "0", "false", "no", "secret-value"]) {
      const text = failure({ ...ENV, GUEST_CHAT: value });
      expect(text).toContain("GUEST_CHAT");
      expect(text).not.toContain("secret-value");
    }
  });

  it.each(["GUEST_NAMES_PER_VISITOR_HOUR", "GUEST_NAMES_PER_HOUR", "GUEST_LIVING"])(
    "refuses %s at zero, signed, padded, written with a point or past its ceiling, and takes its ceiling",
    (name) => {
      const ceiling =
        { GUEST_NAMES_PER_VISITOR_HOUR: 1000, GUEST_NAMES_PER_HOUR: 10_000, GUEST_LIVING: 50_000 }[name] ?? 0;
      for (const value of ["0", "-1", "+1", "01", "1.5", " 1", String(ceiling + 1)])
        expect(failure({ ...ENV, [name]: value })).toContain(name);
      expect(Object.values(loadConfig({ ...ENV, [name]: String(ceiling) }).guests)).toContain(ceiling);
      expect(Object.values(loadConfig({ ...ENV, [name]: "1" }).guests)).toContain(1);
    },
  );

  it("takes a new account's hours from 1, and thresholds just above 0 and of exactly 1", () => {
    expect(loadConfig({ ...ENV, NEW_ACCOUNT_HOURS: "1" }).moderation.newAccountHours).toBe(1);
    expect(
      loadConfig({ ...ENV, MODERATION_THRESHOLDS: '{"hate":0.000001,"violence":1}' }).moderation.thresholds,
    ).toEqual({ hate: 0.000001, violence: 1 });
  });

  it("never shows OpenAI's key when the settings are printed", () => {
    const key = `sk-${"z".repeat(40)}`;
    const config = loadConfig({ ...ENV, OPENAI_API_KEY_FILE: file("openai-shown", `${key}\n`) });
    expect(inspect(config, { depth: 5 })).not.toContain(key);
    expect(JSON.stringify(config)).not.toContain(key);
    // Shown as [redacted] by inspect, JSON and as a string (a template's form); reveal() alone reads it.
    const secret = config.moderation.openaiKey;
    expect([inspect(secret), JSON.stringify({ secret }), String(secret), secret?.reveal()]).toEqual([
      "[redacted]",
      '{"secret":"[redacted]"}',
      "[redacted]",
      key,
    ]);
  });

  it("names the thresholds' setting and the kind of fault when they are not JSON", () => {
    expect(failure({ ...ENV, MODERATION_THRESHOLDS: "harassment=0.9" })).toMatch(
      /Error: setting MODERATION_THRESHOLDS: custom\n/,
    );
  });

  it("reads every setting it is given", () => {
    expect(
      loadConfig({ ...ENV, HOST: "0.0.0.0", PORT: "9000", TRUSTED_PROXY: "10.0.0.2", ROLES_FILE: "/etc/roles.json" }),
    ).toMatchObject({
      roles: "/etc/roles.json",
      host: "0.0.0.0",
      port: 9000,
      trustedProxy: "10.0.0.2",
    });
    expect(loadConfig({ ...ENV, PORT: "0", TRUSTED_PROXY: "fd00::2" })).toMatchObject({
      port: 0,
      trustedProxy: "fd00::2",
    });
  });

  it.each([
    ["DATABASE", undefined],
    ["DATABASE", ""],
    ["LOG_PEPPER_FILE", undefined],
    ["LOG_PEPPER_FILE", ""],
    // A fixed path: a test's name holds it, and StrykerJS's cache matches tests by name.
    ["LOG_PEPPER_FILE", "/nonexistent/gnoworld-pepper"],
    ["PORT", ""],
    ["PORT", "-1"],
    ["PORT", "65536"],
    ["PORT", "80.5"],
    ["PORT", "http"],
    ["PORT", "1e3"],
    ["PORT", "0x50"],
    ["PORT", " 80"],
    ["PORT", "08"],
    ["HOST", ""],
    ["HOST", "h".repeat(254)],
    ["DATABASE", "d".repeat(1025)],
    ["TRUSTED_PROXY", ""],
    ["TRUSTED_PROXY", "proxy.local"],
    ["TRUSTED_PROXY", "999.1.1.1"],
    ["ROLES_FILE", ""],
    // The login refuses every chain with an empty list: it must not boot so (decision 142).
    ["CHAINS", ""],
    ["CHAINS", "onyx-1,"],
    ["CHAINS", "onyx 1"],
    ["CHAINS", "Onyx-1"],
    ["CHAINS", "c".repeat(51)],
    // An origin is written as a browser sends it: scheme, host and port, nothing more.
    ["ORIGINS", "*"],
    ["ORIGINS", "null"],
    ["ORIGINS", "gnoworld.test"],
    ["ORIGINS", "https://gnoworld.test/"],
    ["ORIGINS", "https://gnoworld.test/login"],
    ["ORIGINS", "https://GNOWORLD.test"],
    ["ORIGINS", "https://user@gnoworld.test"],
    ["ORIGINS", "ftp://gnoworld.test"],
    ["ORIGINS", "https://gnoworld.test,"],
    ["CHAINS", "onyx-1, gnoland-1"],
    ["ORIGINS", "https://gnoworld.test?x"],
    ["ORIGINS", "https://gnoworld.test#x"],
    ["ORIGINS", "https://gnoworld.test:443"],
    ["NEW_ACCOUNTS_PER_HOUR", "0"],
    ["NEW_ACCOUNTS_PER_HOUR", "1001"],
    ["NEW_ACCOUNTS_PER_HOUR", "five"],
    ["NEW_ACCOUNTS_PER_HOUR", "5.5"],
    ["NEW_ACCOUNTS_PER_HOUR", "1e2"],
    ["NEW_ACCOUNTS_PER_HOUR", "0x10"],
    ["NEW_ACCOUNTS_PER_HOUR", ""],
    ["NEW_ACCOUNTS_PER_HOUR", " 5"],
    ["NEW_ACCOUNTS_PER_HOUR", "05"],
  ])("stops on %s set to %j, naming the setting", (key, value) => {
    expect(() => loadConfig({ ...ENV, [key]: value })).toThrow(new RegExp(`^setting ${key}: `));
  });

  it("names the setting and the kind of fault, nothing else", () => {
    expect(() => loadConfig({ ...ENV, DATABASE: "" })).toThrow(/^setting DATABASE: too_small$/);
    expect(() => loadConfig({ ...ENV, PORT: "http" })).toThrow(/^setting PORT: invalid_format$/);
  });

  it("keeps why a secret's file could not be read, as the cause: the path is no secret", () => {
    let thrown: unknown;
    try {
      loadConfig({ ...ENV, LOG_PEPPER_FILE: "/nonexistent/gnoworld-pepper" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ message: "setting LOG_PEPPER_FILE: unreadable", cause: { code: "ENOENT" } });
  });

  it("takes the widest values each setting allows", () => {
    expect(loadConfig({ ...ENV, PORT: "65535", HOST: "h".repeat(253), DATABASE: "d".repeat(1024) })).toMatchObject({
      port: 65535,
    });
  });

  it.each([
    ["31 characters", "hunter2-planted-secret-31-chars"],
    ["nothing", ""],
    ["only a newline", "\n"],
  ])("stops on a pepper of %s, and never prints it", (_, pepper) => {
    const printed = failure({ ...ENV, LOG_PEPPER_FILE: file("short", `${pepper}\n`) });
    expect(printed).toMatch(/setting LOG_PEPPER_FILE: /);
    if (pepper.trim() !== "") expect(printed).not.toContain(pepper);
  });

  it("takes a pepper of 32 characters", () => {
    expect(loadConfig({ ...ENV, LOG_PEPPER_FILE: file("exact", "p".repeat(32)) }).pepper).toBe("p".repeat(32));
  });

  it.each(["PORT", "TRUSTED_PROXY", "HOST", "DATABASE"])("never prints the value of a malformed %s", (key) => {
    // Malformed for each: not a port, not an address; over a host's 253 characters or a path's 1024.
    const planted = `planted-${"s".repeat(4096)}`;
    const printed = failure({ ...ENV, [key]: planted });
    expect(printed).toMatch(new RegExp(`setting ${key}: `));
    expect(printed).not.toContain("planted-");
  });

  it("never reads a secret from the environment itself", () => {
    expect(() => loadConfig({ DATABASE: ENV.DATABASE, LOG_PEPPER: PEPPER })).toThrow(/^setting LOG_PEPPER_FILE: /);
  });
});

// 10g: the door's settings and the admin API's listener, each none by default (D93 to D96).
describe("loadConfig, Jarvis's door and the admin API", () => {
  const ANNA = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
  const BEN = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";

  it("opens no door and no admin API by default", () => {
    expect(loadConfig(ENV)).toMatchObject({ jarvis: undefined, admin: undefined });
  });

  it("reads the door's settings once jarvis's address is set, with their defaults", () => {
    expect(loadConfig({ ...ENV, JARVIS_URL: "http://jarvis:8090" }).jarvis).toEqual({
      on: false,
      url: "http://jarvis:8090",
      timeoutMs: 1_500_000,
      questionChars: 500,
      first: { quota: 20, quotaUnnamed: 5, unlimited: [] },
      namesRpc: "https://rpc.gno.land",
      namesChain: "gnoland-1",
    });
  });

  it("switches Jarvis on only for JARVIS=on exactly, off for anything else, never stopping the server (Alexis, off by default)", () => {
    const JARVIS_DOOR_KEY_FILE = file("door-on", "d".repeat(32));
    const door = (value: string | undefined) =>
      loadConfig({
        ...ENV,
        JARVIS_URL: "http://jarvis:8090",
        JARVIS_DOOR_KEY_FILE,
        ...(value === undefined ? {} : { JARVIS: value }),
      }).jarvis?.on;
    expect([undefined, "", "ON", "yes", "1", " on", "on "].map(door)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(door("on")).toBe(true);
    expect(loadConfig({ ...ENV, JARVIS: "on" }).jarvis).toBeUndefined();
  });

  // 10u-g2: the key the door proves itself to jarvis with, from a file, never printed.
  describe("the door's key", () => {
    const URL = { ...ENV, JARVIS_URL: "http://jarvis:8090" };
    const DOOR = `d${"0".repeat(31)}`;

    it("reads the key from its file without its newline, into a value that never prints", () => {
      const key = loadConfig({ ...URL, JARVIS_DOOR_KEY_FILE: file("door-read", `${DOOR}\n`) }).jarvis?.key;
      expect(key?.reveal()).toBe(DOOR);
      expect(inspect(key) + JSON.stringify(key)).not.toContain(DOOR);
    });

    it("has none while off with no file", () => {
      expect(loadConfig(URL).jarvis?.key).toBeUndefined();
    });

    it("refuses to start on without the file, naming the setting", () => {
      expect(failure({ ...URL, JARVIS: "on" })).toMatch(/^Error: setting JARVIS_DOOR_KEY_FILE: required/);
    });

    it.each([
      ["a file that does not exist", "/nonexistent/door", /unreadable/],
      ["a key of 31 bytes", file("door-31", "k".repeat(31)), /too_short/],
      ["an empty file", file("door-none", ""), /too_short/],
    ])("refuses %s, off or on, never printing a key", (_case, path, message) => {
      for (const JARVIS of ["on", "off"]) {
        expect(failure({ ...URL, JARVIS, JARVIS_DOOR_KEY_FILE: path })).toMatch(message);
      }
    });

    it("takes a key of 32 bytes, the shortest", () => {
      const env = { ...URL, JARVIS: "on", JARVIS_DOOR_KEY_FILE: file("door-32", "k".repeat(32)) };
      expect(loadConfig(env).jarvis?.on).toBe(true);
    });

    it("stops the server for a key file named with no jarvis address", () => {
      expect(failure({ ...ENV, JARVIS_DOOR_KEY_FILE: file("door-orphan", DOOR) })).toContain("JARVIS_URL");
    });
  });

  it("reads every door setting it is given, the widest each allows", () => {
    const env = {
      ...ENV,
      JARVIS_URL: "https://jarvis.internal:8443",
      JARVIS_DOOR_KEY_FILE: file("door-wide", "d".repeat(32)),
      JARVIS_TIMEOUT_S: "3600",
      JARVIS_QUESTION_CHARS: "8000",
      JARVIS_QUOTA: "1000",
      JARVIS_QUOTA_UNNAMED: "1",
      JARVIS_UNLIMITED: `${ANNA},${BEN}`,
      JARVIS_NAMES_RPC: "https://rpc.test5.gno.land",
      JARVIS_NAMES_CHAIN: `test5.${"x".repeat(44)}`,
    };
    const { key, ...door } = loadConfig({ ...env, JARVIS: "on" }).jarvis ?? {};
    expect(key?.reveal()).toBe("d".repeat(32));
    expect(door).toEqual({
      on: true,
      url: "https://jarvis.internal:8443",
      timeoutMs: 3_600_000,
      questionChars: 8000,
      first: { quota: 1000, quotaUnnamed: 1, unlimited: [ANNA, BEN] },
      namesRpc: "https://rpc.test5.gno.land",
      namesChain: `test5.${"x".repeat(44)}`,
    });
    const one = loadConfig({ ...env, JARVIS_NAMES_CHAIN: "a" }).jarvis;
    expect(one?.namesChain).toBe("a");
  });

  it.each([
    ["JARVIS_URL", "jarvis:8090"],
    ["JARVIS_URL", "http://jarvis:8090/ask"],
    ["JARVIS_URL", "ftp://jarvis"],
    ["JARVIS_TIMEOUT_S", "0"],
    ["JARVIS_TIMEOUT_S", "3601"],
    ["JARVIS_QUESTION_CHARS", "8001"],
    ["JARVIS_QUOTA", "0"],
    ["JARVIS_QUOTA", "1001"],
    ["JARVIS_QUOTA_UNNAMED", "1001"],
    ["JARVIS_UNLIMITED", "g1nobody"],
    ["JARVIS_UNLIMITED", `${ANNA},${ANNA}`],
    ["JARVIS_NAMES_RPC", "http://rpc.gno.land"],
    ["JARVIS_NAMES_RPC", "https://rpc.gno.land/"],
    ["JARVIS_URL", ""],
    ["JARVIS_TIMEOUT_S", "1.5"],
    ["JARVIS_TIMEOUT_S", "08"],
    ["JARVIS_QUESTION_CHARS", "0"],
    ["JARVIS_QUESTION_CHARS", "abc"],
    ["JARVIS_QUOTA", "-1"],
    ["JARVIS_QUOTA_UNNAMED", "0"],
    ["JARVIS_QUOTA_UNNAMED", "2.5"],
    ["JARVIS_UNLIMITED", ","],
    ["JARVIS_NAMES_RPC", ""],
    ["JARVIS_NAMES_CHAIN", ""],
    ["JARVIS_NAMES_CHAIN", "test 5"],
    ["JARVIS_NAMES_CHAIN", "test5/"],
    ["JARVIS_NAMES_CHAIN", "-test5"],
    ["JARVIS_NAMES_CHAIN", "x".repeat(51)],
  ])("refuses %s=%s, naming the setting", (name, value) => {
    expect(failure({ ...ENV, JARVIS_URL: "http://jarvis:8090", [name]: value })).toMatch(
      new RegExp(`setting ${name}: `),
    );
  });

  it("holds 1,000 accounts with no quota at most", () => {
    const many = Array.from({ length: 1001 }, (_, at) => toAddress(Buffer.from(String(at).padStart(20, "0")))).join(
      ",",
    );
    expect(failure({ ...ENV, JARVIS_URL: "http://jarvis:8090", JARVIS_UNLIMITED: many })).toMatch(
      /setting JARVIS_UNLIMITED: /,
    );
  });

  it("stops when a door setting is set with no jarvis to open the door to", () => {
    for (const name of ["JARVIS_TIMEOUT_S", "JARVIS_QUESTION_CHARS", "JARVIS_QUOTA", "JARVIS_QUOTA_UNNAMED"])
      expect(failure({ ...ENV, [name]: "5" })).toMatch(/setting JARVIS_URL: required/);
    expect(failure({ ...ENV, JARVIS_UNLIMITED: ANNA })).toMatch(/setting JARVIS_URL: required/);
    expect(failure({ ...ENV, JARVIS_NAMES_RPC: "https://rpc.gno.land" })).toMatch(/setting JARVIS_URL: required/);
    expect(failure({ ...ENV, JARVIS_NAMES_CHAIN: "gnoland-1" })).toMatch(/setting JARVIS_URL: required/);
  });

  it("opens the admin API on its own listener once its port is set, on the loopback by default", () => {
    expect(loadConfig({ ...ENV, ADMIN_PORT: "8081" }).admin).toEqual({ host: "127.0.0.1", port: 8081, origins: [] });
    expect(
      loadConfig({ ...ENV, ADMIN_PORT: "0", ADMIN_HOST: "100.64.0.2", ADMIN_ORIGINS: "https://admin.gnoworld.test" })
        .admin,
    ).toEqual({ host: "100.64.0.2", port: 0, origins: ["https://admin.gnoworld.test"] });
  });

  it("takes the public port for the admin API on another address, which the system refuses on the same one", () => {
    expect(
      loadConfig({ ...ENV, HOST: "10.0.0.2", PORT: "8080", ADMIN_HOST: "100.64.0.2", ADMIN_PORT: "8080" }).admin,
    ).toEqual({
      host: "100.64.0.2",
      port: 8080,
      origins: [],
    });
  });

  it("stops when the admin API's host or sites are set with no port to open it on", () => {
    expect(failure({ ...ENV, ADMIN_HOST: "100.64.0.2" })).toMatch(/setting ADMIN_PORT: required/);
    expect(failure({ ...ENV, ADMIN_ORIGINS: "https://admin.gnoworld.test" })).toMatch(/setting ADMIN_PORT: required/);
  });

  it("refuses an admin site that a public page is served from, naming its place (ADR-0002 §6)", () => {
    const env = {
      ...ENV,
      ADMIN_PORT: "8081",
      ORIGINS: "https://gnoworld.test",
      ADMIN_ORIGINS: "https://admin.gnoworld.test,https://gnoworld.test",
    };
    expect(failure(env)).toMatch(/setting ADMIN_ORIGINS: custom \(at 1\)/);
    expect(failure(env)).not.toContain("https://gnoworld.test");
  });

  it("refuses an admin site on a public site's host with another port, as cookies ignore ports (F5106)", () => {
    const env = {
      ...ENV,
      ADMIN_PORT: "8081",
      ORIGINS: "https://gnoworld.land",
      ADMIN_ORIGINS: "https://admin.gnoworld.land,https://gnoworld.land:8443",
    };
    expect(failure(env)).toMatch(/setting ADMIN_ORIGINS: custom \(at 1\)/);
    expect(failure({ ...env, ORIGINS: "http://gnoworld.land", ADMIN_ORIGINS: "https://gnoworld.land" })).toMatch(
      /setting ADMIN_ORIGINS: custom \(at 0\)/,
    );
  });

  it("holds 1,000 accounts with no quota, the most", () => {
    const many = Array.from({ length: 1000 }, (_, at) => toAddress(Buffer.from(String(at).padStart(20, "0"))));
    expect(
      loadConfig({ ...ENV, JARVIS_URL: "http://jarvis:8090", JARVIS_UNLIMITED: many.join(",") }).jarvis?.first
        .unlimited,
    ).toHaveLength(1000);
  });

  it.each([
    ["ADMIN_PORT", "65536"],
    ["ADMIN_PORT", "08"],
    ["ADMIN_PORT", "-1"],
    ["ADMIN_PORT", ""],
    ["ADMIN_HOST", ""],
    ["ADMIN_HOST", "h".repeat(254)],
    ["ADMIN_ORIGINS", "admin.gnoworld.test"],
    ["ADMIN_ORIGINS", "https://admin.gnoworld.test/"],
  ])("refuses %s=%s, naming the setting", (name, value) => {
    expect(failure({ ...ENV, ADMIN_PORT: "8081", [name]: value })).toMatch(new RegExp(`setting ${name}: `));
  });
});
