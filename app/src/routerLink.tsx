// The design system's links to the site's own paths follow the router: the page changes, never
// reloads (F259). The shell hands it to ui's link slot, in Layout, so the root's error boundary has it.
import type { PageLinkProps } from "@gnoworld/ui";
import { Link } from "react-router";

export function RouterLink({ href, ...rest }: PageLinkProps) {
  return <Link to={href} {...rest} />;
}
