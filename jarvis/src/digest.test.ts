import { APIConnectionError } from "@anthropic-ai/sdk";
import type Anthropic from "@anthropic-ai/sdk";
import type { ChainFetch } from "@gnoworld/chain/read";
import { queryEnvelope, statusEnvelope } from "@gnoworld/chain/testing/envelopes";
import type { Digest, ProposedAction } from "@gnoworld/schemas";
import type { FunctionList } from "@gnoworld/schemas/functions";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { makeDigests } from "./digest.ts";
import type { Request } from "./model.ts";
import { DOLLAR } from "./prices.ts";
import { message, script, text, toolUse, usage, type Step } from "./testing/fakeModel.ts";
import { budgetFor, capture, spans } from "./testing/kit.ts";
import { placesData } from "./testing/placesData.ts";
import { REALM_TYPE } from "./testing/realm.ts";
import { cardTools } from "./tools/cards.ts";
import { keepCards } from "./tools/kept.ts";
import { realmCards } from "./tools/realmCards.ts";
import { loadPlaces } from "./tools/places.ts";

// 10k, ADR-0002 §4 ("What a realm shows: a digest"): a realm's page and functions read on its universe's own node with
// its height, the digest the fast model gives through give_digest and propose_action alone, grounded before it is
// kept, then served to every reader for 10 minutes. Each value is built inside its test (F2356).
const { folderOf, remove } = placesData();
afterAll(remove);
const closing: (() => void)[] = [];
afterEach(() => {
  for (const close of closing.splice(0)) close();
});

const REALM = "gno.land/r/demo/poll";
const named = (Name: string, Type: string) => ({ Name, Type });
const pollFunctions = (): FunctionList => [
  { FuncName: "Vote", Params: [named("cur", REALM_TYPE), named("id", "int"), named("answer", "string")] },
  { FuncName: "Results", Params: [named("id", "int")], Results: [named(".res.0", "string")] },
];
const pollPage = () => ["# The poll", "", "1,204 members, 37 proposals.", "", "Answer yes or no."].join("\n");
const digest = (value = "1,204"): Digest => ({ blocks: [{ type: "facts", facts: [{ label: "Members", value }] }] });
const vote = (): ProposedAction => ({
  realm: REALM,
  function: "Vote",
  args: { id: "37", answer: "yes" },
  why: "Proposal 37 is open.",
});

const fromHex = (url: string) => Buffer.from(/&data=0x([0-9a-f]*)$/.exec(url)?.[1] ?? "", "hex").toString("utf8");
interface Chain {
  page: string;
  functions: FunctionList;
  height: number;
  network?: string;
  down?: boolean;
  // The realms the node holds, the poll alone by default; a realm whose page or functions it refuses.
  realms?: string[];
  noPage?: boolean;
  noFunctions?: boolean;
}
// A universe's node (placesData: `https://rpc.<id>.example:443`, chain `<id>-1`): its status, a realm's page for
// `<realm>:` and its functions, as the chain package reads them; a realm it has none of refused as gno refuses it.
const nodeOf = (chain: Chain): ChainFetch =>
  vi.fn<ChainFetch>((url) =>
    chain.down === true
      ? Promise.reject(new TypeError("fetch failed"))
      : Promise.resolve(Response.json(answerOf(chain, url))),
  );
