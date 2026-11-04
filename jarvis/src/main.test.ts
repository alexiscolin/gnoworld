import { spawn, type ChildProcessByStdio } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { queryEnvelope, statusEnvelope } from "@gnoworld/chain/testing/envelopes";
import {
  ApiError,
  JARVIS_PATHS,
  JarvisAnswer,
  JarvisBudgets,
  type AnswerButton,
  type JarvisAsk,
} from "@gnoworld/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { openDatabase } from "@gnoworld/service/db";
import { makeBudget } from "./budget.ts";
import { jarvisMigrations } from "./migrations.ts";
import { fakeAnthropic, held, type FakeStep } from "./testing/fakeAnthropic.ts";
import { fakeGnomcp, type Scenario } from "./testing/fakeGnomcp.ts";
import { fakeGnoscope } from "./testing/fakeGnoscope.ts";
import { bodyOf, onLoopback } from "./testing/loopback.ts";
import { message, text, toolUse } from "./testing/fakeModel.ts";
import { REALM_TYPE } from "./testing/realm.ts";
import { loadPlaces } from "./tools/places.ts";

interface Jarvis {
  child: ChildProcessByStdio<null, Readable, Readable>;
  out: { stdout: string; stderr: string };
}

const ENTRY = fileURLToPath(new URL("main.ts", import.meta.url));
const OUTBOUND = fileURLToPath(new URL("testing/outbound.ts", import.meta.url));
const APP_DATA = fileURLToPath(new URL("../../app/data", import.meta.url));
// As the image starts it (ADR-0002 §7), with the test's network fakes loaded first.
const FLAGS = ["--disallow-code-generation-from-strings", "--import", OUTBOUND];
const DOLLAR = 1_000_000_000;
// A key the test makes up, never a real one.
const KEY = `sk-ant-made-up-${"k".repeat(40)}`;
const GNOSCOPE = "https://gnoscope.test";
// Onyx's node, as app/data's universes name it (its port, 443, is no part of its origin).
const ONYX_NODE = "https://rpc.onyx.testnets.gno.land";
const REALM = "gno.land/r/demo/poll";

const started: Jarvis[] = [];
const folders: string[] = [];
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const { child } of started.splice(0)) child.kill("SIGKILL");
  await Promise.all(closers.splice(0).map((close) => close()));
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const folder = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "gnoworld-jarvis-main-"));
  folders.push(dir);
  return dir;
};
// A server of the test's on the loopback, closed after it: its origin, and each request's path and body.
const local = async (answer: (request: IncomingMessage, body: string) => { status: number; body: unknown }) => {
  const received: { path: string; body: string }[] = [];
  const fake = await onLoopback(async (request, response) => {
    const body = await bodyOf(request);
    received.push({ path: request.url ?? "", body });
    const { status, body: json } = answer(request, body);
    response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(json));
  });
  closers.push(fake.close);
  return { origin: fake.origin, received };
};

