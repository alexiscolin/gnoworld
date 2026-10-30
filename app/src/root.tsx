// The document shell every page shares, and the boundary for an error no route caught.
// First: no schema may be built before Zod is told not to compile (lib/jitless.ts).
import "./lib/jitless.ts";
import "@gnoworld/ui/styles.css";
import type { ReactNode } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { PageError } from "./features/errors/index.ts";
import { Shell } from "./shell.tsx";

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
        <Shell>{children}</Shell>
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
