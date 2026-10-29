// The document shell every page shares, and the boundary for an error no route caught.
// First: no schema may be built before Zod is told not to compile (lib/jitless.ts).
import "./lib/jitless.ts";
import { Center, Cluster, LinkProvider } from "@gnoworld/ui";
import "@gnoworld/ui/styles.css";
import type { ReactNode } from "react";
import { Link, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { PageError } from "./features/errors/index.ts";
import { LoginControl } from "./features/login/index.ts";
import { UpdatePrompt } from "./features/update/index.ts";
import { RouterLink } from "./routerLink.tsx";
import { StoreProvider } from "./storeContext.tsx";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* With credentials: the demo asks for a password, and Chromium sends none for a manifest otherwise. */}
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <Meta />
        <Links />
      </head>
      <body>
        <StoreProvider>
          <LinkProvider link={RouterLink}>
            <Center as="header" max="page">
              <Cluster justify="between">
                <Link to="/">gno.world</Link>
                {/* The search 5n adds sits here, between the home link and the account. */}
                <LoginControl />
              </Cluster>
            </Center>
            <Center max="page">
              <main>{children}</main>
            </Center>
            <UpdatePrompt />
          </LinkProvider>
        </StoreProvider>
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
  return <PageError title="Something went wrong" line="Reload the page to try again." reload />;
}
