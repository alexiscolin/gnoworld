// The count of what the account has not seen, in the tab's title (slice 4's 4f-n): a tab in the background still shows it.
import { useEffect } from "react";

// The count this module put before a title: one or two digits, or 99+, and a space. "(2024) Review" is a title's own.
const OURS = /^\((?:[1-9]\d?|99\+)\) /;

/** `base` with the count before it, `(3) Bubble · gno.world`, 99+ past 99; in place of the count it already holds, and
 * none for a count that is none. */
export function titled(base: string, count: number): string {
  const plain = base.replace(OURS, "");
  if (!Number.isInteger(count) || count < 1) return plain;
  return `(${count > 99 ? "99+" : String(count)}) ${plain}`;
}

/** The page's title with the count of what is unseen, until the page leaves the chat. Another writer's title (a route
 * change sets it anew) gets the count put back before it. */
export function useTabTitle(count: number): void {
  useEffect(() => {
    const apply = () => {
      const next = titled(document.title, count);
      if (next !== document.title) document.title = next;
    };
    apply();
    // The head's own changes: the title's text, or its element replaced.
    const watch = new MutationObserver(apply);
    watch.observe(document.head, { childList: true, characterData: true, subtree: true });
    return () => {
      watch.disconnect();
      document.title = titled(document.title, 0);
    };
  }, [count]);
}
