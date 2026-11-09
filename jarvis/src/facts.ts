// What a text states that can be checked (ADR-0002 §4, "Grounded"; §5, points 4 and 5): its links as core's reader finds
// them, and what a person reads once nothing unseen parts it: its numbers as written, its words, the accounts among them,
// and its figures, numbers a letter or a mark touches. One extractor for a digest's grounding and a translation's check.
import {
  fold,
  inlines,
  isBlank,
  markdown,
  mentionsRoom,
  page,
  type Inline,
  type Outline,
  type PageBlock,
} from "@gnoworld/core";
import type { Digest, DigestBlock, ProposedAction } from "@gnoworld/schemas";

/** What a text states: its links, the accounts it names, its numbers as written, its figures, and whether it names the
 * whole room (`@room`). An account is a word that begins `g1`, or as long as an address, in any case, lower-cased. */
export interface Facts {
  readonly links: ReadonlySet<string>;
  readonly addresses: ReadonlySet<string>;
  readonly numbers: ReadonlySet<string>;
  readonly figures: ReadonlySet<string>;
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

// What a person sees, case and marks kept: what core's isBlank says draws nothing goes, and so do the hair, thin, six-per-em
// and punctuation spaces; a blank with a glyph's width (a Hangul filler, the braille blank) is nothing in what is stated and
// a space in what is held, so each reading asks the most of the sources.
function visible(text: string, held: boolean): string {
  const blank = (char: string): string => {
    if (!isBlank(char) || /\s/u.test(char)) return char;
    return held && /[\p{L}\p{S}]/u.test(char) ? " " : "";
  };
  return text.replace(/[\u2006\u2008\u2009\u200A]/gu, "").replace(/\P{ASCII}/gu, blank);
}

// Its figures and names as a person reads them: core's fold (compatibility forms, no mark, lower case), a numeric symbol
// kept as written; each digit an ASCII one, each dash a hyphen, each run of blanks on a line one space.
function unseen(shown: string): string {
  const values = new Map<string, string>();
  const plain = (char: string): string => {
    if (/\p{Nd}/u.test(char)) return valueOf(char, values);
    return /[\u2010-\u2015\u2212\u02D7\u2796]/u.test(char) ? "-" : char;
  };
  const folded = shown.split(/(\p{No})/u).map((part, at) => (at % 2 === 1 ? part : fold(part)));
  return folded
    .join("")
    .replace(/\P{ASCII}/gu, plain)
    .replace(/[^\S\n]+/g, " ");
}

function numbersIn(plain: string): Set<string> {
  // A unit is a digit or a numeric symbol. A space parts groups of three after a first of three units at most, as thousands
  // are written (`12 345`, never `2026 100`); any one punctuation or symbol parts groups but those that part numbers
  // (`-:/+=<>()[]{}%#&*|~^@!?;"`); a hyphen after no letter nor digit is a sign.
  const number =
    /(?:(?<![\p{L}\p{N}])-)?(?:[\d\p{No}]{1,3}(?: [\d\p{No}]{3}(?![\d\p{No}]))+|[\d\p{No}]+)(?:(?![-:\/+=<>()[\]{}%#&*|~^@!?;"])[\p{P}\p{S}\u02BC][\d\p{No}]+)*/gu;
  return new Set(plain.match(number));
}

/** A number's groups, a comma between each, whatever a language writes between them: `1 000` and `1.000` are `1,000`,
 * which a translation may write either way. */
export const groupsOf = (number: string): string => number.replace(/[^\d\p{No}-]/gu, ",");

// A text's words as a person reads them: runs of letters and digits.
const wordsOf = (plain: string): Set<string> => new Set(plain.match(/[\p{L}\p{N}]+/gu));
const isAccount = (word: string): boolean => word.startsWith("g1") || word.length >= 38;

// A number a letter or a mark touches, as written, case and marks kept (`1OOO`, `GRC20`): a figure no number check reads.
const figuresIn = (shown: string): Set<string> =>
  new Set(
    [...new Set(shown.match(/[\p{L}\p{M}\p{N}]+/gu))].filter(
      (word) => /\p{N}/u.test(word) && /[^\p{Nd}\p{No}]/u.test(word) && !isAccount(word.toLowerCase()),
    ),
  );

function linksIn(nodes: Iterable<Inline>): Set<string> {
  const links = new Set<string>();
  for (const node of nodes) if (node.type === "link") links.add(node.href);
  return links;
}

// What a text's words and figures are as a person reads them, with no Markdown, so none crosses a line break.
function seen(text: string, held: boolean): Pick<Facts, "addresses" | "numbers" | "figures"> {
  const shown = visible(text, held);
  const plain = unseen(shown);
  return {
    addresses: new Set([...wordsOf(plain)].filter(isAccount)),
    numbers: numbersIn(plain),
    figures: figuresIn(shown),
  };
}

// What core's reader finds in a text: its links, and whether it names the whole room.
function markdownFacts(text: string): Pick<Facts, "links" | "room"> {
  const blocks = markdown(text);
  return { links: linksIn(inlines(blocks)), room: mentionsRoom(blocks) };
}

/** A text's facts, read as the room reads a message: as what is stated (a digest, a translation), or, `held`, as what a
 * source holds (a translation's original), each the way that asks the most of the sources. */
export function factsOf(text: string, held = false): Facts {
  return { ...markdownFacts(text), ...seen(text, held) };
}

/** What a source can ground: its links, numbers as written, words, and pieces, which a figure or an argument must be,
 * read when first asked, as few digests state either. */
export interface SourceFacts {
  readonly links: ReadonlySet<string>;
  readonly numbers: ReadonlySet<string>;
  readonly words: ReadonlySet<string>;
  readonly pieces: () => ReadonlySet<string>;
}

// An outline's items and the lists under them, 6 deep at most (core's MAX_LIST_DEPTH).
function* outlineInlines(list: Outline): Generator<Inline> {
  for (const item of list.items) {
    yield* inlines([{ type: "paragraph", children: item.children }]);
    for (const sub of item.sub) yield* outlineInlines(sub);
  }
}

// A block's inline nodes: core's walk of a message's blocks, each heading's line, and what a page's own blocks hold.
function* blockInlines(block: PageBlock): Generator<Inline> {
  if (block.type === "quote") yield* pageInlines(block.children);
  else if (block.type === "heading") yield* inlines([{ type: "paragraph", children: block.children }]);
  else if (block.type === "table") {
    for (const cell of [...block.head, ...block.rows.flat()]) yield* inlines([{ type: "paragraph", children: cell }]);
  } else if (block.type === "outline") yield* outlineInlines(block);
  else if (block.type === "columns") for (const column of block.columns) yield* pageInlines(column);
  else if (block.type !== "form" && block.type !== "rule") yield* inlines([block]);
}

function* pageInlines(blocks: readonly PageBlock[]): Generator<Inline> {
  for (const block of blocks) yield* blockInlines(block);
}

/** A piece as written, the punctuation that wraps it in prose left out: what a source holds a figure or an argument as. */
export const coreOf = (piece: string): string => piece.replace(/^["'`*_~.,;:!?]+|["'`*_~.,;:!?]+$/gu, "");

// A source's pieces: each part between blanks and brackets, as written, its wrapping left out; each link with and without
// its scheme.
function piecesOf(source: string, links: ReadonlySet<string>): Set<string> {
  const pieces = new Set(source.match(/[^\s()[\]<>"'`*_~.,;:!?](?:[^\s()[\]<>]*[^\s()[\]<>"'`*_~.,;:!?])?/gu));
  for (const link of links) pieces.add(link).add(link.slice("https://".length));
  return pieces;
}

/** A source's facts, read as a realm's page, a link to a path resolved against gnoweb's `origin`: no link of one past core's
 * cap, the rest still. */
export function sourceFactsOf(source: string, origin: string): SourceFacts {
  const read = page(source, { origin });
  const links = read.kind === "page" ? linksIn(pageInlines(read.blocks)) : new Set<string>();
  const plain = unseen(visible(source, true));
  let pieces: Set<string> | undefined;
  return {
    links,
    numbers: numbersIn(plain),
    words: wordsOf(plain),
    pieces: () => (pieces ??= piecesOf(source, links)),
  };
}

/** What a digest states, the actions its forms propose, and their arguments' pieces, which a call carries as given. */
export interface DigestFacts extends Facts {
  readonly actions: readonly ProposedAction[];
  readonly pieces: ReadonlySet<string>;
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

// An argument's piece, between blanks as given, that no other check reads as it is: a number's and an account's do.
const isPiece = (piece: string): boolean => !/^-?\d+$/.test(piece) && !(/^[\da-z]+$/.test(piece) && isAccount(piece));

const addAll = (into: Set<string>, from: Iterable<string>): void => {
  for (const value of from) into.add(value);
};

/** A digest's facts, each text read alone by core's reader, so a fence never closed in one hides nothing of the next; its
 * words and figures read in one pass, each text on its line. */
export function digestFacts(digest: Digest): DigestFacts {
  const all = digest.blocks.map(partsOf);
  const [links, pieces] = [new Set<string>(), new Set<string>()];
  let room = false;
  for (const { texts, links: whole, action } of all) {
    for (const found of texts.map(markdownFacts)) {
      addAll(links, found.links);
      room ||= found.room;
    }
    addAll(links, whole);
    for (const value of Object.values(action?.args ?? {}))
      addAll(pieces, Array.from(value.matchAll(/\S+/gu), ([part]) => part).filter(isPiece));
  }
  const actions = all.flatMap(({ action }) => (action === undefined ? [] : [action]));
  const texts = all.flatMap(({ texts: some }) => some).join("\n");
  return { links, ...seen(texts, false), room, actions, pieces };
}