// jarvis's settings in a folder of their own: on, its key file, its file, its gnomcp (a fake) on Onyx, gnoscope off, and
// Onyx's node a fake whose functions are the poll's.
const setup = async (steps: FakeStep[] = [], over: { gnomcp?: Scenario } = {}) => {
  const dir = folder();
  writeFileSync(join(dir, "anthropic"), `${KEY}\n`);
  const model = await fakeAnthropic(steps);
  closers.push(model.close);
  const gnoscope = await fakeGnoscope();
  closers.push(gnoscope.close);
  const node = await local((request) => {
    if (request.url === "/status") return { status: 200, body: statusEnvelope(1204, "2026-11-04T03:34:18Z", "onyx-1") };
    return { status: 200, body: queryEnvelope({ data: JSON.stringify(pollFunctions()) }) };
  });
  const gnomcp = fakeGnomcp({ answers: pollReads(), ...over.gnomcp });
  const env: Record<string, string> = {
    JARVIS: "on",
    JARVIS_PORT: "0",
    JARVIS_DATABASE: join(dir, "jarvis.db"),
    JARVIS_DRAIN_S: "60",
    ANTHROPIC_API_KEY_FILE: join(dir, "anthropic"),
    JARVIS_GNOMCP_COMMAND: gnomcp.command,
    JARVIS_GNOMCP_CONFIG: "/etc/jarvis/gnomcp.toml",
    JARVIS_PROFILES: "onyx",
    JARVIS_INDEXER_PROFILES: "onyx",
    JARVIS_GNOSCOPE_URL: `${GNOSCOPE}/mcp`,
    // gnomcp's folders, made under the system's temporary folder, in the test's own.
    TMPDIR: dir,
    JARVIS_TEST_OUTBOUND: JSON.stringify({
      "https://api.anthropic.com": model.origin,
      [GNOSCOPE]: new URL(gnoscope.url).origin,
      [ONYX_NODE]: node.origin,
    }),
  };
  return { dir, env, model, gnomcp, gnoscope, node };
};
// The poll's functions as `vm/qfuncs` gives them, and gnomcp's reads of its height and its page.
const pollFunctions = () => [
  {
    FuncName: "Vote",
    Params: [
      { Name: "cur", Type: REALM_TYPE },
      { Name: "id", Type: "int" },
      { Name: "answer", Type: "string" },
    ],
  },
];
const said = (words: string) => ({ content: [{ type: "text", text: words }] });
const pollReads = () => ({
  gno_status: said(
    JSON.stringify({
      block_time: "2026-11-04T03:34:18Z",
      chain_id: "onyx-1",
      height: 1204,
      node_chain_id: "onyx-1",
      profile: "onyx",
    }),
  ),
  gno_render: said(
    `<untrusted_content kind="render" source="${REALM}">\n# The poll\n\n37 proposals are open.\n\nAnswer yes or no.\n</untrusted_content>`,
  ),
});

const start = (env: Record<string, string>, flags = FLAGS): Jarvis => {
  const child = spawn(process.execPath, [...flags, ENTRY], {
    env: { PATH: process.env["PATH"] ?? "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const jarvis = { child, out: { stdout: "", stderr: "" } };
  child.stdout.on("data", (chunk: Buffer) => (jarvis.out.stdout += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (jarvis.out.stderr += chunk.toString()));
  started.push(jarvis);
  return jarvis;
};

// What a child prints arrives in its own time: wait for it on its own output, never on a clock.
const printed = (jarvis: Jarvis, seen: () => boolean): Promise<void> =>
  new Promise((resolve, reject) => {
    const read = (): void => {
      if (!seen()) return;
      jarvis.child.stdout.off("data", read);
      resolve();
    };
    jarvis.child.stdout.on("data", read);
    jarvis.child.once("exit", () => {
      if (seen()) resolve();
      else reject(new Error(`exited first: ${jarvis.out.stderr}`));
    });
    read();
  });
const exited = (jarvis: Jarvis): Promise<number | null> =>
  jarvis.child.exitCode !== null
    ? Promise.resolve(jarvis.child.exitCode)
    : new Promise((resolve) => jarvis.child.once("exit", resolve));
const Line = z.looseObject({ event: z.string() });
const lines = (jarvis: Jarvis) =>
  jarvis.out.stdout
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => Line.parse(JSON.parse(line)));
const listening = async (jarvis: Jarvis): Promise<string> => {
  await printed(jarvis, () => /"event":"listening".*"port":\d+/.test(jarvis.out.stdout));
  const port = /"event":"listening".*"port":(\d+)/.exec(jarvis.out.stdout)?.[1] ?? "";
  return `http://127.0.0.1:${port}`;
};
const ask = (url: string, body: unknown, signal?: AbortSignal) =>
  fetch(`${url}${JARVIS_PATHS.ask}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...(signal === undefined ? {} : { signal }),
  });
const setBudget = (url: string, budget: string, dollars: number) =>
  fetch(`${url}${JARVIS_PATHS.budgets}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ budget, dollars }),
  });
