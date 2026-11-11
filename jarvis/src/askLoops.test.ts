import { createHash } from "node:crypto";
import { EXPLAIN_VERSION } from "@gnoworld/schemas";
import { afterAll, describe, expect, it } from "vitest";
import { allowlist } from "./allowlist.ts";
import { EXPLAIN_SYSTEM, makeAskLoops } from "./askLoops.ts";
import { gnomcpTools } from "./gnomcpTools.ts";
import type { Ran } from "./gnomcp.ts";
import type { Question } from "./loop.ts";
import { data, explainBox, said, type Read } from "./testing/explainTools.ts";
import { message, script, text, toolUse } from "./testing/fakeModel.ts";
import { budgetFor, capture, spans } from "./testing/kit.ts";

const CAPS = {
  questionChars: 2_000,
  turns: 4,
  outputTokens: 1_000,
  callTimeoutMs: 60_000,
  retries: 0,
  toolResultBytes: 16_384,
};

// 10u-g: catch-up sums the lines it is given, so it is offered `decline` alone; the others keep the allowlist's tools.
describe("the two loops of /ask", () => {
  it("asks the fast model for catch-up with `decline` as its one tool, the main model for the rest with every tool", async () => {
    const { budget, close } = budgetFor(45 * 1_000_000_000);
    const { log } = capture();
    const model = script(
      message({ content: [text("A.")], stop: "end_turn" }),
      message({ content: [text("B.")], stop: "end_turn" }),
    );
    const tools = allowlist(gnomcpTools({ chains: ["onyx"], indexed: [] }), log);
    const loops = makeAskLoops({
      send: model.send,
      budget,
      log,
      tracer: spans().tracer,
      models: { main: "claude-sonnet-5-5", fast: "claude-haiku-5-5" },
      caps: CAPS,
      skills: { index: [], digest: "" },
      tools: { allowlist: tools, run: () => Promise.resolve({ ok: false, reason: "refused" }) },
      explain: {
        tools: () => ({ allowlist: tools, run: () => Promise.resolve({ ok: false, reason: "refused" }) }),
        profileOf: () => undefined,
      },
    });
    await loops.catchUp({ text: "Catch up.", room: [] });
    await loops.ask({ text: "Where?", room: [] });
    const names = (at: number) => model.requests[at]?.tools?.map((tool) => ("name" in tool ? tool.name : ""));
    expect([model.requests[0]?.model, names(0)]).toEqual(["claude-haiku-5-5", ["decline"]]);
    expect(model.requests[1]?.model).toBe("claude-sonnet-5-5");
    expect(names(1)).toEqual([...tools.offered().map(({ name }) => name), "decline"]);
    close();
  });
});

afterAll(() => {
  data.remove();
});

// D13920: the loop that explains a function reads the code alone, on one chain's profile.
const REALM = "gno.land/r/gov/dao";
const READ = { profile: "gnoland", path: REALM, symbols: ["Vote"] };
const SOURCE = "func Vote(cur realm, id int) { ... }";
const loops = (steps: Parameters<typeof script>, read?: Read) => {
  const { box, calls } = explainBox(read);
  const { budget, close } = budgetFor(45 * 1_000_000_000);
  const { log } = capture();
  const model = script(...steps);
  const made = makeAskLoops({
    send: model.send,
    budget,
    log,
    tracer: spans().tracer,
    models: { main: "claude-sonnet-5-5", fast: "claude-haiku-5-5" },
    caps: { ...CAPS, turns: 4, retries: 0 },
    skills: { index: [], digest: "" },
    tools: box,
    explain: { tools: box.explain, profileOf: (chain) => (chain === "gnoland-1" ? "gnoland" : undefined) },
  });
  const question: Question = {
    text: "Explain.",
    room: [],
    read: [{ source: "function", text: `${REALM} Vote` }],
    finds: { realm: REALM, name: "Vote" },
  };
  return { made, model, calls, question, close };
};
const end = (words = "It votes.") => message({ content: [text(words)], stop: "end_turn" });
const use = (name: string, input: unknown) => message({ content: [toolUse("t1", name, input)], stop: "tool_use" });
const signal = () => new AbortController().signal;

