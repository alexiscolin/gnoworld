// Grounding (backlog row 10: "every number, link and function in a digest traces to its source"; ADR-0002 §4, "Grounded";
// §5, point 4): every link, number and account a digest or an answer's button states, and every word of a form's
// arguments, is in the sources the server read, by string match against sets of their facts built once, so n characters
// stated against m read cost O(n + m); each form proposes a call of the realm read that proposed.ts's check passes. Only
// the chain's node and indexer state a fact; the asker's words may fill a form's arguments; gnoscope's ground nothing (D107).
import { AnswerButton, Digest } from "@gnoworld/schemas";
import type { FunctionList } from "@gnoworld/schemas/functions";
import { coreOf, digestFacts, sourceFactsOf, type DigestFacts, type SourceFacts } from "./facts.ts";
import { checkProposal } from "./proposed.ts";

/** A text the server read, and where: the chain's node (through gnomcp) or its indexer, at a block height; gnoscope, which
 * explains and grounds nothing; or the asker's own words, which a form's arguments may take and nothing else states. */
type Reading =
  | { readonly from: "node" | "indexer"; readonly text: string; readonly height: number }
  | { readonly from: "gnoscope" | "question"; readonly text: string };

/** What the server read of a realm: its path, the gnoweb origin a link to a path resolves against, its `vm/qfuncs` on its
 * node at a height (none when nothing proposes a call), and each text read, with where it was read. */
export interface Read {
  readonly realm: string;
  readonly origin: string;
  readonly functions?: { readonly list: FunctionList; readonly height: number };
  readonly texts: readonly Reading[];
}

/** A realm's sources, read once for every digest and button checked against them: the chain's texts, and the asker's. */
export interface Sources {
  readonly realm: string;
  readonly functions: FunctionList;
  readonly chain: readonly SourceFacts[];
  readonly asked: readonly SourceFacts[];
}

const atBlock = (height: number): number => {
  if (!Number.isSafeInteger(height) || height < 1)
    throw new RangeError(`grounding: no block is at height ${String(height)}`);
  return height;
};

/** The sources' facts, each text read apart, as a realm's page; throws on a chain's reading at no block's height. */
export function sourcesOf(read: Read): Sources {
  if (read.functions !== undefined) atBlock(read.functions.height);
  const chain: SourceFacts[] = [];
  const asked: SourceFacts[] = [];
  for (const reading of read.texts) {
    if (reading.from === "node" || reading.from === "indexer") {
      atBlock(reading.height);
      chain.push(sourceFactsOf(reading.text, read.origin));
    } else if (reading.from === "question") asked.push(sourceFactsOf(reading.text, read.origin));
  }
  return { realm: read.realm, functions: read.functions?.list ?? null, chain, asked };
}

/** A fact stated that the sources lack: a `number` as written, a figure among them; `@room`, never held; a piece of a form's
 * `argument`; a `realm` not the one read; a `function` no call it can make. */
interface Missing {
  readonly kind: "link" | "number" | "address" | "room" | "argument" | "realm" | "function";
  readonly value: string;
}

/** Why nothing is shown: what was given is none (`shape`), states nothing checkable (`nothing`), or states what is missing. */
type Ungrounded = { ok: false; reason: "shape" | "nothing" } | { ok: false; reason: "missing"; missing: Missing[] };
export type GroundedDigest = { ok: true; digest: Digest } | Ungrounded;
export type GroundedButton = { ok: true; button: AnswerButton } | Ungrounded;

const states = (stated: DigestFacts): boolean =>
  stated.room || stated.links.size + stated.numbers.size + stated.addresses.size + stated.actions.length > 0;

// The digest without its forms' arguments: what it states that only the chain may hold.
const withoutArguments = (digest: Digest): Digest => ({
  blocks: digest.blocks.map((block) =>
    block.type === "form" ? { ...block, action: { ...block.action, args: {} } } : block,
  ),
});

// What the sources lack, in order: links, numbers then figures, accounts, the room, arguments' pieces, then each form. A
// value `said` outside the forms' arguments needs the chain's texts; one only an argument gives, the chain's or the asker's.
function missingIn(stated: DigestFacts, said: DigestFacts, sources: Sources): Missing[] {
  const missing: Missing[] = [];
  const either = [...sources.chain, ...sources.asked];
  const held = (of: (facts: SourceFacts) => ReadonlySet<string>, said: ReadonlySet<string>) => (value: string) =>
    sources.chain.some((facts) => of(facts).has(value)) ||
    (!said.has(value) && either.some((facts) => of(facts).has(value)));
  const check = (kind: Missing["kind"], values: ReadonlySet<string>, found: (value: string) => boolean) => {
    for (const value of values) if (!found(value)) missing.push({ kind, value });
  };
  const piece = held((facts) => facts.pieces(), new Set());
  check(
    "link",
    stated.links,
    held((facts) => facts.links, said.links),
  );
  check(
    "number",
    stated.numbers,
    held((facts) => facts.numbers, said.numbers),
  );
  check(
    "number",
    stated.figures,
    held((facts) => facts.pieces(), said.figures),
  );
  check(
    "address",
    stated.addresses,
    held((facts) => facts.words, said.addresses),
  );
  if (stated.room) missing.push({ kind: "room", value: "@room" });
  check("argument", stated.pieces, (value) => value === sources.realm || piece(coreOf(value)));
  // ponytail: each form looks its function up in the realm's list, 50 forms at most (the schema's blocks).
  for (const action of stated.actions) {
    if (action.realm !== sources.realm) missing.push({ kind: "realm", value: action.realm });
    else if (!checkProposal(action, sources.functions).ok) missing.push({ kind: "function", value: action.function });
  }
  return missing;
}

// What a digest states outside its forms' arguments: all of it when no asker's words are among the sources, which then
// change nothing, so a digest is read once.
const saidOf = (digest: Digest, stated: DigestFacts, sources: Sources): DigestFacts =>
  sources.asked.length === 0 ? stated : digestFacts(withoutArguments(digest));

/** The digest the model gave, once its schema passes and its sources hold all it states; else why it shows nothing. */
export function grounded(digest: unknown, sources: Sources): GroundedDigest {
  const parsed = Digest.safeParse(digest);
  if (!parsed.success) return { ok: false, reason: "shape" };
  const stated = digestFacts(parsed.data);
  if (!states(stated)) return { ok: false, reason: "nothing" };
  const missing = missingIn(stated, saidOf(parsed.data, stated, sources), sources);
  return missing.length === 0 ? { ok: true, digest: parsed.data } : { ok: false, reason: "missing", missing };
}

/** The button the model gave, once its schema passes, its label states only what its sources hold and an action's is a
 * form they ground; a place to fly to is the caller's to find among the places. */
export function groundedButton(button: unknown, sources: Sources): GroundedButton {
  const parsed = AnswerButton.safeParse(button);
  if (!parsed.success) return { ok: false, reason: "shape" };
  const label = { type: "text", markdown: parsed.data.label } as const;
  const action = parsed.data.type === "action" ? [{ type: "form", action: parsed.data.action } as const] : [];
  const blocks = { blocks: [label, ...action] };
  const stated = digestFacts(blocks);
  const missing = missingIn(stated, saidOf(blocks, stated, sources), sources);
  return missing.length === 0 ? { ok: true, button: parsed.data } : { ok: false, reason: "missing", missing };
}
