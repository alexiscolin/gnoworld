// A CSS cubic-bezier curve as a GSAP ease: a cubic Bezier from (0,0) to (1,1) with the two handles, solved for t by bisection (x is monotonic)
// and read at y. For the proposal's curves GSAP has no name for.
export const bezier =
  ([x1, y1, x2, y2]: readonly [number, number, number, number]) =>
  (x: number): number => {
    const at = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
    let [lo, hi] = [0, 1];
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (at(mid, x1, x2) < x) lo = mid;
      else hi = mid;
    }
    return at((lo + hi) / 2, y1, y2);
  };
