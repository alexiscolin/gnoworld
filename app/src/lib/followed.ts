// A link of the page that its router follows on a plain click (F259: the page changes, never reloads), drawn outside the router's tree: the
// Earth's pins, the rail. A click with a key held, or with another button, is the browser's: a new tab stays a new tab, Alt saves; one
// another handler took is its own. React Router's links read a click the same way.

/** What a click says of itself, from the page or from React alike. */
interface Click {
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly button: number;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/** Opens `href` through `open` on a plain click, in place of the browser. */
export function followed(event: Click, href: string, open: (href: string) => void): void {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0)
    return;
  event.preventDefault();
  open(href);
}
