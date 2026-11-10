/** A still copy of `part`, not yet in the page: hidden from assistive technology, its controls out of focus, its ids gone (the page's own stay
 * unique) but an SVG's own, which its shapes are filled by. For a part that leaves, or stands in for one that moves (the Flash's leave, the page's ghost, the chat's
 * moves): the one copy of it, which the app takes from here. The caller marks it as it needs (a `data-ghost`, `inert` on the copy itself). */
export function stillCopy(part: Element): HTMLElement | undefined {
  const copy = part.cloneNode(true);
  if (!(copy instanceof HTMLElement)) return undefined;
  copy.setAttribute("aria-hidden", "true");
  for (const control of copy.querySelectorAll("a, button, input, select, textarea, [tabindex]"))
    if (control instanceof HTMLElement) control.inert = true;
  for (const named of [copy, ...copy.querySelectorAll("[id]:not(svg *)")]) named.removeAttribute("id");
  return copy;
}
