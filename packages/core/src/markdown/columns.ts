// A realm page's columns (gnoweb's ext_columns.go): the openers that have a mate, with their closer and their separators.
// A stack pairs them in one pass; a closer with no opener, an opener never closed, one past the depth cap and a separator
// outside columns stay text.

/** How many columns may nest, as gnoweb's cap on its tags nested (nestdepth.go): a fifth opener is text. */
const MAX_COLUMNS_DEPTH = 4;

const SEPARATORS = ["<gno-columns-sep>", "<gno-columns-sep/>", "<gno-columns-sep />"];

export interface Pair {
  end: number;
  seps: number[];
}

// The separators from the top of the stack that stand after `opener`: those between it and its closer, none inside columns
// of its own, which took theirs.
function takeSeps(seps: number[], opener: number): number[] {
  const mine: number[] = [];
  for (let sep = seps.at(-1); sep !== undefined && sep > opener; sep = seps.at(-1)) mine.unshift(seps.pop() ?? 0);
  return mine;
}

/** The columns of the lines that have a mate, by their opener's line. `base` columns already hold these lines. */
export function columnPairs(lines: readonly string[], base: number): Map<number, Pair> {
  const pairs = new Map<number, Pair>();
  const open: { at: number; live: boolean }[] = [];
  const seps: number[] = [];
  let live = base;
  for (const [at, line] of lines.entries()) {
    const body = line.trim();
    if (body === "<gno-columns>") {
      open.push({ at, live: live < MAX_COLUMNS_DEPTH });
      live += live < MAX_COLUMNS_DEPTH ? 1 : 0;
    } else if (SEPARATORS.includes(body)) seps.push(at);
    else if (body === "</gno-columns>") {
      const opener = open.pop();
      if (opener?.live !== true) continue;
      live -= 1;
      pairs.set(opener.at, { end: at, seps: takeSeps(seps, opener.at) });
    }
  }
  return pairs;
}
