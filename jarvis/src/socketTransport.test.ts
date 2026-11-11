import { createServer } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startGnomcp, type Gnomcp } from "./gnomcp.ts";
import { readOnlyProfiles, type Scenario } from "./testing/fakeGnomcp.ts";
import { fakeGnomcpTcp } from "./testing/fakeGnomcpTcp.ts";
import { capture } from "./testing/kit.ts";

// gnomcp reached over TCP (10u-g2): the same MCP, the same start checks, timeouts, bound and restarts as over stdio,
// tested against a fake on a local socket.
const PROFILES = { read: ["onyx", "betanet"], indexed: ["onyx"] };
const opened: Gnomcp[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((gnomcp) => gnomcp.close()));
});

const setupOf = async (scenario: Scenario = {}, extra: { callTimeoutMs?: number; now?: () => number } = {}) => {
  const tcp = await fakeGnomcpTcp(scenario);
  const { log, events, raw } = capture();
  return { ...tcp, events, raw, setup: { address: tcp.address, profiles: PROFILES, log, ...extra } };
};
const start = async (scenario: Scenario = {}, extra: { callTimeoutMs?: number; now?: () => number } = {}) => {
  const made = await setupOf(scenario, extra);
  const gnomcp = await startGnomcp(made.setup);
  opened.push(gnomcp);
  return { ...made, gnomcp };
};
const message = async (scenario: Scenario) => {
  const made = await setupOf(scenario);
  return startGnomcp(made.setup).then(
    (gnomcp) => {
      opened.push(gnomcp);
      return "started";
    },
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
};
const render = (gnomcp: Gnomcp) => gnomcp.call("gno_render", { profile: "onyx", realm: "gno.land/r/x" });

describe("gnomcp over TCP", () => {
  it("starts over one connection, checks it as over stdio, and gives a read's text", async () => {
    const { gnomcp, fake, connections } = await start();
    expect(await gnomcp.call("gno_status", { profile: "onyx" })).toEqual({
      ok: true,
      text: 'gno_status {"profile":"onyx"}',
      isError: false,
    });
    expect(connections()).toBe(1);
    expect(fake.requests().map(({ method }) => method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/list",
      "tools/call",
      "tools/call",
    ]);
  });

  it("refuses a call outside the table before it reaches the socket", async () => {
    const { gnomcp, fake } = await start();
    expect(await gnomcp.call("gno_call", { profile: "onyx" })).toEqual({ ok: false, reason: "refused" });
    expect(fake.requests().filter(({ method }) => method === "tools/call")).toHaveLength(1);
  });

  it("refuses to start when a profile is not read-only", async () => {
    const profiles = readOnlyProfiles().map((profile) => ({ ...profile, kind: "testnet" }));
    expect(await message({ profiles })).toMatch(/not read-only/);
  });

  it("refuses to start when one of our reads is missing", async () => {
    expect(await message({ tools: [] })).toMatch(/no tool gno_packages/);
  });

  it("refuses a server that is not gnomcp 0.11.0", async () => {
    expect(await message({ server: { name: "gnomcp", version: "0.12.0" } })).toMatch(/not gnomcp 0.11.0/);
  });

  it("refuses to start when nothing listens", async () => {
    const { log } = capture();
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const address = closed.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    await new Promise((resolve) => closed.close(resolve));
    await expect(
      startGnomcp({ address: { host: "127.0.0.1", port: address.port }, profiles: PROFILES, log }),
    ).rejects.toThrow();
  });

  it("ends a call that passes its time as a timeout", async () => {
    const { gnomcp } = await start({ slow: ["gno_status"] }, { callTimeoutMs: 200 });
    expect(await gnomcp.call("gno_status", { profile: "onyx" })).toEqual({ ok: false, reason: "timeout" });
  });

  it("starts again at the next call once the connection dropped, and checks it again", async () => {
    const { gnomcp, connections } = await start({ crash: { tool: "gno_render", starts: 1 } });
    expect(await render(gnomcp)).toMatchObject({ ok: false });
    expect(await gnomcp.call("gno_status", { profile: "onyx" })).toMatchObject({ ok: true });
    expect(connections()).toBe(2);
  });

  it("gives up after 3 starts in 10 minutes, and starts again once the window passed", async () => {
    const clock = { now: Date.parse("2026-11-04T12:00:00.000Z") };
    const { gnomcp, events } = await start({ crash: { tool: "gno_render", starts: 99 } }, { now: () => clock.now });
    for (let crash = 0; crash < 4; crash += 1) expect(await render(gnomcp)).toEqual({ ok: false, reason: "down" });
    expect(events()).toContainEqual({ event: "jarvis_gnomcp_down", reason: "restarts" });
    clock.now += 11 * 60_000;
    expect(await gnomcp.call("gno_status", { profile: "onyx" })).toMatchObject({ ok: true });
  });

  it("drops the connection when one message passes 1 MiB, spending none of the restarts", async () => {
    const answers = { gno_render: { content: [{ type: "text", text: "z".repeat(1_100_000) }] } };
    const { gnomcp, connections, events } = await start({ answers });
    for (let drop = 0; drop < 4; drop += 1) expect(await render(gnomcp)).toEqual({ ok: false, reason: "down" });
    expect(await gnomcp.call("gno_status", { profile: "onyx" })).toMatchObject({ ok: true });
    expect(connections()).toBe(5);
    expect(events()).not.toContainEqual({ event: "jarvis_gnomcp_down", reason: "restarts" });
    expect(events()).toContainEqual({ event: "jarvis_gnomcp_down", reason: "oversized" });
  });

  it("closes its connection, which the server sees close, and answers down after", async () => {
    const { gnomcp, open } = await start();
    expect(open()).toBe(1);
    await gnomcp.close();
    await vi.waitFor(() => {
      expect(open()).toBe(0);
    });
    expect(await gnomcp.call("gno_status", { profile: "onyx" })).toEqual({ ok: false, reason: "down" });
  });
});
