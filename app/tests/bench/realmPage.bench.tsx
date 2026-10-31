// The realm page reader's budget (docs/plans/slice-5-part-2.md §4), measured by scripts/bench.py in the full gate: linear in
// bytes, under 50 ms at the 256 KB cap, timed at 16, 64 and 256 KB so a quadratic step shows as a ratio, not a lucky page.
import { page, PAGE_MAX_BYTES } from "@gnoworld/core";
import { renderToStaticMarkup } from "react-dom/server";
import { bench, describe } from "vitest";
import { drawing } from "../../src/features/chat/index.ts";
import { RealmBlocks } from "../../src/features/realms/RealmBlocks.tsx";

// A page of everything the reader reads: headings, marks, links, a list, code, a quote, an alert, columns, a form.
const UNIT = [
  "# A realm",
  "",
  "Some **bold** words, `code`, and a [link](https://gno.land/r/demo/dao) beside _more_ text.",
  "",
  "- one",
  "- two",
  "",
  "> [!NOTE] Heads up",
  "> body",
  "",
  "<gno-columns>",
  "left",
  "<gno-columns-sep>",
  "right",
  "</gno-columns>",
  "",
  '<gno-form exec="Vote">',
  '<gno-input name="who" type="hidden" value="x" />',
  "</gno-form>",
  "",
  "```",
  "code",
  "```",
  "",
].join("\n");
const upTo = (bytes: number) => UNIT.repeat(Math.ceil(bytes / UNIT.length)).slice(0, bytes);
// Lines that are each an opener nothing closes: the shape a quadratic reader pays for.
const OPENERS = "<gno-form>\n<gno-columns>\n> [!NOTE]\n```\n"
  .repeat(Math.ceil(PAGE_MAX_BYTES / 38))
  .slice(0, PAGE_MAX_BYTES);

// A fence's line of blanks and a mark, the shape a regex with two runs of blanks pays half a minute for (R-F1).
const BLANKS = ("```" + " ".repeat(PAGE_MAX_BYTES - 8) + "!").slice(0, PAGE_MAX_BYTES);

/** One read timed; a page the reader calls too big, or any answer but a page, throws: the bench then has no sample. */
const timed = (source: string) => () => {
  if (page(source).kind !== "page") throw new Error("the bench's page is not read as a page");
};

const big = upTo(PAGE_MAX_BYTES);

describe("a realm page", () => {
  const small = upTo(16 * 1024);
  const middle = upTo(64 * 1024);
  bench("page, 16 KB of every block [4 ms]", timed(small));
  bench("page, 64 KB of every block [15 ms]", timed(middle));
  bench("page, 256 KB of every block [50 ms]", timed(big));
  bench("page, 256 KB of openers nothing closes [50 ms]", timed(OPENERS));
  bench("page, 256 KB of a fence's line of blanks and a mark [50 ms]", timed(BLANKS));
});

// The tree is drawn too: 256 KB of one-character headings is some 65,000 blocks of elements, which the reader's 50 ms does not
// cover (the chat's bench draws RoomView alone the same way). The reader is not in these: the tree is read once, outside.
const treeOf = (source: string) => {
  const read = page(source);
  if (read.kind !== "page") throw new Error("the bench's page is not read as a page");
  return read.blocks;
};
const everything = treeOf(big);
const headings = treeOf("# a\n".repeat(PAGE_MAX_BYTES / 4));
const items = treeOf("- a\n".repeat(PAGE_MAX_BYTES / 4));
const marks = treeOf("*a* ".repeat(PAGE_MAX_BYTES / 4));

const via = await drawing();

describe("a realm page, drawn", () => {
  bench("RealmBlocks, 256 KB of every block, drawn whole [100 ms]", () => {
    renderToStaticMarkup(<RealmBlocks via={via} blocks={everything} />);
  });
  bench("RealmBlocks, 256 KB of one-character headings, drawn whole [100 ms]", () => {
    renderToStaticMarkup(<RealmBlocks via={via} blocks={headings} />);
  });
  bench("RealmBlocks, 256 KB of one-character list items, drawn whole [100 ms]", () => {
    renderToStaticMarkup(<RealmBlocks via={via} blocks={items} />);
  });
  bench("RealmBlocks, 256 KB of marks in one paragraph, drawn whole [100 ms]", () => {
    renderToStaticMarkup(<RealmBlocks via={via} blocks={marks} />);
  });
});
