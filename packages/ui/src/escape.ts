// Who holds an Escape: a field being typed in, an input method composing, a dialog or a menu that is open. Escape is theirs then, never the page's: it closes them
// and goes no further (a card open alone, a level of space). A popover that is manual does not hold it, a flash or a tooltip: they are shown beside what the
// reader does, and a tooltip's first Escape is its own (WCAG 1.4.13, Tooltip/hold.ts); a manual one that closes on Escape says so by `data-takes-escape`.
const FIELDS = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

/** Whether `target` is in a field a person types in: a key typed there is the field's (space's keys, the search's chord, Escape). */
export const typedIn = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(FIELDS) !== null;

/** Whether an input method is composing: Safari ends a composition with isComposing false and keyCode 229, read by name as the types mark
 * it deprecated. */
export const composing = (event: KeyboardEvent): boolean => event.isComposing || Reflect.get(event, "keyCode") === 229;

const takes = (node: Element) => node.getAttribute("popover") !== "manual" || node.hasAttribute("data-takes-escape");

/** Whether something other than the page holds this Escape, or already took it (a tooltip's or a chart's reading's first Escape). */
export function holdsEscape(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || composing(event) || typedIn(event.target)) return true;
  if (document.querySelector("dialog[open]") !== null) return true;
  return [...document.querySelectorAll("[popover]")].some((node) => takes(node) && node.matches(":popover-open"));
}
