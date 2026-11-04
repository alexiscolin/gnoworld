import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { loadJarvisConfig } from "./config.ts";

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
      database: ENV.JARVIS_DATABASE,
      budgets: { ask: 45 * DOLLAR, translate: 5 * DOLLAR },
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
      places: fileURLToPath(new URL("../../../app/data", import.meta.url)),
      skills: fileURLToPath(new URL("../../jarvis/skills", import.meta.url)),
      gnomcp: { command: "/usr/local/bin/gnomcp", config: "/etc/gnomcp/profiles.toml" },
      profiles: { read: ["testnet"], indexed: [] },
    });
  });

  it("reads the day's budgets in whole dollars, the demo's $3 and $1 among them, as nano-dollars", () => {
    const demo = { ...ENV, JARVIS_BUDGET_USD: "3", JARVIS_TRANSLATION_BUDGET_USD: "1" };
    expect(loadJarvisConfig(demo).budgets).toEqual({ ask: 3 * DOLLAR, translate: 1 * DOLLAR });
    const most = { ...ENV, JARVIS_BUDGET_USD: "500", JARVIS_TRANSLATION_BUDGET_USD: "500" };
    expect(loadJarvisConfig(most).budgets).toEqual({ ask: 500 * DOLLAR, translate: 500 * DOLLAR });
    const least = { ...ENV, JARVIS_BUDGET_USD: "1", JARVIS_TRANSLATION_BUDGET_USD: "1" };
    expect(loadJarvisConfig(least).budgets).toEqual({ ask: DOLLAR, translate: DOLLAR });
  });

  it("takes a database's path of 1024 characters, the longest", () => {
    const longest = `/${"d".repeat(1023)}`;
    expect(loadJarvisConfig({ ...ENV, JARVIS_DATABASE: longest }).database).toBe(longest);
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
