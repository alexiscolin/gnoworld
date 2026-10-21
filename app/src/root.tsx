// The document shell every page shares, and the boundary for an error no route caught.
import { LinkProvider, type PageLinkProps } from "@gnoworld/ui";
import "@gnoworld/ui/styles.css";
import type { ReactNode } from "react";
import { Link, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { PageError } from "./features/errors/index.ts";
import { UpdatePrompt } from "./features/update/index.ts";

// The design system's links to the site's own paths follow the router: the page changes, never
// reloads (F259). In Layout, so the root's error boundary has it too.
function RouterLink({ href, ...rest }: PageLinkProps) {
  return <Link to={href} {...rest} />;
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* With credentials: the demo asks for a password, and Chromium sends none for a manifest otherwise. */}
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
        <Meta />
        <Links />
      </head>
      <body>
        <LinkProvider link={RouterLink}>
          <header>
            <Link to="/">gno.world</Link>
          </header>
          <main>{children}</main>
          <UpdatePrompt />
        </LinkProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary() {
  return <PageError title="Something went wrong" line="Reload the page to try again." />;
}
