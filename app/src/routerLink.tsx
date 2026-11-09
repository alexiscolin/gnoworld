// The design system's links to the site's own paths follow the router: the page changes, never
// reloads (F259). The shell hands it to ui's link slot, in Layout, so the root's error boundary has it.
import { LinkProvider, type PageLinkProps } from "@gnoworld/ui";
import { createContext, use, type ReactNode } from "react";
import { Link } from "react-router";
import { fullChatHref } from "./fullChat.ts";
import { isPagePath } from "./pagePath.ts";

// Inside the full chat, every link to a chat's page keeps it full (FullChatLinks): one place for every link, ui's and the chat's own.
const InFullChatContext = createContext(false);

/** The page's link: ui calls it, so it draws a component, which reads where it stands. */
export function RouterLink({ href, ...rest }: PageLinkProps) {
  return <Link to={use(InFullChatContext) ? fullChatHref(href) : href} {...rest} />;
}

/** What the full chat holds: its links stay in it (Alexis, 2026-11-07, "tout ce qui est dans le chat reste dans le chat"). */
export function FullChatLinks({ children, full }: { children?: ReactNode; full: boolean }) {
  return <InFullChatContext value={full}>{children}</InFullChatContext>;
}

/** The slot, filled: a link to a page goes through the router, one to a file of the site (F326) stays an anchor. */
export function AppLinks({ children }: { children: ReactNode }) {
  return (
    <LinkProvider link={RouterLink} pages={isPagePath}>
      {children}
    </LinkProvider>
  );
}