function answerOf(chain: Chain, url: string): unknown {
  const id = /^https:\/\/rpc\.([a-z]+)\.example:443\//.exec(url)?.[1] ?? "";
  if (url.endsWith("/status")) return statusEnvelope(chain.height, "2026-11-04T03:34:18Z", chain.network ?? `${id}-1`);
  return url.includes("qrender") ? pageOf(chain, fromHex(url)) : functionsOf(chain, fromHex(url));
}
const REFUSED = () => queryEnvelope({ data: null, error: { "@type": "/vm.InvalidPkgPathError" } });
function pageOf(chain: Chain, data: string): unknown {
  if (chain.noPage === true) return queryEnvelope({ data: null, error: { "@type": "/vm.NoRenderDeclError" } });
  const held = (chain.realms ?? [REALM]).some((realm) => data === `${realm}:`);
  return held ? queryEnvelope({ data: chain.page }) : REFUSED();
}
function functionsOf(chain: Chain, data: string): unknown {
  const listed = chain.noFunctions !== true && (chain.realms ?? [REALM]).includes(data);
  return listed ? queryEnvelope({ data: JSON.stringify(chain.functions) }) : REFUSED();
}
const asked = (url: string) =>
  url.endsWith("/status") ? "status" : `${url.includes("qrender") ? "render" : "funcs"} ${fromHex(url)}`;

const said = (...content: Anthropic.ContentBlock[]) =>
  message({
    content,
    stop: content.some(({ type }) => type === "tool_use") ? "tool_use" : "end_turn",
    model: "claude-haiku-5-5",
    usage: usage({ input_tokens: 2_000, output_tokens: 200 }),
  });
const give = (body: Digest, over: Record<string, unknown> = {}) =>
  said(toolUse("t1", "give_digest", { profile: "onyx", realm: REALM, digest: body, ...over }));
const done = () => said(text("Done."));

interface Setup {
  steps?: Step[];
  chain?: Partial<Chain>;
  cap?: number;
  keepBytes?: number;
  chains?: string[];
}
const setup = ({ steps = [], chain = {}, cap = 45 * DOLLAR, keepBytes, chains = ["onyx", "gnoland"] }: Setup = {}) => {
  const state: Chain = { page: pollPage(), functions: pollFunctions(), height: 1204, ...chain };
  const node = vi.fn<ChainFetch>((url, init) => nodeOf(state)(url, init));
  const kit = budgetFor(cap);
  closing.push(kit.close);
  const model = script(...steps);
  const { log, events } = capture();
  const places = loadPlaces(folderOf());
  const cards = cardTools({ chains, places, read: () => Promise.reject(new Error("no gnomcp")), fetch: node });
  const caps = {
    questionChars: 2_000,
    turns: 4,
    outputTokens: 4_096,
    callTimeoutMs: 60_000,
    retries: 2,
    toolResultBytes: 16 * 1024,
  };
  const loop = {
    send: model.send,
    budget: kit.budget,
    log,
    tracer: spans().tracer,
    model: "claude-haiku-5-5" as const,
    caps,
    random: (size: number) => new Uint8Array(size).fill(0xef),
    wait: () => Promise.resolve(),
  };
  const parts = {
    db: kit.db,
    places,
    cards,
    loop,
    fetch: node,
    now: () => kit.clock.now,
    ...(keepBytes === undefined ? {} : { keepBytes }),
  };
  const digests = makeDigests(parts);
  const signal = () => new AbortController().signal;
  const ask = (realm = REALM, universe = "onyx") => digests.digest({ universe, realm }, signal());
  return { digests, ask, model, node, kit, events, state, parts, signal };
};
const toolsOffered = (request: Request | undefined) =>
  (request?.tools ?? []).map((tool) => ("name" in tool ? tool.name : ""));
const sent = (request: Request | undefined) => JSON.stringify(request?.messages ?? []);

