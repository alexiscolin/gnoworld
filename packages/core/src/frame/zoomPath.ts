// The dive's one move (D401): van Wijk and Nuij's smooth zoom ("Smooth and efficient zooming and panning", 2003), the path between
// two views that keeps the speed the eye perceives steady. It goes in a straight line and rises (widens the view) only when the two
// are far apart for their sizes, so what it goes to never drifts off the screen and comes back. A view is what it looks at and how
// wide it sees: here the camera's distance to what it looks at.

/** How much the path prefers rising to panning: √2 is the paper's; the demo's feel is 1.42. */
export const ZOOM_RHO = 1.42;

/** A flight's seconds by its path's length: from 1.3 to 3.4 s (the demo Alexis validated, 2026-11-08). */
export const zoomSeconds = (length: number): number => Math.min(3.4, Math.max(1.3, 1.15 + length * 0.42));

/** The path from a view `from` wide to one `to` wide whose centres are `apart`: its length, and what `glideAt` reads it by. */
export interface ZoomPath {
  /** Its length, in the path's own unit: how far it seems to go. */
  readonly length: number;
  readonly apart: number;
  readonly from: number;
  readonly to: number;
  readonly rho: number;
  readonly r0: number;
  readonly cosh0: number;
  readonly sinh0: number;
}

/** Where a path is: the share of the way between the two centres, 0 to 1, and how wide the view is. */
export interface ZoomStep {
  along: number;
  width: number;
}

// Below this share of the widths, the centres are one: the path only zooms.
const SAME = 1e-6;

/** The path from a view `from` wide to one `to` wide, their centres `apart`; `rho` how much it rises rather than pans. */
export function zoomPath(
  apart: number,
  { from, to }: { readonly from: number; readonly to: number },
  rho = ZOOM_RHO,
): ZoomPath {
  const r2 = rho * rho;
  if (apart < SAME * Math.max(from, to)) {
    const length = Math.abs(Math.log(to / from)) / rho;
    return { length, apart: 0, from, to, rho, r0: 0, cosh0: 1, sinh0: 0 };
  }
  const b0 = (to * to - from * from + r2 * r2 * apart * apart) / (2 * from * r2 * apart);
  const b1 = (to * to - from * from - r2 * r2 * apart * apart) / (2 * to * r2 * apart);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  return { length: (r1 - r0) / rho, apart, from, to, rho, r0, cosh0: Math.cosh(r0), sinh0: Math.sinh(r0) };
}

/** Where `path` is `share` of its length along (0 to 1), into `out`. */
export function glideAt(path: ZoomPath, share: number, out: ZoomStep): void {
  // Its ends exactly, which the formula reaches only to a rounding.
  if (share <= 0 || share >= 1) {
    out.along = share <= 0 ? 0 : 1;
    out.width = share <= 0 ? path.from : path.to;
    return;
  }
  const s = share * path.length;
  if (path.apart === 0) {
    out.along = share;
    out.width = path.from * Math.exp(Math.sign(path.to - path.from) * path.rho * s);
    return;
  }
  const x = path.rho * s + path.r0;
  const along = ((path.from / (path.rho * path.rho)) * (path.cosh0 * Math.tanh(x) - path.sinh0)) / path.apart;
  out.along = Math.min(1, Math.max(0, along));
  out.width = (path.from * path.cosh0) / Math.cosh(x);
}
