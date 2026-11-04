import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { loadJarvisConfig, loadServed } from "./config.ts";
import { z } from "zod";

const dir = mkdtempSync(join(tmpdir(), "gnoworld-jarvis-config-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
const file = (name: string, content: string): string => {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
};
// A key the test makes up, never a real one.
const KEY = `sk-ant-made-up-${"k".repeat(40)}`;
const ENV = {
  ANTHROPIC_API_KEY_FILE: file("anthropic", `${KEY}\n`),
  JARVIS_DATABASE: join(dir, "jarvis.db"),
  JARVIS_PROFILES: "testnet",
  JARVIS_GNOMCP_COMMAND: "/usr/local/bin/gnomcp",
  JARVIS_GNOMCP_CONFIG: "/etc/gnomcp/profiles.toml",
};
const DOLLAR = 1_000_000_000;

// The whole error as a crash would print it: its message, its stack and its causes.
const failure = (env: Record<string, string | undefined>): string => {
  try {
    loadJarvisConfig(env);
  } catch (error) {
    return inspect(error, { depth: 5 });
  }
  throw new Error("loadJarvisConfig accepted the settings");
};

describe("loadJarvisConfig", () => {
  it("reads the settings, with every default, and the key from its file without its newline", () => {
    const { anthropicKey, ...rest } = loadJarvisConfig(ENV);
    expect(anthropicKey.reveal()).toBe(KEY);
    expect(rest).toEqual({
      caps: {
        questionChars: 2_000,
        turns: 8,
        outputTokens: 4_096,
        callTimeoutMs: 60_000,
        retries: 2,
        toolResultBytes: 16 * 1024,
      },
      models: { main: "claude-sonnet-5-5", fast: "claude-haiku-5-5", deep: "claude-opus-5-5" },
      gnoscope: false,
      gnoscopeServer: { url: "https://gnoscope.com/mcp", timeoutMs: 10_000, networks: ["mainnet", "onyx"] },
      places: fileURLToPath(new URL("../../app/data", import.meta.url)),
      skills: fileURLToPath(new URL("../skills", import.meta.url)),
      gnomcp: { command: "/usr/local/bin/gnomcp", config: "/etc/gnomcp/profiles.toml" },
      profiles: { read: ["testnet"], indexed: [] },
    });
  });

  it("reads the day's budgets in whole dollars, the demo's $3 and $1 among them, as nano-dollars", () => {
    const demo = { ...ENV, JARVIS_BUDGET_USD: "3", JARVIS_TRANSLATION_BUDGET_USD: "1" };
    expect(loadServed(demo).budgets).toEqual({ ask: 3 * DOLLAR, translate: 1 * DOLLAR });
    const most = { ...ENV, JARVIS_BUDGET_USD: "500", JARVIS_TRANSLATION_BUDGET_USD: "500" };
    expect(loadServed(most).budgets).toEqual({ ask: 500 * DOLLAR, translate: 500 * DOLLAR });
    const least = { ...ENV, JARVIS_BUDGET_USD: "1", JARVIS_TRANSLATION_BUDGET_USD: "1" };
    expect(loadServed(least).budgets).toEqual({ ask: DOLLAR, translate: DOLLAR });
  });

  it("takes a database's path of 1024 characters, the longest", () => {
    const longest = `/${"d".repeat(1023)}`;
    expect(loadServed({ ...ENV, JARVIS_DATABASE: longest }).database).toBe(longest);
  });

  it("reads each cap at its lowest and its highest", () => {
    const low = {
      ...ENV,
      JARVIS_QUESTION_CHARS: "1",
      JARVIS_TURNS: "1",
      JARVIS_OUTPUT_TOKENS: "1",
      JARVIS_CALL_TIMEOUT_S: "1",
      JARVIS_RETRIES: "0",
      JARVIS_TOOL_RESULT_KIB: "1",
    };
    expect(loadJarvisConfig(low).caps).toEqual({
      questionChars: 1,
      turns: 1,
      outputTokens: 1,
      callTimeoutMs: 1_000,
      retries: 0,
      toolResultBytes: 1024,
    });
    const high = {
      ...ENV,
      JARVIS_QUESTION_CHARS: "8000",
      JARVIS_TURNS: "20",
      JARVIS_OUTPUT_TOKENS: "16000",
      JARVIS_CALL_TIMEOUT_S: "600",
      JARVIS_RETRIES: "2",
      JARVIS_TOOL_RESULT_KIB: "64",
    };
    expect(loadJarvisConfig(high).caps).toEqual({
      questionChars: 8_000,
      turns: 20,
      outputTokens: 16_000,
      callTimeoutMs: 600_000,
      retries: 2,
      toolResultBytes: 64 * 1024,
    });
    expect(loadJarvisConfig({ ...ENV, JARVIS_RETRIES: "1" }).caps.retries).toBe(1);
  });

  it("reads the models by task, any of the three priced", () => {
    const env = {
      ...ENV,
      JARVIS_MODEL: "claude-opus-5-5",
      JARVIS_MODEL_FAST: "claude-sonnet-5-5",
      JARVIS_MODEL_DEEP: "claude-haiku-5-5",
    };
    expect(loadJarvisConfig(env).models).toEqual({
      main: "claude-opus-5-5",
      fast: "claude-sonnet-5-5",
      deep: "claude-haiku-5-5",
    });
  });

  it("turns gnoscope on only when it says on", () => {
    expect(loadJarvisConfig({ ...ENV, JARVIS_GNOSCOPE: "on" }).gnoscope).toBe(true);
    expect(loadJarvisConfig({ ...ENV, JARVIS_GNOSCOPE: "off" }).gnoscope).toBe(false);
  });

  it("reads gnoscope's address, its time in seconds at its lowest and highest, and the networks its tools may name", () => {
    const env = {
      ...ENV,
      JARVIS_GNOSCOPE_URL: "https://explorer.example:8443/v2/mcp",
      JARVIS_GNOSCOPE_TIMEOUT_S: "1",
      JARVIS_GNOSCOPE_NETWORKS: "onyx",
    };
    expect(loadJarvisConfig(env).gnoscopeServer).toEqual({
      url: "https://explorer.example:8443/v2/mcp",
      timeoutMs: 1_000,
      networks: ["onyx"],
    });
    const slowest = { ...ENV, JARVIS_GNOSCOPE_TIMEOUT_S: "60", JARVIS_GNOSCOPE_NETWORKS: "mainnet,test-12,onyx" };
    expect(loadJarvisConfig(slowest).gnoscopeServer).toMatchObject({
      timeoutMs: 60_000,
      networks: ["mainnet", "test-12", "onyx"],
    });
  });

  it("reads the places' data folder as an absolute path", () => {
    expect(loadJarvisConfig({ ...ENV, JARVIS_DATA_DIR: "/app/data" }).places).toBe("/app/data");
  });

  it("reads the skills folder and gnomcp's command and configuration as absolute paths", () => {
    const env = {
      ...ENV,
      JARVIS_SKILLS_DIR: "/app/server/jarvis/skills",
      JARVIS_GNOMCP_COMMAND: "/opt/gnomcp/bin/gnomcp",
      JARVIS_GNOMCP_CONFIG: "/run/gnomcp/profiles.toml",
    };
    expect(loadJarvisConfig(env)).toMatchObject({
      skills: "/app/server/jarvis/skills",
      gnomcp: { command: "/opt/gnomcp/bin/gnomcp", config: "/run/gnomcp/profiles.toml" },
    });
  });

  it("reads the chain profiles it may read, and those of them with an indexer, each as written", () => {
    const env = { ...ENV, JARVIS_PROFILES: "testnet,gnoland1,my_dev-2", JARVIS_INDEXER_PROFILES: "testnet,my_dev-2" };
    expect(loadJarvisConfig(env).profiles).toEqual({
      read: ["testnet", "gnoland1", "my_dev-2"],
      indexed: ["testnet", "my_dev-2"],
    });
    expect(loadJarvisConfig({ ...ENV, JARVIS_PROFILES: "p".repeat(50) }).profiles.read).toEqual(["p".repeat(50)]);
  });

  it("refuses an indexer on a profile it may not read, naming the entry", () => {
    const error = failure({ ...ENV, JARVIS_PROFILES: "testnet,local", JARVIS_INDEXER_PROFILES: "local,pearl" });
    expect(error).toMatch(/setting JARVIS_INDEXER_PROFILES: \w+ \(at 1\)/);
    expect(error).not.toContain("pearl");
  });

  it.each([
    ["ANTHROPIC_API_KEY_FILE", undefined],
    ["ANTHROPIC_API_KEY_FILE", ""],
    ["JARVIS_DATABASE", undefined],
    ["JARVIS_DATABASE", ""],
    ["JARVIS_DATABASE", "d".repeat(1025)],
    ["JARVIS_DATABASE", `/${"d".repeat(1024)}`],
    // In memory, a restart would open the day again at zero (D45, F5179).
    ["JARVIS_DATABASE", ":memory:"],
    ["JARVIS_DATABASE", "jarvis.db"],
    ["JARVIS_DATABASE", "./jarvis.db"],
    ["JARVIS_DATABASE", "file:jarvis.db"],
    ["JARVIS_PROFILES", undefined],
    ["JARVIS_PROFILES", ""],
    ["JARVIS_PROFILES", "testnet,"],
    ["JARVIS_PROFILES", "testnet, local"],
    ["JARVIS_PROFILES", "Testnet"],
    ["JARVIS_PROFILES", "-testnet"],
    ["JARVIS_PROFILES", "_testnet"],
    ["JARVIS_PROFILES", "test.net"],
    ["JARVIS_PROFILES", "p".repeat(51)],
    ["JARVIS_INDEXER_PROFILES", ","],
    ["JARVIS_INDEXER_PROFILES", "pearl"],
    ["JARVIS_GNOMCP_COMMAND", undefined],
    ["JARVIS_GNOMCP_COMMAND", "gnomcp"],
    ["JARVIS_GNOMCP_COMMAND", "./gnomcp"],
    ["JARVIS_GNOMCP_COMMAND", "/"],
    ["JARVIS_GNOMCP_COMMAND", "/usr/../bin/gnomcp"],
    ["JARVIS_GNOMCP_COMMAND", "/usr/bin/"],
    ["JARVIS_GNOMCP_CONFIG", undefined],
    ["JARVIS_GNOMCP_CONFIG", "profiles.toml"],
    ["JARVIS_GNOMCP_CONFIG", "/etc//profiles.toml"],
    ["JARVIS_SKILLS_DIR", ""],
    ["JARVIS_SKILLS_DIR", "skills"],
    ["JARVIS_SKILLS_DIR", "/app/skills/"],
    ["JARVIS_SKILLS_DIR", "/app/./skills"],
    ["JARVIS_GNOSCOPE", ""],
    ["JARVIS_GNOSCOPE", "ON"],
    ["JARVIS_GNOSCOPE", "true"],
    ["JARVIS_GNOSCOPE", "1"],
    ["JARVIS_GNOSCOPE", "yes"],
    ["JARVIS_GNOSCOPE_URL", ""],
    ["JARVIS_GNOSCOPE_URL", "gnoscope.com/mcp"],
    ["JARVIS_GNOSCOPE_URL", "http://gnoscope.com/mcp"],
    ["JARVIS_GNOSCOPE_URL", "wss://gnoscope.com/mcp"],
    ["JARVIS_GNOSCOPE_URL", "https://user:pass@gnoscope.com/mcp"],
    ["JARVIS_GNOSCOPE_URL", "https://user@gnoscope.com/mcp"],
    ["JARVIS_GNOSCOPE_URL", "https://:secret@gnoscope.com/mcp"],
    ["JARVIS_GNOSCOPE_URL", "https://gnoscope.com/mcp#tools"],
    ["JARVIS_GNOSCOPE_URL", `https://gnoscope.com/${"m".repeat(2048)}`],
    ["JARVIS_GNOSCOPE_TIMEOUT_S", "0"],
    ["JARVIS_GNOSCOPE_TIMEOUT_S", "61"],
    ["JARVIS_GNOSCOPE_TIMEOUT_S", "10s"],
    ["JARVIS_GNOSCOPE_NETWORKS", ""],
    ["JARVIS_GNOSCOPE_NETWORKS", "mainnet,"],
    ["JARVIS_GNOSCOPE_NETWORKS", "Mainnet"],
    ["JARVIS_GNOSCOPE_NETWORKS", "main net"],
    ["JARVIS_GNOSCOPE_NETWORKS", "n".repeat(41)],
    ["JARVIS_DATA_DIR", ""],
    ["JARVIS_DATA_DIR", "app/data"],
    ["JARVIS_DATA_DIR", "/app/../data"],
    ["JARVIS_BUDGET_USD", "0"],
    ["JARVIS_BUDGET_USD", "501"],
    ["JARVIS_BUDGET_USD", "4500"],
    ["JARVIS_BUDGET_USD", "45.00"],
    ["JARVIS_BUDGET_USD", "4.5"],
    ["JARVIS_BUDGET_USD", "$45"],
    ["JARVIS_BUDGET_USD", "045"],
    ["JARVIS_BUDGET_USD", ""],
    ["JARVIS_BUDGET_USD", "-45"],
    ["JARVIS_TRANSLATION_BUDGET_USD", "0"],
    ["JARVIS_TRANSLATION_BUDGET_USD", "501"],
    ["JARVIS_TRANSLATION_BUDGET_USD", "0.5"],
    ["JARVIS_QUESTION_CHARS", "0"],
    ["JARVIS_QUESTION_CHARS", "8001"],
    ["JARVIS_TURNS", "0"],
    ["JARVIS_TURNS", "21"],
    ["JARVIS_OUTPUT_TOKENS", "0"],
    ["JARVIS_OUTPUT_TOKENS", "16001"],
    ["JARVIS_OUTPUT_TOKENS", "4k"],
    ["JARVIS_CALL_TIMEOUT_S", "0"],
    ["JARVIS_CALL_TIMEOUT_S", "601"],
    ["JARVIS_CALL_TIMEOUT_S", "60s"],
    ["JARVIS_RETRIES", "3"],
    ["JARVIS_RETRIES", "-1"],
    ["JARVIS_RETRIES", "02"],
    ["JARVIS_RETRIES", ""],
    ["JARVIS_RETRIES", "1.5"],
    ["JARVIS_TOOL_RESULT_KIB", "0"],
    ["JARVIS_TOOL_RESULT_KIB", "65"],
    ["JARVIS_TOOL_RESULT_KIB", "16384"],
    ["JARVIS_MODEL", "claude-sonnet-4-6"],
    ["JARVIS_MODEL", "claude-sonnet-5-5-20260401"],
    ["JARVIS_MODEL", "Claude-Sonnet-5-5"],
    ["JARVIS_MODEL", ""],
    ["JARVIS_MODEL_FAST", "claude-haiku-4-5"],
    ["JARVIS_MODEL_DEEP", "claude-fable-5-1"],
  ])("stops on %s set to %j, naming the setting", (key, value) => {
    expect(() => loadJarvisConfig({ ...ENV, [key]: value })).toThrow(new RegExp(`^setting ${key}: `));
  });

  it.each([
    "JARVIS_DATABASE",
    "JARVIS_PROFILES",
    "JARVIS_INDEXER_PROFILES",
    "JARVIS_GNOMCP_COMMAND",
    "JARVIS_GNOMCP_CONFIG",
    "JARVIS_SKILLS_DIR",
    "JARVIS_GNOSCOPE",
    "JARVIS_GNOSCOPE_URL",
    "JARVIS_GNOSCOPE_TIMEOUT_S",
    "JARVIS_GNOSCOPE_NETWORKS",
    "JARVIS_DATA_DIR",
    "JARVIS_BUDGET_USD",
    "JARVIS_TURNS",
    "JARVIS_RETRIES",
    "JARVIS_MODEL",
  ])("never prints the value of a malformed %s", (key) => {
    // Malformed for each: past a path's 1024 characters or a name's 50, relative, not a number, not a model.
    const planted = `planted-${"s".repeat(4096)}`;
    const printed = failure({ ...ENV, [key]: planted });
    expect(printed).toMatch(new RegExp(`setting ${key}: `));
    expect(printed).not.toContain("planted-");
    expect(printed).not.toContain(KEY);
  });

  it("names the setting and the kind of fault, nothing else", () => {
    expect(() => loadJarvisConfig({ ...ENV, JARVIS_DATABASE: "" })).toThrow(/^setting JARVIS_DATABASE: too_small$/);
    expect(() => loadJarvisConfig({ ...ENV, JARVIS_RETRIES: "3" })).toThrow(/^setting JARVIS_RETRIES: \w+$/);
    expect(() => loadJarvisConfig({ ...ENV, JARVIS_MODEL: "claude-sonnet-4-6" })).toThrow(
      /^setting JARVIS_MODEL: \w+$/,
    );
  });
});

// What jarvis reads in any case, on or off: its switch, where it listens, its file, its budgets and how long a stop
// waits for the questions in flight. Off, it reads nothing more: no key file, no gnomcp, no model (Alexis, "Coupé par
// défaut").
describe("loadServed", () => {
  const SERVED = { JARVIS_DATABASE: join(dir, "served.db") };

  it("reads jarvis off, its defaults, and nothing of the key, gnomcp or the profiles", () => {
    expect(loadServed(SERVED)).toEqual({
      on: false,
      listen: { host: "127.0.0.1", port: 8081, names: ["127.0.0.1", "localhost"] },
      database: SERVED.JARVIS_DATABASE,
      budgets: { ask: 45 * DOLLAR, translate: 5 * DOLLAR },
      drainMs: 20_000,
    });
  });

  it("turns jarvis on only when JARVIS is exactly on", () => {
    expect(loadServed({ ...SERVED, JARVIS: "on" }).on).toBe(true);
  });

  it.each(["", "ON", "On", " on", "on ", "yes", "true", "1", "enabled", "off", String.fromCodePoint(0xff4f, 0xff4e)])(
    "reads JARVIS set to %j as off, never as an error",
    (value) => {
      expect(loadServed({ ...SERVED, JARVIS: value }).on).toBe(false);
    },
  );

  it("reads no key file, and needs none, while off: a missing or unreadable one starts nothing", () => {
    const off = { ...SERVED, ANTHROPIC_API_KEY_FILE: "/nonexistent/gnoworld-anthropic", JARVIS_PROFILES: "Not A Name" };
    expect(loadServed(off).on).toBe(false);
  });

  it("reads where it listens, its stop's wait and its budgets at their bounds", () => {
    const set = {
      ...SERVED,
      JARVIS_HOST: "0.0.0.0",
      JARVIS_PORT: "0",
      JARVIS_DRAIN_S: "1",
      JARVIS_BUDGET_USD: "1",
      JARVIS_TRANSLATION_BUDGET_USD: "500",
    };
    expect(loadServed(set)).toMatchObject({
      listen: { host: "0.0.0.0", port: 0 },
      drainMs: 1_000,
      budgets: { ask: DOLLAR, translate: 500 * DOLLAR },
    });
    expect(loadServed({ ...SERVED, JARVIS_PORT: "65535", JARVIS_DRAIN_S: "600" })).toMatchObject({
      listen: { port: 65_535 },
      drainMs: 600_000,
    });
  });

  it("reads the names a request's Host may give it, each a name or an address with no port (F5288)", () => {
    expect(loadServed({ ...SERVED, JARVIS_HOSTNAMES: "jarvis" }).listen.names).toEqual(["jarvis"]);
    const names = "jarvis.gnoworld.internal,10.0.0.7,[fd00::7]";
    expect(loadServed({ ...SERVED, JARVIS_HOSTNAMES: names }).listen.names).toEqual(names.split(","));
  });

  it.each([
    ["JARVIS_HOSTNAMES", ""],
    ["JARVIS_HOSTNAMES", "jarvis,"],
    ["JARVIS_HOSTNAMES", "Jarvis"],
    ["JARVIS_HOSTNAMES", "jar vis"],
    ["JARVIS_HOSTNAMES", "jarvis:8081"],
    ["JARVIS_HOSTNAMES", "j".repeat(254)],
    ["JARVIS_HOSTNAMES", "a@b"],
    ["JARVIS_DATABASE", undefined],
    ["JARVIS_DATABASE", ":memory:"],
    ["JARVIS_DATABASE", "jarvis.db"],
    ["JARVIS_HOST", ""],
    ["JARVIS_HOST", "h".repeat(254)],
    ["JARVIS_PORT", "65536"],
    ["JARVIS_PORT", "-1"],
    ["JARVIS_PORT", "08081"],
    ["JARVIS_PORT", "port"],
    ["JARVIS_DRAIN_S", "0"],
    ["JARVIS_DRAIN_S", "601"],
    ["JARVIS_DRAIN_S", "20s"],
    ["JARVIS_BUDGET_USD", "0"],
    ["JARVIS_BUDGET_USD", "501"],
    ["JARVIS_TRANSLATION_BUDGET_USD", "4.5"],
  ])("stops on %s set to %j, naming the setting, on or off", (key, value) => {
    for (const on of ["on", undefined]) {
      expect(() => loadServed({ ...SERVED, JARVIS: on, [key]: value })).toThrow(new RegExp(`^setting ${key}: `));
    }
  });
});

describe("the Anthropic key", () => {
  it("is read only from its file: the key in the environment itself starts nothing", () => {
    const error = failure({ ...ENV, ANTHROPIC_API_KEY_FILE: undefined, ANTHROPIC_API_KEY: KEY });
    expect(error).toMatch(/setting ANTHROPIC_API_KEY_FILE: /);
    expect(error).not.toContain(KEY);
  });

  it.each([
    ["a file that cannot be read", () => "/nonexistent/gnoworld-anthropic"],
    ["an empty file", () => file("key-empty", "")],
    ["31 characters", () => file("key-short", `sk-ant-planted-${"x".repeat(16)}\n`)],
    ["two words", () => file("key-words", `sk-ant-planted-${"a".repeat(20)} ${"b".repeat(20)}\n`)],
    ["two lines", () => file("key-lines", `sk-ant-planted-${"a".repeat(30)}\r\nX-Planted: 1\n`)],
    [
      "a character past ASCII",
      () => file("key-accent", `sk-ant-planted-${"a".repeat(30)}${String.fromCodePoint(0xe9)}\n`),
    ],
    ["a control character", () => file("key-tab", `sk-ant-planted-${"a".repeat(30)}\t${"b".repeat(4)}\n`)],
    ["257 characters", () => file("key-long", `sk-ant-planted-${"k".repeat(242)}\n`)],
  ])("stops on a key file holding %s, naming the setting and never its content", (_, path) => {
    const error = failure({ ...ENV, ANTHROPIC_API_KEY_FILE: path() });
    expect(error).toMatch(/setting ANTHROPIC_API_KEY_FILE: /);
    expect(error).not.toMatch(/planted|X-Planted/);
  });

  it("keeps why its file could not be read, as the cause: the path is no secret", () => {
    let thrown: unknown;
    try {
      loadJarvisConfig({ ...ENV, ANTHROPIC_API_KEY_FILE: "/nonexistent/gnoworld-anthropic" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ message: "setting ANTHROPIC_API_KEY_FILE: unreadable", cause: { code: "ENOENT" } });
  });

  it("takes a key of 32 and of 256 characters, the shortest and the longest", () => {
    for (const key of ["k".repeat(32), "k".repeat(256)]) {
      const env = { ...ENV, ANTHROPIC_API_KEY_FILE: file(`key-${String(key.length)}`, key) };
      expect(loadJarvisConfig(env).anthropicKey.reveal()).toBe(key);
    }
  });

  it("never shows when the settings are printed, logged as JSON or written in a string", () => {
    const config = loadJarvisConfig(ENV);
    expect(inspect(config, { depth: 5 })).not.toContain(KEY);
    expect(JSON.stringify(config)).not.toContain(KEY);
    expect(String(config.anthropicKey)).toBe("[redacted]");
    expect(JSON.stringify({ key: config.anthropicKey })).toBe('{"key":"[redacted]"}');
  });
});

// Jarvis apart from the server (decision-isolation.md, D110): its package lists nothing of the server's, and its compiler
// reaches its own folder alone; the lint's walls hold each import (scripts/probe.py, walls).
it("lists nothing of the server's in its package, and compiles its own folder alone", () => {
  const read = (name: string): unknown => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), "utf8"));
  const manifest = JSON.stringify(read("package.json"));
  expect(manifest).not.toMatch(/@gnoworld\/(server|app)|server\//);
  expect(manifest).toMatch(/"@gnoworld\/service":/);
  const tsconfig = readFileSync(new URL("../tsconfig.json", import.meta.url), "utf8");
  expect(tsconfig).toMatch(/"include": \["src"\]/);
  expect(tsconfig).not.toMatch(/\.\.\/server|"references"|"paths"/);
});

// jarvis in the stack (ADR-0002 §5, §7; 10i's report, "What 10j's deploy needs"): deploy/compose.yaml, the two ways
// out's lists and the guard's rules, read as text. Docker is refused in this sandbox: deploy/test.sh starts the stack
// and proves each of these by a request (test-jarvis.sh). Each value is built inside its test (F2356).
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

// A key's block of a YAML mapping at an indentation, up to the next key at that indentation or less; empty if none.
function block(text: string, indent: number, key: string): string {
  const pad = " ".repeat(indent);
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line === `${pad}${key}:` || line.startsWith(`${pad}${key}: `));
  if (start === -1) return "";
  const end = lines.findIndex(
    (line, at) => at > start && line.trim() !== "" && !line.trimStart().startsWith("#") && line.search(/\S/) <= indent,
  );
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}
// The keys of a mapping's block, one indentation in.
const keysOf = (text: string, indent: number) =>
  [...text.matchAll(new RegExp(`^ {${String(indent)}}([A-Za-z_][A-Za-z0-9_-]*):`, "gm"))].map(
    (match) => match[1] ?? "",
  );
