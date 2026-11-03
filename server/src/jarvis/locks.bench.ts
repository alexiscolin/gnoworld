// Jarvis's locks on one tool call (docs/plans/slice-10.md §4): the allowlist's check of its arguments, then the
// untrusted block of its result, a 64 KiB page cut to the 16 KiB a result holds. Measured by scripts/bench.py.
import { bench, describe } from "vitest";
import { logger } from "../log.ts";
import { allowlist } from "./allowlist.ts";
import { gnomcpTools } from "./gnomcpTools.ts";
import { untrustedBlocks } from "./untrusted.ts";

const tools = allowlist(
  gnomcpTools({ chains: ["onyx", "gnoland1"], indexed: ["onyx"] }),
  logger("p".repeat(40), () => undefined),
);
const turn = untrustedBlocks();
const LINE = `| ${"Proposal 42: fund the gnoland builders".padEnd(60, ".")} | ${String.fromCodePoint(0xe9)}t${String.fromCodePoint(0xe9)} |\n`;
const PAGE = LINE.repeat(Math.ceil((64 * 1024) / Buffer.byteLength(LINE)));
const HUGE = LINE.repeat(Math.ceil((16 * 1024 * 1024) / Buffer.byteLength(LINE)));

describe("jarvis's locks", () => {
  bench("check a gno_render call, then block its 64 KiB result [1 ms]", () => {
    const call = tools.check("gno_render", { profile: "onyx", realm: "gno.land/r/gov/dao", path: "proposals" });
    if (!call.ok) throw new Error("the bench's call was refused");
    if (!turn.wrap(call.name, PAGE).includes('cut_at_byte="')) throw new Error("the bench's page was not cut");
  });

  // A block reads only what fits of a text: a result of 16 MiB costs what one of 64 KiB does.
  bench("block a 16 MiB result, read only as far as its 16 KiB [1 ms]", () => {
    if (!turn.wrap("gno_read", HUGE).includes('cut_at_byte="')) throw new Error("the bench's result was not cut");
  });
});
