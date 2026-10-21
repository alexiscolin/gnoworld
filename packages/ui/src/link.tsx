// The page's link (F259): ui imports no router, so the app hands it its own once, at its root, and
// an internal link then changes the page without reloading it. Without one, a plain anchor.
import { createContext, use, type AnchorHTMLAttributes, type ReactNode } from "react";

export type PageLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

// Draws the page's anchor from its props. Called, not rendered: what it returns does the work, so it
// calls no hook itself.
type DrawLink = (props: PageLinkProps) => ReactNode;

const PageLinkContext = createContext<DrawLink | null>(null);

// A path from the site's root: "/" not followed by a second slash or a backslash, which a browser
// reads as another host's address.
const OWN_PATH = /^\/(?![/\\])/;

/** Hands every link of the design system inside it the page's own link, for the site's own paths. */
export function LinkProvider({ link, children }: { link: DrawLink; children: ReactNode }) {
  return <PageLinkContext value={link}>{children}</PageLinkContext>;
}

/** An anchor: the page's link for a path from the site's root, a plain one for anything else. */
export function Anchor(props: PageLinkProps) {
  const link = use(PageLinkContext);
  return link !== null && OWN_PATH.test(props.href) ? link(props) : <a {...props} />;
}
