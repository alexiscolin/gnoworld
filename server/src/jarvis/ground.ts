// Grounding (backlog row 10: "every number, link and function in a digest traces to its source"; ADR-0002 §4, "Grounded";
// §5, point 4): every link, number and account a digest or an answer's button states, and every word of a form's
// arguments, is in the sources the server read, by string match against sets of their facts built once, so n characters
// stated against m read cost O(n + m); each form proposes a call of the realm read that proposed.ts's check passes.
import { AnswerButton, Digest } from "@gnoworld/schemas";
import type { FunctionList } from "@gnoworld/schemas/functions";
import { coreOf, digestFacts, sourceFactsOf, type DigestFacts, type SourceFacts } from "./facts.ts";
import { checkProposal } from "./proposed.ts";

/** What the server read of a realm: its path, its page's raw Markdown, its state's text (with an answer's button, the
 * asker's question too), its `vm/qfuncs`, and the gnoweb origin a link to a path resolves against, in both texts. */
export interface Read {
  readonly realm: string;
  readonly page: string;
  readonly state: string;
  readonly functions: FunctionList;
  readonly origin: string;
}

/** A realm's sources, read once for every digest and button checked against them. */
export interface Sources {
  readonly realm: string;
  readonly functions: FunctionList;
  readonly texts: readonly SourceFacts[];
}

/** The sources' facts, the page and the state each read apart, as a realm's page. */
export function sourcesOf(read: Read): Sources {
  const texts = [sourceFactsOf(read.page, read.origin), sourceFactsOf(read.state, read.origin)];
  return { realm: read.realm, functions: read.functions, texts };
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

// What the sources lack, in order: links, numbers then figures, accounts, the room, arguments' pieces, then each form.
function missingIn(stated: DigestFacts, sources: Sources): Missing[] {
  const missing: Missing[] = [];
  const held = (of: (facts: SourceFacts) => ReadonlySet<string>) => (value: string) =>
    sources.texts.some((facts) => of(facts).has(value));
  const link = held((facts) => facts.links);
  const number = held((facts) => facts.numbers);
  const word = held((facts) => facts.words);
  const piece = held((facts) => facts.pieces());
  const check = (kind: Missing["kind"], values: ReadonlySet<string>, found: (value: string) => boolean) => {
    for (const value of values) if (!found(value)) missing.push({ kind, value });
  };
  check("link", stated.links, link);
  check("number", stated.numbers, number);
  check("number", stated.figures, piece);
  check("address", stated.addresses, word);
  if (stated.room) missing.push({ kind: "room", value: "@room" });
  check("argument", stated.pieces, (value) => value === sources.realm || piece(coreOf(value)));
  // ponytail: each form looks its function up in the realm's list, 50 forms at most (the schema's blocks).
  for (const action of stated.actions) {
    if (action.realm !== sources.realm) missing.push({ kind: "realm", value: action.realm });
    else if (!checkProposal(action, sources.functions).ok) missing.push({ kind: "function", value: action.function });
  }
  return missing;
}

/** The digest the model gave, once its schema passes and its sources hold all it states; else why it shows nothing. */
export function grounded(digest: unknown, sources: Sources): GroundedDigest {
  const parsed = Digest.safeParse(digest);
  if (!parsed.success) return { ok: false, reason: "shape" };
  const stated = digestFacts(parsed.data);
  if (!states(stated)) return { ok: false, reason: "nothing" };
  const missing = missingIn(stated, sources);
  return missing.length === 0 ? { ok: true, digest: parsed.data } : { ok: false, reason: "missing", missing };
}

/** The button the model gave, once its schema passes, its label states only what its sources hold and an action's is a
 * form they ground; a place to fly to is the caller's to find among the places. */
export function groundedButton(button: unknown, sources: Sources): GroundedButton {
  const parsed = AnswerButton.safeParse(button);
  if (!parsed.success) return { ok: false, reason: "shape" };
  const label = { type: "text", markdown: parsed.data.label } as const;
  const action = parsed.data.type === "action" ? [{ type: "form", action: parsed.data.action } as const] : [];
  const missing = missingIn(digestFacts({ blocks: [label, ...action] }), sources);
  return missing.length === 0 ? { ok: true, button: parsed.data } : { ok: false, reason: "missing", missing };
}
