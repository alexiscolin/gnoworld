// Grounding's hot path (docs/plans/slice-10.md §4): a digest of the schema's 50 blocks, every fact in it found, checked
// against a page of 100 KiB with its links, numbers and addresses, its state and its functions. Measured by
// scripts/bench.py in the full gate.
import { Digest } from "@gnoworld/schemas";
import { bench, describe } from "vitest";
import { grounded, sourcesOf, type Read } from "./ground.ts";

const REALM = "gno.land/r/demo/poll";
const CUR = [
  "interface {.seal func(); Address func() .uverse.address; IsCode func() bool; IsCurrent func() bool;",
  "IsEphemeral func() bool; IsUser func() bool; IsUserCall func() bool; IsUserRun func() bool; PkgPath func() string;",
  "Previous func() .uverse.realm; String func() string; Sub func(string) .uverse.realm; Subpath func() string}",
].join(" ");
const address = (at: number) => `g1${String(at).padStart(6, "q").replace(/1/g, "p")}${"q".repeat(32)}`;
const line = (at: number) =>
  `- Proposal ${String(at)}: [vote](/r/gov/dao:proposal/${String(at)}), 1,${String(at % 1000).padStart(3, "0")} yes, ` +
  `https://gno.land/r/demo/boards:${String(at)} by ${address(at)}`;

function readOf(): Read {
  let page = "# Proposals\n\n";
  for (let at = 0; page.length < 100 * 1024; at += 1) page += `${line(at)}\n`;
  const functions = Array.from({ length: 40 }, (_, at) => ({
    FuncName: `Act${String(at)}`,
    Params: [
      { Name: "cur", Type: CUR },
      { Name: "id", Type: "int" },
    ],
  }));
  const texts = [
    { from: "node" as const, text: page, height: 1204 },
    { from: "node" as const, text: "(512 int)", height: 1204 },
  ];
  return { realm: REALM, origin: "https://gno.land", functions: { list: functions, height: 1204 }, texts };
}

// Ten each of facts, links, text, chart and form blocks, every value one the page holds; parsed, so it holds to the caps.
function digestOf(): Digest {
  const blocks: Digest["blocks"] = [];
  for (let at = 0; at < 10; at += 1) {
    const facts = Array.from({ length: 12 }, (_, n) => ({
      label: `Proposal ${String(at * 12 + n)}`,
      value: "1,012 yes",
    }));
    const links = Array.from({ length: 10 }, (_, n) => ({
      label: `Vote ${String(n)}`,
      href: `https://gno.land/r/gov/dao:proposal/${String(at * 10 + n)}`,
    }));
    blocks.push({ type: "facts", facts }, { type: "links", links });
    blocks.push({
      type: "text",
      markdown: `See [it](https://gno.land/r/demo/boards:${String(at)}) by @${address(at)}.`,
    });
    blocks.push({ type: "chart", label: "Yes", points: Array.from({ length: 100 }, (_, n) => n) });
    blocks.push({
      type: "form",
      action: {
        realm: REALM,
        function: `Act${String(at * 4)}`,
        args: { id: String(at) },
        why: `Proposal ${String(at)}.`,
      },
    });
  }
  return { blocks };
}

let input: { digest: Digest; read: Read } | undefined;

// Each name a literal, so scripts/bench.py sees a bench switched off.
describe("grounding", () => {
  bench(
    "a 50-block digest against a 100 KiB page [5 ms]",
    () => {
      if (input === undefined) throw new Error("the bench's input is not built");
      if (!grounded(input.digest, sourcesOf(input.read)).ok) throw new Error("the bench's digest was refused");
    },
    {
      setup: () => {
        input = { digest: Digest.parse(digestOf()), read: readOf() };
      },
    },
  );
});
