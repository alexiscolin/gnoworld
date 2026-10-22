import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
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

  it("reads the socket Ergo's auth script dials, an absolute path a socket can hold; none by default", () => {
    expect(loadConfig(ENV).authSocket).toBeUndefined();
    expect(loadConfig({ ...ENV, AUTH_SOCKET: "/run/gnoworld/auth.sock" }).authSocket).toBe("/run/gnoworld/auth.sock");
    expect(loadConfig({ ...ENV, AUTH_SOCKET: `/${"s".repeat(99)}` }).authSocket).toBe(`/${"s".repeat(99)}`);
    // A socket's path holds about 100 bytes, not characters: é takes two.
    for (const path of ["", "run/auth.sock", `/${"s".repeat(100)}`, `/${"é".repeat(50)}`]) {
      expect(failure({ ...ENV, AUTH_SOCKET: path })).toMatch(/setting AUTH_SOCKET: /);
    }
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