describe("a realm's digest, read on its universe's node", () => {
  it("is the digest the model gave through give_digest once its reads hold it, with the height they were read at", async () => {
    const { ask, model } = setup({ steps: [give(digest()), done()] });
    expect(await ask()).toEqual({ kind: "digest", digest: digest(), proposal: null, height: 1204 });
    expect(model.requests[0]?.model).toBe("claude-haiku-5-5");
  });

  it("reads the realm's status, page and functions on its universe's own node, before the model is asked", async () => {
    const { ask, node, model } = setup({ steps: [give(digest()), done()] });
    await ask();
    const urls = node.mock.calls.map(([url]) => url);
    expect(urls.every((url) => url.startsWith("https://rpc.onyx.example:443/"))).toBe(true);
    // The height's status first, its chain checked; the page's read checks it again unless seen within a minute (D126).
    expect(urls.map(asked)[0]).toBe("status");
    expect(urls.map(asked).filter((what) => what !== "status")).toEqual([
      "render gno.land/r/demo/poll:",
      "funcs gno.land/r/demo/poll",
    ]);
    const first = sent(model.requests[0]);
    expect(first).toContain("1,204 members, 37 proposals.");
    expect(first).toContain(`source=\\"page\\"`);
    expect(first).toContain(`source=\\"functions\\"`);
    expect(first).toContain("efefefef");
  });

  it("offers the model give_digest and propose_action, and nothing else", async () => {
    const { ask, model } = setup({ steps: [give(digest()), done()] });
    await ask();
    expect(model.requests.map(toolsOffered)).toEqual([
      ["give_digest", "propose_action"],
      ["give_digest", "propose_action"],
    ]);
  });

  it("carries the one proposal the model gave of a write function its reads list", async () => {
    const proposal = said(toolUse("t2", "propose_action", { profile: "onyx", action: vote() }));
    const { ask } = setup({ steps: [give(digest()), proposal, done()] });
    expect(await ask()).toEqual({ kind: "digest", digest: digest(), proposal: vote(), height: 1204 });
  });

  it.each([
    ["a number the page lacks", () => give(digest("4,321"))],
    ["another realm", () => give(digest(), { realm: "gno.land/r/demo/boards" })],
    ["another universe", () => give(digest(), { profile: "gnoland" })],
  ])("answers none for a digest stating %s, refused to the model, and keeps it so", async (_, step) => {
    const { ask, model } = setup({ steps: [step(), done()] });
    expect(await ask()).toEqual({ kind: "none" });
    expect(JSON.stringify(model.requests[1]?.messages.at(-1))).toContain("Refused, nothing kept");
    expect(await ask()).toEqual({ kind: "none" });
    expect(model.requests).toHaveLength(2);
  });

  it("answers none for a node of another chain, its page never read and the model never asked", async () => {
    const { ask, node, model } = setup({ chain: { network: "gnoland-1" } });
    expect(await ask()).toEqual({ kind: "none" });
    expect(node.mock.calls.map(([url]) => asked(url))).toEqual(["status"]);
    expect(model.requests).toHaveLength(0);
  });

  it("answers none for a realm its node does not hold, asking the model nothing", async () => {
    const { ask, model } = setup();
    expect(await ask("gno.land/r/demo/none")).toEqual({ kind: "none" });
    expect(model.requests).toHaveLength(0);
  });

  it("answers invalid for a universe none of jarvis's chains names, reading nothing", async () => {
    const { ask, node } = setup();
    expect(await ask(REALM, "mars")).toEqual({ kind: "invalid" });
    expect(node).not.toHaveBeenCalled();
  });
});

