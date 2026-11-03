// What a text states that can be checked (ADR-0002 §4, "Grounded"; §5, points 4 and 5): its links as core's reader finds
// them, the accounts it names, its numbers. One extractor for a digest's grounding and a translation's check, so both read
// a text alike. A number is its groups of digits, read in their compatibility forms, a digit by its value in any script,
// whatever a language writes between groups: `1,000`, `1 000` and `1.000` are one number, `10,00` and `1000` two others.
import { inlines, markdown, mentions, mentionsRoom, page, type Inline, type PageBlock } from "@gnoworld/core";
import type { Digest, DigestBlock, ProposedAction } from "@gnoworld/schemas";

/** What a text states: its links, the accounts it names with their at sign or not, its numbers, and whether it names the
 * whole room (`@room`). */
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

function numbersIn(text: string): Set<string> {
  // A space parts groups of three after a first of three digits at most, as thousands are written (`12 345`, never
  // `2026 100` nor `1 2`); a mark parts groups of any length. NFKC makes each space a plain one.
  const number =
    /\p{Nd}{1,3}(?: \p{Nd}{3}(?!\p{Nd}))+(?:[.,'\u2019\u066b\u066c]\p{Nd}+)*|\p{Nd}+(?:[.,'\u2019\u066b\u066c]\p{Nd}+)*/gu;
  const values = new Map<string, string>();
  const found = new Set<string>();
  for (const [run] of text.normalize("NFKC").matchAll(number))
    found.add(run.replace(/\P{Nd}+/gu, ",").replace(/[^\d,]/gu, (digit) => valueOf(digit, values)));
  return found;
}

// A text's words that begin `g1`, runs of letters and digits: an account's address is one, with its at sign or not.
const g1Words = (text: string): Set<string> => new Set(text.match(/(?<![\p{L}\p{N}])g1[\p{L}\p{N}]*/gu));

// Of those, the words of an account's form, by core's rule for a mention read with an at sign (its form, not its checksum).
const accountsIn = (text: string): Set<string> =>
  new Set([...g1Words(text)].filter((word) => mentions(markdown(`@${word}`))[0] === word));

function linksIn(nodes: Iterable<Inline>): Set<string> {
  const links = new Set<string>();
  for (const node of nodes) if (node.type === "link") links.add(node.href);
  return links;
}

/** A text's facts, read as the room reads a message. */
export function factsOf(text: string): Facts {
  const blocks = markdown(text);
  return {
    links: linksIn(inlines(blocks)),
    addresses: accountsIn(text),
    numbers: numbersIn(text),
    room: mentionsRoom(blocks),
  };
}

/** What a source can ground: its links, its numbers, and its words that begin `g1`, every account it names among them. */
export interface SourceFacts {
  readonly links: ReadonlySet<string>;
  readonly numbers: ReadonlySet<string>;
  readonly addresses: ReadonlySet<string>;
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
  return {
    links: linksIn(read.kind === "page" ? pageInlines(read.blocks) : []),
    numbers: numbersIn(source),
    addresses: g1Words(source),
  };
}

/** What a digest states, and the actions its forms propose. */
export interface DigestFacts extends Facts {
  readonly actions: readonly ProposedAction[];
}

// A block's parts: texts a reader sees, figures (numbers alone), addresses taken whole, and its action.
interface Parts {
  texts: string[];
  figures: string[];
  links: string[];
  action?: ProposedAction;
}

const parts = (texts: string[], more: Partial<Parts> = {}): Parts => ({ texts, figures: [], links: [], ...more });

function partsOf(block: DigestBlock): Parts {
  switch (block.type) {
    case "facts":
      return parts(block.facts.flatMap(({ label, value }) => [label, value]));
    case "chart":
      return parts([block.label], { figures: block.points.map(String) });
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
    const { texts, figures, links: whole, action } = partsOf(block);
    for (const found of texts.map(factsOf)) {
      addAll(links, found.links);
      addAll(addresses, found.addresses);
      addAll(numbers, found.numbers);
      room ||= found.room;
    }
    addAll(numbers, numbersIn(figures.join("\n")));
    addAll(links, whole);
    if (action !== undefined) actions.push(action);
  }
  return { links, addresses, numbers, room, actions };
}
