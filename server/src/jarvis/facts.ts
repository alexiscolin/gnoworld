// What a text states that can be checked (ADR-0002 §4, "Grounded"; §5, points 4 and 5): its links as core's reader finds
// them, and what a person reads once nothing unseen parts it: its numbers, as written, and its words, each that begins `g1`
// an account. One extractor for a digest's grounding and a translation's check, both reading a text alike.
import { fold, inlines, isBlank, markdown, mentionsRoom, page, type Inline, type PageBlock } from "@gnoworld/core";
import type { Digest, DigestBlock, ProposedAction } from "@gnoworld/schemas";

/** What a text states: its links, the accounts it names (its words that begin `g1`, lower-cased), its numbers as written,
 * and whether it names the whole room (`@room`). */
export interface Facts {
  readonly links: ReadonlySet<string>;
  readonly addresses: ReadonlySet<string>;
  readonly numbers: ReadonlySet<string>;
  readonly room: boolean;
}

// A digit's value: Unicode writes each script's ten digits in a row from 0, rows side by side (its stability policy), so a
// digit is its distance from its stretch's first, modulo ten. Each is looked up once a text.
function valueOf(digit: string, values: Map<string, string>): string {
  const known = values.get(digit);
  if (known !== undefined) return known;
  const point = digit.codePointAt(0) ?? 0;
  let zero = point;
  while (/\p{Nd}/u.test(String.fromCodePoint(zero - 1))) zero -= 1;
  const value = String((point - zero) % 10);
  values.set(digit, value);
  return value;
}

// A text as a person reads its figures and names: core's fold (compatibility forms, no mark nor format character, lower
// case), what else core's isBlank says draws nothing dropped, each digit an ASCII one, a minus sign a hyphen, and each run
// of blanks on a line one space, as a page draws it.
function unseen(text: string): string {
  const values = new Map<string, string>();
  const plain = (char: string): string => {
    if (/\p{Nd}/u.test(char)) return valueOf(char, values);
    if (char === "\u2212") return "-";
    return isBlank(char) && !/\s/u.test(char) ? "" : char;
  };
  return fold(text)
    .replace(/\P{ASCII}/gu, plain)
    .replace(/[^\S\n]+/g, " ");
}

function numbersIn(shown: string): Set<string> {
  // A space parts groups of three after a first of three digits at most, as thousands are written (`12 345`, never
  // `2026 100` nor `1 2`); a mark parts groups of any length; a hyphen after no letter nor digit is a sign.
  const number =
    /(?:(?<![\p{L}\p{N}])-)?(?:\d{1,3}(?: \d{3}(?!\d))+(?:[.,'_\u2019\u02bc\u00b7\u2032\u066b\u066c]\d+)*|\d+(?:[.,'_\u2019\u02bc\u00b7\u2032\u066b\u066c]\d+)*)/gu;
  return new Set(shown.match(number));
}

/** A number's groups of digits, a comma between each, whatever a language writes between them: `1 000` and `1.000` are
 * `1,000`, which a translation may write either way. */
export const groupsOf = (number: string): string => number.replace(/[^\d-]/g, ",");

// A text's words as a person reads them: runs of letters and digits.
const wordsOf = (shown: string): string[] => shown.match(/[\p{L}\p{N}]+/gu) ?? [];

function linksIn(nodes: Iterable<Inline>): Set<string> {
  const links = new Set<string>();
  for (const node of nodes) if (node.type === "link") links.add(node.href);
  return links;
}

/** A text's facts, read as the room reads a message. */
export function factsOf(text: string): Facts {
  const blocks = markdown(text);
  const shown = unseen(text);
  return {
    links: linksIn(inlines(blocks)),
    addresses: new Set(wordsOf(shown).filter((word) => word.startsWith("g1"))),
    numbers: numbersIn(shown),
    room: mentionsRoom(blocks),
  };
}

/** What a source can ground: its links, its numbers as written, and its words, every account it names among them. */
export interface SourceFacts {
  readonly links: ReadonlySet<string>;
  readonly numbers: ReadonlySet<string>;
  readonly words: ReadonlySet<string>;
}

// A page's inline nodes: core's walk of a message's blocks, and each heading's line.
function* pageInlines(blocks: readonly PageBlock[]): Generator<Inline> {
  for (const block of blocks) {
    if (block.type === "quote") yield* pageInlines(block.children);
    else if (block.type === "heading") yield* inlines([{ type: "paragraph", children: block.children }]);
    else if (block.type !== "form") yield* inlines([block]);
  }
}

/** A source's facts, read as a realm's page, a link to a path resolved against gnoweb's `origin`: no link of one past core's
 * cap, its numbers and words still. */
export function sourceFactsOf(source: string, origin: string): SourceFacts {
  const read = page(source, { origin });
  const shown = unseen(source);
  return {
    links: read.kind === "page" ? linksIn(pageInlines(read.blocks)) : new Set<string>(),
    numbers: numbersIn(shown),
    words: new Set(wordsOf(shown)),
  };
}

/** What a digest states, and the actions its forms propose. */
export interface DigestFacts extends Facts {
  readonly actions: readonly ProposedAction[];
}

// A block's parts: texts a reader sees (a chart's points one a line), addresses taken whole, and its action.
interface Parts {
  texts: string[];
  links: string[];
  action?: ProposedAction;
}

const parts = (texts: string[], more: Partial<Parts> = {}): Parts => ({ texts, links: [], ...more });

function partsOf(block: DigestBlock): Parts {
  switch (block.type) {
    case "facts":
      return parts(block.facts.flatMap(({ label, value }) => [label, value]));
    case "chart":
      return parts([block.label, block.points.join("\n")]);
    case "links":
      return parts(
        block.links.map(({ label }) => label),
        { links: block.links.map(({ href }) => href) },
      );
    case "form":
      return parts([block.action.why, ...Object.values(block.action.args)], { action: block.action });
    case "announcement":
      return parts([block.text]);
    case "text":
      return parts([block.markdown]);
  }
}

const addAll = (into: Set<string>, from: Iterable<string>): void => {
  for (const value of from) into.add(value);
};

/** A digest's facts, each text read alone, so a fence never closed in one hides nothing of the next. */
export function digestFacts(digest: Digest): DigestFacts {
  const [links, addresses, numbers] = [new Set<string>(), new Set<string>(), new Set<string>()];
  const actions: ProposedAction[] = [];
  let room = false;
  for (const block of digest.blocks) {
    const { texts, links: whole, action } = partsOf(block);
    for (const found of texts.map(factsOf)) {
      addAll(links, found.links);
      addAll(addresses, found.addresses);
      addAll(numbers, found.numbers);
      room ||= found.room;
    }
    addAll(links, whole);
    if (action !== undefined) actions.push(action);
  }
  return { links, addresses, numbers, room, actions };
}
