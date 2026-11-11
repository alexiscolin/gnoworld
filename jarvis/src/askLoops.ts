// The two loops of /ask (D13985): a person's question, a room's `here` and a realm's `function` on the main model, and
// `catch-up`, which sums up the lines it is given, on the fast one with `decline` as its one tool; the same skills and caps.
import { allowlist } from "./allowlist.ts";
import type { Model } from "./prices.ts";
import { makeLoop } from "./loop.ts";

type Parts = Parameters<typeof makeLoop>[0];

export function makeAskLoops({
  models,
  ...parts
}: Omit<Parts, "model" | "system"> & { models: { main: Model; fast: Model } }) {
  const main = makeLoop({ ...parts, model: models.main });
  const none = { allowlist: allowlist([], parts.log), run: parts.tools.run };
  const fast = makeLoop({ ...parts, model: models.fast, tools: none });
  return { ask: main.ask, catchUp: fast.ask };
}
