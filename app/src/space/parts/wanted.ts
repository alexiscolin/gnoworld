// Which planets are drawn as themselves: the few largest on screen.

/** At most this many at once. */
const MOST = 10;

/** Keeps `planet`, `px` across, among the MOST largest, largest first, in the same two lists each time. */
export function keepLargest<T>({ wanted, sizes }: { wanted: T[]; sizes: number[] }, planet: T, px: number): void {
  let at = wanted.length;
  while (at > 0 && (sizes[at - 1] ?? Infinity) < px) at -= 1;
  if (at >= MOST) return;
  if (wanted.length < MOST) {
    wanted.push(planet);
    sizes.push(px);
  }
  wanted.copyWithin(at + 1, at, wanted.length - 1);
  sizes.copyWithin(at + 1, at, sizes.length - 1);
  wanted[at] = planet;
  sizes[at] = px;
}