describe("the digests' cache", () => {
  it("serves a realm's digest to every reader for 10 minutes, reading nothing more", async () => {
    const { ask, model, node, kit } = setup({ steps: [give(digest()), done()] });
    await ask();
    const reads = node.mock.calls.length;
    kit.clock.now += 10 * 60_000 - 1;
    expect(await ask()).toEqual({ kind: "digest", digest: digest(), proposal: null, height: 1204 });
    expect([node.mock.calls.length, model.requests.length]).toEqual([reads, 2]);
  });

  it("reads the realm again past 10 minutes, the same page keeping its digest at the new height, asking no model", async () => {
    const { ask, model, node, kit, state } = setup({ steps: [give(digest()), done()] });
    await ask();
    const reads = node.mock.calls.length;
    kit.clock.now += 10 * 60_000;
    state.height = 1300;
    expect(await ask()).toEqual({ kind: "digest", digest: digest(), proposal: null, height: 1300 });
    expect(node.mock.calls.length).toBeGreaterThan(reads);
    expect(model.requests).toHaveLength(2);
  });

  it("makes the digest again past 10 minutes once the page changed", async () => {
    const { ask, model, kit, state } = setup({ steps: [give(digest()), done(), give(digest("1,300")), done()] });
    await ask();
    kit.clock.now += 10 * 60_000;
    state.page = pollPage().replace("1,204", "1,300");
    state.height = 1300;
    expect(await ask()).toEqual({ kind: "digest", digest: digest("1,300"), proposal: null, height: 1300 });
    expect(model.requests).toHaveLength(4);
  });

  it("keeps a digest a realm, another realm or universe its own", async () => {
    const steps = [give(digest()), done(), give(digest(), { profile: "gnoland" }), done()];
    const { ask, model } = setup({ steps });
    await ask();
    expect(await ask("gno.land/r/demo/boards")).toEqual({ kind: "none" });
    expect(await ask(REALM, "gnoland")).toEqual({ kind: "digest", digest: digest(), proposal: null, height: 1204 });
    expect(await ask()).toEqual({ kind: "digest", digest: digest(), proposal: null, height: 1204 });
    expect(model.requests).toHaveLength(4);
  });

  it("asks the model once for readers who ask at the same time", async () => {
    let answer: (value: Anthropic.Message) => void = () => undefined;
    const held = new Promise<Anthropic.Message>((resolve) => (answer = resolve));
    const { ask, model } = setup({ steps: [() => held, done()] });
    const readers = [ask(), ask(), ask()];
    await expect.poll(() => model.requests.length, { timeout: 30_000 }).toBe(1);
    answer(give(digest()));
    const answers = await Promise.all(readers);
    expect(answers).toEqual(
      Array.from({ length: 3 }, () => ({ kind: "digest", digest: digest(), proposal: null, height: 1204 })),
    );
    expect(model.requests).toHaveLength(2);
  });

  it("keeps its bytes under its bound, the oldest made dropped first", async () => {
    const gnoland = give(digest(), { profile: "gnoland" });
    const steps = [give(digest()), done(), gnoland, done(), give(digest()), done()];
    const { ask, model, kit, parts } = setup({ steps, keepBytes: 1 });
    await ask();
    const rows = () => kit.db.prepare("SELECT COUNT(*) AS count FROM digests").get();
    expect(rows()).toEqual({ count: 1 });
    const again = makeDigests({ ...parts, keepBytes: 1 });
    kit.clock.now += 1;
    await again.digest({ universe: "gnoland", realm: REALM }, new AbortController().signal);
    expect(rows()).toEqual({ count: 1 });
    expect(await ask()).toEqual({ kind: "digest", digest: digest(), proposal: null, height: 1204 });
    expect(model.requests).toHaveLength(6);
  });
});

describe("the digests' stop", () => {
  it("answers spent once the questions' budget is gone, asking nothing and keeping nothing", async () => {
    const { ask, model, kit } = setup({ steps: [give(digest()), done()], cap: 1 });
    expect(await ask()).toEqual({ kind: "spent" });
    expect(model.requests).toHaveLength(0);
    kit.budget.change("ask", 45 * DOLLAR);
    expect(await ask()).toEqual({ kind: "digest", digest: digest(), proposal: null, height: 1204 });
    expect(kit.budget.state("translate").spent).toBe(0);
  });

  it("answers failed for a model that fails, keeping nothing", async () => {
    const down = new APIConnectionError({ message: "down" });
    const { ask, model } = setup({ steps: [down, down, down, give(digest()), done()] });
    expect(await ask()).toEqual({ kind: "failed" });
    expect(await ask()).toEqual({ kind: "digest", digest: digest(), proposal: null, height: 1204 });
    expect(model.requests).toHaveLength(5);
  });

  it("answers gone to a reader who left, and stops the making once no reader waits", async () => {
    const seen: AbortSignal[] = [];
    const held = (_: Request, signal?: AbortSignal) => {
      if (signal !== undefined) seen.push(signal);
      return new Promise<Anthropic.Message>(() => undefined);
    };
    const { digests, model } = setup({ steps: [held] });
    const left = new AbortController();
    const reading = digests.digest({ universe: "onyx", realm: REALM }, left.signal);
    await expect.poll(() => model.requests.length, { timeout: 30_000 }).toBe(1);
    left.abort();
    expect(await reading).toEqual({ kind: "gone" });
    await expect.poll(() => seen[0]?.aborted, { timeout: 30_000 }).toBe(true);
  });
});

