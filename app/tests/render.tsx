// A route rendered as the build renders it, through React Router's own static rendering: Vitest
// runs the app's routes with no DOM.
import { LinkProvider, type PageLinkProps } from "@gnoworld/ui";
import { renderToStaticMarkup } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider, type RouteObject } from "react-router";
import type { PlaceKind } from "@gnoworld/core";
import { expect } from "vitest";
import { site } from "../src/places.ts";
import { StoreProvider } from "../src/storeContext.tsx";

async function query(route: RouteObject, path: string) {
  const handler = createStaticHandler([route]);
  const context = await handler.query(new Request(`https://gno.world${path}`));
  if (context instanceof Response) throw new Error(`${path} answered ${String(context.status)}, not a page`);
  return { handler, context };
}

// What the app's router draws for ui's link slot, here a stand-in that marks the links it draws.
const routed = (props: PageLinkProps) => <a data-routed="" {...props} />;

/** A route as the build renders it, inside the page's store as the shell puts every route; inside ui's link slot
 * when asked, its links through the router marked. */
export async function render(route: RouteObject, path: string, { slot = false } = {}): Promise<string> {
  const { handler, context } = await query(route, path);
  const page = (
    <StoreProvider>
      <StaticRouterProvider router={createStaticRouter(handler.dataRoutes, context)} context={context} />
    </StoreProvider>
  );
  return renderToStaticMarkup(slot ? <LinkProvider link={routed}>{page}</LinkProvider> : page);
}

/** The error a route's loader gave for a path, as React Router hands it to the route's meta. */
export async function routeError(route: RouteObject, path: string): Promise<unknown> {
  const { context } = await query(route, path);
  return Object.values(context.errors ?? {})[0];
}

/** The words of the page's first heading, its inner tags dropped: what it says, whatever marks its parts. */
export function headingOf(html: string): string | undefined {
  return /<h1\b[^>]*>(.*?)<\/h1>/s.exec(html)?.[1]?.replace(/<[^>]*>/g, "");
}

/** The way home a page that failed offers: the primary link to the universe. */
export const BACK_HOME = /<a [^>]*href="\/"[^>]*>Back to the universe<\/a>/;

/** What the page's alert holds: the markup inside its first role="alert" div, nested divs included. */
export function alertOf(html: string): string {
  const opening = '<div role="alert">';
  const start = html.indexOf(opening);
  if (start === -1) return "";
  const from = start + opening.length;
  let depth = 1;
  for (const tag of html.slice(from).matchAll(/<\/?div\b/g)) {
    depth += tag[0] === "<div" ? 1 : -1;
    if (depth === 0) return html.slice(from, from + tag.index);
  }
  return "";
}

/** The browser's loader gives every pre-rendered page of a kind, at its path and its canonical one, what the build's does. */
export function expectClientAsBuild(
  kind: PlaceKind,
  client: (args: { request: Request }) => unknown,
  build: (args: { request: Request }) => unknown,
): void {
  const paths = site.places.filter((place) => place.kind === kind).flatMap((place) => [place.path, place.canonical]);
  expect(paths.length).toBeGreaterThan(0);
  for (const path of paths) {
    const request = new Request(`https://gno.world${path}`);
    expect(client({ request }), path).toEqual(build({ request }));
  }
}