const QUESTION: JarvisAsk = { question: "Which block is Onyx at?", room: "#bubble", lines: [] };
const ended = (words: string) => message({ content: [text(words)], stop: "end_turn" });
const running = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
// The day's budget spent to its cap, $1, in jarvis's file before it starts, as a day of questions leaves it.
const spentDay = (path: string) => {
  const db = openDatabase(path, jarvisMigrations);
  const budget = makeBudget(db, { caps: { ask: DOLLAR, translate: DOLLAR }, holdMs: 60_000, now: Date.now });
  const reserved = budget.reserve("ask", DOLLAR);
  if (reserved.ok) budget.settle(reserved.hold, DOLLAR);
  db.close();
};
// The results of a turn's calls as the model's next request carries them, by their call's id.
const resultsOf = (body: Record<string, unknown> | undefined) => {
  const Results = z.object({
    content: z.array(z.object({ type: z.literal("tool_result"), tool_use_id: z.string(), content: z.string() })),
  });
  const results = Results.parse(z.array(z.unknown()).parse(body?.["messages"]).at(-1)).content;
  return (id: string) => results.find(({ tool_use_id: use }) => use === id)?.content ?? "";
};
const READS = ["gno_packages", "gno_read", "gno_render", "gno_eval", "gno_status", "gno_history", "gno_activity"];
const GNOSCOPE_READS = ["explain_tx", "get_realm_state", "get_address", "search_code"];
const namesOf = (body: { tools?: readonly { name: string }[] | undefined } | undefined) =>
  body?.tools?.map(({ name }) => name);

// Each test boots Node processes (jarvis, gnomcp's fake), which takes seconds when the machine is busy: a minute.
describe("jarvis's process: switched off", { timeout: 60_000 }, () => {
  it.each([
    ["unset", undefined],
    ["ON", "ON"],
    ["yes", "yes"],
  ])(
    "starts with JARVIS %s and answers off: no key read, no model client made, no gnomcp nor gnoscope reached",
    async (_case, value) => {
      const { env, model, gnomcp, gnoscope } = await setup();
      const rest = Object.fromEntries(Object.entries(env).filter(([key]) => key !== "JARVIS"));
      // A key file that is not there and a header the SDK's client refuses at its making: a read or a client stops it.
      const off = {
        ...rest,
        ...(value === undefined ? {} : { JARVIS: value }),
        JARVIS_GNOSCOPE: "on",
        ANTHROPIC_API_KEY_FILE: "/nonexistent/gnoworld-anthropic",
        ANTHROPIC_CUSTOM_HEADERS: "x-planted: 1",
      };
      const url = await listening(start(off));
      const response = await ask(url, QUESTION);
      expect(response.status).toBe(200);
      expect(JarvisAnswer.parse(await response.json())).toEqual({ status: "off" });
      expect(model.seen).toEqual([]);
      expect(gnomcp.starts()).toEqual([]);
      expect(gnoscope.requests).toEqual([]);
    },
  );

  it("serves its budgets while off, read and changed", async () => {
    const { env } = await setup();
    const url = await listening(start({ ...env, JARVIS: "off", JARVIS_BUDGET_USD: "3" }));
    expect(JarvisBudgets.parse(await (await fetch(`${url}${JARVIS_PATHS.budgets}`)).json())).toEqual({
      ask: 3,
      translate: 5,
    });
    expect(JarvisBudgets.parse(await (await setBudget(url, "translate", 2)).json())).toEqual({ ask: 3, translate: 2 });
  });

  it("refuses to start without --disallow-code-generation-from-strings", async () => {
    const { env } = await setup();
    const jarvis = start(env, ["--import", OUTBOUND]);
    expect(await exited(jarvis)).not.toBe(0);
    expect(jarvis.out.stderr).toContain("--disallow-code-generation-from-strings");
  });

  it("stops at start on a malformed setting, naming it and never its value", async () => {
    const { env } = await setup();
    const jarvis = start({ ...env, JARVIS: "off", JARVIS_PORT: "planted-port" });
    expect(await exited(jarvis)).not.toBe(0);
    expect(jarvis.out.stderr).toMatch(/setting JARVIS_PORT: /);
    expect(jarvis.out.stderr).not.toContain("planted-port");
  });
});

