// The document shell every page shares, and the boundary for an error no route caught.
import type { ReactNode } from "react";
import { Link, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { ErrorNotice } from "./ui/ErrorNotice.tsx";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <header>
          <Link to="/">gno.world</Link>
        </header>
        <main>{children}</main>
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
  return <ErrorNotice title="Something went wrong">Reload the page to try again.</ErrorNotice>;
}
