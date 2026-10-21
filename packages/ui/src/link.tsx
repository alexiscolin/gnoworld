// The page's link (F259): ui imports no router, so the app hands it its own once, at its root, and
// an internal link then changes the page without reloading it. Without one, a plain anchor.
import { createContext, use, type AnchorHTMLAttributes, type ReactNode } from "react";

export type PageLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

// Draws the page's anchor from its props. Called, not rendered: what it returns does the work, so it
// calls no hook itself.
type DrawLink = (props: PageLinkProps) => ReactNode;

const PageLinkContext = createContext<DrawLink | null>(null);

// A path from the site's root, as the browser's own parser reads it: an href it takes for another host
// ("//…", "/\…", tabs and line ends dropped first) or cannot read stays a plain anchor. The origin
// stands in for the site's: only its sameness counts.
const SITE = "https://site.invalid";
function ownPath(href: string): boolean {
  try {
    return href.startsWith("/") && new URL(href, SITE).origin === SITE;
  } catch {
    return false;
  }
}

/** Hands every link of the design system inside it the page's own link, for the site's own paths. */
export function LinkProvider({ link, children }: { link: DrawLink; children: ReactNode }) {
  return <PageLinkContext value={link}>{children}</PageLinkContext>;
}

/** An anchor: the page's link for a path from the site's root, a plain one for anything else, or
 * when it must `reload` the document, as an error page's way out does (F325). */
export function Anchor({ reload = false, ...props }: PageLinkProps & { reload?: boolean }) {
  const link = use(PageLinkContext);
  return link !== null && !reload && ownPath(props.href) ? link(props) : <a {...props} />;
}
