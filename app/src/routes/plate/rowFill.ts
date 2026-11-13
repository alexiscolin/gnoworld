// The plate's squares fill their last row (Alexis, 2026-11-12): four to a row of twelve columns, two on a narrow plate; the squares of a last
// row that is not full share its width, so a square alone there takes the whole row.

const WIDE_ROW = 4;

/** The twelve-column span of the square at `index` of `count`, and whether it keeps the narrow plate's half row (an odd last one takes it all). */
export function rowFill(index: number, count: number): { span: 3 | 4 | 6 | 12; narrow: boolean } {
  const last = count % WIDE_ROW || WIDE_ROW;
  const share = index >= count - last ? last : WIDE_ROW;
  const span = share === 1 ? 12 : share === 2 ? 6 : share === 3 ? 4 : 3;
  return { span, narrow: !(count % 2 === 1 && index === count - 1) };
}
