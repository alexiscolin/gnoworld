import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { startGnomcp, type Gnomcp, type Ran } from "./gnomcp.ts";
import { gnomcpTools } from "./gnomcpTools.ts";
import { fakeGnomcp, gnomcpListing, readOnlyProfiles, type Scenario } from "./testing/fakeGnomcp.ts";
import { capture } from "./testing/kit.ts";

const CONFIG = "/etc/jarvis/gnomcp.toml";
const PROFILES = { read: ["onyx", "betanet"], indexed: ["onyx"] };
const MINUTE = 60_000;

const opened: Gnomcp[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(opened.splice(0).map((gnomcp) => gnomcp.close()));
});

const setupOf = (
  scenario: Scenario = {},
  extra: { callTimeoutMs?: number; startTimeoutMs?: number; now?: () => number } = {},
) => {
  const fake = fakeGnomcp(scenario);
  const { log, events, raw } = capture();
  const setup = {
    command: fake.command,
    config: CONFIG,
    profiles: PROFILES,
    tools: gnomcpTools({ chains: PROFILES.read, indexed: PROFILES.indexed }),
    log,
    ...extra,
  };
  return { fake, setup, events, raw };
};
const start = async (
  scenario: Scenario = {},
  extra: { callTimeoutMs?: number; startTimeoutMs?: number; now?: () => number } = {},
) => {
  const made = setupOf(scenario, extra);
  const gnomcp = await startGnomcp(made.setup);
  opened.push(gnomcp);
  return { ...made, gnomcp };
};
const refusal = async (scenario: Scenario) => {
  const made = setupOf(scenario);
  const error: unknown = await startGnomcp(made.setup).then(
    (gnomcp) => {
      opened.push(gnomcp);
      return new Error("gnomcp started");
    },
    (caught: unknown) => caught,
  );
  return { ...made, message: error instanceof Error ? error.message : String(error) };
};
// Whether a process still runs: signal 0 checks, and sends nothing.
const running = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
// What a child writes arrives in its own time: wait for it, a little at a time.
const until = async (seen: () => boolean): Promise<void> => {
  for (let tries = 0; !seen(); tries += 1) {
    if (tries > 500) throw new Error("waited 5 s for the child");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe("startGnomcp: gnomcp started read-only", () => {
  it("runs it in an empty folder of its own, its home, keys and sessions there, with its configuration and its audit on stderr", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY_FILE", "/run/secrets/anthropic");
    vi.stubEnv("GNOMCP_SESSION_PASSPHRASE", "a-passphrase-of-the-test");
    vi.stubEnv("GNOMCP_CONFIG", "/elsewhere/profiles.toml");
    const { fake } = await start();
    const [seen] = fake.starts();
    const home = seen?.cwd ?? "";
    expect(home.startsWith(realpathSync(tmpdir()))).toBe(true);
    expect(seen?.listed).toEqual([]);
    expect(seen?.argv).toEqual([
      "-config",
      CONFIG,
      "-audit-path",
      "/dev/stderr",
      "-audit-reads",
      "-sessions-path",
      join(home, "sessions"),
    ]);
    expect(seen?.env).toEqual({ HOME: home, GNOMCP_AGENT_KEYS_PATH: join(home, "agent-keys") });
  });

  it("speaks MCP: initializes, lists the tools, reads the profiles, and calls no write", async () => {
    const { fake } = await start();
    const Named = z.object({ name: z.string() });
    const methods = fake
      .requests()
      .map(({ method, params }) => (method === "tools/call" ? `${method} ${Named.parse(params).name}` : method));
    expect(methods).toEqual(["initialize", "notifications/initialized", "tools/list", "tools/call gno_profile_list"]);
  });

  it("removes its folder once closed", async () => {
    const { fake, gnomcp } = await start();
    const home = fake.starts()[0]?.cwd ?? "";
    expect(existsSync(home)).toBe(true);
    await gnomcp.close();
    expect(existsSync(home)).toBe(false);
  });

  it.each(["gno_packages", "gno_read", "gno_render", "gno_eval", "gno_status", "gno_history", "gno_activity"])(
    "refuses to start when gnomcp has no %s, naming it, and leaves no folder",
    async (name) => {
      const tools = gnomcpListing().filter((tool) => tool.name !== name);
      const { message, fake } = await refusal({ tools });
      expect(message).toBe(`gnomcp: no tool ${name}`);
      expect(existsSync(fake.starts()[0]?.cwd ?? "")).toBe(false);
    },
  );

  it.each([
    ["gno_read", "symbols"],
    ["gno_activity", "realm"],
    ["gno_packages", "limit"],
    ["gno_status", "profile"],
  ])("refuses to start when %s's schema has no %s, which ours allows", async (name, field) => {
    const tools = gnomcpListing().map((tool) => {
      if (tool.name !== name) return tool;
      const properties = Object.fromEntries(
        Object.entries(tool.inputSchema.properties).filter(([key]) => key !== field),
      );
      return { ...tool, inputSchema: { ...tool.inputSchema, properties } };
    });
    expect((await refusal({ tools })).message).toBe(`gnomcp: ${name} has no field ${field}`);
  });

  it.each([
    ["the current testnet", { name: "testnet", chain_id: "pearl-1", kind: "testnet", tx_indexer_url: "" }],
    ["a local chain", { name: "local", chain_id: "dev", kind: "local", tx_indexer_url: "" }],
    ["a kind gnomcp may add later", { name: "staging", chain_id: "staging", kind: "writable", tx_indexer_url: "" }],
  ])("refuses to start when gnomcp holds a profile on %s, which it may write", async (_case, profile) => {
    const { message } = await refusal({ profiles: [...readOnlyProfiles(), profile] });
    expect(message).toBe(`gnomcp: the profile ${profile.name} is ${profile.kind}, not read-only`);
  });

  it("refuses to start when one of Jarvis's profiles is not gnomcp's", async () => {
    const profiles = readOnlyProfiles().filter((profile) => profile.name !== "betanet");
    expect((await refusal({ profiles })).message).toBe("gnomcp: no profile betanet");
  });

  it("refuses to start when a profile Jarvis reads the indexer of has none in gnomcp", async () => {
    const profiles = readOnlyProfiles().map((profile) => ({ ...profile, tx_indexer_url: "" }));
    expect((await refusal({ profiles })).message).toBe("gnomcp: the profile onyx has no indexer");
  });

  it.each([
    ["an error result", { content: [{ type: "text", text: "no config" }], isError: true }],
    ["no structured content", { content: [{ type: "text", text: "4 profiles loaded" }] }],
    [
      "a profile with no kind",
      { content: [], structuredContent: { profiles: [{ name: "onyx", tx_indexer_url: "" }] } },
    ],
    [
      "a kind that is a number",
      { content: [], structuredContent: { profiles: [{ name: "onyx", kind: 1, tx_indexer_url: "" }] } },
    ],
    ["no list", { content: [], structuredContent: { profile: [] } }],
  ])("refuses to start on a profile list it cannot read: %s", async (_case, answer) => {
    const { message } = await refusal({ answers: { gno_profile_list: answer } });
    expect(message).toBe("gnomcp: its profile list is not gnomcp 0.11.0's");
  });

  it("refuses a kind written otherwise than gnomcp's own word, read-only", async () => {
    const profiles = readOnlyProfiles().map((profile) => ({ ...profile, kind: "READ-ONLY" }));
    expect((await refusal({ profiles })).message).toBe("gnomcp: the profile betanet is READ-ONLY, not read-only");
  });

  it.each(["initialize", "tools/list", "gno_profile_list"])(
    "refuses a gnomcp that never answers %s at start, its process ended and its folder removed",
    async (silent) => {
      const made = setupOf({ slow: [silent] }, { startTimeoutMs: 1_000 });
      const started = performance.now();
      const error: unknown = await startGnomcp(made.setup).catch((caught: unknown) => caught);
      expect(error instanceof Error ? error.message : error).toBe("gnomcp: it did not answer at start");
      expect(performance.now() - started).toBeLessThan(5_000);
      const [seen] = made.fake.starts();
      expect(existsSync(seen?.cwd ?? "")).toBe(false);
      await until(() => !running(seen?.pid ?? 0));
      expect(running(seen?.pid ?? 0)).toBe(false);
    },
  );

  it("ends the child of a start it refused after the spawn", async () => {
    const { fake } = await refusal({ tools: gnomcpListing().filter((tool) => tool.name !== "gno_eval") });
    await until(() => !running(fake.starts()[0]?.pid ?? 0));
    expect(running(fake.starts()[0]?.pid ?? 0)).toBe(false);
  });

  it("refuses to start when a profile Jarvis reads the indexer of is not gnomcp's", async () => {
    const made = setupOf();
    const setup = { ...made.setup, profiles: { read: PROFILES.read, indexed: ["onyx", "sapphire"] } };
    const error: unknown = await startGnomcp(setup).catch((caught: unknown) => caught);
    expect(error instanceof Error ? error.message : error).toBe("gnomcp: the profile sapphire has no indexer");
  });

  it("refuses a gnomcp that stops at start, its last words logged", async () => {
    const { message, events } = await refusal({ exitAtStart: true, stderr: ["load config: bad rpc-url"] });
    expect(message).toBe("gnomcp: it stopped at start");
    await until(() => events().length > 0);
    expect(events()).toContainEqual({ event: "jarvis_gnomcp_stderr", error: "load config: bad rpc-url" });
  });
});

describe("Gnomcp.call: one read", () => {
  it("gives a read's text once its result passed the schema", async () => {
    const { gnomcp, fake } = await start();
    expect(await gnomcp.call("gno_status", { profile: "onyx" })).toEqual({
      ok: true,
      text: 'gno_status {"profile":"onyx"}',
      isError: false,
    });
    expect(fake.requests().at(-1)).toMatchObject({
      method: "tools/call",
      params: { name: "gno_status", arguments: { profile: "onyx" } },
    });
  });

  it.each([
    ["a write gnomcp lists", "gno_call", { profile: "onyx", realm: "gno.land/r/demo/boards", func: "CreatePost" }],
    ["an admin tool", "gno_profile_add", { name: "pearl", gnoweb_url: "https://pearl.testnets.example" }],
    ["a key tool", "gno_key_generate", { profile: "onyx" }],
    ["a read on a profile not Jarvis's", "gno_status", { profile: "testnet" }],
    ["a read with a field ours lacks", "gno_render", { profile: "onyx", realm: "gno.land/r/x", identity: "agent" }],
  ])("refuses %s itself, a second wall behind the loop's, and never sends it", async (_case, name, args) => {
    const { gnomcp, fake } = await start();
    expect(await gnomcp.call(name, args)).toEqual({ ok: false, reason: "refused" });
    expect(fake.requests().filter((request) => request.method === "tools/call")).toHaveLength(1);
  });

  it("joins a text and a resource's text, as gno_read gives a package's source", async () => {
    const answers = {
      gno_read: {
        content: [
          { type: "text", text: "outline" },
          {
            type: "resource",
            resource: { uri: "gno://gno.land/r/demo/boards", mimeType: "text/plain", text: "-- a.gno --" },
          },
        ],
      },
    };
    const { gnomcp } = await start({ answers });
    expect(await gnomcp.call("gno_read", { profile: "onyx", path: "gno.land/r/demo/boards" })).toEqual({
      ok: true,
      text: "outline\n-- a.gno --",
      isError: false,
    });
  });

  it("gives gnomcp's own error result as an error, its text kept for the block", async () => {
    const answers = { gno_render: { content: [{ type: "text", text: "no chain client" }], isError: true } };
    const { gnomcp } = await start({ answers });
    expect(await gnomcp.call("gno_render", { profile: "onyx", realm: "gno.land/r/x" })).toEqual({
      ok: true,
      text: "no chain client",
      isError: true,
    });
  });

  it.each([
    ["an image", { content: [{ type: "image", data: "AAAA", mimeType: "image/png" }] }],
    ["a resource with no text", { content: [{ type: "resource", resource: { uri: "gno://x", blob: "AAAA" } }] }],
    ["no content", { content: [] }],
  ])("refuses a result it cannot read as text: %s", async (_case, answer) => {
    const { gnomcp } = await start({ answers: { gno_status: answer } });
    expect(await gnomcp.call("gno_status", { profile: "onyx" })).toEqual({ ok: false, reason: "malformed" });
  });

  it("drops gnomcp when one message passes 1 MiB, and starts it again at the next call", async () => {
    const answers = { gno_render: { content: [{ type: "text", text: "z".repeat(1_100_000) }] } };
    const { gnomcp, fake } = await start({ answers });
    expect(await gnomcp.call("gno_render", { profile: "onyx", realm: "gno.land/r/x" })).toEqual({
      ok: false,
      reason: "down",
    });
    expect(await gnomcp.call("gno_status", { profile: "onyx" })).toMatchObject({ ok: true });
    expect(fake.starts()).toHaveLength(2);
  });

  it("gives up a call at its timeout, the child still answering the next one", async () => {
    const { gnomcp, fake } = await start({ slow: ["gno_status"] }, { callTimeoutMs: 200 });
    const started = performance.now();
    expect(await gnomcp.call("gno_status", { profile: "onyx" })).toEqual({ ok: false, reason: "timeout" });
    expect(performance.now() - started).toBeLessThan(3_000);
    expect(await gnomcp.call("gno_render", { profile: "onyx", realm: "gno.land/r/x" })).toMatchObject({ ok: true });
    expect(fake.starts()).toHaveLength(1);
  });

  it("starts a crashed gnomcp again at the next call, and checks it again", async () => {
    const { gnomcp, fake } = await start({ crash: { tool: "gno_render", starts: 1 } });
    expect(await gnomcp.call("gno_render", { profile: "onyx", realm: "gno.land/r/x" })).toEqual({
      ok: false,
      reason: "down",
    });
    expect(await gnomcp.call("gno_status", { profile: "onyx" })).toMatchObject({ ok: true });
    expect(fake.starts()).toHaveLength(2);
    const again = fake
      .requests()
      .filter((request) => request.start === 2)
      .map((request) => request.method);
    expect(again.slice(0, 4)).toEqual(["initialize", "notifications/initialized", "tools/list", "tools/call"]);
  });

  it("starts it once for calls that find it down at once", async () => {
    const { gnomcp, fake } = await start({ crash: { tool: "gno_render", starts: 1 } });
    await gnomcp.call("gno_render", { profile: "onyx", realm: "gno.land/r/x" });
    const both = await Promise.all([
      gnomcp.call("gno_status", { profile: "onyx" }),
      gnomcp.call("gno_status", { profile: "betanet" }),
    ]);
    expect(both.map((ran: Ran) => ran.ok)).toEqual([true, true]);
    expect(fake.starts()).toHaveLength(2);
  });

  it("starts it 3 times in 10 minutes at most, then answers down until the window moves on", async () => {
    const clock = { now: Date.parse("2026-11-04T12:00:00.000Z") };
    const { gnomcp, fake, events } = await start(
      { crash: { tool: "gno_render", starts: 99 } },
      { now: () => clock.now },
    );
    const render = () => gnomcp.call("gno_render", { profile: "onyx", realm: "gno.land/r/x" });
    for (let crash = 0; crash < 4; crash += 1) expect(await render()).toEqual({ ok: false, reason: "down" });
    expect(fake.starts()).toHaveLength(3);
    expect(events()).toContainEqual({ event: "jarvis_gnomcp_down", reason: "restarts" });
    clock.now += 10 * MINUTE;
    expect(await render()).toEqual({ ok: false, reason: "down" });
    expect(fake.starts()).toHaveLength(3);
    clock.now += 1;
    expect(await render()).toEqual({ ok: false, reason: "down" });
    expect(fake.starts()).toHaveLength(4);
  });

  it("ends a child started again while it was closing, and answers down after", async () => {
    const { gnomcp, fake } = await start({ crash: { tool: "gno_render", starts: 1 } });
    await gnomcp.call("gno_render", { profile: "onyx", realm: "gno.land/r/x" });
    const restarting = gnomcp.call("gno_status", { profile: "onyx" });
    await gnomcp.close();
    await restarting;
    expect(await gnomcp.call("gno_status", { profile: "onyx" })).toEqual({ ok: false, reason: "down" });
    const pids = fake.starts().map((seen) => seen.pid);
    await until(() => !pids.some(running));
    expect(pids.some(running)).toBe(false);
    expect(fake.starts().map((seen) => existsSync(seen.cwd))).toEqual(pids.map(() => false));
  });

  it("answers down when gnomcp, started again, no longer passes its checks, and logs why", async () => {
    const { gnomcp, fake, events } = await start({ crash: { tool: "gno_render", starts: 1 } });
    await gnomcp.call("gno_render", { profile: "onyx", realm: "gno.land/r/x" });
    const writable = { name: "testnet", chain_id: "pearl-1", kind: "testnet", tx_indexer_url: "" };
    fake.change({ profiles: [...readOnlyProfiles(), writable] });
    expect(await gnomcp.call("gno_status", { profile: "onyx" })).toEqual({ ok: false, reason: "down" });
    expect(events()).toContainEqual({
      event: "jarvis_gnomcp_down",
      error: "gnomcp: the profile testnet is testnet, not read-only",
    });
  });
});

describe("startGnomcp: gnomcp's stderr in jarvis's log", () => {
  it("logs each audit line by its tool, its result and its time, never its arguments", async () => {
    const { gnomcp, events, raw } = await start();
    await gnomcp.call("gno_eval", { profile: "onyx", path: "gno.land/r/demo/boards", expr: "an-argument-0123456789" });
    await until(() => events().some((event) => event["tool"] === "gno_eval"));
    expect(events()).toContainEqual({ event: "jarvis_gnomcp_audit", tool: "gno_profile_list", reason: "ok", ms: 3 });
    expect(events()).toContainEqual({ event: "jarvis_gnomcp_audit", tool: "gno_eval", reason: "ok", ms: 3 });
    expect(raw()).not.toContain("an-argument-0123456789");
  });

  it("logs any other line by its words, hidden characters shown, cut to 512 characters", async () => {
    const hidden = `warn ${String.fromCodePoint(0x202e)} reversed`;
    const { events } = await start({ stderr: ["2026/11/04 session hydration warning", hidden, "y".repeat(3_000_000)] });
    await until(() => events().filter((event) => event["event"] === "jarvis_gnomcp_stderr").length === 3);
    expect(events().filter((event) => event["event"] === "jarvis_gnomcp_stderr")).toEqual([
      { event: "jarvis_gnomcp_stderr", error: "2026/11/04 session hydration warning" },
      { event: "jarvis_gnomcp_stderr", error: "warn [U+202E] reversed" },
      { event: "jarvis_gnomcp_stderr", error: "y".repeat(512) },
    ]);
  });

  it.each([
    ["a duration that is no number", { tool: "gno_eval", result: "ok", duration_ms: "3" }],
    ["a result that is a number", { tool: "gno_eval", result: 7, duration_ms: 3 }],
    ["no tool", { result: "ok", duration_ms: 3 }],
  ])("never logs the text of a JSON line that is no audit line as gnomcp writes it: %s", async (_case, fields) => {
    const line = JSON.stringify({ ...fields, args_summary: JSON.stringify({ expr: "an-argument-0123456789" }) });
    const { events, raw } = await start({ stderr: [line, "[1, 2]"] });
    await until(() => events().filter((event) => event["event"] === "jarvis_gnomcp_audit").length >= 3);
    expect(raw()).not.toContain("an-argument-0123456789");
    expect(events().filter((event) => event["event"] === "jarvis_gnomcp_stderr")).toEqual([]);
  });

  it("logs an audit line's tool or result that is no name as <malformed>", async () => {
    const line = JSON.stringify({ tool: "gno status\nforged", result: "ok; rm", duration_ms: 1 });
    const { events } = await start({ stderr: [line] });
    await until(() => events().some((event) => event["event"] === "jarvis_gnomcp_audit"));
    expect(events()).toContainEqual({
      event: "jarvis_gnomcp_audit",
      tool: "<malformed>",
      reason: "<malformed>",
      ms: 1,
    });
  });
});