describe("a digest's proposal (red pass, R1)", () => {
  const propose = (action: ProposedAction, profile = "onyx", id = "t2") =>
    said(toolUse(id, "propose_action", { profile, action }));

  it.each([
    ["another realm", () => propose({ ...vote(), realm: "gno.land/r/demo/boards" })],
    ["another universe", () => propose(vote(), "gnoland")],
    ["a function the realm's vm/qfuncs lacks", () => propose({ ...vote(), function: "Ghost" })],
    ["a read function", () => propose({ ...vote(), function: "Results", args: { id: "37" } })],
  ])("keeps no proposal of %s, refused to the model", async (_, step) => {
    const { ask, model } = setup({ steps: [give(digest()), step(), done()] });
    expect(await ask()).toEqual({ kind: "digest", digest: digest(), proposal: null, height: 1204 });
    expect(JSON.stringify(model.requests[2]?.messages.at(-1))).toContain("Refused, nothing kept");
  });

  it("keeps the first of two proposals, the second refused", async () => {
    const second = { ...vote(), args: { id: "37", answer: "no" }, why: "Or vote no on 37." };
    const steps = [give(digest()), propose(vote()), propose(second, "onyx", "t3"), done()];
    const { ask } = setup({ steps });
    expect(await ask()).toEqual({ kind: "digest", digest: digest(), proposal: vote(), height: 1204 });
  });
});

describe("a digest past its 10 minutes (red pass, R2, R5)", () => {
  it("is made again once the realm's functions changed, its page the same", async () => {
    const { ask, model, kit, state } = setup({ steps: [give(digest()), done(), give(digest("37")), done()] });
    await ask();
    kit.clock.now += 10 * 60_000;
    state.functions = [{ FuncName: "Vote", Params: [named("cur", REALM_TYPE), named("id", "int")] }];
    expect(await ask()).toEqual({ kind: "digest", digest: digest("37"), proposal: null, height: 1204 });
    expect(model.requests).toHaveLength(4);
  });

  it.each([
    ["its node down", (state: Chain) => (state.down = true)],
    ["its node on another chain", (state: Chain) => (state.network = "gnoland-1")],
    ["its realm gone", (state: Chain) => (state.realms = [])],
  ])("answers none with %s, never the old digest at a new height", async (_, change) => {
    const { ask, kit, state } = setup({ steps: [give(digest()), done()] });
    await ask();
    kit.clock.now += 10 * 60_000;
    change(state);
    expect(await ask()).toEqual({ kind: "none" });
  });

  it("serves a digest reused at a new height for 10 more minutes, reading nothing", async () => {
    const { ask, kit, node } = setup({ steps: [give(digest()), done()] });
    await ask();
    kit.clock.now += 10 * 60_000;
    await ask();
    const reads = node.mock.calls.length;
    kit.clock.now += 60_000;
    await ask();
    expect(node.mock.calls.length).toBe(reads);
  });

  it("makes a none again past 10 minutes, the page the same, and keeps it within them", async () => {
    const { ask, model, kit } = setup({ steps: [give(digest("4,321")), done(), give(digest()), done()] });
    expect(await ask()).toEqual({ kind: "none" });
    kit.clock.now += 10 * 60_000 - 1;
    expect(await ask()).toEqual({ kind: "none" });
    kit.clock.now += 1;
    expect(await ask()).toEqual({ kind: "digest", digest: digest(), proposal: null, height: 1204 });
    expect(model.requests).toHaveLength(4);
  });
});