describe("jarvis's process: switched on", { timeout: 60_000 }, () => {
  it("answers a question through the model, sending its key from its file and the tools /ask offers", async () => {
    const { env, model, gnomcp, gnoscope } = await setup([ended("Onyx is at block 7.")]);
    const jarvis = start(env);
    const url = await listening(jarvis);
    const response = await ask(url, QUESTION);
    expect(response.status).toBe(200);
    expect(JarvisAnswer.parse(await response.json())).toEqual({
      status: "answered",
      markdown: "Onyx is at block 7.",
      buttons: [],
    });
    const [first] = model.seen;
    expect(first?.key).toBe(KEY);
    expect(namesOf(first?.body)).toEqual([...READS, "load_skill", "find_place", "give_button"]);
    expect(first?.body).toMatchObject({ model: "claude-sonnet-5-5", inference_geo: "global" });
    expect(gnomcp.starts()).toHaveLength(1);
    expect(gnoscope.requests).toEqual([]);
    expect(jarvis.out.stdout + jarvis.out.stderr).not.toContain(KEY);
  });

  it("offers gnoscope's reads with its switch on, once it listed them at start", async () => {
    const { env, model } = await setup([ended("Done.")]);
    const url = await listening(start({ ...env, JARVIS_GNOSCOPE: "on" }));
    await ask(url, QUESTION);
    expect(namesOf(model.seen[0]?.body)).toEqual([
      ...READS,
      "load_skill",
      "find_place",
      "give_button",
      ...GNOSCOPE_READS,
    ]);
  });

  it("answers from gnomcp alone when gnoscope is down at start, and says so in its log", async () => {
    const { env, model } = await setup([ended("From the node.")]);
    const closed = await local(() => ({ status: 200, body: {} }));
    // A gnoscope that answers nothing an MCP client reads: no initialize, so no tool.
    const outbound = z.record(z.string(), z.string()).parse(JSON.parse(env["JARVIS_TEST_OUTBOUND"] ?? "{}"));
    const routes = { ...outbound, [GNOSCOPE]: closed.origin };
    const jarvis = start({ ...env, JARVIS_GNOSCOPE: "on", JARVIS_TEST_OUTBOUND: JSON.stringify(routes) });
    const url = await listening(jarvis);
    expect(JarvisAnswer.parse(await (await ask(url, QUESTION)).json())).toMatchObject({ status: "answered" });
    expect(namesOf(model.seen[0]?.body)).toEqual([...READS, "load_skill", "find_place", "give_button"]);
    expect(lines(jarvis).some(({ event, reason }) => event === "jarvis_gnoscope_down" && reason === "start")).toBe(
      true,
    );
  });

  it("runs each call the model asks by its own runner, and answers with the button kept", async () => {
    const place = loadPlaces(APP_DATA).found[0]?.shown.path ?? "/";
    const fly: AnswerButton = { type: "fly", label: "Fly there", place };
    const calls = message({
      content: [
        toolUse("toolu_1", "gno_status", { profile: "onyx" }),
        toolUse("toolu_2", "load_skill", { skill: "concierge" }),
        toolUse("toolu_3", "find_place", { query: "govdao" }),
        toolUse("toolu_4", "explain_tx", { network: "onyx", hash: "a".repeat(44) }),
        toolUse("toolu_5", "give_button", { button: fly }),
      ],
      stop: "tool_use",
    });
    const { env, model, gnoscope } = await setup([calls, ended("Here it is.")]);
    const url = await listening(start({ ...env, JARVIS_GNOSCOPE: "on" }));
    const response = await ask(url, QUESTION);
    expect(JarvisAnswer.parse(await response.json())).toEqual({
      status: "answered",
      markdown: "Here it is.",
      buttons: [fly],
    });
    const of = resultsOf(model.seen[1]?.body);
    expect(of("toolu_1")).toContain('"chain_id":"onyx-1"');
    expect(of("toolu_2")).toContain("Where to go and whom to meet in gnoworld");
    expect(of("toolu_3")).toContain("GovDAO");
    expect(gnoscope.calls()).toEqual([
      { method: "tools/call", params: { name: "explain_tx", arguments: { network: "onyx", hash: "a".repeat(44) } } },
    ]);
    expect(of("toolu_4")).toContain("explain_tx");
    expect(of("toolu_5")).toContain("Kept");
  });

  it("keeps an action's button whose function Onyx's node lists, refuses one it does not, asking the node's status once", async () => {
    const action = (fn: string) => ({
      profile: "onyx",
      button: {
        type: "action",
        label: "Vote",
        action: { realm: REALM, function: fn, args: { id: "37", answer: "yes" }, why: "37 proposals are open." },
      },
    });
    const turn = (...uses: ReturnType<typeof toolUse>[]) => message({ content: uses, stop: "tool_use" });
    const { env, model, node } = await setup([
      turn(toolUse("toolu_1", "give_button", action("Vote"))),
      ended("Vote here."),
      turn(toolUse("toolu_2", "give_button", action("Vote")), toolUse("toolu_3", "give_button", action("Burn"))),
      ended("Vote again."),
    ]);
    const url = await listening(start(env));
    const vote = action("Vote").button;
    expect(JarvisAnswer.parse(await (await ask(url, QUESTION)).json())).toMatchObject({ buttons: [vote] });
    expect(JarvisAnswer.parse(await (await ask(url, QUESTION)).json())).toMatchObject({ buttons: [vote] });
    expect(resultsOf(model.seen[3]?.body)("toolu_3")).toContain("Refused, nothing kept");
    expect(node.received.filter(({ path }) => path === "/status")).toHaveLength(1);
    expect(node.received.filter(({ path }) => path.startsWith("/abci_query"))).toHaveLength(3);
  });

  it("answers spent at 100% of the budget, asking the model nothing, then answers once a change raises it", async () => {
    const { env, dir, model } = await setup([ended("Back.")]);
    spentDay(join(dir, "jarvis.db"));
    const url = await listening(start({ ...env, JARVIS_BUDGET_USD: "1" }));
    expect(JarvisAnswer.parse(await (await ask(url, QUESTION)).json())).toEqual({ status: "spent" });
    expect(model.seen).toEqual([]);
    expect(JarvisBudgets.parse(await (await fetch(`${url}${JARVIS_PATHS.budgets}`)).json())).toMatchObject({ ask: 1 });
    expect(JarvisBudgets.parse(await (await setBudget(url, "ask", 2)).json())).toMatchObject({ ask: 2 });
    expect(JarvisAnswer.parse(await (await ask(url, QUESTION)).json())).toMatchObject({ status: "answered" });
    expect(model.seen).toHaveLength(1);
  });

  it("stops the loop when the door's request closes: its model request ended, nothing more asked", async () => {
    const hanging = held();
    const { env, model } = await setup([hanging.step, ended("Never asked.")]);
    const jarvis = start(env);
    const url = await listening(jarvis);
    const leave = new AbortController();
    const asked = ask(url, QUESTION, leave.signal).catch((error: unknown) => error);
    await model.asked(1);
    leave.abort();
    await asked;
    await printed(jarvis, () => jarvis.out.stdout.includes('"event":"jarvis_answered"'));
    const events = lines(jarvis).map(({ event, reason }) => [event, reason]);
    // The attempt ended with no answer, its hold settled at its worst, before the question ended gone.
    expect(events.slice(-2)).toEqual([
      ["jarvis_budget_settle", "unpriced"],
      ["jarvis_answered", "gone"],
    ]);
    expect(model.seen).toHaveLength(1);
  });

  it("answers internal when the API refuses its key, and never prints the key", async () => {
    const { env } = await setup([{ status: 401, error: "authentication_error" }]);
    const jarvis = start(env);
    const url = await listening(jarvis);
    const response = await ask(url, QUESTION);
    expect([response.status, ApiError.parse(await response.json()).error]).toEqual([502, "internal"]);
    await printed(jarvis, () => jarvis.out.stdout.includes('"event":"jarvis_model_error"'));
    expect(jarvis.out.stdout + jarvis.out.stderr).not.toContain(KEY);
  });

  it("refuses what is no question: a malformed body, one too large, another path or method, each by its code", async () => {
    const { env, model } = await setup();
    const url = await listening(start(env));
    const post = (path: string, body: string, type = "application/json") =>
      fetch(`${url}${path}`, { method: "POST", headers: { "content-type": type }, body });
    const refused = async (response: Response) => [response.status, ApiError.parse(await response.json()).error];
    expect(await refused(await post(JARVIS_PATHS.ask, "{question:"))).toEqual([400, "refused"]);
    expect(await refused(await post(JARVIS_PATHS.ask, JSON.stringify({ ...QUESTION, extra: 1 })))).toEqual([
      400,
      "refused",
    ]);
    expect(await refused(await post(JARVIS_PATHS.ask, JSON.stringify("x".repeat(300 * 1024))))).toEqual([
      413,
      "too_large",
    ]);
    expect(await refused(await post(JARVIS_PATHS.ask, JSON.stringify(QUESTION), "text/plain"))).toEqual([
      415,
      "unsupported",
    ]);
    expect(await refused(await fetch(`${url}${JARVIS_PATHS.ask}`))).toEqual([405, "unsupported"]);
    expect(await refused(await fetch(`${url}/health`))).toEqual([404, "not_found"]);
    expect(await refused(await post("/translate", "{}"))).toEqual([404, "not_found"]);
    expect(model.seen).toEqual([]);
  });
});

