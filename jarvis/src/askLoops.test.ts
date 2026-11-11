import { describe, expect, it } from "vitest";
import { allowlist } from "./allowlist.ts";
import { makeAskLoops } from "./askLoops.ts";
import { gnomcpTools } from "./gnomcpTools.ts";
import { message, script, text } from "./testing/fakeModel.ts";
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