describe("a digest's making, again and paid (red pass, R3, R4, R10, R13)", () => {
  it("is made anew for a reader who asks after every reader of the last one left", async () => {
    const hung = (_: Request, signal?: AbortSignal) =>
      new Promise<Anthropic.Message>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    const { digests, model } = setup({ steps: [hung, give(digest()), done()] });
    const left = new AbortController();
    const first = digests.digest({ universe: "onyx", realm: REALM }, left.signal);
    await expect.poll(() => model.requests.length, { timeout: 30_000 }).toBe(1);
    left.abort();
    expect(await first).toEqual({ kind: "gone" });
    expect(await digests.digest({ universe: "onyx", realm: REALM }, new AbortController().signal)).toEqual({
      kind: "digest",
      digest: digest(),
      proposal: null,
      height: 1204,
    });
  });

  it("spends the questions' budget its calls cost, the translations' none", async () => {
    const { ask, kit } = setup({ steps: [give(digest()), done()] });
    await ask();
    // Two calls of Haiku 5.5, each 2,000 input tokens at 100 and 200 output tokens at 500 nano-dollars.
    expect(kit.budget.state("ask").spent).toBe(2 * (2_000 * 100 + 200 * 500));
    expect(kit.budget.state("translate").spent).toBe(0);
  });

  it("keeps two digests whose bytes fit, dropping the oldest made though it was read last", async () => {
    const boards = "gno.land/r/demo/boards";
    const steps = [
      give(digest()),
      done(),
      give(digest(), { profile: "gnoland" }),
      done(),
      give(digest(), { realm: boards }),
      done(),
    ];
    const first = setup({ steps, chain: { realms: [REALM, boards] } });
    const row = () => first.kit.db.prepare("SELECT bytes FROM digests ORDER BY made LIMIT 1").get();
    await first.ask();
    const bytes = Number(row()?.["bytes"]);
    // Two rows fit, three do not: each row's bytes differ from the first's by its names' few letters.
    const digests = makeDigests({ ...first.parts, keepBytes: 3 * bytes - 1 });
    const at = (universe: string, realm: string) => digests.digest({ universe, realm }, first.signal());
    first.kit.clock.now += 1;
    await at("gnoland", REALM);
    first.kit.clock.now += 1;
    expect(await at("onyx", REALM)).toMatchObject({ kind: "digest" });
    await at("onyx", boards);
    const kept = first.kit.db.prepare("SELECT universe, realm FROM digests ORDER BY made").all();
    expect(kept).toEqual([
      { universe: "gnoland", realm: REALM },
      { universe: "onyx", realm: boards },
    ]);
  });

  it("answers invalid for a universe of the data that none of jarvis's chains names, reading nothing", async () => {
    const { ask, node } = setup({ chains: ["onyx"] });
    expect(await ask(REALM, "gnoland")).toEqual({ kind: "invalid" });
    expect(node).not.toHaveBeenCalled();
  });
});

