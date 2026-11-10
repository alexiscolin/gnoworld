// Who holds an Escape: a field being typed in, an input method composing, a dialog or a menu that is open. Escape is theirs then, never the page's: it closes them
// and goes no further (a card open alone, a level of space). A popover that is manual does not hold it, a flash or a tooltip: they are shown beside what the
// reader does, and a tooltip's first Escape is its own (WCAG 1.4.13, Tooltip/hold.ts); a manual one that closes on Escape says so by `data-takes-escape`.
const FIELD = "input, textarea, select, [contenteditable='true']";

const takes = (node: Element) => node.getAttribute("popover") !== "manual" || node.hasAttribute("data-takes-escape");

/** Whether something other than the page holds this Escape. */
export function holdsEscape(event: KeyboardEvent): boolean {
  if (event.isComposing) return true;
  if (event.target instanceof Element && event.target.closest(FIELD) !== null) return true;
  if (document.querySelector("dialog[open]") !== null) return true;
  return [...document.querySelectorAll("[popover]")].some((node) => takes(node) && node.matches(":popover-open"));
}
