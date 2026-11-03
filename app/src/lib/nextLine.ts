// The roving focus of a vertical list (WAI-ARIA's composite widgets): the arrows up and down, Home and End move the focus among its items,
// round the ends; a key held with a modifier is the browser's or the system's. A room's lines (4c) and the cosmos's rail (7i) move so.
const MOVES = ["ArrowUp", "ArrowDown", "Home", "End"];

/** A key pressed, with its modifiers, from the page or from React alike. */
interface Press {
  readonly key: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

/** The item `press` moves the focus to among `count`, from the one `at` reads (-1: none, a key on an item's own controls); none for any
 * other key. The key is read first. */
export function nextLine(press: Press, count: number, at: () => number): number | undefined {
  if (!MOVES.includes(press.key) || press.altKey || press.ctrlKey || press.metaKey || press.shiftKey) return undefined;
  const from = at();
  if (from === -1) return undefined;
  const steps: Record<string, number> = { ArrowUp: from - 1, ArrowDown: from + 1, Home: 0, End: count - 1 };
  return ((steps[press.key] ?? from) + count) % count;
}
