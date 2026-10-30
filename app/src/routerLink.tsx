// The design system's links to the site's own paths follow the router: the page changes, never
// reloads (F259). The shell hands it to ui's link slot, in Layout, so the root's error boundary has it.
import { LinkProvider, type PageLinkProps } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { isPagePath } from "./pagePath.ts";

export function RouterLink({ href, ...rest }: PageLinkProps) {
  return <Link to={href} {...rest} />;
}

/** The slot, filled: a link to a page goes through the router, one to a file of the site (F326) stays an anchor. */
export function AppLinks({ children }: { children: ReactNode }) {
  return (
    <LinkProvider link={RouterLink} pages={isPagePath}>
      {children}
    </LinkProvider>
  );
}
