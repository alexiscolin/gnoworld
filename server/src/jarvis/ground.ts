// Grounding (backlog row 10: "every number, link and function in a digest traces to its source"; ADR-0002 §4, "Grounded";
// §5, point 4): every link, number and account a digest or an answer's button states is in the sources the server read, by
// string match against sets of their facts built once, so n characters stated against m read cost O(n + m); each form
// proposes a call of the realm read that proposed.ts's check passes. A digest that states nothing checkable is refused.
import type { AnswerButton, Digest } from "@gnoworld/schemas";
import type { FunctionList } from "@gnoworld/schemas/functions";
import { digestFacts, sourceFactsOf, type DigestFacts, type SourceFacts } from "./facts.ts";
import { checkProposal } from "./proposed.ts";

/** What the server read of a realm: its path, its page's raw Markdown, its state's text, its `vm/qfuncs`, and the gnoweb
 * origin a link to a path resolves against, in both texts. */
export interface Sources {
  readonly realm: string;
  readonly page: string;
  readonly state: string;
  readonly functions: FunctionList;
  readonly origin: string;
}

/** A fact stated that the sources lack; `@room` is never held, a `realm` is not the one read, a `function` no call it
 * can make. */
interface Missing {
  readonly kind: "link" | "number" | "address" | "room" | "realm" | "function";
  readonly value: string;
}

interface Ungrounded {
  ok: false;
  missing: Missing[];
}
export type GroundedDigest = { ok: true; digest: Digest } | Ungrounded;
export type GroundedButton = { ok: true; button: AnswerButton } | Ungrounded;

const states = (stated: DigestFacts): boolean =>
  stated.room || stated.links.size + stated.numbers.size + stated.addresses.size + stated.actions.length > 0;

// What the sources lack, in order: links, numbers, accounts, the room, then each form.
function missingIn(stated: DigestFacts, sources: Sources): Missing[] {
  const read = [sourceFactsOf(sources.page, sources.origin), sourceFactsOf(sources.state, sources.origin)];
  const missing: Missing[] = [];
  const check = (
    kind: Missing["kind"],
    values: ReadonlySet<string>,
    of: (facts: SourceFacts) => ReadonlySet<string>,
  ) => {
    for (const value of values) if (!read.some((facts) => of(facts).has(value))) missing.push({ kind, value });
  };
  check("link", stated.links, (facts) => facts.links);
  check("number", stated.numbers, (facts) => facts.numbers);
  check("address", stated.addresses, (facts) => facts.words);
  if (stated.room) missing.push({ kind: "room", value: "@room" });
  // ponytail: each form looks its function up in the realm's list, 50 forms at most (the schema's blocks).
  for (const action of stated.actions) {
    if (action.realm !== sources.realm) missing.push({ kind: "realm", value: action.realm });
    else if (!checkProposal(action, sources.functions).ok) missing.push({ kind: "function", value: action.function });
  }
  return missing;
}

/** The digest, when its sources hold all it states; else what they lack, none named when it states nothing checkable. */
export function grounded(digest: Digest, sources: Sources): GroundedDigest {
  const stated = digestFacts(digest);
  if (!states(stated)) return { ok: false, missing: [] };
  const missing = missingIn(stated, sources);
  return missing.length === 0 ? { ok: true, digest } : { ok: false, missing };
}

/** The button, when its label states only what its sources hold and an action's is a digest's form they ground; a place
 * to fly to is the caller's to find among the places. */
export function groundedButton(button: AnswerButton, sources: Sources): GroundedButton {
  const label = { type: "text", markdown: button.label } as const;
  const blocks: Digest["blocks"] =
    button.type === "action" ? [label, { type: "form", action: button.action }] : [label];
  const stated = digestFacts({ blocks });
  const missing = states(stated) ? missingIn(stated, sources) : [];
  return missing.length === 0 ? { ok: true, button } : { ok: false, missing };
}
