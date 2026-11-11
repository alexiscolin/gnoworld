import { afterEach, describe, expect, it, vi } from "vitest";
import type { Send } from "@gnoworld/service/net";
import { fakeChain, RPC, type Routes } from "../testing/fakeWorldsChain.ts";
import { makeOwnerReaders, makeOwners } from "./owners.ts";

// Part 1 of the owners' moderation (docs/plans/owners-moderation.md, sections 3, 6, 7): who holds a namespace, read on the chain the server
// is configured with, cached 60 s. The expression is one string (`gno.land/r/sys/users.func() string {...}()`), so an answer is `("g1..." string)`,
// the address, or `("" string)`, nobody (vm/qeval prints a result as `rtv.String()`, gno.land/pkg/sdk/vm/keeper.go QueryEval; gno_eval on onyx-1, 2026-11-11).
const ALEXIS = "g1mpkp5lm8lwpm0pym4388836d009zfe4maxlqsq";
const OTHER = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const holder = (address: string): string => `("${address}" string)`;
const NOBODY = '("" string)';
const nameOf = (expression: string): string => /ResolveName\("([^"]*)"\)/.exec(expression)?.[1] ?? "";
const names = (count: number, prefix = "world"): string[] =>
  Array.from({ length: count }, (_, index) => `${prefix}${String(index)}`);

type Given = string | Response;

// A clock the test moves, and an owners' reader on a chain that answers with `eval`.
function setup(
  eval_: Routes["eval"],
  options: { inFlight?: number; perHour?: number; perVisitor?: number; keys?: number } = {},
) {
  const clock = { at: 1_000_000 };
  const chain = fakeChain({ eval: eval_ });
  const owner = makeOwners({ send: chain.send, rpc: RPC, now: () => clock.at, ...options });
  return { clock, chain, owner };
}