const compose = () => read("deploy/compose.yaml");
const services = () => block(compose(), 0, "services");
const names = () => keysOf(services(), 2);
const service = (name: string) => block(services(), 2, name);
const networks = () => block(compose(), 0, "networks");
const environment = (name: string) => block(service(name), 4, "environment");
// A setting of a service's environment, as written.
const setting = (name: string, key: string) =>
  new RegExp(`^ {6}${key}: (.*)$`, "m").exec(environment(name))?.[1]?.trim();
// A service's networks, in its list (`[a, b]`) or its map (`a: {}`).
function networksOf(name: string): string[] {
  const listed = block(service(name), 4, "networks");
  const inline = /^ {4}networks: \[([^\]]*)\]$/m.exec(listed)?.[1];
  return (inline === undefined ? keysOf(listed, 6) : inline.split(",").map((one) => one.trim())).sort();
}
const on = (network: string) =>
  names()
    .filter((name) => networksOf(name).includes(network))
    .sort();
// The hosts a way out lets out: its default rule's allowed domains, its one list.
function allowedBy(acl: string): string[] {
  const allowed = block(block(acl, 0, "default"), 2, "allowed_domains");
  return [...allowed.matchAll(/^ {4}- "?([^"\s#]+)"?\s*$/gm)].map((match) => match[1] ?? "").sort();
}
const Universes = z.array(
  z.object({ id: z.string(), chainId: z.string(), rpc: z.url(), indexer: z.url(), gnoweb: z.url() }),
);
const universes = () => Universes.parse(JSON.parse(read("app/data/universes.json")));
// A fixed address setting and a subnet setting, by their default.
const defaultOf = (written: string | undefined, name: string) =>
  new RegExp(`^\\$\\{${name}:-([0-9./]+)\\}$`).exec(written ?? "")?.[1];
const subnetOf = (network: string) => /- subnet: (\$\{[A-Z_]+:-[0-9./]+\})$/m.exec(block(networks(), 2, network))?.[1];
const inSubnet = (address: string, subnet: string) => {
  const [base = "", bits = "32"] = subnet.split("/");
  const toNumber = (ip: string) => ip.split(".").reduce((sum, part) => sum * 256 + Number(part), 0);
  const mask = Number(bits) === 0 ? 0 : 2 ** 32 - 2 ** (32 - Number(bits));
  return (toNumber(address) & mask) >>> 0 === (toNumber(base) & mask) >>> 0;
};
const isPrivate = (subnet: string) => inSubnet(subnet.split("/")[0] ?? "", "172.16.0.0/12");

describe("the jarvis service", () => {
  it("is built from its own image, as a user of its own, locked as every service, with init to reap gnomcp", () => {
    const jarvis = service("jarvis");
    expect(jarvis).toMatch(/^ {4}<<: \*locked$/m);
    expect(jarvis).toMatch(/^ {6}dockerfile: deploy\/jarvis\/Dockerfile$/m);
    expect(jarvis).toMatch(/^ {4}user: "65533:65533"$/m);
    expect(jarvis).toMatch(/^ {4}init: true$/m);
    for (const cap of ["cpus", "mem_limit", "pids_limit"])
      expect(jarvis).toMatch(new RegExp(`^ {4}${cap}: \\S+$`, "m"));
  });

  it("overrides nothing the lock or the image sets: its root, its command, its privileges", () => {
    const keys = keysOf(service("jarvis"), 4);
    expect(keys).toEqual([
      "build",
      "user",
      "init",
      "stop_grace_period",
      "networks",
      "environment",
      "secrets",
      "volumes",
      "cpus",
      "mem_limit",
      "pids_limit",
      "healthcheck",
    ]);
    expect(service("jarvis")).toMatch(/^ {4}<<: \*locked$/m);
  });

  it("is off unless JARVIS says on, the same setting the server's door reads", () => {
    expect(setting("jarvis", "JARVIS")).toBe("${JARVIS:-off}");
    expect(setting("server", "JARVIS")).toBe("${JARVIS:-off}");
  });

  it("is given only the settings it reads, none naming another key or moving its way out", () => {
    expect(keysOf(environment("jarvis"), 6).sort()).toEqual(
      [
        "JARVIS",
        "JARVIS_HOST",
        "JARVIS_PORT",
        "JARVIS_HOSTNAMES",
        "JARVIS_DATABASE",
        "JARVIS_BUDGET_USD",
        "JARVIS_TRANSLATION_BUDGET_USD",
        "JARVIS_DRAIN_S",
        "ANTHROPIC_API_KEY_FILE",
        "JARVIS_GNOMCP_COMMAND",
        "JARVIS_GNOMCP_CONFIG",
        "JARVIS_PROFILES",
        "JARVIS_INDEXER_PROFILES",
        "JARVIS_GNOSCOPE",
        "OTEL_SERVICE_NAME",
        "HTTPS_PROXY",
        "NO_PROXY",
        "NODE_USE_ENV_PROXY",
      ].sort(),
    );
    expect(setting("jarvis", "NO_PROXY")).toBe("localhost,127.0.0.1");
    expect(setting("jarvis", "JARVIS_BUDGET_USD")).toBe("${JARVIS_BUDGET_USD:-3}");
    expect(setting("jarvis", "JARVIS_TRANSLATION_BUDGET_USD")).toBe("${JARVIS_TRANSLATION_BUDGET_USD:-1}");
  });

  it("listens on its address on the network it shares with the server alone, for the name the server asks", () => {
    const address = defaultOf(setting("jarvis", "JARVIS_HOST"), "JARVIS_ADDRESS") ?? "";
    expect(address).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(block(service("jarvis"), 4, "networks")).toContain(`ipv4_address: \${JARVIS_ADDRESS:-${address}}`);
    expect(setting("jarvis", "JARVIS_PORT")).toBe('"8081"');
    expect(setting("jarvis", "JARVIS_HOSTNAMES")).toBe("jarvis");
    expect(setting("server", "JARVIS_URL")).toBe("http://jarvis:8081");
    // The server's way out would carry its questions to the proxy: jarvis is named among the hosts it reaches itself.
    expect(setting("server", "NO_PROXY")?.split(",")).toContain("jarvis");
    expect(inSubnet(address, defaultOf(subnetOf("jarvis"), "JARVIS_SUBNET") ?? "")).toBe(true);
  });

  it("keeps its file on a volume only it mounts", () => {
    expect(setting("jarvis", "JARVIS_DATABASE")).toBe("/data/jarvis.db");
    expect(block(service("jarvis"), 4, "volumes").split("\n").slice(1)).toEqual(["      - jarvis:/data"]);
    const mounting = names().filter((name) => /^ {6}- jarvis:/m.test(block(service(name), 4, "volumes")));
    expect(mounting).toEqual(["jarvis"]);
    expect(block(compose(), 0, "volumes")).toMatch(/^ {2}jarvis: \{\}$/m);
  });

  it("holds Anthropic's key alone, as a secret file it reads only when on, and no other service holds it", () => {
    expect(setting("jarvis", "ANTHROPIC_API_KEY_FILE")).toBe("/run/secrets/anthropic_api_key");
    expect(service("jarvis")).toMatch(/^ {4}secrets: \[anthropic_api_key\]$/m);
    expect(names().filter((name) => /anthropic/i.test(service(name)))).toEqual(["jarvis"]);
    expect(block(compose(), 0, "secrets")).toMatch(
      /^ {2}anthropic_api_key:\n {4}file: \$\{ANTHROPIC_API_KEY_FILE:-\.\/secrets\/anthropic_api_key\}$/m,
    );
  });

  it("waits past its drain by 15 s at least before it is killed, and is never given NODE_OPTIONS", () => {
    const drain = Number(/^"(\d+)"$/.exec(setting("jarvis", "JARVIS_DRAIN_S") ?? "")?.[1]);
    const grace = Number(/^ {4}stop_grace_period: (\d+)s$/m.exec(service("jarvis"))?.[1]);
    expect(drain).toBeGreaterThan(0);
    expect(grace - drain).toBeGreaterThanOrEqual(15);
    expect(grace - drain).toBeLessThanOrEqual(20);
    expect(compose()).not.toMatch(/NODE_OPTIONS/);
  });

  it("starts gnomcp from the image with its read-only settings, on the profiles named after the data's universes", () => {
    expect(setting("jarvis", "JARVIS_GNOMCP_COMMAND")).toBe("/gnomcp/gnomcp");
    expect(setting("jarvis", "JARVIS_GNOMCP_CONFIG")).toBe("/app/deploy/jarvis/gnomcp.toml");
    const ids = universes().map((universe) => universe.id);
    expect(setting("jarvis", "JARVIS_PROFILES")?.split(",").sort()).toEqual([...ids].sort());
    expect(setting("jarvis", "JARVIS_INDEXER_PROFILES")?.split(",").sort()).toEqual([...ids].sort());
    expect(setting("jarvis", "JARVIS_GNOSCOPE")).toBe("${JARVIS_GNOSCOPE:-off}");
  });

  it("asks a health check jarvis answers on or off, by the name it takes", () => {
    const test = block(block(service("jarvis"), 4, "healthcheck"), 6, "test");
    expect(test).toContain("path: '/budgets'");
    expect(test).toContain("headers: { host: 'jarvis' }");
    expect(test).toContain("host: process.env.JARVIS_HOST");
  });

  it("leaves the server's names on the node the server's way out lets out", () => {
    expect(setting("server", "JARVIS_NAMES_RPC")).toBeUndefined();
    expect(allowedBy(read("deploy/egress/acl.yaml"))).toContain("rpc.gno.land");
  });
});

describe("the demo's ceiling", () => {
  it("holds every service's caps, jarvis's and its way out's with them, under 2.4 cores and 2 GB (question 10j-4)", () => {
    const units = new Map([
      ["", 1],
      ["k", 2 ** 10],
      ["m", 2 ** 20],
      ["g", 2 ** 30],
    ]);
    const size = (written: string) => {
      const [, number = "0", unit = ""] = /^(\d+)([kmg]?)$/.exec(written) ?? [];
      return Number(number) * (units.get(unit) ?? Number.NaN);
    };
    const capOf = (name: string, key: string) => new RegExp(`^ {4}${key}: (\\S+)$`, "m").exec(service(name))?.[1];
    expect(names()).toEqual(expect.arrayContaining(["jarvis", "egress_jarvis"]));
    for (const name of names()) expect(capOf(name, "cpus"), name).toBeDefined();
    const cores = names().reduce((sum, name) => sum + Number(capOf(name, "cpus")), 0);
    const bytes = names().reduce((sum, name) => sum + size(capOf(name, "mem_limit") ?? "0"), 0);
    expect(cores).toBeLessThanOrEqual(2.4 + 1e-9);
    expect(bytes).toBeLessThanOrEqual(2 ** 31);
    expect(read("deploy/test.sh")).toContain("sys.exit(float(c) > 2.4 or int(m) > 2**31)");
    // And the running demo's, which counts the containers it finds.
    expect(read("deploy/test.sh")).toContain(
      "for id in $ts $guard $web $ergo $server $egress $jarvis $egress_jarvis; do",
    );
    expect(read("deploy/test.sh")).toContain(`[ "$cpus" -le 2400000000 ]`);
  });
});

describe("gnomcp's settings in the image", () => {
  const toml = () => read("deploy/jarvis/gnomcp.toml");
  const profile = (name: string) => toml().split(`[${name}]\n`)[1]?.split(/^\[/m)[0] ?? "";
  const field = (name: string, key: string) => new RegExp(`^${key} = "([^"]*)"$`, "m").exec(profile(name))?.[1];
  const keys = (name: string) => keysOfToml(profile(name));
  const keysOfToml = (text: string) => [...text.matchAll(/^([a-z-]+) = /gm)].map((match) => match[1] ?? "").sort();

  it("name each of jarvis's universes on its own chain, node, page and indexer, and nothing that writes", () => {
    const profiles = [...toml().matchAll(/^\[([a-z0-9_-]+)\]$/gm)].map((match) => match[1] ?? "").sort();
    expect(profiles).toEqual([...universes().map((one) => one.id), "local", "sapphire", "testnet"].sort());
    for (const universe of universes()) {
      expect(keys(universe.id)).toEqual(["chain-id", "gnoweb-url", "rpc-url", "tx-indexer-url"]);
      expect(field(universe.id, "chain-id")).toBe(universe.chainId);
      expect(field(universe.id, "rpc-url")).toBe(universe.rpc);
      expect(field(universe.id, "gnoweb-url")).toBe(universe.gnoweb);
      expect(field(universe.id, "tx-indexer-url")).toBe(universe.indexer);
    }
  });

  it("redefine gnomcp's built-ins on the mainnet's chain, which gnomcp 0.11.0 never writes to", () => {
    // gnomcp 0.11.0 writes to dev and testnet chains alone (internal/profiles/validate.go, testnetChainNames).
    const mainnet = universes().find((one) => one.chainId === "gnoland-1");
    for (const builtin of ["local", "sapphire", "testnet"]) {
      expect(keys(builtin)).toEqual(["chain-id", "rpc-url"]);
      expect(field(builtin, "chain-id")).toBe("gnoland-1");
      expect(field(builtin, "rpc-url")).toBe(mainnet?.rpc);
    }
  });
});

describe("the networks", () => {
  it("are every one internal, with no gateway, but the guard's own way out", () => {
    for (const name of keysOf(networks(), 2).filter((one) => one !== "outside")) {
      const network = block(networks(), 2, name);
      expect(network, name).toMatch(/^ {4}internal: true$/m);
      expect(network, name).toMatch(/^ {6}com\.docker\.network\.bridge\.gateway_mode_ipv4: isolated$/m);
      expect(network, name).toMatch(/^ {6}com\.docker\.network\.bridge\.gateway_mode_ipv6: isolated$/m);
    }
    expect(keysOf(networks(), 2)).toEqual(
      expect.arrayContaining(["inside", "jarvis", "jarvis_out", "admin", "outside"]),
    );
    expect(on("outside")).toEqual(["guard"]);
  });

  it("put jarvis on its two alone, and the server on the internal one, jarvis's and the admin API's", () => {
    expect(networksOf("jarvis")).toEqual(["jarvis", "jarvis_out"]);
    expect(networksOf("server")).toEqual(["admin", "inside", "jarvis"]);
    expect(on("jarvis")).toEqual(["jarvis", "server"]);
    expect(on("jarvis_out")).toEqual(["guard", "jarvis"]);
    expect(on("admin")).toEqual(["server"]);
    expect(names().filter((name) => service(name).includes("network_mode: service:jarvis"))).toEqual([]);
  });

  it("open the admin API on the server's address of its own network, never on the others", () => {
    const address = defaultOf(setting("server", "ADMIN_HOST"), "ADMIN_ADDRESS") ?? "";
    expect(block(service("server"), 4, "networks")).toContain(`ipv4_address: \${ADMIN_ADDRESS:-${address}}`);
    expect(setting("server", "ADMIN_PORT")).toBe('"8082"');
    expect(inSubnet(address, defaultOf(subnetOf("admin"), "ADMIN_SUBNET") ?? "")).toBe(true);
  });

  it("have private, disjoint subnets by default, so the guard's refusal of private addresses covers them", () => {
    const subnets = [
      defaultOf(subnetOf("inside"), "INSIDE_SUBNET"),
      defaultOf(subnetOf("jarvis"), "JARVIS_SUBNET"),
      defaultOf(subnetOf("admin"), "ADMIN_SUBNET"),
    ].map((one) => one ?? "");
    for (const subnet of subnets) expect(isPrivate(subnet), subnet).toBe(true);
    for (const [at, subnet] of subnets.entries())
      for (const other of subnets.slice(at + 1)) expect(inSubnet(other.split("/")[0] ?? "", subnet)).toBe(false);
  });
});

describe("jarvis's way out", () => {
  it("is a proxy of its own, locked as the server's, in the guard's network, on its own port and list", () => {
    const egress = service("egress_jarvis");
    expect(egress).toMatch(/^ {4}<<: \*locked$/m);
    expect(egress).toMatch(/^ {4}profiles: \[demo\]$/m);
    expect(egress).toMatch(/^ {4}user: "65532:65532"$/m);
    expect(egress).toMatch(/^ {4}network_mode: service:guard$/m);
    expect(egress).toMatch(/^ {6}guard: \{ condition: service_healthy, restart: true \}$/m);
    expect(egress).toMatch(/^ {6}test: \[CMD, \/probe, "127\.0\.0\.1:4751"\]$/m);
    for (const cap of ["cpus", "mem_limit", "pids_limit"])
      expect(egress).toMatch(new RegExp(`^ {4}${cap}: \\S+$`, "m"));
    // smokescreen v0.1.0 applies its flags after its config file (cmd/smokescreen.go:195-292): the port and list win.
    // A flow list of quoted words, on one line or as Prettier lays it out.
    const entry = block(egress, 4, "entrypoint")
      .replace(/^ {4}entrypoint:/, "")
      .replace(/,(\s*)\]/, "$1]");
    expect(z.array(z.string()).parse(JSON.parse(entry))).toEqual([
      "/smokescreen",
      "--config-file",
      "/etc/smokescreen/config.yaml",
      "--listen-port",
      "4751",
      "--egress-acl-file",
      "/etc/smokescreen/jarvis-acl.yaml",
    ]);
    expect(setting("jarvis", "HTTPS_PROXY")).toBe("${JARVIS_EGRESS_PROXY:-http://guard:4751}");
    expect(setting("jarvis", "NODE_USE_ENV_PROXY")).toBe('"1"');
    expect(read("deploy/egress/Dockerfile")).toMatch(
      /^COPY deploy\/egress\/config\.yaml deploy\/egress\/acl\.yaml deploy\/egress\/jarvis-acl\.yaml \/out\/etc\/$/m,
    );
    expect(read(".dockerignore").split("\n")).toContain("!deploy/egress/jarvis-acl.yaml");
  });

  it("lets out Anthropic's API, each universe's node and indexer, and gnoscope, by full name, and nothing else", () => {
    const hostOf = (url: string) => new URL(url).hostname;
    const wanted = [
      "api.anthropic.com",
      "gnoscope.com",
      ...universes().flatMap((universe) => [hostOf(universe.rpc), hostOf(universe.indexer)]),
    ].sort();
    expect(allowedBy(read("deploy/egress/jarvis-acl.yaml"))).toEqual(wanted);
  });

  it.each(["deploy/egress/acl.yaml", "deploy/egress/jarvis-acl.yaml"])(
    "%s enforces its one list: no service rule, no other list, no wildcard",
    (path) => {
      const acl = read(path);
      expect(keysOf(acl, 0)).toEqual(["version", "services", "default"]);
      expect(acl).toMatch(/^services: \[\]$/m);
      expect(keysOf(block(acl, 0, "default"), 2)).toEqual(["project", "action", "allowed_domains"]);
      expect(block(acl, 0, "default")).toMatch(/^ {2}action: enforce$/m);
      expect([...acl.matchAll(/^\s+- /gm)].length).toBe(allowedBy(acl).length);
      expect(acl).not.toMatch(/\*/);
    },
  );

  it("shares no host with the server's list but a node both read", () => {
    const server = new Set(allowedBy(read("deploy/egress/acl.yaml")));
    const shared = allowedBy(read("deploy/egress/jarvis-acl.yaml")).filter((host) => server.has(host));
    const nodes = universes().map((universe) => new URL(universe.rpc).hostname);
    expect(shared.filter((host) => !nodes.includes(host))).toEqual([]);
    expect(server.has("api.anthropic.com")).toBe(false);
    expect(server.has("gnoscope.com")).toBe(false);
  });
});

describe("the guard's rules", () => {
  const rules = () => read("deploy/guard/guard.sh");
  const at = (line: string) => rules().indexOf(line);
  it("let jarvis's proxy be reached from jarvis's network alone, and the server's from the internal one alone", () => {
    expect(rules()).toMatch(/^jarvis_out=\$\(ip route get "\$jarvis"/m);
    const accept = at(`echo "-A INPUT -i $jarvis_out -p tcp --dport 4751 -j ACCEPT"`);
    const reject = at(`echo '-A INPUT -p tcp --dport 4751 -j REJECT'`);
    const closed = at(`echo "-A INPUT -i $jarvis_out -j REJECT"`);
    expect(accept).toBeGreaterThan(-1);
    expect(reject).toBeGreaterThan(accept);
    expect(closed).toBeGreaterThan(accept);
    expect(at(`echo "-A INPUT -i $inside -p tcp --dport 4750 -j ACCEPT"`)).toBeGreaterThan(-1);
    expect(at(`echo '-A INPUT -p tcp --dport 4750 -j REJECT'`)).toBeGreaterThan(-1);
  });

  it("send jarvis's network nothing but its proxy's replies", () => {
    const outputs = [...rules().matchAll(/-A OUTPUT -o \$jarvis_out [^"']*/g)].map((match) => match[0]);
    expect(outputs).toEqual([
      "-A OUTPUT -o $jarvis_out -p tcp --sport 4751 -m conntrack --ctstate ESTABLISHED -j ACCEPT",
    ]);
  });

  it("wait for jarvis, whose address names its network", () => {
    expect(block(service("guard"), 4, "depends_on")).toMatch(/^ {6}jarvis: \{ condition: service_healthy \}$/m);
  });
});

// What only Docker proves, read as text so a check or a fault planted for it is not lost (deploy/test.sh, F2763).
describe("deploy/test.sh", () => {
  const script = () => read("deploy/test.sh");
  const jarvis = () => read("deploy/test-jarvis.sh");
  it("starts jarvis and its way out with a made-up key, and runs jarvis's proofs", () => {
    expect(script()).toContain(`export ANTHROPIC_API_KEY_FILE="$tmp/anthropic_api_key"`);
    expect(script()).toMatch(/for secret in ergo_oper_password log_pepper openai_api_key anthropic_api_key; do/);
    expect(script()).toMatch(/up -d --build --wait web guard ergo server egress jarvis egress_jarvis/);
    expect(script()).toContain(`. "$here/test-jarvis.sh"`);
    expect(script()).toContain(`"$here/jarvis/Dockerfile"; do`);
    expect(script()).toMatch(/hardened "\$jarvis" jarvis$/m);
  });

  it("proves jarvis's networks, its way out, its file, its key and its image on the running stack", () => {
    for (const check of [
      "jarvis sits on its two networks only",
      "jarvis's network holds jarvis and the server alone",
      "the admin API's network holds the server alone",
      "the server reads jarvis's budgets by its name, not through its way out",
      "jarvis, off by default, answers a question off",
      "nothing on the internal network reaches jarvis",
      "jarvis's way out lets six hosts out",
      "jarvis reaches Anthropic's API through its way out",
      "jarvis cannot use the server's way out",
      "the guard's rules refuse 4751 but from jarvis's network",
      "no other service mounts it",
      "the server holds no Anthropic key",
      "jarvis waits 35 s for its drain",
      "the image holds no test, bench or test helper",
    ])
      expect(jarvis(), check).toContain(check);
  });

  it("plants each of jarvis's faults in `--mutants`, each killed by its own check", () => {
    const faults: [string, string][] = [
      ["a host added to jarvis's way out", "jarvis's way out lets six hosts out"],
      ["jarvis's way out open to the internal network", "the guard's rules refuse 4751 but from jarvis's network"],
      ["the guard drops jarvis's replies", "jarvis reaches Anthropic's API through its way out"],
      ["jarvis on the internal network", "jarvis sits on its two networks only"],
      ["jarvis's root writable", "jarvis: read-only root"],
      ["jarvis's key given to the server", "the server holds no Anthropic key"],
      ["jarvis killed before its drain ends", "jarvis waits 35 s for its drain"],
    ];
    for (const [fault, by] of faults) expect(script()).toContain(`mutant "${fault}" "${by}"`);
  });
});