describe("jarvis's process: a start it refuses", { timeout: 60_000 }, () => {
  it.each([
    [
      "a key file it cannot read",
      () => ({ ANTHROPIC_API_KEY_FILE: "/nonexistent/gnoworld-anthropic" }),
      /setting ANTHROPIC_API_KEY_FILE: unreadable/,
    ],
    [
      "a chain profile that is no universe of the data",
      () => ({ JARVIS_PROFILES: "betanet", JARVIS_INDEXER_PROFILES: "" }),
      /cards: the chain profile "betanet" is no universe of the data/,
    ],
  ])("stops at start, never listening, on %s", async (_case, over, fault) => {
    const { env, model } = await setup();
    const jarvis = start({ ...env, ...over() });
    expect(await exited(jarvis)).not.toBe(0);
    expect(jarvis.out.stderr).toMatch(fault);
    expect(lines(jarvis).some(({ event }) => event === "listening")).toBe(false);
    expect(model.seen).toEqual([]);
  });

  it("stops at start, never listening, when gnomcp refuses to start", async () => {
    const { env } = await setup([], { gnomcp: { exitAtStart: true } });
    const jarvis = start(env);
    expect(await exited(jarvis)).not.toBe(0);
    expect(jarvis.out.stderr).toContain("gnomcp: it stopped at start");
    expect(lines(jarvis).some(({ event }) => event === "listening")).toBe(false);
  });
});