describe("a digest's reads and what it keeps (StrykerJS, the review's V4, V5)", () => {
  it("serves a digest reused at a new height at that height for its next 10 minutes", async () => {
    const { ask, kit, state } = setup({ steps: [give(digest()), done()] });
    await ask();
    kit.clock.now += 10 * 60_000;
    state.height = 1300;
    await ask();
    kit.clock.now += 60_000;
    expect(await ask()).toEqual({ kind: "digest", digest: digest(), proposal: null, height: 1300 });
  });

  it("counts a row's bytes as its universe, realm, reads' hash and card in UTF-8", async () => {
    const { ask, kit } = setup({ steps: [give(digest()), done(), give(digest("4,321")), done()] });
    await ask();
    await ask(REALM, "gnoland");
    const rows = kit.db.prepare("SELECT universe, realm, source, card, bytes FROM digests ORDER BY made").all();
    expect(rows.map((row) => row["bytes"])).toEqual(
      rows.map(({ universe, realm, source, card }) =>
        Buffer.byteLength(String(universe) + String(realm) + String(source) + (card === null ? "" : String(card))),
      ),
    );
    expect(rows.map((row) => row["card"] === null)).toEqual([false, true]);
  });

  it("counts a digest made again in place of its row, so two rows that fit still fit", async () => {
    const steps = [
      give(digest()),
      done(),
      give(digest(), { profile: "gnoland" }),
      done(),
      give(digest("1,300")),
      done(),
    ];
    const first = setup({ steps });
    await first.ask();
    await first.ask(REALM, "gnoland");
    const total = first.kit.db.prepare("SELECT SUM(bytes) AS bytes FROM digests").get();
    const digests = makeDigests({ ...first.parts, keepBytes: Number(total?.["bytes"]) });
    first.kit.clock.now += 10 * 60_000;
    first.state.page = pollPage().replace("1,204", "1,300");
    expect(await digests.digest({ universe: "onyx", realm: REALM }, first.signal())).toMatchObject({ kind: "digest" });
    expect(first.kit.db.prepare("SELECT universe FROM digests ORDER BY universe").all()).toEqual([
      { universe: "gnoland" },
      { universe: "onyx" },
    ]);
  });

  it("makes two realms asked at once each its own digest", async () => {
    const boards = "gno.land/r/demo/boards";
    const steps = [give(digest()), give(digest("37"), { realm: boards }), done(), done()];
    const { ask } = setup({ steps, chain: { realms: [REALM, boards] } });
    const [poll, board] = await Promise.all([ask(), ask(boards)]);
    expect([poll, board]).toEqual([
      { kind: "digest", digest: digest(), proposal: null, height: 1204 },
      { kind: "digest", digest: digest("37"), proposal: null, height: 1204 },
    ]);
  });

  it.each([
    ["a page its node refuses", { noPage: true }],
    ["functions its node refuses", { noFunctions: true }],
  ])("answers none for %s, asking the model nothing", async (_, chain) => {
    const { ask, model } = setup({ chain });
    expect(await ask()).toEqual({ kind: "none" });
    expect(model.requests).toHaveLength(0);
  });

  it("sends a page of 60 KiB whole in its block, with no room block", async () => {
    const long = `${"Filler line of the poll.\n".repeat(2_400)}9,999 members in all.`;
    const { ask, model } = setup({ steps: [give(digest("9,999")), done()], chain: { page: long } });
    expect(await ask()).toMatchObject({ kind: "digest" });
    const first = sent(model.requests[0]);
    expect(first).toContain("9,999 members in all.");
    expect(first).not.toContain("cut_at_byte");
    expect(first).not.toContain(`source=\\"room\\"`);
  });

  it("refuses a digest of another realm naming the one read, and runs no other tool", async () => {
    const places = loadPlaces(folderOf());
    const cards = cardTools({ chains: ["onyx"], places, read: () => Promise.reject(new Error("no gnomcp")) });
    const read = { realm: REALM, origin: "https://onyx.example", texts: [] };
    const tools = realmCards(cards.definitions, { at: { profile: "onyx", height: 1204 }, read });
    const kept = keepCards();
    const asked = { text: "", cards: kept, signal: new AbortController().signal };
    const other = { profile: "onyx", realm: "gno.land/r/demo/boards", digest: digest() };
    expect(await tools.run({ name: "give_digest", args: other }, asked)).toEqual({
      ok: true,
      isError: true,
      text: `Refused, nothing kept: only ${REALM} on onyx was read: give its digest.`,
    });
    expect(await tools.run({ name: "give_button", args: {} }, asked)).toEqual({ ok: false, reason: "refused" });
  });
});
