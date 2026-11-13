import { useSyncExternalStore } from "react";
import { useLocation } from "react-router";

/** The attribute of the root that holds the path a page was written for (root.tsx's Layout). */
export const WRITTEN = "data-written";

const never = () => () => undefined;

/** The path the shell draws its header from: the one the page was written for while it hydrates, then the address's own. A path no page is
 * written for is served the page written at `/`, and its first draw must be that page's (React's error #418 on /w/nowhere otherwise). */
export function useDrawnPath(): string {
  const { pathname } = useLocation();
  return useSyncExternalStore(
    never,
    () => pathname,
    () => (typeof document === "undefined" ? pathname : (document.documentElement.getAttribute(WRITTEN) ?? pathname)),
  );
}