describe("jarvis's process: its stop on SIGTERM", { timeout: 60_000 }, () => {
  it("lets a question in flight end, takes no new one, stops gnomcp, flushes its spans, closes its file and exits once", async () => {
    const answer = held();
    const { env, dir, model, gnomcp } = await setup([answer.step]);
    const collector = await local(() => ({ status: 200, body: {} }));
    const jarvis = start({ ...env, JARVIS_TRACES_URL: `${collector.origin}/v1/traces` });
    const url = await listening(jarvis);
    const inFlight = ask(url, QUESTION);
    await model.asked(1);
    jarvis.child.kill("SIGTERM");
    await printed(jarvis, () => jarvis.out.stdout.includes('"event":"stopping"'));
    jarvis.child.kill("SIGTERM");
    const late = await fetch(`${url}${JARVIS_PATHS.budgets}`).then(
      (response) => response.status,
      () => "refused",
    );
    expect([503, "refused"]).toContain(late);
    answer.answer(ended("Just in time."));
    expect(JarvisAnswer.parse(await (await inFlight).json())).toMatchObject({ status: "answered" });
    expect(await exited(jarvis)).toBe(0);
    expect(lines(jarvis).filter(({ event }) => event === "stopping")).toHaveLength(1);
    const pids = gnomcp.starts().map(({ pid }) => pid);
    expect(pids).toHaveLength(1);
    expect(pids.some(running)).toBe(false);
    expect(gnomcp.starts().map(({ cwd }) => existsSync(cwd))).toEqual([false]);
    expect(collector.received.some(({ body }) => body.includes("jarvis.question"))).toBe(true);
    // Its file closed: SQLite removes the log of a file whose last connection closed cleanly; opened again at once, no
    // hold left.
    expect(existsSync(join(dir, "jarvis.db-wal"))).toBe(false);
    const db = openDatabase(join(dir, "jarvis.db"), jarvisMigrations);
    expect(db.prepare("SELECT COUNT(*) AS holds FROM budget_holds").get()).toEqual({ holds: 0 });
    db.close();
  });

  it("exits 0 when its collector cannot be reached, its spans lost", async () => {
    const { env } = await setup([ended("Lost spans.")]);
    const gone = await local(() => ({ status: 200, body: {} }));
    await Promise.all(closers.splice(-1).map((close) => close()));
    const jarvis = start({ ...env, JARVIS_TRACES_URL: `${gone.origin}/v1/traces` });
    const url = await listening(jarvis);
    await ask(url, QUESTION);
    jarvis.child.kill("SIGTERM");
    expect(await exited(jarvis)).toBe(0);
  });

  it("cuts a question that outlasts the stop's wait, settling its hold, and exits", async () => {
    const hanging = held();
    const { env, dir, model } = await setup([hanging.step]);
    const jarvis = start({ ...env, JARVIS_DRAIN_S: "1" });
    const url = await listening(jarvis);
    const inFlight = ask(url, QUESTION).then(
      (response) => response.status,
      () => "cut",
    );
    await model.asked(1);
    jarvis.child.kill("SIGTERM");
    expect(await exited(jarvis)).toBe(0);
    expect([503, "cut"]).toContain(await inFlight);
    const db = openDatabase(join(dir, "jarvis.db"), jarvisMigrations);
    expect(db.prepare("SELECT COUNT(*) AS holds FROM budget_holds").get()).toEqual({ holds: 0 });
    const day = z
      .object({ spent: z.number() })
      .parse(db.prepare("SELECT spent FROM budget_days WHERE kind = 'ask'").get());
    expect(day.spent).toBeGreaterThan(0);
    db.close();
    expect(lines(jarvis).some((line) => line.event === "jarvis_answered" && line["reason"] === "gone")).toBe(true);
  });

  it("stops while a client stalls in its body, cutting it once the stop's wait is up", async () => {
    const { env } = await setup();
    const jarvis = start({ ...env, JARVIS_DRAIN_S: "1" });
    const url = new URL(await listening(jarvis));
    const socket = connect(Number(url.port), "127.0.0.1");
    socket.on("error", () => undefined);
    await once(socket, "connect");
    socket.write(
      `POST ${JARVIS_PATHS.ask} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{"question`,
    );
    // events.once rejects on the reset a cut connection may give first.
    const closed = new Promise((resolve) => socket.on("close", resolve));
    jarvis.child.kill("SIGTERM");
    expect(await exited(jarvis)).toBe(0);
    await closed;
  });

  it("stops at once when off, with nothing in flight", async () => {
    const { env } = await setup();
    const jarvis = start({ ...env, JARVIS: "off" });
    await listening(jarvis);
    jarvis.child.kill("SIGTERM");
    expect(await exited(jarvis)).toBe(0);
  });
});
