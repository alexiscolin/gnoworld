// What the tests of core and of the app's journeys share, never the product's (7b8; Alexis's "rangement propre"): one correlation where
// five tests each wrote their own; the journeys import it by its path, as cosmos.spec.ts does ladder.ts. Its source also runs on their
// reading pages, so it calls nothing outside itself.

/** Pearson's correlation of the pairs' two values, -1 to 1; NaN where either never moves, so a flat series passes no bound. */
export function correlation(pairs: readonly (readonly [number, number])[]): number {
  const mean = (at: 0 | 1) => pairs.reduce((sum, pair) => sum + pair[at], 0) / pairs.length;
  const [mx, my] = [mean(0), mean(1)];
  let [xy, xx, yy] = [0, 0, 0];
  for (const [x, y] of pairs) [xy, xx, yy] = [xy + (x - mx) * (y - my), xx + (x - mx) ** 2, yy + (y - my) ** 2];
  return xx === 0 || yy === 0 ? Number.NaN : xy / Math.sqrt(xx * yy);
}
