// The document shell every page shares, and the boundary for an error no route caught.
// First: no schema may be built before Zod is told not to compile (lib/jitless.ts).
import "./lib/jitless.ts";
import "@gnoworld/ui/styles.css";
import layers from "@gnoworld/ui/layers.css?url";
import type { ReactNode } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { PageError } from "./features/errors/index.ts";
import { markFullEarly } from "./fullChat.ts";
import { Shell } from "./shell.tsx";

// Before the first draw: a page opened with the full chat covers itself at once (fullChat.ts).
markFullEarly();

export function Layout({ children }: { children: ReactNode }) {
  return (
    // The root's marks set before React draws (fullChat.ts's data-chat): the page's own, never a mismatch to report. `data-first` holds the
    // header out of sight till the page's arrival takes it (arrival.ts).
    <html lang="en" data-first="" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* With credentials: the demo asks for a password, and Chromium sends none for a manifest otherwise. */}
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        {/* First of the sheets: the layers rank by first mention, so the order is never left to the chunks (F3260). */}
        <link rel="stylesheet" href={layers} />
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