// A send that holds every read until the test lets them go.
function gated(eval_: (expression: string) => Given) {
  const chain = fakeChain({ eval: eval_ });
  const waiting: (() => void)[] = [];
  let started = 0;
  const send: Send = async (url, init, ms) => {
    started += 1;
    await new Promise<void>((resolve) => waiting.push(resolve));
    return chain.send(url, init, ms);
  };
  return {
    send,
    release: () => {
      for (const go of waiting.splice(0)) go();
    },
    started: () => started,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("a holder of a namespace", () => {
  it("is the address the expression gives, asked as one vm/qeval within 5 s", async () => {
    const { chain, owner } = setup(() => holder(ALEXIS));
    expect(await owner("nym-alexiscolin000", "v")).toBe(ALEXIS);
    expect(chain.asked.map((ask) => [ask.kind, nameOf(ask.data)])).toEqual([["vm/qeval", "nym-alexiscolin000"]]);
    expect(chain.asked[0]?.data.startsWith("gno.land/r/sys/users.")).toBe(true);
    expect(chain.asked[0]?.ms).toBeGreaterThan(0);
    expect(chain.asked[0]?.ms).toBeLessThanOrEqual(5_000);
  });

  it("is the address itself for an address namespace, with no read: the names realm lets an address deploy under its own", async () => {
    const { chain, owner } = setup(() => NOBODY);
    expect(await owner(ALEXIS, "v")).toBe(ALEXIS);
    expect(chain.asked).toEqual([]);
  });

  it("is nobody for a name the chain says nobody holds: it does not exist, was deleted, or is an old alias after a rename", async () => {
    const { owner } = setup(() => NOBODY);
    expect(await owner("nobody", "v")).toBeUndefined();
  });

  it.each([
    ["a quote", 'a")+Evil("'],
    ["a slash", "a/b"],
    ["a capital", "Alexis"],
    ["a digit first", "1abc"],
    ["65 characters", "a".repeat(65)],
    ["an uppercase address", ALEXIS.toUpperCase()],
    ["nothing", ""],
  ])("is nobody for a namespace with %s, with no read", async (_why, bad) => {
    const { chain, owner } = setup(() => holder(OTHER));
    expect(await owner(bad, "v")).toBeUndefined();
    expect(chain.asked).toEqual([]);
  });

  it("is nobody for an answer whose address has a bad checksum, which no key can sign for", async () => {
    const { owner } = setup(() => holder(`${ALEXIS.slice(0, 39)}p`));
    expect(await owner("nym", "v")).toBeUndefined();
  });
});

describe("a read that does not give a clean answer", () => {
  it("refuses at once and is not cached, for a timeout: the next ask reads again", async () => {
    let calls = 0;
    const send: Send = (_url, _init, ms) => {
      calls += 1;
      return Promise.reject(new Error(`timeout after ${String(ms)}`));
    };
    const owner = makeOwners({ send, rpc: RPC, now: () => 0 });
    expect(await owner("slow", "v")).toBeUndefined();
    expect(await owner("slow", "v")).toBeUndefined();
    expect(calls).toBe(2);
  });

  it("is not cached after a failure, so a stale yes never outlives it: a yes, 60 s, a failure, then a good read again", async () => {
    const answers: Given[] = [holder(ALEXIS), new Response("boom", { status: 503 }), holder(ALEXIS)];
    const { clock, chain, owner } = setup(() => answers.shift() ?? NOBODY);
    expect(await owner("nym", "v")).toBe(ALEXIS);
    clock.at += MINUTE;
    expect(await owner("nym", "v")).toBeUndefined();
    expect(await owner("nym", "v")).toBe(ALEXIS);
    expect(chain.asked.length).toBe(3);
  });

  it.each([
    ["a 2 MiB answer", () => holder(ALEXIS) + " ".repeat(2 * 1024 * 1024)],
    ["an answer of 1,025 bytes", () => `("${"a".repeat(1_025 - 12)}" string)`],
    ["junk", () => "hello"],
    ["an empty answer", () => ""],
    ["the old two-value text", () => `(&(struct{("${ALEXIS}" .uverse.address)} X) *X)\n(true bool)`],
    ["a body that is no JSON", () => new Response("not json")],
    ["an envelope with no result", () => Response.json({ result: {} })],
    ["a chain's refusal", () => new Response("refused", { status: 500 })],
  ])("refuses %s and does not cache it", async (_why, given) => {
    const { chain, owner } = setup(() => given());
    expect(await owner("nym", "v")).toBeUndefined();
    expect(await owner("nym", "v")).toBeUndefined();
    expect(chain.asked.length).toBe(2);
  });

  it("holds no slot after it: four reads that fail, then a fifth ask on a healthy chain reads and gives the owner", async () => {
    let healthy = false;
    const gate = gated(() => (healthy ? holder(ALEXIS) : new Response("boom", { status: 503 })));
    const owner = makeOwners({ send: gate.send, rpc: RPC, now: () => 0 });
    const four = names(4).map((name, index) => owner(name, `v${String(index)}`));
    await vi.waitFor(() => {
      expect(gate.started()).toBe(4);
    });
    gate.release();
    expect(await Promise.all(four)).toEqual(Array<undefined>(4).fill(undefined));
    healthy = true;
    const fifth = owner("fifth", "w");
    await vi.waitFor(() => {
      expect(gate.started()).toBe(5);
    });
    gate.release();
    expect(await fifth).toBe(ALEXIS);
  });

  it("starts a new read after a shared flight that failed", async () => {
    let healthy = false;
    const gate = gated(() => (healthy ? holder(ALEXIS) : new Response("boom", { status: 503 })));
    const owner = makeOwners({ send: gate.send, rpc: RPC, now: () => 0 });
    const shared = [owner("nym", "a"), owner("nym", "b")];
    await vi.waitFor(() => {
      expect(gate.started()).toBe(1);
    });
    gate.release();
    expect(await Promise.all(shared)).toEqual([undefined, undefined]);
    healthy = true;
    const next = owner("nym", "c");
    await vi.waitFor(() => {
      expect(gate.started()).toBe(2);
    });
    gate.release();
    expect(await next).toBe(ALEXIS);
  });

  it("gives up on a send that never settles after 5 s and frees its slot", async () => {
    vi.useFakeTimers();
    let first = true;
    const chain = fakeChain({ eval: () => holder(ALEXIS) });
    const send: Send = (url, init, ms) => {
      if (!first) return chain.send(url, init, ms);
      first = false;
      return new Promise<Response>(() => undefined);
    };
    const owner = makeOwners({ send, rpc: RPC, now: () => Date.now(), inFlight: 1 });
    const stuck = owner("stuck", "a");
    expect(await owner("other", "b")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await stuck).toBeUndefined();
    expect(await owner("other", "b")).toBe(ALEXIS);
  });
});

describe("the cache", () => {
  it("keeps a yes for 60 s and reads again at 60 s: a namespace that moved is lost then", async () => {
    let held = ALEXIS;
    const { clock, chain, owner } = setup(() => holder(held));
    expect(await owner("nym", "v")).toBe(ALEXIS);
    held = OTHER;
    clock.at += MINUTE - 1;
    expect(await owner("nym", "v")).toBe(ALEXIS);
    expect(chain.asked.length).toBe(1);
    clock.at += 1;
    expect(await owner("nym", "v")).toBe(OTHER);
    expect(chain.asked.length).toBe(2);
  });

  it("keeps a no for 60 s too, and reads again at 60 s", async () => {
    let free = true;
    const { clock, chain, owner } = setup(() => (free ? NOBODY : holder(ALEXIS)));
    expect(await owner("nym", "v")).toBeUndefined();
    free = false;
    clock.at += MINUTE - 1;
    expect(await owner("nym", "v")).toBeUndefined();
    expect(chain.asked.length).toBe(1);
    clock.at += 1;
    expect(await owner("nym", "v")).toBe(ALEXIS);
  });

  it("counts the 60 s from the answer's time, not the ask's: a read that took 30 s keeps its yes until 90 s", async () => {
    const clock = { at: 0 };
    const chain = fakeChain({ eval: () => holder(ALEXIS) });
    const slow: Send = (url, init, ms) => {
      clock.at += 30_000;
      return chain.send(url, init, ms);
    };
    const owner = makeOwners({ send: slow, rpc: RPC, now: () => clock.at });
    expect(await owner("nym", "v")).toBe(ALEXIS);
    clock.at += MINUTE - 1;
    expect(await owner("nym", "v")).toBe(ALEXIS);
    expect(chain.asked.length).toBe(1);
    clock.at += 1;
    expect(await owner("nym", "v")).toBe(ALEXIS);
    expect(chain.asked.length).toBe(2);
  });

  it("takes an age below zero for expired: a clock stepped back an hour does not keep a yes alive", async () => {
    const { clock, chain, owner } = setup(() => holder(ALEXIS));
    await owner("nym", "v");
    clock.at -= HOUR;
    await owner("nym", "v");
    expect(chain.asked.length).toBe(2);
  });

  it("holds at most the cap of keys, the oldest going first: with 2 kept, a third name drops the first, which is read again", async () => {
    const { chain, owner } = setup(() => holder(ALEXIS), { keys: 2, perVisitor: 100 });
    await owner("one", "v");
    await owner("two", "v");
    await owner("three", "v");
    await owner("two", "v");
    expect(chain.asked.length).toBe(3);
    await owner("one", "v");
    expect(chain.asked.length).toBe(4);
  });

  it("holds no key for a failure or a refused namespace: with 2 kept, a yes survives 5 failures and 5 refusals", async () => {
    const { chain, owner } = setup((expression) => (nameOf(expression) === "keep" ? holder(ALEXIS) : "junk"), {
      keys: 2,
      perVisitor: 100,
    });
    await owner("keep", "v");
    for (const name of names(5, "bad")) await owner(name, "v");
    for (const name of names(5, "Bad")) await owner(name, "v");
    expect(await owner("keep", "v")).toBe(ALEXIS);
    expect(chain.asked.filter((ask) => nameOf(ask.data) === "keep").length).toBe(1);
  });
});

describe("the reads at the chain", () => {
  it("share one read for one namespace asked a hundred times at once, even with one read an hour left", async () => {
    const gate = gated(() => holder(ALEXIS));
    const owner = makeOwners({ send: gate.send, rpc: RPC, now: () => 0, perHour: 1 });
    const asks = names(100, "v").map((visitor) => owner("nym", visitor));
    await vi.waitFor(() => {
      expect(gate.started()).toBe(1);
    });
    gate.release();
    expect(await Promise.all(asks)).toEqual(Array<string>(100).fill(ALEXIS));
    expect(gate.started()).toBe(1);
  });

  it("are at most 4 in flight: a fifth namespace is refused with no read until one ends, then reads", async () => {
    const gate = gated(() => holder(ALEXIS));
    const owner = makeOwners({ send: gate.send, rpc: RPC, now: () => 0 });
    const four = names(4).map((name, index) => owner(name, `v${String(index)}`));
    await vi.waitFor(() => {
      expect(gate.started()).toBe(4);
    });
    expect(await owner("e", "w")).toBeUndefined();
    expect(gate.started()).toBe(4);
    gate.release();
    await Promise.all(four);
    const next = owner("e", "w");
    await vi.waitFor(() => {
      expect(gate.started()).toBe(5);
    });
    gate.release();
    expect(await next).toBe(ALEXIS);
  });

  it("are at most 1,000 an hour: 2,000 pins in 2,000 rooms make 1,000 reads, the rest refused, and an hour later the reads go on", async () => {
    const { clock, chain, owner } = setup((expression) => holder(nameOf(expression) ? ALEXIS : OTHER));
    const results: (string | undefined)[] = [];
    for (const [index, room] of names(2_000).entries()) results.push(await owner(room, `v${String(index)}`));
    expect(chain.asked.length).toBe(1_000);
    expect(results.filter((who) => who === ALEXIS).length).toBe(1_000);
    clock.at += HOUR;
    expect(await owner("fresh", "w")).toBe(ALEXIS);
    expect(chain.asked.length).toBe(1_001);
  });

  it("are at most 1,000 an hour when every read fails too: a failing chain is no way past the cap", async () => {
    const { clock, chain, owner } = setup(() => new Response("boom", { status: 503 }));
    const results: (string | undefined)[] = [];
    for (const [index, room] of names(2_000).entries()) results.push(await owner(room, `v${String(index)}`));
    expect(chain.asked.length).toBe(1_000);
    expect(results.every((who) => who === undefined)).toBe(true);
    clock.at += HOUR;
    await owner("fresh", "w");
    expect(chain.asked.length).toBe(1_001);
  });

  it("are not starved by 24 visitors making 5 failing reads each: a 25th visitor still gets its owner (F13831)", async () => {
    const { chain, owner } = setup((expression) =>
      nameOf(expression) === "healthy" ? holder(ALEXIS) : new Response("boom", { status: 503 }),
    );
    const rooms = names(120);
    for (const [index, room] of rooms.entries()) await owner(room, `v${String(Math.floor(index / 5))}`);
    expect(chain.asked.length).toBe(120);
    expect(await owner("healthy", "v24")).toBe(ALEXIS);
  });

  it("are at most 5 an hour for one visitor, who is refused alone: another visitor still reads", async () => {
    const { chain, owner } = setup(() => holder(ALEXIS));
    const mine = [];
    for (const room of names(6)) mine.push(await owner(room, "greedy"));
    expect(mine.filter((who) => who === ALEXIS).length).toBe(5);
    expect(mine[5]).toBeUndefined();
    expect(chain.asked.length).toBe(5);
    expect(await owner("elsewhere", "other")).toBe(ALEXIS);
    expect(chain.asked.length).toBe(6);
  });

  it("does not spend a visitor's or the hourly cap on a cached answer or an address namespace", async () => {
    const { chain, owner } = setup(() => holder(ALEXIS), { perHour: 1, perVisitor: 1 });
    expect(await owner("nym", "v")).toBe(ALEXIS);
    expect(await owner("nym", "v")).toBe(ALEXIS);
    expect(await owner(ALEXIS, "v")).toBe(ALEXIS);
    expect(chain.asked.length).toBe(1);
  });

  it("go only to the configured RPC: two readers on two chains each ask their own and each keeps its own cache", async () => {
    const other = "https://rpc.gno.land:443";
    const onyx = fakeChain({ eval: () => holder(ALEXIS) });
    const main = fakeChain({ eval: () => NOBODY }, { rpc: other });
    const clock = () => 0;
    const [onyxOwners, mainOwners] = [
      makeOwners({ send: onyx.send, rpc: RPC, now: clock }),
      makeOwners({ send: main.send, rpc: other, now: clock }),
    ];
    expect(await onyxOwners("nym", "v")).toBe(ALEXIS);
    expect(await mainOwners("nym", "v")).toBeUndefined();
    expect(onyx.asked.every((ask) => ask.url.startsWith("https://rpc.onyx.testnets.gno.land/abci_query"))).toBe(true);
    expect(main.asked.every((ask) => ask.url.startsWith("https://rpc.gno.land/abci_query"))).toBe(true);
    expect([onyx.asked.length, main.asked.length]).toEqual([1, 1]);
  });
});

// The rights review (owners-sec-rights.md, medium): the lists a page shows and the acts a person makes read through two pools of their own
// over one cache, so a flood of lists never refuses an owner's pin.
describe("the display pool and the action pool", () => {
  const pair = (eval_: Routes["eval"], options: { perHour?: number; perVisitor?: number } = {}) => {
    const chain = fakeChain({ eval: eval_ });
    const readers = makeOwnerReaders({ send: chain.send, rpc: RPC, now: () => 1_000_000, ...options });
    return { chain, ...readers };
  };

  it("spends the display pool alone when many accounts list, and an owner's act still reads afterwards", async () => {
    const { chain, act, show } = pair(() => holder(ALEXIS), { perHour: 3, perVisitor: 100 });
    for (let i = 0; i < 20; i += 1) await show(`world${String(i)}`, `visitor${String(i)}`);
    expect(chain.asked).toHaveLength(3);
    expect(await act("acme", "owner-visitor")).toBe(ALEXIS);
    expect(chain.asked).toHaveLength(4);
  });

  it("fills the one cache from either pool: a read made for display serves an act with no read, and the reverse", async () => {
    const { chain, act, show } = pair(() => holder(ALEXIS));
    expect(await show("acme", "v")).toBe(ALEXIS);
    expect(await act("acme", "w")).toBe(ALEXIS);
    expect(await act("other", "w")).toBe(ALEXIS);
    expect(await show("other", "v")).toBe(ALEXIS);
    expect(chain.asked).toHaveLength(2);
  });

  it("keeps a visitor's own limit per pool: five display reads leave the same visitor's acts free", async () => {
    const { chain, act, show } = pair(() => holder(ALEXIS), { perVisitor: 2 });
    await show("a", "v");
    await show("b", "v");
    expect(await show("c", "v")).toBeUndefined();
    expect(await act("c", "v")).toBe(ALEXIS);
    expect(chain.asked).toHaveLength(3);
  });

  it("tells nobody from a failed read with `lookup`: null for a namespace nobody holds, undefined for a refused or limited read", async () => {
    const nobody = pair(() => NOBODY);
    expect(await nobody.act.lookup("acme", "v")).toBeNull();
    expect(await nobody.act("acme", "v")).toBeUndefined();
    const failing = pair(() => new Error("down"));
    expect(await failing.act.lookup("acme", "v")).toBeUndefined();
    const limited = pair(() => holder(ALEXIS), { perHour: 1 });
    await limited.act.lookup("a", "v");
    expect(await limited.act.lookup("b", "w")).toBeUndefined();
    expect(await limited.act.lookup(ALEXIS, "w")).toBe(ALEXIS);
  });
});

// The surviving mutants of the first StrykerJS run (slice 13, owners-mutants.md).
describe("lookup, the reader that tells nobody from a failure", () => {
  it("says null for a name the chain gives to nobody and for a text that is no name, undefined for a read that failed", async () => {
    const answers: Given[] = [NOBODY, new Response("boom", { status: 503 })];
    const chain = fakeChain({ eval: () => answers.shift() ?? NOBODY });
    const { act } = makeOwnerReaders({ send: chain.send, rpc: RPC, now: () => 0 });
    expect(await act.lookup("nobody", "v")).toBeNull();
    expect(await act.lookup("a/b", "v")).toBeNull();
    expect(chain.asked.map((ask) => nameOf(ask.data))).toEqual(["nobody"]);
    expect(await act.lookup("broken", "v")).toBeUndefined();
  });
});

describe("a read that ends", () => {
  it("leaves no timer behind: the 5 s one is cleared as soon as the answer is in", async () => {
    vi.useFakeTimers();
    const { owner } = setup(() => holder(ALEXIS));
    expect(await owner("nym", "v")).toBe(ALEXIS);
    expect(vi.getTimerCount()).toBe(0);
  });
});