describe("the explanation's loop", () => {
  it("offers the model the four tools and no decline, on one profile, and a prompt of one job in English", async () => {
    const { made, model, question, close } = loops([end()]);
    await made.explain("gnoland-1")?.(question, signal());
    const request = model.requests[0];
    expect(request?.tools?.map((tool) => ("name" in tool ? tool.name : "")).sort()).toEqual([
      "find_place",
      "give_button",
      "gno_read",
      "load_skill",
    ]);
    const read = request?.tools?.find((tool) => "name" in tool && tool.name === "gno_read");
    expect(JSON.stringify(read)).toContain('"enum":["gnoland"]');
    const system = JSON.stringify(request?.system);
    expect(system).toContain("English");
    expect(system).not.toContain("concierge");
    close();
  });

  it("tells the model a realm's names and comments are its author's, may lie, and that nothing is vouched for", () => {
    expect(EXPLAIN_SYSTEM).toMatch(/comments are its author's words, and may lie/);
    expect(EXPLAIN_SYSTEM).toMatch(/never say a realm or a function is safe/);
  });

  it("is pinned to its version: a changed prompt without a bumped EXPLAIN_VERSION fails here", () => {
    const PINNED: Record<number, string> = { 1: "d313a687ec3cf3cf8a76b459aa4c8400db8d7c82d428d49f5d42fc11c2d3857d" };
    expect(PINNED[EXPLAIN_VERSION]).toBe(createHash("sha256").update(EXPLAIN_SYSTEM).digest("hex"));
  });

  it("has a loop for a chain with a profile only, one loop for a chain asked twice", () => {
    const { made, close } = loops([]);
    expect(made.explain("gnoland-1")).toBe(made.explain("gnoland-1"));
    expect(made.explain("elsewhere-1")).toBeUndefined();
    expect(made.explain(undefined)).toBeUndefined();
    close();
  });

  it("answers a render the model asks for as refused, and runs nothing", async () => {
    const { made, calls, question, close } = loops([use("gno_render", { profile: "gnoland", realm: REALM }), end()]);
    const result = await made.explain("gnoland-1")?.(question, signal());
    expect(calls).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: "answer", keep: false });
    close();
  });

  it("says keep when a code read of the asked realm succeeded and held the function's declaration", async () => {
    const { made, question, close } = loops([use("gno_read", READ), end()], () => Promise.resolve(said(SOURCE)));
    expect(await made.explain("gnoland-1")?.(question, signal())).toMatchObject({ kind: "answer", keep: true });
    close();
  });

  it("says keep for a method of that name, with its receiver", async () => {
    const read = () => Promise.resolve(said("func (b *Board) Vote(cur realm, id int) {}"));
    const { made, question, close } = loops([use("gno_read", READ), end()], read);
    expect(await made.explain("gnoland-1")?.(question, signal())).toMatchObject({ keep: true });
    close();
  });

  it.each([
    ["a read that failed", { ok: false, reason: "error" } satisfies Ran],
    ["a read that answered an error", { ok: true, isError: true, text: "not found: func Vote(" } satisfies Ran],
    [
      "a read that found nothing of the function",
      { ok: true, isError: false, text: "func Propose() {}" } satisfies Ran,
    ],
    [
      "a comment that names the function",
      { ok: true, isError: false, text: "// func Vote( is safe\nfunc Propose() {}" } satisfies Ran,
    ],
    [
      "a block comment on one line that names it",
      { ok: true, isError: false, text: "/* func Vote( */ func Propose() {}" } satisfies Ran,
    ],
    [
      "a function whose name only starts with it",
      { ok: true, isError: false, text: "func Voted(x int) {}" } satisfies Ran,
    ],
    ["a call of it, no declaration", { ok: true, isError: false, text: "func Other() { Vote(1) }" } satisfies Ran],
  ])("says no keep after %s: the asker is answered, nothing is shared", async (_name, ran) => {
    const { made, question, close } = loops([use("gno_read", READ), end()], () => Promise.resolve(ran));
    expect(await made.explain("gnoland-1")?.(question, signal())).toMatchObject({ kind: "answer", keep: false });
    close();
  });

  it("says no keep when the read was of another realm, whatever its text holds", async () => {
    const { made, question, close } = loops([use("gno_read", { ...READ, path: "gno.land/r/evil/dao" }), end()], () =>
      Promise.resolve(said(SOURCE)),
    );
    expect(await made.explain("gnoland-1")?.(question, signal())).toMatchObject({ keep: false });
    close();
  });

  it("says no keep when the model read nothing", async () => {
    const { made, question, close } = loops([end("From memory.")]);
    expect(await made.explain("gnoland-1")?.(question, signal())).toMatchObject({ keep: false });
    close();
  });

  it("says no keep when one read found it and another failed", async () => {
    let n = 0;
    const read: Read = () => Promise.resolve((n += 1) === 1 ? said(SOURCE) : { ok: false, reason: "error" });
    const { made, question, close } = loops([use("gno_read", READ), use("gno_read", READ), end()], read);
    expect(await made.explain("gnoland-1")?.(question, signal())).toMatchObject({ keep: false });
    close();
  });

  it("says nothing of keep for a question that names no function to find", async () => {
    const { made, question, close } = loops([end()]);
    const plain: Question = { text: question.text, room: [], read: question.read ?? [] };
    expect(await made.explain("gnoland-1")?.(plain, signal())).not.toHaveProperty("keep");
    close();
  });
});
